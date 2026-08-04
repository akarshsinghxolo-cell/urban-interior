create or replace function public.uc_resolve_staff_reference(
  p_workspace_id text,
  p_reference text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_staff_id text;
  v_match_count integer;
begin
  if v_reference is null then
    return null;
  end if;

  select staff.id
    into v_staff_id
  from public.entity_master_staff as staff
  where staff.workspace_id = p_workspace_id
    and staff.id = v_reference
  limit 1;

  if v_staff_id is not null then
    return v_staff_id;
  end if;

  select count(*)::integer, min(staff.id)
    into v_match_count, v_staff_id
  from public.entity_master_staff as staff
  where staff.workspace_id = p_workspace_id
    and lower(btrim(coalesce(staff.data ->> 'name', ''))) = lower(v_reference);

  if v_match_count = 0 then
    raise exception using
      errcode = '23503',
      message = format('STAFF_ASSIGNMENT_UNKNOWN: %s', v_reference);
  end if;

  if v_match_count > 1 then
    raise exception using
      errcode = '21000',
      message = format('STAFF_ASSIGNMENT_AMBIGUOUS: %s', v_reference);
  end if;

  return v_staff_id;
end;
$$;

revoke all on function public.uc_resolve_staff_reference(text, text) from public, anon, authenticated, service_role;

create or replace function public.uc_canonicalize_staff_assignment_payload(
  p_table_name text,
  p_workspace_id text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_reference text;
  v_staff_id text;
begin
  case p_table_name
    when 'entity_tasks' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assigned_to_staff_id'), ''),
          nullif(btrim(v_data ->> 'assignee_id'), ''),
          nullif(btrim(v_data ->> 'assignee_name'), ''),
          nullif(btrim(v_data ->> 'assigned_to'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assigned_to_staff_id', 'assignee_id', 'assignee_name', 'assigned_to', 'assigned_role'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_followups' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assigned_to_staff_id'), ''),
          nullif(btrim(v_data ->> 'assigned_to'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assigned_to_staff_id', 'assigned_to', 'assigned_role'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_visits' then
      if lower(btrim(coalesce(v_data ->> 'assignee_type', ''))) = 'contractor' then
        return v_data - array['assigned_staff_id', 'staff_id', 'staff_name'];
      end if;

      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'staff_id'), ''),
          nullif(btrim(v_data ->> 'staff_name'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['staff_id', 'staff_name'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
        v_data := jsonb_set(v_data, '{assignee_type}', '"staff"'::jsonb, true);
      end if;

    when 'entity_recurringTasks' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assignee_id'), ''),
          nullif(btrim(v_data ->> 'assignee_name'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assignee_id', 'assignee_name'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_approvalPolicies' then
      if v_data ? 'approver_id' then
        v_reference := nullif(btrim(v_data ->> 'approver_id'), '');
      else
        v_reference := nullif(btrim(v_data ->> 'approver_name'), '');
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - 'approver_name';
      if v_staff_id is null then
        v_data := v_data - 'approver_id';
      else
        v_data := jsonb_set(v_data, '{approver_id}', to_jsonb(v_staff_id), true);
      end if;

    else
      raise exception using
        errcode = '22023',
        message = format('UNSUPPORTED_STAFF_ASSIGNMENT_TABLE: %s', p_table_name);
  end case;

  return v_data;
end;
$$;

revoke all on function public.uc_canonicalize_staff_assignment_payload(text, text, jsonb) from public, anon, authenticated, service_role;

-- Normalize current assignment records before constraints are introduced.
update public.entity_tasks
set data = public.uc_canonicalize_staff_assignment_payload('entity_tasks', workspace_id, data);

update public.entity_followups
set data = public.uc_canonicalize_staff_assignment_payload('entity_followups', workspace_id, data);

update public.entity_visits
set data = public.uc_canonicalize_staff_assignment_payload('entity_visits', workspace_id, data);

update public."entity_recurringTasks"
set data = public.uc_canonicalize_staff_assignment_payload('entity_recurringTasks', workspace_id, data);

update public."entity_approvalPolicies"
set data = public.uc_canonicalize_staff_assignment_payload('entity_approvalPolicies', workspace_id, data);

-- Historical ownership remains staff_id, but duplicate display labels are not persisted.
update public.entity_attendance set data = data - 'staff_name' where data ? 'staff_name';
update public."entity_payrollLines" set data = data - 'staff_name' where data ? 'staff_name';
update public."entity_leaveRequests" set data = data - 'staff_name' where data ? 'staff_name';
update public."entity_salaryAdjustments" set data = data - 'staff_name' where data ? 'staff_name';

create or replace function public.uc_guard_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_old_data jsonb;
  v_old_staff_id text;
  v_new_staff_id text;
  v_staff_status text;
begin
  new.data := public.uc_canonicalize_staff_assignment_payload(tg_table_name, new.workspace_id, new.data);

  if tg_table_name = 'entity_approvalPolicies' then
    v_new_staff_id := nullif(btrim(new.data ->> 'approver_id'), '');
  else
    v_new_staff_id := nullif(btrim(new.data ->> 'assigned_staff_id'), '');
  end if;

  if tg_op = 'UPDATE' then
    v_old_data := public.uc_canonicalize_staff_assignment_payload(tg_table_name, old.workspace_id, old.data);
    if tg_table_name = 'entity_approvalPolicies' then
      v_old_staff_id := nullif(btrim(v_old_data ->> 'approver_id'), '');
    else
      v_old_staff_id := nullif(btrim(v_old_data ->> 'assigned_staff_id'), '');
    end if;
  end if;

  if v_new_staff_id is not null
     and (tg_op = 'INSERT' or v_new_staff_id is distinct from v_old_staff_id) then
    select lower(btrim(coalesce(staff.data ->> 'status', '')))
      into v_staff_status
    from public.entity_master_staff as staff
    where staff.workspace_id = new.workspace_id
      and staff.id = v_new_staff_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = format('STAFF_ASSIGNMENT_UNKNOWN: %s', v_new_staff_id);
    end if;

    if v_staff_status <> 'active' then
      raise exception using
        errcode = '23514',
        message = format('STAFF_ASSIGNMENT_REQUIRES_ACTIVE_STAFF: %s', v_new_staff_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.uc_guard_staff_assignment() from public, anon, authenticated, service_role;

create or replace function public.uc_normalize_staff_history_payload()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  new.data := coalesce(new.data, '{}'::jsonb) - 'staff_name';
  return new;
end;
$$;

revoke all on function public.uc_normalize_staff_history_payload() from public, anon, authenticated, service_role;

-- New assignments are canonicalized and may only target active Staff.
drop trigger if exists entity_tasks_staff_assignment_guard on public.entity_tasks;
create trigger entity_tasks_staff_assignment_guard
before insert or update of data on public.entity_tasks
for each row execute function public.uc_guard_staff_assignment();

drop trigger if exists entity_followups_staff_assignment_guard on public.entity_followups;
create trigger entity_followups_staff_assignment_guard
before insert or update of data on public.entity_followups
for each row execute function public.uc_guard_staff_assignment();

drop trigger if exists entity_visits_staff_assignment_guard on public.entity_visits;
create trigger entity_visits_staff_assignment_guard
before insert or update of data on public.entity_visits
for each row execute function public.uc_guard_staff_assignment();

drop trigger if exists entity_recurring_tasks_staff_assignment_guard on public."entity_recurringTasks";
create trigger entity_recurring_tasks_staff_assignment_guard
before insert or update of data on public."entity_recurringTasks"
for each row execute function public.uc_guard_staff_assignment();

drop trigger if exists entity_approval_policies_staff_assignment_guard on public."entity_approvalPolicies";
create trigger entity_approval_policies_staff_assignment_guard
before insert or update of data on public."entity_approvalPolicies"
for each row execute function public.uc_guard_staff_assignment();

-- Historical HR rows keep IDs and shed duplicate labels on all future writes.
drop trigger if exists entity_attendance_staff_history_normalizer on public.entity_attendance;
create trigger entity_attendance_staff_history_normalizer
before insert or update of data on public.entity_attendance
for each row execute function public.uc_normalize_staff_history_payload();

drop trigger if exists entity_payroll_lines_staff_history_normalizer on public."entity_payrollLines";
create trigger entity_payroll_lines_staff_history_normalizer
before insert or update of data on public."entity_payrollLines"
for each row execute function public.uc_normalize_staff_history_payload();

drop trigger if exists entity_leave_requests_staff_history_normalizer on public."entity_leaveRequests";
create trigger entity_leave_requests_staff_history_normalizer
before insert or update of data on public."entity_leaveRequests"
for each row execute function public.uc_normalize_staff_history_payload();

drop trigger if exists entity_salary_adjustments_staff_history_normalizer on public."entity_salaryAdjustments";
create trigger entity_salary_adjustments_staff_history_normalizer
before insert or update of data on public."entity_salaryAdjustments"
for each row execute function public.uc_normalize_staff_history_payload();

-- Generated relationship columns expose JSON Staff references to PostgreSQL RI.
alter table public.entity_tasks
  add column if not exists assigned_staff_id text
  generated always as (nullif(btrim(data ->> 'assigned_staff_id'), '')) stored;

alter table public.entity_followups
  add column if not exists assigned_staff_id text
  generated always as (nullif(btrim(data ->> 'assigned_staff_id'), '')) stored;

alter table public."entity_recurringTasks"
  add column if not exists assigned_staff_id text
  generated always as (nullif(btrim(data ->> 'assigned_staff_id'), '')) stored;

alter table public.entity_visits
  add column if not exists staff_id text
  generated always as (nullif(btrim(data ->> 'assigned_staff_id'), '')) stored;

alter table public.entity_attendance
  add column if not exists staff_id text
  generated always as (nullif(btrim(data ->> 'staff_id'), '')) stored;

alter table public."entity_payrollLines"
  add column if not exists staff_id text
  generated always as (nullif(btrim(data ->> 'staff_id'), '')) stored;

alter table public."entity_leaveRequests"
  add column if not exists staff_id text
  generated always as (nullif(btrim(data ->> 'staff_id'), '')) stored;

alter table public."entity_salaryAdjustments"
  add column if not exists staff_id text
  generated always as (nullif(btrim(data ->> 'staff_id'), '')) stored;

alter table public."entity_approvalPolicies"
  add column if not exists approver_staff_id text
  generated always as (nullif(btrim(data ->> 'approver_id'), '')) stored;

-- Composite target key ensures Staff references cannot cross workspaces.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.entity_master_staff'::regclass
      and conname = 'entity_master_staff_workspace_id_id_key'
  ) then
    alter table public.entity_master_staff
      add constraint entity_master_staff_workspace_id_id_key unique (workspace_id, id);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.entity_tasks'::regclass and conname='entity_tasks_assigned_staff_fkey') then
    alter table public.entity_tasks add constraint entity_tasks_assigned_staff_fkey
      foreign key (workspace_id, assigned_staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.entity_followups'::regclass and conname='entity_followups_assigned_staff_fkey') then
    alter table public.entity_followups add constraint entity_followups_assigned_staff_fkey
      foreign key (workspace_id, assigned_staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public."entity_recurringTasks"'::regclass and conname='entity_recurring_tasks_assigned_staff_fkey') then
    alter table public."entity_recurringTasks" add constraint entity_recurring_tasks_assigned_staff_fkey
      foreign key (workspace_id, assigned_staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.entity_visits'::regclass and conname='entity_visits_staff_fkey') then
    alter table public.entity_visits add constraint entity_visits_staff_fkey
      foreign key (workspace_id, staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.entity_attendance'::regclass and conname='entity_attendance_staff_fkey') then
    alter table public.entity_attendance add constraint entity_attendance_staff_fkey
      foreign key (workspace_id, staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public."entity_payrollLines"'::regclass and conname='entity_payroll_lines_staff_fkey') then
    alter table public."entity_payrollLines" add constraint entity_payroll_lines_staff_fkey
      foreign key (workspace_id, staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public."entity_leaveRequests"'::regclass and conname='entity_leave_requests_staff_fkey') then
    alter table public."entity_leaveRequests" add constraint entity_leave_requests_staff_fkey
      foreign key (workspace_id, staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public."entity_salaryAdjustments"'::regclass and conname='entity_salary_adjustments_staff_fkey') then
    alter table public."entity_salaryAdjustments" add constraint entity_salary_adjustments_staff_fkey
      foreign key (workspace_id, staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public."entity_approvalPolicies"'::regclass and conname='entity_approval_policies_staff_fkey') then
    alter table public."entity_approvalPolicies" add constraint entity_approval_policies_staff_fkey
      foreign key (workspace_id, approver_staff_id)
      references public.entity_master_staff(workspace_id, id) on delete restrict;
  end if;
end;
$$;

create index if not exists entity_tasks_assigned_staff_idx on public.entity_tasks(workspace_id, assigned_staff_id) where assigned_staff_id is not null;
create index if not exists entity_followups_assigned_staff_idx on public.entity_followups(workspace_id, assigned_staff_id) where assigned_staff_id is not null;
create index if not exists entity_recurring_tasks_assigned_staff_idx on public."entity_recurringTasks"(workspace_id, assigned_staff_id) where assigned_staff_id is not null;
create index if not exists entity_visits_staff_idx on public.entity_visits(workspace_id, staff_id) where staff_id is not null;
create index if not exists entity_attendance_staff_idx on public.entity_attendance(workspace_id, staff_id) where staff_id is not null;
create index if not exists entity_payroll_lines_staff_idx on public."entity_payrollLines"(workspace_id, staff_id) where staff_id is not null;
create index if not exists entity_leave_requests_staff_idx on public."entity_leaveRequests"(workspace_id, staff_id) where staff_id is not null;
create index if not exists entity_salary_adjustments_staff_idx on public."entity_salaryAdjustments"(workspace_id, staff_id) where staff_id is not null;
create index if not exists entity_approval_policies_staff_idx on public."entity_approvalPolicies"(workspace_id, approver_staff_id) where approver_staff_id is not null;

-- Staff lifecycle: application/workspace deletes are forbidden. Mark Staff inactive instead.
create or replace function public.uc_guard_workspace_staff_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if current_setting('uc.write_source', true) = 'workspace-commit' then
    raise exception using
      errcode = '23514',
      message = 'STAFF_DELETE_FORBIDDEN_USE_INACTIVE';
  end if;
  return old;
end;
$$;

revoke all on function public.uc_guard_workspace_staff_delete() from public, anon, authenticated, service_role;

-- GPS route history must survive Staff lifecycle changes.
alter table public."StaffRouteBundle"
  drop constraint if exists "StaffRouteBundle_staffId_fkey";

alter table public."StaffRouteBundle"
  add constraint "StaffRouteBundle_staffId_fkey"
  foreign key ("staffId") references public.entity_master_staff(id) on delete restrict;

-- Runtime has zero compatibility-view consumers; canonical Staff is now the only source.
drop view if exists public."StaffProfile";
