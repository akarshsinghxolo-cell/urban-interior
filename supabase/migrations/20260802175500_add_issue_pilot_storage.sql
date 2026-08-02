-- P2: additive canonical Issue storage for the Risks + Blockers consolidation pilot.
--
-- Safety properties:
--   * does not redirect any application read/write path;
--   * does not modify or drop entity_blocked / entity_risks;
--   * does not advance the workspace revision or write a client delta, because
--     this table is shadow/parity storage until a later cutover gate;
--   * aborts on legacy ID collisions or backfill parity failures.

begin;

-- Blocker and Risk IDs must remain stable through compatibility projection.
-- The canonical table therefore cannot accept an ID that represents both
-- legacy types.
do $$
begin
  if exists (
    select 1
      from public.entity_blocked b
      join public.entity_risks r on r.id = b.id
  ) then
    raise exception 'ISSUE_PILOT_LEGACY_ID_COLLISION';
  end if;
end
$$;

create table public.entity_issues (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null,

  -- Generated columns keep the existing JSON workspace envelope compatible
  -- while making the high-value Issue routing/filter fields typed and
  -- indexable at the database layer.
  issue_type text generated always as (data ->> 'issue_type') stored,
  status text generated always as (data ->> 'status') stored,
  title text generated always as (data ->> 'title') stored,
  reason text generated always as (data ->> 'reason') stored,
  customer_id text generated always as (data ->> 'customer_id') stored,
  site_id text generated always as (data ->> 'site_id') stored,
  work_order_id text generated always as (data ->> 'work_order_id') stored,
  task_id text generated always as (data ->> 'task_id') stored,
  po_id text generated always as (data ->> 'po_id') stored,
  grn_id text generated always as (data ->> 'grn_id') stored,
  quotation_id text generated always as (data ->> 'quotation_id') stored,
  thread_id text generated always as (data ->> 'thread_id') stored,
  risk_type text generated always as (data ->> 'risk_type') stored,
  severity text generated always as (data ->> 'severity') stored,
  amount numeric generated always as (
    case
      when jsonb_typeof(data -> 'amount') = 'number'
        then (data ->> 'amount')::numeric
      else null
    end
  ) stored,
  created_at text generated always as (data ->> 'created_at') stored,
  resolved_at text generated always as (data ->> 'resolved_at') stored,
  resolved_by text generated always as (data ->> 'resolved_by') stored,

  constraint entity_issues_data_object_check
    check (jsonb_typeof(data) = 'object'),
  constraint entity_issues_id_matches_data_check
    check ((data ? 'id') and data ->> 'id' = id),
  constraint entity_issues_issue_type_check
    check (issue_type is not null and issue_type in ('blocker', 'risk')),
  constraint entity_issues_status_check
    check (status is not null and status in ('open', 'resolved', 'dismissed')),
  constraint entity_issues_title_check
    check (nullif(btrim(title), '') is not null),
  constraint entity_issues_reason_check
    check (reason is not null),
  constraint entity_issues_created_at_check
    check (nullif(btrim(created_at), '') is not null),
  constraint entity_issues_risk_shape_check
    check (
      issue_type <> 'risk'
      or (
        risk_type is not null
        and risk_type in ('cash', 'margin', 'vendor', 'collection')
        and severity is not null
        and severity in ('low', 'medium', 'high', 'urgent')
      )
    )
);

comment on table public.entity_issues is
  'Canonical Issue pilot storage. Shadow/parity only until Risks + Blockers cutover; do not remove legacy tables yet.';
comment on column public.entity_issues.data is
  'Canonical Issue JSON record. Generated columns expose high-value fields for indexing/querying without creating a second writable truth.';

create index entity_issues_workspace_type_status_idx
  on public.entity_issues (workspace_id, issue_type, status);
create index entity_issues_customer_idx
  on public.entity_issues (workspace_id, customer_id)
  where customer_id is not null;
create index entity_issues_work_order_idx
  on public.entity_issues (workspace_id, work_order_id)
  where work_order_id is not null;
create index entity_issues_task_idx
  on public.entity_issues (workspace_id, task_id)
  where task_id is not null;
create index entity_issues_po_idx
  on public.entity_issues (workspace_id, po_id)
  where po_id is not null;

alter table public.entity_issues enable row level security;
revoke all on table public.entity_issues from anon, authenticated;
grant select, insert, update, delete on table public.entity_issues to service_role;

-- Lossless legacy Blocker backfill. The complete source JSON is retained in
-- legacy_payload while canonical routing/lifecycle fields are promoted.
insert into public.entity_issues (
  id,
  workspace_id,
  revision,
  updated_at,
  updated_by,
  data
)
select
  b.id,
  b.workspace_id,
  b.revision,
  b.updated_at,
  b.updated_by,
  jsonb_strip_nulls(jsonb_build_object(
    'id', b.id,
    'issue_type', 'blocker',
    'status', case when b.data ->> 'resolved' = 'true' then 'resolved' else 'open' end,
    'title', b.data ->> 'title',
    'reason', coalesce(b.data ->> 'reason', ''),
    'customer_id', b.data ->> 'customer_id',
    'customer_name', b.data ->> 'customer_name',
    'work_order_id', b.data ->> 'linked_work_order_id',
    'task_id', b.data ->> 'linked_task_id',
    'po_id', b.data ->> 'linked_po_id',
    'grn_id', b.data ->> 'linked_grn_id',
    'quotation_id', b.data ->> 'linked_quotation_id',
    'thread_id', b.data ->> 'thread_id',
    'created_at', b.data ->> 'created_at',
    'legacy_payload', b.data
  ))
from public.entity_blocked b;

-- Lossless legacy Risk backfill. Existing Risk rows are all open because the
-- legacy resolver deletes a Risk instead of retaining a resolved row.
insert into public.entity_issues (
  id,
  workspace_id,
  revision,
  updated_at,
  updated_by,
  data
)
select
  r.id,
  r.workspace_id,
  r.revision,
  r.updated_at,
  r.updated_by,
  jsonb_strip_nulls(jsonb_build_object(
    'id', r.id,
    'issue_type', 'risk',
    'status', 'open',
    'title', r.data ->> 'title',
    'reason', coalesce(r.data ->> 'reason', ''),
    'customer_id', r.data ->> 'customer_id',
    'customer_name', r.data ->> 'customer_name',
    'risk_type', r.data ->> 'type',
    'severity', r.data ->> 'severity',
    'amount', r.data -> 'amount',
    'created_at', r.data ->> 'created_at',
    'legacy_payload', r.data
  ))
from public.entity_risks r;

-- Abort rather than accepting a partial backfill. These checks intentionally
-- compare both counts and IDs, so an unnoticed skipped row cannot pass merely
-- because another row was duplicated.
do $$
begin
  if (
    select count(*) from public.entity_issues where issue_type = 'blocker'
  ) <> (
    select count(*) from public.entity_blocked
  ) then
    raise exception 'ISSUE_PILOT_BLOCKER_COUNT_MISMATCH';
  end if;

  if (
    select count(*) from public.entity_issues where issue_type = 'risk'
  ) <> (
    select count(*) from public.entity_risks
  ) then
    raise exception 'ISSUE_PILOT_RISK_COUNT_MISMATCH';
  end if;

  if exists (
    select b.id from public.entity_blocked b
    except
    select i.id from public.entity_issues i where i.issue_type = 'blocker'
  ) or exists (
    select i.id from public.entity_issues i where i.issue_type = 'blocker'
    except
    select b.id from public.entity_blocked b
  ) then
    raise exception 'ISSUE_PILOT_BLOCKER_ID_MISMATCH';
  end if;

  if exists (
    select r.id from public.entity_risks r
    except
    select i.id from public.entity_issues i where i.issue_type = 'risk'
  ) or exists (
    select i.id from public.entity_issues i where i.issue_type = 'risk'
    except
    select r.id from public.entity_risks r
  ) then
    raise exception 'ISSUE_PILOT_RISK_ID_MISMATCH';
  end if;
end
$$;

commit;
