-- Additive shadow storage for the Task + Follow-up consolidation.
--
-- This migration does NOT cut over any runtime collection. `entity_tasks` and
-- `entity_followups` remain authoritative after this migration. The new table
-- is server-only shadow storage used to prove lossless parity before a later
-- compatibility-view cutover.

begin;

-- ---------------------------------------------------------------------------
-- 1. Preconditions.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.entity_tasks') is null
     or to_regclass('public.entity_followups') is null then
    raise exception 'WORK_ITEM_SHADOW_LEGACY_TABLE_MISSING';
  end if;

  if to_regclass('public."entity_workItems"') is not null then
    raise exception 'WORK_ITEM_SHADOW_TARGET_ALREADY_EXISTS';
  end if;

  -- The canonical table keeps the same globally unique ID contract used by
  -- existing entity tables. A cross-type collision must be resolved explicitly
  -- rather than silently rewriting an ID during migration.
  if exists (
    select 1
    from public.entity_tasks t
    join public.entity_followups f on f.id = t.id
  ) then
    raise exception 'WORK_ITEM_SHADOW_ID_COLLISION';
  end if;

  -- Existing entity rows are expected to keep their envelope ID and JSON ID in
  -- lock-step. Abort if legacy data has already drifted.
  if exists (select 1 from public.entity_tasks where data ->> 'id' is distinct from id)
     or exists (select 1 from public.entity_followups where data ->> 'id' is distinct from id) then
    raise exception 'WORK_ITEM_SHADOW_LEGACY_ID_MISMATCH';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Canonical WorkItem shadow table.
-- ---------------------------------------------------------------------------
create table public."entity_workItems" (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null,

  item_type text generated always as (data ->> 'item_type') stored,
  lifecycle_status text generated always as (data ->> 'lifecycle_status') stored,
  title text generated always as (data ->> 'title') stored,
  priority text generated always as (data ->> 'priority') stored,
  customer_id text generated always as (data ->> 'customer_id') stored,
  work_required_id text generated always as (data ->> 'work_required_id') stored,
  work_order_id text generated always as (data ->> 'work_order_id') stored,
  quotation_id text generated always as (data ->> 'quotation_id') stored,
  po_id text generated always as (data ->> 'po_id') stored,
  payment_id text generated always as (data ->> 'payment_id') stored,
  visit_id text generated always as (data ->> 'visit_id') stored,
  site_id text generated always as (data ->> 'site_id') stored,
  thread_id text generated always as (data ->> 'thread_id') stored,
  assignee_id text generated always as (data ->> 'assignee_id') stored,
  assignee_name text generated always as (data ->> 'assignee_name') stored,
  assigned_to text generated always as (data ->> 'assigned_to') stored,
  assigned_role text generated always as (data ->> 'assigned_role') stored,
  due_date text generated always as (data ->> 'due_date') stored,
  due_at text generated always as (data ->> 'due_at') stored,
  work_kind text generated always as (data ->> 'work_kind') stored,
  record_created_at text generated always as (data ->> 'created_at') stored,
  record_updated_at text generated always as (data ->> 'updated_at') stored,

  constraint entity_work_items_data_object_check
    check (jsonb_typeof(data) = 'object'),
  constraint entity_work_items_id_matches_data_check
    check (data ? 'id' and data ->> 'id' = id),
  constraint entity_work_items_type_check
    check (item_type is not null and item_type in ('task', 'followup')),
  constraint entity_work_items_title_check
    check (nullif(btrim(title), '') is not null),
  constraint entity_work_items_priority_check
    check (priority is not null and priority in ('low', 'medium', 'high', 'urgent')),
  constraint entity_work_items_status_check
    check (
      (item_type = 'task' and lifecycle_status in (
        'todo', 'in_progress', 'blocked', 'review', 'completed', 'cancelled'
      ))
      or
      (item_type = 'followup' and lifecycle_status in (
        'pending', 'scheduled', 'completed', 'missed', 'closed'
      ))
    ),
  constraint entity_work_items_due_shape_check
    check (
      (item_type = 'task'
        and nullif(btrim(due_date), '') is not null
        and due_at is null)
      or
      (item_type = 'followup'
        and nullif(btrim(due_date), '') is not null
        and nullif(btrim(due_at), '') is not null)
    ),
  constraint entity_work_items_created_at_check
    check (nullif(btrim(record_created_at), '') is not null),
  constraint entity_work_items_updated_at_check
    check (nullif(btrim(record_updated_at), '') is not null)
);

create index entity_work_items_workspace_type_status_idx
  on public."entity_workItems" (workspace_id, item_type, lifecycle_status);
create index entity_work_items_customer_idx
  on public."entity_workItems" (workspace_id, customer_id)
  where customer_id is not null;
create index entity_work_items_thread_idx
  on public."entity_workItems" (workspace_id, thread_id)
  where thread_id is not null;
create index entity_work_items_due_date_idx
  on public."entity_workItems" (workspace_id, due_date)
  where due_date is not null;

-- Shadow storage is intentionally server-only. Existing Task/Follow-up client
-- reads continue through their current tables during this gate.
alter table public."entity_workItems" enable row level security;
revoke all on table public."entity_workItems" from public, anon, authenticated;
grant select, insert, update, delete on table public."entity_workItems" to service_role;

comment on table public."entity_workItems" is
  'Server-only canonical Task/Follow-up shadow storage. Legacy tables remain authoritative until compatibility-view cutover.';

-- ---------------------------------------------------------------------------
-- 3. Lossless Task backfill.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Lossless Follow-up backfill.
-- ---------------------------------------------------------------------------
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
-- 5. Field-level parity assertions.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public."entity_workItems" where item_type = 'task')
     <> (select count(*) from public.entity_tasks) then
    raise exception 'WORK_ITEM_SHADOW_TASK_COUNT_MISMATCH';
  end if;

  if (select count(*) from public."entity_workItems" where item_type = 'followup')
     <> (select count(*) from public.entity_followups) then
    raise exception 'WORK_ITEM_SHADOW_FOLLOWUP_COUNT_MISMATCH';
  end if;

  if (select count(*) from public."entity_workItems")
     <> ((select count(*) from public.entity_tasks)
       + (select count(*) from public.entity_followups)) then
    raise exception 'WORK_ITEM_SHADOW_TOTAL_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
    from public.entity_tasks t
    left join public."entity_workItems" w on w.id = t.id
    where w.id is null
       or w.item_type is distinct from 'task'
       or w.workspace_id is distinct from t.workspace_id
       or w.revision is distinct from t.revision
       or w.updated_at is distinct from t.updated_at
       or w.updated_by is distinct from t.updated_by
       or w.lifecycle_status is distinct from t.data ->> 'status'
       or w.title is distinct from t.data ->> 'title'
       or w.priority is distinct from t.data ->> 'priority'
       or w.due_date is distinct from t.data ->> 'due_date'
       or w.due_at is not null
       or w.work_kind is distinct from t.data ->> 'task_type'
       or w.record_created_at is distinct from t.data ->> 'created_at'
       or w.record_updated_at is distinct from t.data ->> 'updated_at'
       or w.data -> 'legacy_payload' is distinct from t.data
  ) then
    raise exception 'WORK_ITEM_SHADOW_TASK_PARITY_MISMATCH';
  end if;

  if exists (
    select 1
    from public.entity_followups f
    left join public."entity_workItems" w on w.id = f.id
    where w.id is null
       or w.item_type is distinct from 'followup'
       or w.workspace_id is distinct from f.workspace_id
       or w.revision is distinct from f.revision
       or w.updated_at is distinct from f.updated_at
       or w.updated_by is distinct from f.updated_by
       or w.lifecycle_status is distinct from f.data ->> 'status'
       or w.title is distinct from f.data ->> 'title'
       or w.priority is distinct from f.data ->> 'priority'
       or w.due_date is distinct from f.data ->> 'due_date'
       or w.due_at is distinct from f.data ->> 'due_at'
       or w.work_kind is distinct from f.data ->> 'followup_type'
       or w.record_created_at is distinct from f.data ->> 'created_at'
       or w.record_updated_at is distinct from f.data ->> 'updated_at'
       or w.data -> 'legacy_payload' is distinct from f.data
  ) then
    raise exception 'WORK_ITEM_SHADOW_FOLLOWUP_PARITY_MISMATCH';
  end if;
end
$$;

commit;
