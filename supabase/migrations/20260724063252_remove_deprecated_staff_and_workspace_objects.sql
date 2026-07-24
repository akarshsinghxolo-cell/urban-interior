-- Guarded removal of deprecated workspace snapshot and auth-mirror objects.
-- GenericRecord and normalized StaffLocationPing remain active.

do $guard$
begin
  if to_regclass('public."WorkspaceMeta"') is null then
    raise exception using errcode = 'P0002', message = 'WorkspaceMeta is already absent';
  end if;
  if to_regclass('public."entity_staffAuthUsers"') is null then
    raise exception using errcode = 'P0002', message = 'entity_staffAuthUsers is already absent';
  end if;
  if to_regprocedure('public.write_workspace_snapshot(text,text,integer)') is null then
    raise exception using errcode = 'P0002', message = 'write_workspace_snapshot is already absent';
  end if;
  if exists (select 1 from public."WorkspaceMeta") then
    raise exception using errcode = '23514', message = 'WorkspaceMeta is not empty';
  end if;
  if exists (select 1 from public."entity_staffAuthUsers") then
    raise exception using errcode = '23514', message = 'entity_staffAuthUsers is not empty';
  end if;
  if exists (
    select 1
    from public."GenericRecord"
    where collection = 'workspace.snapshot'
  ) then
    raise exception using errcode = '23514', message = 'Legacy workspace snapshots still exist';
  end if;
end;
$guard$;

drop function public.write_workspace_snapshot(text, text, integer);
drop table public."WorkspaceMeta";
drop table public."entity_staffAuthUsers";
