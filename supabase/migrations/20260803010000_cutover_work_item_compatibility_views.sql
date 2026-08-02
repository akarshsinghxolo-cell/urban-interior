-- Physically consolidate Tasks + Follow-ups without changing their logical
-- workspace collection contracts.
--
-- The old public tables are moved into a private rollback schema. Their public
-- names are recreated as writable compatibility views over entity_workItems,
-- so existing modules, journal operations and client patches keep using the
-- legacy Task / Followup payloads unchanged.

begin;

-- ---------------------------------------------------------------------------
-- 1. Preconditions and final shadow refresh.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.entity_tasks') is null
     or to_regclass('public.entity_followups') is null
     or to_regclass('public."entity_workItems"') is null then
    raise exception 'WORK_ITEM_COMPAT_REQUIRED_RELATION_MISSING';
  end if;

  if to_regclass('uc_legacy.entity_tasks') is not null
     or to_regclass('uc_legacy.entity_followups') is not null then
    raise exception 'WORK_ITEM_COMPAT_ROLLBACK_COPY_ALREADY_EXISTS';
  end if;

  if exists (
    select 1 from public.entity_tasks t join public.entity_followups f on f.id = t.id
  ) then
    raise exception 'WORK_ITEM_COMPAT_LEGACY_ID_COLLISION';
  end if;

  if exists (select 1 from public.entity_tasks where data ->> 'id' is distinct from id)
     or exists (select 1 from public.entity_followups where data ->> 'id' is distinct from id) then
    raise exception 'WORK_ITEM_COMPAT_LEGACY_ID_MISMATCH';
  end if;

  -- Before canonical writes are enabled, every WorkItem must still originate
  -- from one of the two legacy collections. Abort instead of deleting an
  -- unexpected canonical-only row during the final refresh.
  if exists (
    select 1
    from public."entity_workItems" w
    where (w.item_type = 'task' and not exists (
      select 1 from public.entity_tasks t
      where t.id = w.id and t.workspace_id = w.workspace_id
    ))
       or (w.item_type = 'followup' and not exists (
      select 1 from public.entity_followups f
      where f.id = w.id and f.workspace_id = w.workspace_id
    ))
  ) then
    raise exception 'WORK_ITEM_COMPAT_CANONICAL_ONLY_ROWS_PRESENT';
  end if;
end
$$;

-- Refresh canonical storage from the current authoritative legacy tables at
-- the cutover boundary. This closes any gap since the shadow-table migration
-- without creating a workspace revision or client-visible journal event.
delete from public."entity_workItems";

insert into public."entity_workItems" (
  id, workspace_id, revision, updated_at, updated_by, data
)
select
  t.id,
  t.workspace_id,
  t.revision,
  t.updated_at,
  t.updated_by,
  jsonb_strip_nulls(jsonb_build_object(
    'id', t.id,
    'item_type', 'task',
    'lifecycle_status', t.data ->> 'status',
    'title', t.data ->> 'title',
    'priority', t.data ->> 'priority',
    'customer_id', t.data ->> 'customer_id',
    'work_required_id', t.data ->> 'work_required_id',
    'work_order_id', t.data ->> 'work_order_id',
    'quotation_id', t.data ->> 'quotation_id',
    'po_id', t.data ->> 'po_id',
    'payment_id', t.data ->> 'payment_id',
    'visit_id', t.data ->> 'visit_id',
    'site_id', t.data ->> 'site_id',
    'thread_id', t.data ->> 'thread_id',
    'assignee_id', t.data ->> 'assignee_id',
    'assignee_name', t.data ->> 'assignee_name',
    'assigned_to', t.data ->> 'assigned_to',
    'assigned_role', t.data ->> 'assigned_role',
    'due_date', t.data ->> 'due_date',
    'work_kind', t.data ->> 'task_type',
    'created_at', t.data ->> 'created_at',
    'updated_at', t.data ->> 'updated_at',
    'legacy_payload', t.data
  ))
from public.entity_tasks t;

insert into public."entity_workItems" (
  id, workspace_id, revision, updated_at, updated_by, data
)
select
  f.id,
  f.workspace_id,
  f.revision,
  f.updated_at,
  f.updated_by,
  jsonb_strip_nulls(jsonb_build_object(
    'id', f.id,
    'item_type', 'followup',
    'lifecycle_status', f.data ->> 'status',
    'title', f.data ->> 'title',
    'priority', f.data ->> 'priority',
    'customer_id', f.data ->> 'customer_id',
    'work_required_id', f.data ->> 'work_required_id',
    'quotation_id', f.data ->> 'quotation_id',
    'payment_id', f.data ->> 'payment_id',
    'visit_id', f.data ->> 'visit_id',
    'thread_id', f.data ->> 'thread_id',
    'assigned_to', f.data ->> 'assigned_to',
    'assigned_role', f.data ->> 'assigned_role',
    'due_date', f.data ->> 'due_date',
    'due_at', f.data ->> 'due_at',
    'work_kind', f.data ->> 'followup_type',
    'created_at', f.data ->> 'created_at',
    'updated_at', f.data ->> 'updated_at',
    'legacy_payload', f.data
  ))
from public.entity_followups f;

-- ---------------------------------------------------------------------------
-- 2. Move original tables into a private rollback schema.
-- ---------------------------------------------------------------------------
create schema if not exists uc_legacy authorization postgres;
revoke all on schema uc_legacy from public;
revoke all on schema uc_legacy from anon, authenticated, service_role;

alter table public.entity_tasks set schema uc_legacy;
alter table public.entity_followups set schema uc_legacy;

revoke all on table uc_legacy.entity_tasks from anon, authenticated, service_role;
revoke all on table uc_legacy.entity_followups from anon, authenticated, service_role;

comment on table uc_legacy.entity_tasks is
  'Rollback copy retained temporarily after entity_workItems compatibility-view cutover.';
comment on table uc_legacy.entity_followups is
  'Rollback copy retained temporarily after entity_workItems compatibility-view cutover.';

-- ---------------------------------------------------------------------------
-- 3. Legacy read projections.
-- ---------------------------------------------------------------------------
create view public.entity_tasks
with (security_invoker = true)
as
select
  w.id,
  w.workspace_id,
  w.revision,
  w.updated_at,
  w.updated_by,
  coalesce(w.data -> 'legacy_payload', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'id', w.id,
      'title', w.title,
      'status', w.lifecycle_status,
      'priority', w.priority,
      'customer_id', w.customer_id,
      'work_required_id', w.work_required_id,
      'work_order_id', w.work_order_id,
      'quotation_id', w.quotation_id,
      'po_id', w.po_id,
      'payment_id', w.payment_id,
      'visit_id', w.visit_id,
      'site_id', w.site_id,
      'thread_id', w.thread_id,
      'assignee_id', w.assignee_id,
      'assignee_name', w.assignee_name,
      'assigned_to', w.assigned_to,
      'assigned_role', w.assigned_role,
      'due_date', w.due_date,
      'task_type', w.work_kind,
      'created_at', w.record_created_at,
      'updated_at', w.record_updated_at
    )) as data
from public."entity_workItems" w
where w.item_type = 'task';

create view public.entity_followups
with (security_invoker = true)
as
select
  w.id,
  w.workspace_id,
  w.revision,
  w.updated_at,
  w.updated_by,
  coalesce(w.data -> 'legacy_payload', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'id', w.id,
      'title', w.title,
      'status', w.lifecycle_status,
      'priority', w.priority,
      'customer_id', w.customer_id,
      'work_required_id', w.work_required_id,
      'quotation_id', w.quotation_id,
      'payment_id', w.payment_id,
      'visit_id', w.visit_id,
      'thread_id', w.thread_id,
      'assigned_to', w.assigned_to,
      'assigned_role', w.assigned_role,
      'due_date', w.due_date,
      'due_at', w.due_at,
      'followup_type', w.work_kind,
      'created_at', w.record_created_at,
      'updated_at', w.record_updated_at
    )) as data
from public."entity_workItems" w
where w.item_type = 'followup';

comment on view public.entity_tasks is
  'Legacy Task compatibility projection over canonical entity_workItems.';
comment on view public.entity_followups is
  'Legacy Followup compatibility projection over canonical entity_workItems.';

-- Match the existing server-mediated persistence boundary. The views are not
-- exposed directly to browser roles during the compatibility phase.
revoke all on table public.entity_tasks from public, anon, authenticated;
revoke all on table public.entity_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.entity_tasks to service_role;
grant select, insert, update, delete on table public.entity_followups to service_role;

-- ---------------------------------------------------------------------------
-- 4. Controlled legacy-write translation.
-- ---------------------------------------------------------------------------
create or replace function public.uc_legacy_work_item_view_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item_type text := tg_argv[0];
  v_workspace_id text;
  v_revision bigint;
  v_updated_at timestamptz;
  v_data jsonb;
begin
  if v_item_type not in ('task', 'followup') then
    raise exception using errcode = '22023', message = 'WORK_ITEM_COMPAT_INVALID_TYPE';
  end if;

  if tg_op = 'DELETE' then
    delete from public."entity_workItems"
     where id = old.id
       and workspace_id = old.workspace_id
       and item_type = v_item_type;
    if not found then
      raise exception using errcode = 'P0002', message = 'WORK_ITEM_COMPAT_CANONICAL_ROW_MISSING';
    end if;
    return old;
  end if;

  if new.id is null or btrim(new.id) = '' then
    raise exception using errcode = '22023', message = 'WORK_ITEM_COMPAT_INVALID_ID';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception using errcode = '22023', message = 'WORK_ITEM_COMPAT_INVALID_DATA';
  end if;
  if new.data ->> 'id' is distinct from new.id then
    raise exception using errcode = '22023', message = 'WORK_ITEM_COMPAT_ID_MISMATCH';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id then
      raise exception using errcode = '22023', message = 'WORK_ITEM_COMPAT_IDENTITY_CHANGE';
    end if;
  end if;

  v_workspace_id := coalesce(nullif(new.workspace_id, ''), 'default');
  v_revision := coalesce(new.revision, 0);
  v_updated_at := coalesce(new.updated_at, now());

  if v_item_type = 'task' then
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'item_type', 'task',
      'lifecycle_status', new.data ->> 'status',
      'title', new.data ->> 'title',
      'priority', new.data ->> 'priority',
      'customer_id', new.data ->> 'customer_id',
      'work_required_id', new.data ->> 'work_required_id',
      'work_order_id', new.data ->> 'work_order_id',
      'quotation_id', new.data ->> 'quotation_id',
      'po_id', new.data ->> 'po_id',
      'payment_id', new.data ->> 'payment_id',
      'visit_id', new.data ->> 'visit_id',
      'site_id', new.data ->> 'site_id',
      'thread_id', new.data ->> 'thread_id',
      'assignee_id', new.data ->> 'assignee_id',
      'assignee_name', new.data ->> 'assignee_name',
      'assigned_to', new.data ->> 'assigned_to',
      'assigned_role', new.data ->> 'assigned_role',
      'due_date', new.data ->> 'due_date',
      'work_kind', new.data ->> 'task_type',
      'created_at', new.data ->> 'created_at',
      'updated_at', new.data ->> 'updated_at',
      'legacy_payload', new.data
    ));
  else
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'item_type', 'followup',
      'lifecycle_status', new.data ->> 'status',
      'title', new.data ->> 'title',
      'priority', new.data ->> 'priority',
      'customer_id', new.data ->> 'customer_id',
      'work_required_id', new.data ->> 'work_required_id',
      'quotation_id', new.data ->> 'quotation_id',
      'payment_id', new.data ->> 'payment_id',
      'visit_id', new.data ->> 'visit_id',
      'thread_id', new.data ->> 'thread_id',
      'assigned_to', new.data ->> 'assigned_to',
      'assigned_role', new.data ->> 'assigned_role',
      'due_date', new.data ->> 'due_date',
      'due_at', new.data ->> 'due_at',
      'work_kind', new.data ->> 'followup_type',
      'created_at', new.data ->> 'created_at',
      'updated_at', new.data ->> 'updated_at',
      'legacy_payload', new.data
    ));
  end if;

  if tg_op = 'INSERT' then
    insert into public."entity_workItems" (
      id, workspace_id, revision, updated_at, updated_by, data
    ) values (
      new.id, v_workspace_id, v_revision, v_updated_at, new.updated_by, v_data
    );
  else
    update public."entity_workItems"
       set revision = v_revision,
           updated_at = v_updated_at,
           updated_by = new.updated_by,
           data = v_data
     where id = old.id
       and workspace_id = old.workspace_id
       and item_type = v_item_type;
    if not found then
      raise exception using errcode = 'P0002', message = 'WORK_ITEM_COMPAT_CANONICAL_ROW_MISSING';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.uc_legacy_work_item_view_write() from public, anon, authenticated;
grant execute on function public.uc_legacy_work_item_view_write() to service_role;

create trigger entity_tasks_work_item_compat_write
instead of insert or update or delete on public.entity_tasks
for each row execute function public.uc_legacy_work_item_view_write('task');

create trigger entity_followups_work_item_compat_write
instead of insert or update or delete on public.entity_followups
for each row execute function public.uc_legacy_work_item_view_write('followup');

-- ---------------------------------------------------------------------------
-- 5. Exact cutover parity assertions.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.entity_tasks)
     <> (select count(*) from public."entity_workItems" where item_type = 'task') then
    raise exception 'WORK_ITEM_COMPAT_TASK_COUNT_MISMATCH';
  end if;

  if (select count(*) from public.entity_followups)
     <> (select count(*) from public."entity_workItems" where item_type = 'followup') then
    raise exception 'WORK_ITEM_COMPAT_FOLLOWUP_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
    from uc_legacy.entity_tasks legacy
    full join public.entity_tasks compat on compat.id = legacy.id
    where legacy.id is null
       or compat.id is null
       or compat.workspace_id is distinct from legacy.workspace_id
       or compat.revision is distinct from legacy.revision
       or compat.updated_at is distinct from legacy.updated_at
       or compat.updated_by is distinct from legacy.updated_by
       or compat.data is distinct from legacy.data
  ) then
    raise exception 'WORK_ITEM_COMPAT_TASK_PARITY_MISMATCH';
  end if;

  if exists (
    select 1
    from uc_legacy.entity_followups legacy
    full join public.entity_followups compat on compat.id = legacy.id
    where legacy.id is null
       or compat.id is null
       or compat.workspace_id is distinct from legacy.workspace_id
       or compat.revision is distinct from legacy.revision
       or compat.updated_at is distinct from legacy.updated_at
       or compat.updated_by is distinct from legacy.updated_by
       or compat.data is distinct from legacy.data
  ) then
    raise exception 'WORK_ITEM_COMPAT_FOLLOWUP_PARITY_MISMATCH';
  end if;
end
$$;

commit;
