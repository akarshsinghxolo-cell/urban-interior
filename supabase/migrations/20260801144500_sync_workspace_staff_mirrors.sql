-- Keep the workspace Staff master and normalized/auth Staff mirrors coherent.
--
-- Canonical ownership is split deliberately:
--   * entity_master_staff owns operational HR profile fields.
--   * uc_user_roles/auth.users own login approval and authentication identity.
--   * StaffProfile is a normalized mirror used by GPS/auth-facing server paths.
--
-- Workspace-origin Staff edits therefore mirror profile/role details only for
-- an already-linked auth identity. They may not invent a login, replace the
-- auth user/email, or delete an auth-linked Staff record.

begin;

create or replace function public.uc_sync_workspace_staff_mirrors()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_new jsonb := coalesce(new.data, '{}'::jsonb);
  v_old jsonb := case when tg_op = 'UPDATE' then coalesce(old.data, '{}'::jsonb) else '{}'::jsonb end;
  v_name text := btrim(coalesce(v_new ->> 'name', ''));
  v_code text := btrim(coalesce(v_new ->> 'code', new.id));
  v_role_key text := upper(btrim(coalesce(v_new ->> 'role_key', 'FIELD_STAFF')));
  v_status text := lower(btrim(coalesce(v_new ->> 'status', 'active')));
  v_profile_status text;
  v_auth_user_text text := nullif(btrim(coalesce(v_new ->> 'auth_user_id', '')), '');
  v_old_auth_user_text text := nullif(btrim(coalesce(v_old ->> 'auth_user_id', '')), '');
  v_auth_user_id uuid;
  v_role_status text;
  v_master_email text := lower(btrim(coalesce(v_new ->> 'email', '')));
  v_master_login_email text := lower(btrim(coalesce(v_new ->> 'login_email', '')));
  v_old_email text := lower(btrim(coalesce(v_old ->> 'email', '')));
  v_old_login_email text := lower(btrim(coalesce(v_old ->> 'login_email', '')));
  v_login_enabled boolean := lower(coalesce(v_new ->> 'login_enabled', 'false')) = 'true';
  v_existing_profile public."StaffProfile"%rowtype;
begin
  if current_setting('uc.write_source', true) is distinct from 'workspace-commit' then
    return new;
  end if;

  if v_name = '' then
    raise exception using errcode = '23514', message = 'STAFF_NAME_REQUIRED';
  end if;

  if v_role_key not in (
    'OWNER', 'OPERATIONS_MANAGER', 'FIELD_STAFF', 'SALES_TELECALLER',
    'PROCUREMENT_STAFF', 'FINANCE', 'ACCOUNTS_ADMIN'
  ) then
    raise exception using errcode = '23514', message = 'INVALID_STAFF_ROLE';
  end if;

  if tg_op = 'UPDATE' and v_auth_user_text is distinct from v_old_auth_user_text then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW';
  end if;

  -- The workspace Staff editor is not an auth-user creation endpoint. A Staff
  -- record can request login only after the dedicated User Approvals flow has
  -- created/linked auth.users + uc_user_roles atomically.
  if v_login_enabled and v_auth_user_text is null then
    raise exception using errcode = '23514', message = 'STAFF_LOGIN_MUST_USE_AUTH_FLOW';
  end if;

  -- Operational-only Staff have no auth/profile mirror to synchronize.
  if v_auth_user_text is null then
    return new;
  end if;

  if v_auth_user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '23514', message = 'INVALID_STAFF_AUTH_LINK';
  end if;
  v_auth_user_id := v_auth_user_text::uuid;

  if tg_op = 'UPDATE' then
    if v_master_email is distinct from v_old_email
       or v_master_login_email is distinct from v_old_login_email then
      raise exception using errcode = '23514', message = 'STAFF_LOGIN_EMAIL_MUST_USE_AUTH_FLOW';
    end if;
    if lower(coalesce(v_new ->> 'login_enabled', 'false'))
       is distinct from lower(coalesce(v_old ->> 'login_enabled', 'false')) then
      raise exception using errcode = '23514', message = 'STAFF_LOGIN_ACCESS_MUST_USE_AUTH_FLOW';
    end if;
  end if;

  select status
    into v_role_status
    from public.uc_user_roles
   where user_id = v_auth_user_id
      or staff_id = new.id
   order by case when staff_id = new.id then 0 else 1 end, updated_at desc
   limit 1
   for update;

  if v_role_status is null then
    raise exception using errcode = '23503', message = 'STAFF_ROLE_ASSIGNMENT_NOT_FOUND';
  end if;

  -- Pending/rejected access stays under User Approvals. HR edits may change
  -- operational profile details, but may not activate or re-role those users.
  if v_role_status in ('pending', 'rejected') and tg_op = 'UPDATE' then
    if v_status is distinct from lower(coalesce(v_old ->> 'status', ''))
       or v_role_key is distinct from upper(coalesce(v_old ->> 'role_key', '')) then
      raise exception using errcode = '23514', message = 'STAFF_ACCESS_MUST_USE_AUTH_FLOW';
    end if;
  end if;

  if v_role_status in ('pending', 'rejected') then
    v_profile_status := case when v_role_status = 'rejected' then 'inactive' else 'pending' end;
  else
    v_profile_status := case when v_status = 'active' then 'active' else 'inactive' end;
  end if;

  select * into v_existing_profile
    from public."StaffProfile"
   where id = new.id
   for update;

  insert into public."StaffProfile" (
    id, code, name, phone, email, "roleId", department, designation,
    "reportingManagerId", status, "joiningDate", "exitDate", city, address,
    "emergencyContact", "attendancePolicyId", "salaryType", "monthlySalary",
    "dailyWage", "bankDetailsJson", "gpsTrackingEnabled", "dataJson",
    workspace_id, revision, updated_at, updated_by
  ) values (
    new.id,
    v_code,
    v_name,
    nullif(btrim(coalesce(v_new ->> 'phone', '')), ''),
    nullif(v_master_email, ''),
    v_role_key,
    nullif(btrim(coalesce(v_new ->> 'department', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'designation', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'reporting_manager_id', '')), ''),
    v_profile_status,
    nullif(btrim(coalesce(v_new ->> 'joining_date', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'exit_date', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'city', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'address', '')), ''),
    nullif(btrim(coalesce(v_new ->> 'emergency_contact', '')), ''),
    nullif(btrim(coalesce(v_new #>> '{attendance_policy,id}', '')), ''),
    coalesce(nullif(btrim(coalesce(v_new ->> 'salary_type', '')), ''), 'monthly'),
    nullif(v_new ->> 'monthly_salary', '')::double precision,
    nullif(v_new ->> 'daily_wage', '')::double precision,
    case when v_new ? 'bank_details' then (v_new -> 'bank_details')::text else null end,
    lower(coalesce(v_new ->> 'gps_tracking_enabled', 'true')) <> 'false',
    (v_new || jsonb_build_object('authUserId', v_auth_user_id))::text,
    new.workspace_id,
    coalesce(v_existing_profile.revision, 0) + 1,
    now(),
    'workspace-staff-sync'
  )
  on conflict (id) do update set
    code = excluded.code,
    name = excluded.name,
    phone = excluded.phone,
    email = excluded.email,
    "roleId" = excluded."roleId",
    department = excluded.department,
    designation = excluded.designation,
    "reportingManagerId" = excluded."reportingManagerId",
    status = excluded.status,
    "joiningDate" = excluded."joiningDate",
    "exitDate" = excluded."exitDate",
    city = excluded.city,
    address = excluded.address,
    "emergencyContact" = excluded."emergencyContact",
    "attendancePolicyId" = excluded."attendancePolicyId",
    "salaryType" = excluded."salaryType",
    "monthlySalary" = excluded."monthlySalary",
    "dailyWage" = excluded."dailyWage",
    "bankDetailsJson" = excluded."bankDetailsJson",
    "gpsTrackingEnabled" = excluded."gpsTrackingEnabled",
    "dataJson" = excluded."dataJson",
    workspace_id = excluded.workspace_id,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  -- For approved/inactive linked users, HR role/lifecycle edits are mirrored to
  -- the access row. Pending/rejected access remains controlled only by the User
  -- Approvals flow, while display name still follows the Staff profile.
  if v_role_status in ('active', 'inactive') then
    update public.uc_user_roles
       set role = v_role_key,
           display_name = v_name,
           staff_id = new.id,
           status = case when v_status = 'active' then 'active' else 'inactive' end,
           updated_at = now()
     where user_id = v_auth_user_id;
  else
    update public.uc_user_roles
       set display_name = v_name,
           staff_id = new.id,
           updated_at = now()
     where user_id = v_auth_user_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.uc_sync_workspace_staff_mirrors() from public, anon, authenticated, service_role;

drop trigger if exists entity_master_staff_workspace_mirror on public.entity_master_staff;
create trigger entity_master_staff_workspace_mirror
after insert or update on public.entity_master_staff
for each row
execute function public.uc_sync_workspace_staff_mirrors();

create or replace function public.uc_guard_workspace_staff_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if current_setting('uc.write_source', true) = 'workspace-commit'
     and nullif(btrim(coalesce(old.data ->> 'auth_user_id', '')), '') is not null then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_DELETE_MUST_USE_AUTH_FLOW';
  end if;
  return old;
end;
$function$;

revoke all on function public.uc_guard_workspace_staff_delete() from public, anon, authenticated, service_role;

drop trigger if exists entity_master_staff_workspace_delete_guard on public.entity_master_staff;
create trigger entity_master_staff_workspace_delete_guard
before delete on public.entity_master_staff
for each row
execute function public.uc_guard_workspace_staff_delete();

comment on function public.uc_sync_workspace_staff_mirrors() is
  'Mirrors workspace-origin edits for already-auth-linked Staff into StaffProfile and uc_user_roles while keeping auth identity/approval changes on the dedicated auth flow.';
comment on function public.uc_guard_workspace_staff_delete() is
  'Prevents normal workspace commits from deleting Staff records that are linked to authentication identities.';

commit;
