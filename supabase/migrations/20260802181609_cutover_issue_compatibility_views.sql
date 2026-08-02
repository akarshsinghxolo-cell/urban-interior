-- P3/P4: physically consolidate Risks + Blockers without changing their
-- logical workspace collection contracts.
--
-- The old public tables are moved into a private rollback schema. Their public
-- names are recreated as writable compatibility views over entity_issues, so
-- existing modules, journal operations and client patches continue to use the
-- legacy BlockedItem / RiskItem payloads unchanged.

begin;

-- ---------------------------------------------------------------------------
-- 1. Preconditions and final shadow refresh.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.entity_issues') is null
     or to_regclass('public.entity_blocked') is null
     or to_regclass('public.entity_risks') is null then
    raise exception 'ISSUE_COMPAT_REQUIRED_RELATION_MISSING';
  end if;

  if exists (
    select 1 from public.entity_blocked b join public.entity_risks r on r.id = b.id
  ) then
    raise exception 'ISSUE_COMPAT_LEGACY_ID_COLLISION';
  end if;

  -- Before canonical writes are enabled, every Issue row must still originate
  -- from one of the two legacy collections. Abort rather than deleting any
  -- unexpected canonical-only data during the refresh.
  if exists (
    select 1
    from public.entity_issues i
    where (i.issue_type = 'blocker' and not exists (
      select 1 from public.entity_blocked b where b.id = i.id and b.workspace_id = i.workspace_id
    ))
       or (i.issue_type = 'risk' and not exists (
      select 1 from public.entity_risks r where r.id = i.id and r.workspace_id = i.workspace_id
    ))
  ) then
    raise exception 'ISSUE_COMPAT_CANONICAL_ONLY_ROWS_PRESENT';
  end if;
end
$$;

-- Refresh the shadow from the current authoritative legacy tables immediately
-- before switching the physical storage. This closes any gap between P2 and
-- this migration without exposing the refresh to workspace clients.
delete from public.entity_issues;

insert into public.entity_issues (id, workspace_id, revision, updated_at, updated_by, data)
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

insert into public.entity_issues (id, workspace_id, revision, updated_at, updated_by, data)
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

-- ---------------------------------------------------------------------------
-- 2. Move original tables into a private rollback schema.
-- ---------------------------------------------------------------------------
create schema if not exists uc_legacy authorization postgres;
revoke all on schema uc_legacy from public;
revoke all on schema uc_legacy from anon, authenticated, service_role;

alter table public.entity_blocked set schema uc_legacy;
alter table public.entity_risks set schema uc_legacy;

revoke all on table uc_legacy.entity_blocked from anon, authenticated, service_role;
revoke all on table uc_legacy.entity_risks from anon, authenticated, service_role;

comment on table uc_legacy.entity_blocked is
  'Rollback copy retained temporarily after entity_issues compatibility-view cutover.';
comment on table uc_legacy.entity_risks is
  'Rollback copy retained temporarily after entity_issues compatibility-view cutover.';

-- ---------------------------------------------------------------------------
-- 3. Legacy read projections.
-- ---------------------------------------------------------------------------
create view public.entity_blocked
with (security_invoker = true)
as
select
  i.id,
  i.workspace_id,
  i.revision,
  i.updated_at,
  i.updated_by,
  coalesce(i.data -> 'legacy_payload', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'id', i.id,
      'title', i.title,
      'reason', i.reason,
      'customer_id', i.customer_id,
      'customer_name', i.data ->> 'customer_name',
      'linked_task_id', i.task_id,
      'linked_work_order_id', i.work_order_id,
      'linked_po_id', i.po_id,
      'linked_grn_id', i.grn_id,
      'linked_quotation_id', i.quotation_id,
      'thread_id', i.thread_id,
      'resolved', i.status <> 'open',
      'created_at', i.created_at
    )) as data
from public.entity_issues i
where i.issue_type = 'blocker';

create view public.entity_risks
with (security_invoker = true)
as
select
  i.id,
  i.workspace_id,
  i.revision,
  i.updated_at,
  i.updated_by,
  coalesce(i.data -> 'legacy_payload', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'id', i.id,
      'title', i.title,
      'type', i.risk_type,
      'severity', i.severity,
      'customer_id', i.customer_id,
      'customer_name', i.data ->> 'customer_name',
      'amount', i.data -> 'amount',
      'reason', i.reason,
      'created_at', i.created_at
    )) as data
from public.entity_issues i
where i.issue_type = 'risk'
  and i.status = 'open';

comment on view public.entity_blocked is
  'Legacy BlockedItem compatibility projection over canonical entity_issues.';
comment on view public.entity_risks is
  'Legacy RiskItem compatibility projection over canonical entity_issues; resolved/dismissed risks remain hidden to preserve legacy delete-on-resolve semantics.';

-- Views are server-only, matching the surrounding workspace persistence model.
revoke all on table public.entity_blocked from public, anon, authenticated;
revoke all on table public.entity_risks from public, anon, authenticated;
grant select, insert, update, delete on table public.entity_blocked to service_role;
grant select, insert, update, delete on table public.entity_risks to service_role;

-- ---------------------------------------------------------------------------
-- 4. Controlled legacy-write translation.
-- ---------------------------------------------------------------------------
create or replace function public.uc_legacy_issue_view_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_issue_type text := tg_argv[0];
  v_workspace_id text;
  v_revision bigint;
  v_updated_at timestamptz;
  v_data jsonb;
begin
  if v_issue_type not in ('blocker', 'risk') then
    raise exception using errcode = '22023', message = 'ISSUE_COMPAT_INVALID_TYPE';
  end if;

  if tg_op = 'DELETE' then
    delete from public.entity_issues
     where id = old.id
       and workspace_id = old.workspace_id
       and issue_type = v_issue_type;
    return old;
  end if;

  if new.id is null or btrim(new.id) = '' then
    raise exception using errcode = '22023', message = 'ISSUE_COMPAT_INVALID_ID';
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception using errcode = '22023', message = 'ISSUE_COMPAT_INVALID_DATA';
  end if;
  if new.data ->> 'id' is distinct from new.id then
    raise exception using errcode = '22023', message = 'ISSUE_COMPAT_ID_MISMATCH';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id then
      raise exception using errcode = '22023', message = 'ISSUE_COMPAT_IDENTITY_CHANGE';
    end if;
  end if;

  v_workspace_id := coalesce(nullif(new.workspace_id, ''), 'default');
  v_revision := coalesce(new.revision, 0);
  v_updated_at := coalesce(new.updated_at, now());

  if v_issue_type = 'blocker' then
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'issue_type', 'blocker',
      'status', case when new.data ->> 'resolved' = 'true' then 'resolved' else 'open' end,
      'title', new.data ->> 'title',
      'reason', coalesce(new.data ->> 'reason', ''),
      'customer_id', new.data ->> 'customer_id',
      'customer_name', new.data ->> 'customer_name',
      'work_order_id', new.data ->> 'linked_work_order_id',
      'task_id', new.data ->> 'linked_task_id',
      'po_id', new.data ->> 'linked_po_id',
      'grn_id', new.data ->> 'linked_grn_id',
      'quotation_id', new.data ->> 'linked_quotation_id',
      'thread_id', new.data ->> 'thread_id',
      'created_at', new.data ->> 'created_at',
      'legacy_payload', new.data
    ));
  else
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'issue_type', 'risk',
      'status', 'open',
      'title', new.data ->> 'title',
      'reason', coalesce(new.data ->> 'reason', ''),
      'customer_id', new.data ->> 'customer_id',
      'customer_name', new.data ->> 'customer_name',
      'risk_type', new.data ->> 'type',
      'severity', new.data ->> 'severity',
      'amount', new.data -> 'amount',
      'created_at', new.data ->> 'created_at',
      'legacy_payload', new.data
    ));
  end if;

  if tg_op = 'INSERT' then
    insert into public.entity_issues (
      id, workspace_id, revision, updated_at, updated_by, data
    ) values (
      new.id, v_workspace_id, v_revision, v_updated_at, new.updated_by, v_data
    );
  else
    update public.entity_issues
       set revision = v_revision,
           updated_at = v_updated_at,
           updated_by = new.updated_by,
           data = v_data
     where id = old.id
       and workspace_id = old.workspace_id
       and issue_type = v_issue_type;
    if not found then
      raise exception using errcode = 'P0002', message = 'ISSUE_COMPAT_CANONICAL_ROW_MISSING';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.uc_legacy_issue_view_write() from public, anon, authenticated;
grant execute on function public.uc_legacy_issue_view_write() to service_role;

create trigger entity_blocked_issue_compat_write
instead of insert or update or delete on public.entity_blocked
for each row execute function public.uc_legacy_issue_view_write('blocker');

create trigger entity_risks_issue_compat_write
instead of insert or update or delete on public.entity_risks
for each row execute function public.uc_legacy_issue_view_write('risk');

-- ---------------------------------------------------------------------------
-- 5. Cutover parity assertions.
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.entity_blocked)
     <> (select count(*) from public.entity_issues where issue_type = 'blocker') then
    raise exception 'ISSUE_COMPAT_BLOCKER_COUNT_MISMATCH';
  end if;

  if (select count(*) from public.entity_risks)
     <> (select count(*) from public.entity_issues where issue_type = 'risk' and status = 'open') then
    raise exception 'ISSUE_COMPAT_RISK_COUNT_MISMATCH';
  end if;

  if exists (
    select b.id from public.entity_blocked b
    except
    select i.id from public.entity_issues i where i.issue_type = 'blocker'
  ) then
    raise exception 'ISSUE_COMPAT_BLOCKER_ID_MISMATCH';
  end if;

  if exists (
    select r.id from public.entity_risks r
    except
    select i.id from public.entity_issues i where i.issue_type = 'risk' and i.status = 'open'
  ) then
    raise exception 'ISSUE_COMPAT_RISK_ID_MISMATCH';
  end if;
end
$$;

commit;
