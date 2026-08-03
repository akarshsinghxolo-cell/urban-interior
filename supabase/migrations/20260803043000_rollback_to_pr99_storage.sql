-- Restore the physical workspace tables expected by the PR #99 application
-- while preserving all current legacy-visible rows and migration history.
--
-- Historical consolidation migrations remain in Git for reproducibility; this
-- migration reverses their final physical-storage state without rewriting the
-- workspace revision or change journal.

begin;

create temporary table pr99_tasks_snapshot on commit drop as
select id, workspace_id, revision, updated_at, updated_by, data
from public.entity_tasks;

create temporary table pr99_followups_snapshot on commit drop as
select id, workspace_id, revision, updated_at, updated_by, data
from public.entity_followups;

create temporary table pr99_blocked_snapshot on commit drop as
select id, workspace_id, revision, updated_at, updated_by, data
from public.entity_blocked;

create temporary table pr99_risks_snapshot on commit drop as
select id, workspace_id, revision, updated_at, updated_by, data
from public.entity_risks;

do $$
begin
  if (select relkind from pg_class where oid = 'public.entity_tasks'::regclass) <> 'v'
     or (select relkind from pg_class where oid = 'public.entity_followups'::regclass) <> 'v'
     or (select relkind from pg_class where oid = 'public.entity_blocked'::regclass) <> 'v'
     or (select relkind from pg_class where oid = 'public.entity_risks'::regclass) <> 'v' then
    raise exception 'PR99_ROLLBACK_EXPECTED_COMPAT_VIEWS';
  end if;

  if to_regclass('public."entity_workItems"') is null
     or to_regclass('public.entity_issues') is null then
    raise exception 'PR99_ROLLBACK_CANONICAL_TABLE_MISSING';
  end if;

  -- PR #99 Risk semantics deleted resolved Risks. Do not silently discard a
  -- newer hidden Risk if one has appeared since the compatibility cutover.
  if exists (
    select 1
    from public.entity_issues
    where issue_type = 'risk' and status <> 'open'
  ) then
    raise exception 'PR99_ROLLBACK_HIDDEN_RISK_ROWS_PRESENT';
  end if;

  if (select count(*) from public.entity_tasks)
       <> (select count(*) from public."entity_workItems" where item_type = 'task')
     or (select count(*) from public.entity_followups)
       <> (select count(*) from public."entity_workItems" where item_type = 'followup')
     or (select count(*) from public.entity_blocked)
       <> (select count(*) from public.entity_issues where issue_type = 'blocker')
     or (select count(*) from public.entity_risks)
       <> (select count(*) from public.entity_issues where issue_type = 'risk' and status = 'open') then
    raise exception 'PR99_ROLLBACK_CANONICAL_PARITY_MISMATCH';
  end if;
end
$$;

drop view public.entity_tasks;
drop view public.entity_followups;
drop view public.entity_blocked;
drop view public.entity_risks;

drop function if exists public.uc_legacy_work_item_view_write();
drop function if exists public.uc_legacy_issue_view_write();

-- Match the live physical entity-table envelope used by the untouched PR #99
-- collections: bigint row revision, updated_at ordering index, server-mediated
-- writes, and authenticated read policy for the default workspace.
create table public.entity_tasks (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create table public.entity_followups (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create table public.entity_blocked (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create table public.entity_risks (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

insert into public.entity_tasks select * from pr99_tasks_snapshot;
insert into public.entity_followups select * from pr99_followups_snapshot;
insert into public.entity_blocked select * from pr99_blocked_snapshot;
insert into public.entity_risks select * from pr99_risks_snapshot;

create index entity_tasks_workspace_idx on public.entity_tasks (workspace_id);
create index entity_tasks_updated_idx on public.entity_tasks (updated_at desc);
create index entity_followups_workspace_idx on public.entity_followups (workspace_id);
create index entity_followups_updated_idx on public.entity_followups (updated_at desc);
create index entity_blocked_workspace_idx on public.entity_blocked (workspace_id);
create index entity_blocked_updated_idx on public.entity_blocked (updated_at desc);
create index entity_risks_workspace_idx on public.entity_risks (workspace_id);
create index entity_risks_updated_idx on public.entity_risks (updated_at desc);

alter table public.entity_tasks enable row level security;
alter table public.entity_followups enable row level security;
alter table public.entity_blocked enable row level security;
alter table public.entity_risks enable row level security;

create policy "entity_tasks workspace read"
  on public.entity_tasks for select to authenticated
  using (workspace_id = 'default');
create policy "entity_followups workspace read"
  on public.entity_followups for select to authenticated
  using (workspace_id = 'default');
create policy "entity_blocked workspace read"
  on public.entity_blocked for select to authenticated
  using (workspace_id = 'default');
create policy "entity_risks workspace read"
  on public.entity_risks for select to authenticated
  using (workspace_id = 'default');

revoke all on public.entity_tasks from anon, authenticated;
revoke all on public.entity_followups from anon, authenticated;
revoke all on public.entity_blocked from anon, authenticated;
revoke all on public.entity_risks from anon, authenticated;

grant select, insert, update, delete, truncate, references, trigger
  on public.entity_tasks to service_role;
grant select, insert, update, delete, truncate, references, trigger
  on public.entity_followups to service_role;
grant select, insert, update, delete, truncate, references, trigger
  on public.entity_blocked to service_role;
grant select, insert, update, delete, truncate, references, trigger
  on public.entity_risks to service_role;

drop table public."entity_workItems";
drop table public.entity_issues;

-- The consolidation rollback schema is expected to be empty after its cleanup
-- migrations. This DROP has no dependent-object option, so unexpected objects
-- abort the rollback instead of being removed implicitly.
drop schema if exists uc_legacy;

do $$
begin
  if exists (
    select 1
    from pr99_tasks_snapshot s
    full join public.entity_tasks t using (id)
    where s.id is null or t.id is null
       or s.workspace_id is distinct from t.workspace_id
       or s.revision is distinct from t.revision
       or s.updated_at is distinct from t.updated_at
       or s.updated_by is distinct from t.updated_by
       or s.data is distinct from t.data
  ) then
    raise exception 'PR99_ROLLBACK_TASK_PARITY_MISMATCH';
  end if;

  if exists (
    select 1
    from pr99_followups_snapshot s
    full join public.entity_followups t using (id)
    where s.id is null or t.id is null
       or s.workspace_id is distinct from t.workspace_id
       or s.revision is distinct from t.revision
       or s.updated_at is distinct from t.updated_at
       or s.updated_by is distinct from t.updated_by
       or s.data is distinct from t.data
  ) then
    raise exception 'PR99_ROLLBACK_FOLLOWUP_PARITY_MISMATCH';
  end if;

  if exists (
    select 1
    from pr99_blocked_snapshot s
    full join public.entity_blocked t using (id)
    where s.id is null or t.id is null
       or s.workspace_id is distinct from t.workspace_id
       or s.revision is distinct from t.revision
       or s.updated_at is distinct from t.updated_at
       or s.updated_by is distinct from t.updated_by
       or s.data is distinct from t.data
  ) then
    raise exception 'PR99_ROLLBACK_BLOCKER_PARITY_MISMATCH';
  end if;

  if exists (
    select 1
    from pr99_risks_snapshot s
    full join public.entity_risks t using (id)
    where s.id is null or t.id is null
       or s.workspace_id is distinct from t.workspace_id
       or s.revision is distinct from t.revision
       or s.updated_at is distinct from t.updated_at
       or s.updated_by is distinct from t.updated_by
       or s.data is distinct from t.data
  ) then
    raise exception 'PR99_ROLLBACK_RISK_PARITY_MISMATCH';
  end if;
end
$$;

commit;
