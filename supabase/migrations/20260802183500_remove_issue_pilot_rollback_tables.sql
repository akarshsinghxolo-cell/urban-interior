-- Final cleanup for the Risks + Blockers physical consolidation pilot.
--
-- The canonical storage is public.entity_issues. The public legacy relation
-- names are compatibility views. The private rollback tables were empty at
-- cutover and remain intentionally unwritten after cutover.
--
-- This migration uses no CASCADE. Any unexpected dependency stops the drop.

begin;

do $$
declare
  v_blocked_kind "char";
  v_risks_kind "char";
  v_issues_kind "char";
begin
  select c.relkind into v_blocked_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'entity_blocked';

  select c.relkind into v_risks_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'entity_risks';

  select c.relkind into v_issues_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'entity_issues';

  if v_blocked_kind is distinct from 'v' then
    raise exception 'ISSUE_CLEANUP_BLOCKED_NOT_VIEW';
  end if;
  if v_risks_kind is distinct from 'v' then
    raise exception 'ISSUE_CLEANUP_RISKS_NOT_VIEW';
  end if;
  if v_issues_kind is distinct from 'r' then
    raise exception 'ISSUE_CLEANUP_CANONICAL_NOT_TABLE';
  end if;

  if to_regclass('uc_legacy.entity_blocked') is null
     or to_regclass('uc_legacy.entity_risks') is null then
    raise exception 'ISSUE_CLEANUP_ROLLBACK_TABLE_MISSING';
  end if;

  if exists (select 1 from uc_legacy.entity_blocked) then
    raise exception 'ISSUE_CLEANUP_BLOCKED_BACKUP_NOT_EMPTY';
  end if;
  if exists (select 1 from uc_legacy.entity_risks) then
    raise exception 'ISSUE_CLEANUP_RISKS_BACKUP_NOT_EMPTY';
  end if;
end
$$;

-- Deliberately omit CASCADE: unexpected external dependencies must fail loudly.
drop table uc_legacy.entity_blocked;
drop table uc_legacy.entity_risks;

-- This pilot created the schema only for these two rollback tables. Drop it
-- only if no relation remains; otherwise leave it untouched for investigation.
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'uc_legacy'
      and c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
  ) then
    execute 'drop schema uc_legacy';
  end if;
end
$$;

commit;
