-- Remove private rollback copies after the Task/Follow-up WorkItem cutover has
-- passed full CI, live compatibility-view parity, and atomic commit probes.
--
-- This migration is intentionally conservative: it refuses to remove the
-- backups unless they still exactly match the public compatibility views.
-- DROP TABLE is used without CASCADE so any unexpected external dependency
-- aborts the migration instead of being removed implicitly.

begin;

do $$
begin
  if to_regclass('public.entity_tasks') is null
     or to_regclass('public.entity_followups') is null
     or to_regclass('public."entity_workItems"') is null then
    raise exception 'WORK_ITEM_CLEANUP_REQUIRED_PUBLIC_RELATION_MISSING';
  end if;

  if (select relkind from pg_class where oid='public.entity_tasks'::regclass) <> 'v'
     or (select relkind from pg_class where oid='public.entity_followups'::regclass) <> 'v' then
    raise exception 'WORK_ITEM_CLEANUP_COMPAT_VIEW_MISSING';
  end if;

  if to_regclass('uc_legacy.entity_tasks') is null
     or to_regclass('uc_legacy.entity_followups') is null then
    raise exception 'WORK_ITEM_CLEANUP_ROLLBACK_COPY_MISSING';
  end if;

  if (select count(*) from uc_legacy.entity_tasks)
     <> (select count(*) from public.entity_tasks) then
    raise exception 'WORK_ITEM_CLEANUP_TASK_COUNT_MISMATCH';
  end if;

  if (select count(*) from uc_legacy.entity_followups)
     <> (select count(*) from public.entity_followups) then
    raise exception 'WORK_ITEM_CLEANUP_FOLLOWUP_COUNT_MISMATCH';
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
    raise exception 'WORK_ITEM_CLEANUP_TASK_PARITY_MISMATCH';
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
    raise exception 'WORK_ITEM_CLEANUP_FOLLOWUP_PARITY_MISMATCH';
  end if;
end
$$;

drop table uc_legacy.entity_tasks;
drop table uc_legacy.entity_followups;

commit;
