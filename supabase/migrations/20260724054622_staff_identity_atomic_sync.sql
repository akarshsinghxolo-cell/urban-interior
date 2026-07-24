-- Consolidate staff identity writes and expose a drift report.
-- Legacy objects are marked deprecated here and removed in a later migration.

create or replace view public.staff_identity_drift_report
with (security_invoker = true)
as
with role_rows as (
  select
    r.id as role_assignment_id,
    r.user_id,
    r.staff_id,
    lower(nullif(trim(r.email), '')) as role_email,
    r.role as role_key,
    r.status as role_status,
    case when r.status in ('rejected', 'inactive') then 'inactive' else r.status end as expected_profile_status
  from public.uc_user_roles r
),
profile_rows as (
  select
    p.id,
    p.code,
    lower(nullif(trim(p.email), '')) as profile_email,
    p."roleId" as profile_role,
    p.status as profile_status,
    nullif((nullif(p."dataJson", '')::jsonb ->> 'authUserId'), '')::uuid as profile_auth_user_id
  from public."StaffProfile" p
),
master_rows as (
  select
    m.id,
    lower(nullif(trim(m.data ->> 'email'), '')) as master_email,
    nullif(m.data ->> 'role_key', '') as master_role,
    nullif(m.data ->> 'status', '') as master_status,
    nullif(m.data ->> 'auth_user_id', '')::uuid as master_auth_user_id
  from public.entity_master_staff m
),
combined as (
  select
    coalesce(r.staff_id, 'role:' || r.role_assignment_id::text) as identity_key,
    r.role_assignment_id,
    r.user_id,
    r.staff_id,
    r.role_email as email,
    r.role_key as role,
    r.role_status,
    r.expected_profile_status,
    p.profile_email,
    p.profile_role,
    p.profile_status,
    p.profile_auth_user_id,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    (p.id is not null) as profile_exists,
    (m.id is not null) as master_exists
  from role_rows r
  left join profile_rows p on p.id = r.staff_id
  left join master_rows m on m.id = r.staff_id

  union all

  select
    p.id,
    null::uuid,
    p.profile_auth_user_id,
    p.id,
    p.profile_email,
    p.profile_role,
    null::text,
    null::text,
    p.profile_email,
    p.profile_role,
    p.profile_status,
    p.profile_auth_user_id,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    true,
    (m.id is not null)
  from profile_rows p
  left join role_rows r on r.staff_id = p.id
  left join master_rows m on m.id = p.id
  where r.role_assignment_id is null

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
    null::text,
    null::text,
    null::text,
    null::uuid,
    m.master_email,
    m.master_role,
    m.master_status,
    m.master_auth_user_id,
    false,
    true
  from master_rows m
  left join role_rows r on r.staff_id = m.id
  left join profile_rows p on p.id = m.id
  where r.role_assignment_id is null
    and p.id is null
)
select
  c.*,
  d.drift_reasons,
  cardinality(d.drift_reasons) > 0 as is_drifted
from combined c
cross join lateral (
  select array_remove(array[
    case when c.role_assignment_id is null then 'missing_role_assignment' end,
    case when c.role_assignment_id is not null and c.staff_id is null then 'role_missing_staff_id' end,
    case when not c.profile_exists then 'missing_staff_profile' end,
    case when not c.master_exists then 'missing_master_staff' end,
    case when c.profile_exists and c.email is not null and c.profile_email is distinct from c.email then 'profile_email_mismatch' end,
    case when c.master_exists and c.email is not null and c.master_email is distinct from c.email then 'master_email_mismatch' end,
    case when c.profile_exists and c.role is not null and c.profile_role is distinct from c.role then 'profile_role_mismatch' end,
    case when c.master_exists and c.role is not null and c.master_role is distinct from c.role then 'master_role_mismatch' end,
    case when c.profile_exists and c.expected_profile_status is not null and c.profile_status is distinct from c.expected_profile_status then 'profile_status_mismatch' end,
    case when c.master_exists and c.expected_profile_status is not null and c.master_status is distinct from c.expected_profile_status then 'master_status_mismatch' end,
    case when c.profile_exists and c.user_id is not null and c.profile_auth_user_id is distinct from c.user_id then 'profile_auth_user_mismatch' end,
    case when c.master_exists and c.user_id is not null and c.master_auth_user_id is distinct from c.user_id then 'master_auth_user_mismatch' end
  ]::text[], null) as drift_reasons
) d;

revoke all on public.staff_identity_drift_report from public, anon, authenticated;
grant select on public.staff_identity_drift_report to service_role;

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
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_display_name, ''));
  v_requested_staff_id text := nullif(trim(coalesce(p_staff_id, '')), '');
  v_staff_id text;
  v_code text;
  v_profile_status text;
  v_role_label text;
  v_existing_profile public."StaffProfile"%rowtype;
  v_existing_master public.entity_master_staff%rowtype;
  v_role_row public.uc_user_roles%rowtype;
  v_master_data jsonb;
  v_workspace_revision integer;
  v_next_workspace_revision integer;
  v_now timestamptz := now();
begin
  if p_user_id is null then raise exception using errcode = '22023', message = 'INVALID_USER_ID'; end if;
  if v_email = '' then raise exception using errcode = '22023', message = 'INVALID_EMAIL'; end if;
  if v_name = '' then raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME'; end if;
  if p_role not in ('OWNER','OPERATIONS_MANAGER','FIELD_STAFF','SALES_TELECALLER','PROCUREMENT_STAFF','FINANCE','ACCOUNTS_ADMIN') then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;
  if p_status not in ('pending','active','rejected','inactive') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, v_now)
  on conflict (id) do nothing;

  select revision into v_workspace_revision
  from public.entity_workspace_revision
  where id = p_workspace_id
  for update;

  select p.* into v_existing_profile
  from public."StaffProfile" p
  where (v_requested_staff_id is not null and p.id = v_requested_staff_id)
     or lower(coalesce(p.email, '')) = v_email
  order by case when p.id = v_requested_staff_id then 0 else 1 end
  limit 1;

  v_staff_id := coalesce(v_existing_profile.id, v_requested_staff_id, 'staff-auth-' || left(replace(p_user_id::text, '-', ''), 12));
  v_code := coalesce(v_existing_profile.code, 'AUTH-' || upper(left(replace(p_user_id::text, '-', ''), 8)));
  v_profile_status := case when p_status in ('rejected','inactive') then 'inactive' else p_status end;
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

  insert into public."StaffProfile" (id, code, name, email, "roleId", status, "salaryType", "gpsTrackingEnabled", "dataJson")
  values (
    v_staff_id,
    v_code,
    v_name,
    v_email,
    p_role,
    v_profile_status,
    coalesce(v_existing_profile."salaryType", 'monthly'),
    coalesce(v_existing_profile."gpsTrackingEnabled", true),
    jsonb_build_object('source','supabase_auth','authUserId',p_user_id,'email',v_email)::text
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    "roleId" = excluded."roleId",
    status = excluded.status,
    "dataJson" = excluded."dataJson";

  select m.* into v_existing_master
  from public.entity_master_staff m
  where m.id = v_staff_id
  for update;

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
      'status',v_profile_status,
      'gps_tracking_enabled',true,
      'login_enabled',p_status in ('pending','active'),
      'login_email',v_email,
      'created_at',coalesce(v_existing_master.data ->> 'created_at',v_now::text),
      'updated_at',v_now
    );

  insert into public.entity_master_staff (id, workspace_id, revision, updated_at, updated_by, data)
  values (v_staff_id,p_workspace_id,coalesce(v_existing_master.revision,-1)+1,v_now,'auth-system',v_master_data)
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
      user_id,email,role,staff_id,display_name,status,
      approved_by,approved_at,rejected_at,created_at,updated_at
    )
    values (
      p_user_id,v_email,p_role,v_staff_id,v_name,p_status,
      case when p_status in ('active','rejected') then p_approved_by else null end,
      case when p_status='active' then coalesce(p_approved_at,v_now) else null end,
      case when p_status='rejected' then coalesce(p_rejected_at,v_now) else null end,
      v_now,v_now
    )
    returning * into v_role_row;
  else
    update public.uc_user_roles
    set user_id=p_user_id,
        email=v_email,
        role=p_role,
        staff_id=v_staff_id,
        display_name=v_name,
        status=p_status,
        approved_by=case when p_status in ('active','rejected') then p_approved_by else null end,
        approved_at=case when p_status='active' then coalesce(p_approved_at,v_now) else null end,
        rejected_at=case when p_status='rejected' then coalesce(p_rejected_at,v_now) else null end,
        updated_at=v_now
    where id=p_assignment_id
    returning * into v_role_row;

    if not found then
      raise exception using errcode='P0002', message='ROLE_ASSIGNMENT_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'assignment',to_jsonb(v_role_row),
    'staffId',v_staff_id,
    'workspaceRevision',v_next_workspace_revision
  );
end;
$function$;

revoke all on function public.sync_staff_identity_bundle(uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text)
from public, anon, authenticated;
grant execute on function public.sync_staff_identity_bundle(uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text)
to service_role;

comment on table public."WorkspaceMeta" is
  'DEPRECATED: legacy full-workspace snapshot revision table. Use entity_workspace_revision.';
comment on function public.write_workspace_snapshot(text,text,integer) is
  'DEPRECATED: legacy full-workspace snapshot writer. Use commit_workspace_operations.';
comment on table public."entity_staffAuthUsers" is
  'DEPRECATED: unused workspace auth mirror. Use auth.users, uc_user_roles and StaffProfile.';
comment on table public."entity_staffLocationPings" is
  'DEPRECATED: workspace telemetry mirror. Use normalized StaffLocationPing via tracking API.';
