begin;

-- uc_user_roles is an access/approval ledger, not a second Staff profile.
-- Refuse convergence unless every access row already points at the canonical
-- Staff record for the same authenticated user.
do $guard$
begin
  if exists (
    select 1
    from public.uc_user_roles r
    where r.staff_id is null
  ) then
    raise exception using
      errcode = '23502',
      message = 'USER_ACCESS_CANONICALIZATION_ABORTED: access row missing staff_id';
  end if;

  if exists (
    select 1
    from public.uc_user_roles r
    left join public.entity_master_staff m on m.id = r.staff_id
    where m.id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'USER_ACCESS_CANONICALIZATION_ABORTED: access row points to missing Staff';
  end if;

  if exists (
    select 1
    from public.uc_user_roles r
    join public.entity_master_staff m on m.id = r.staff_id
    where nullif(m.data ->> 'auth_user_id', '') is distinct from r.user_id::text
  ) then
    raise exception using
      errcode = '23514',
      message = 'USER_ACCESS_CANONICALIZATION_ABORTED: auth user and Staff link disagree';
  end if;
end;
$guard$;

-- The old drift view depends on the mirrored columns that are being removed.
drop view if exists public.staff_identity_drift_report;
drop index if exists public.uc_user_roles_email_idx;

alter table public.uc_user_roles
  drop column if exists email,
  drop column if exists display_name,
  drop column if exists role;

alter table public.uc_user_roles
  alter column staff_id set not null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.uc_user_roles'::regclass
      and conname = 'uc_user_roles_staff_id_fkey'
  ) then
    alter table public.uc_user_roles
      add constraint uc_user_roles_staff_id_fkey
      foreign key (staff_id)
      references public.entity_master_staff(id)
      on delete restrict;
  end if;
end;
$constraint$;

comment on table public.uc_user_roles is
  'Login access approval/audit state only. Canonical Staff profile identity and role live in entity_master_staff; authentication identity lives in auth.users.';

comment on column public.uc_user_roles.staff_id is
  'Required link to the canonical entity_master_staff record for this authenticated user.';

-- Keep the RPC contract stable for the application while storing identity and
-- role only once, on canonical Staff. The access table stores approval state.
create or replace function public.sync_staff_identity_bundle(
  p_assignment_id uuid,
  p_user_id uuid,
  p_email text,
  p_role text,
  p_display_name text,
  p_status text,
  p_staff_id text default null,
  p_approved_by uuid default null,
  p_approved_at timestamptz default null,
  p_rejected_at timestamptz default null,
  p_workspace_id text default 'default'
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_display_name, ''));
  v_requested_staff_id text := nullif(trim(coalesce(p_staff_id, '')), '');
  v_staff_id text;
  v_code text;
  v_staff_status text;
  v_role_label text;
  v_existing_master public.entity_master_staff%rowtype;
  v_role_row public.uc_user_roles%rowtype;
  v_master_data jsonb;
  v_workspace_revision integer;
  v_next_workspace_revision integer;
  v_gps_enabled boolean := true;
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;
  if v_email = '' then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if v_name = '' then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  if p_role not in (
    'OWNER','OPERATIONS_MANAGER','FIELD_STAFF','SALES_TELECALLER',
    'PROCUREMENT_STAFF','FINANCE','ACCOUNTS_ADMIN'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;
  if p_status not in ('pending','active','rejected','inactive') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, v_now)
  on conflict (id) do nothing;

  select revision
    into v_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  select m.*
    into v_existing_master
    from public.entity_master_staff m
   where m.workspace_id = p_workspace_id
     and (
       (v_requested_staff_id is not null and m.id = v_requested_staff_id)
       or coalesce(m.data ->> 'auth_user_id', '') = p_user_id::text
       or lower(coalesce(m.data ->> 'email', '')) = v_email
     )
   order by case
     when v_requested_staff_id is not null and m.id = v_requested_staff_id then 0
     when coalesce(m.data ->> 'auth_user_id', '') = p_user_id::text then 1
     else 2
   end
   limit 1
   for update;

  v_staff_id := coalesce(
    v_existing_master.id,
    v_requested_staff_id,
    'staff-auth-' || left(replace(p_user_id::text, '-', ''), 12)
  );
  v_code := coalesce(
    nullif(v_existing_master.data ->> 'code', ''),
    'AUTH-' || upper(left(replace(p_user_id::text, '-', ''), 8))
  );
  v_staff_status := case
    when p_status in ('rejected','inactive') then 'inactive'
    else p_status
  end;
  v_role_label := case p_role
    when 'OWNER' then 'Owner'
    when 'OPERATIONS_MANAGER' then 'Operations Manager'
    when 'FIELD_STAFF' then 'Field Staff'
    when 'SALES_TELECALLER' then 'Sales / Telecaller'
    when 'PROCUREMENT_STAFF' then 'Procurement Staff'
    when 'FINANCE' then 'Finance'
    when 'ACCOUNTS_ADMIN' then 'Accounts / Admin'
    else 'Staff'
  end;
  v_gps_enabled := case lower(coalesce(v_existing_master.data ->> 'gps_tracking_enabled', 'true'))
    when 'false' then false
    else true
  end;

  v_master_data :=
    jsonb_build_object(
      'phone','',
      'department','',
      'designation','',
      'salary_type','monthly',
      'attendance_policy', jsonb_build_object(
        'id','policy-' || v_staff_id,
        'grace_period_minutes',15,
        'late_grace_minutes',15,
        'absent_deduction_enabled',false,
        'absent_deduction_days',0
      )
    )
    || coalesce(v_existing_master.data, '{}'::jsonb)
    || jsonb_build_object(
      'id',v_staff_id,
      'code',v_code,
      'name',v_name,
      'email',v_email,
      'auth_user_id',p_user_id,
      'role',v_role_label,
      'role_key',p_role,
      'status',v_staff_status,
      'gps_tracking_enabled',v_gps_enabled,
      'login_enabled',p_status in ('pending','active'),
      'login_email',v_email,
      'created_at',coalesce(v_existing_master.data ->> 'created_at',v_now::text),
      'updated_at',v_now
    );

  insert into public.entity_master_staff (
    id, workspace_id, revision, updated_at, updated_by, data
  )
  values (
    v_staff_id,
    p_workspace_id,
    coalesce(v_existing_master.revision,-1)+1,
    v_now,
    'auth-system',
    v_master_data
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    data = excluded.data;

  v_next_workspace_revision := v_workspace_revision + 1;
  update public.entity_workspace_revision
     set revision = v_next_workspace_revision,
         updated_at = v_now
   where id = p_workspace_id;

  if p_assignment_id is null then
    insert into public.uc_user_roles (
      user_id, staff_id, status,
      approved_by, approved_at, rejected_at, created_at, updated_at
    )
    values (
      p_user_id, v_staff_id, p_status,
      case when p_status in ('active','rejected') then p_approved_by else null end,
      case when p_status = 'active' then coalesce(p_approved_at,v_now) else null end,
      case when p_status = 'rejected' then coalesce(p_rejected_at,v_now) else null end,
      v_now, v_now
    )
    returning * into v_role_row;
  else
    update public.uc_user_roles
       set user_id = p_user_id,
           staff_id = v_staff_id,
           status = p_status,
           approved_by = case when p_status in ('active','rejected') then p_approved_by else null end,
           approved_at = case when p_status = 'active' then coalesce(p_approved_at,v_now) else null end,
           rejected_at = case when p_status = 'rejected' then coalesce(p_rejected_at,v_now) else null end,
           updated_at = v_now
     where id = p_assignment_id
    returning * into v_role_row;

    if not found then
      raise exception using errcode = 'P0002', message = 'ROLE_ASSIGNMENT_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'assignment', to_jsonb(v_role_row),
    'staffId', v_staff_id,
    'workspaceRevision', v_next_workspace_revision
  );
end;
$function$;

revoke all on function public.sync_staff_identity_bundle(
  uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.sync_staff_identity_bundle(
  uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text
) to service_role;

-- Workspace Staff edits may update access status/linkage, but do not copy
-- identity/name/role back into the access ledger.
create or replace function public.uc_sync_workspace_staff_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_new jsonb := coalesce(new.data, '{}'::jsonb);
  v_old jsonb := case
    when tg_op = 'UPDATE' then coalesce(old.data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_name text := btrim(coalesce(v_new ->> 'name', ''));
  v_role_key text := upper(btrim(coalesce(v_new ->> 'role_key', 'FIELD_STAFF')));
  v_status text := lower(btrim(coalesce(v_new ->> 'status', 'active')));
  v_auth_user_text text := nullif(btrim(coalesce(v_new ->> 'auth_user_id', '')), '');
  v_old_auth_user_text text := nullif(btrim(coalesce(v_old ->> 'auth_user_id', '')), '');
  v_auth_user_id uuid;
  v_role_assignment_id uuid;
  v_role_status text;
  v_master_email text := lower(btrim(coalesce(v_new ->> 'email', '')));
  v_master_login_email text := lower(btrim(coalesce(v_new ->> 'login_email', '')));
  v_old_email text := lower(btrim(coalesce(v_old ->> 'email', '')));
  v_old_login_email text := lower(btrim(coalesce(v_old ->> 'login_email', '')));
  v_login_enabled boolean := lower(coalesce(v_new ->> 'login_enabled', 'false')) = 'true';
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

  if tg_op = 'INSERT' and v_auth_user_text is not null then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW';
  end if;
  if tg_op = 'UPDATE' and v_auth_user_text is distinct from v_old_auth_user_text then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW';
  end if;
  if v_login_enabled and v_auth_user_text is null then
    raise exception using errcode = '23514', message = 'STAFF_LOGIN_MUST_USE_AUTH_FLOW';
  end if;

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

  select id, status
    into v_role_assignment_id, v_role_status
    from public.uc_user_roles
   where user_id = v_auth_user_id
      or staff_id = new.id
   order by case when staff_id = new.id then 0 else 1 end, updated_at desc
   limit 1
   for update;

  if v_role_assignment_id is null or v_role_status is null then
    raise exception using errcode = '23503', message = 'STAFF_ROLE_ASSIGNMENT_NOT_FOUND';
  end if;

  if v_role_status in ('pending', 'rejected') and tg_op = 'UPDATE' then
    if v_status is distinct from lower(coalesce(v_old ->> 'status', ''))
       or v_role_key is distinct from upper(coalesce(v_old ->> 'role_key', '')) then
      raise exception using errcode = '23514', message = 'STAFF_ACCESS_MUST_USE_AUTH_FLOW';
    end if;
  end if;

  if v_role_status in ('active', 'inactive') then
    update public.uc_user_roles
       set staff_id = new.id,
           status = case when v_status = 'active' then 'active' else 'inactive' end,
           updated_at = now()
     where id = v_role_assignment_id;
  else
    update public.uc_user_roles
       set staff_id = new.id,
           updated_at = now()
     where id = v_role_assignment_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.uc_sync_workspace_staff_access()
from public, anon, authenticated, service_role;

-- Keep the existing User Approvals diagnostic API shape while comparing only
-- true separate concerns: access state versus canonical Staff linkage/status.
create view public.staff_identity_drift_report
with (security_invoker = true)
as
with role_rows as (
  select
    r.id as role_assignment_id,
    r.user_id,
    r.staff_id,
    r.status as role_status,
    case
      when r.status in ('rejected','inactive') then 'inactive'
      else r.status
    end as expected_profile_status
  from public.uc_user_roles r
),
master_rows as (
  select
    m.id,
    lower(nullif(btrim(m.data ->> 'email'), '')) as master_email,
    nullif(m.data ->> 'role_key', '') as master_role,
    nullif(m.data ->> 'status', '') as master_status,
    case
      when coalesce(m.data ->> 'auth_user_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (m.data ->> 'auth_user_id')::uuid
      else null::uuid
    end as master_auth_user_id
  from public.entity_master_staff m
),
combined as (
  select
    coalesce(r.staff_id, 'role:' || r.role_assignment_id::text) as identity_key,
    r.role_assignment_id,
    r.user_id,
    r.staff_id,
    m.master_email as email,
    m.master_role as role,
    r.role_status,
    r.expected_profile_status,
    m.master_email as profile_email,
    m.master_role as profile_role,
    m.master_status as profile_status,
    m.master_auth_user_id as profile_auth_user_id,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    m.id is not null as profile_exists,
    m.id is not null as master_exists
  from role_rows r
  left join master_rows m on m.id = r.staff_id

  union all

  select
    m.id,
    null::uuid,
    m.master_auth_user_id,
    m.id,
    m.master_email,
    m.master_role,
    null::text,
    null::text,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    true,
    true
  from master_rows m
  left join role_rows r on r.staff_id = m.id
  where r.role_assignment_id is null
)
select
  c.identity_key,
  c.role_assignment_id,
  c.user_id,
  c.staff_id,
  c.email,
  c.role,
  c.role_status,
  c.expected_profile_status,
  c.profile_email,
  c.profile_role,
  c.profile_status,
  c.profile_auth_user_id,
  c.master_email,
  c.master_role,
  c.master_status,
  c.master_auth_user_id,
  c.profile_exists,
  c.master_exists,
  d.drift_reasons,
  cardinality(d.drift_reasons) > 0 as is_drifted
from combined c
cross join lateral (
  select array_remove(array[
    case when c.role_assignment_id is null then 'missing_role_assignment' end,
    case when c.role_assignment_id is not null and c.staff_id is null then 'role_missing_staff_id' end,
    case when not c.master_exists then 'missing_master_staff' end,
    case
      when c.master_exists
       and c.expected_profile_status is not null
       and c.master_status is distinct from c.expected_profile_status
      then 'master_status_mismatch'
    end,
    case
      when c.master_exists
       and c.user_id is not null
       and c.master_auth_user_id is distinct from c.user_id
      then 'master_auth_user_mismatch'
    end
  ], null::text) as drift_reasons
) d;

revoke all on public.staff_identity_drift_report from public, anon, authenticated;
grant select on public.staff_identity_drift_report to service_role;

commit;
