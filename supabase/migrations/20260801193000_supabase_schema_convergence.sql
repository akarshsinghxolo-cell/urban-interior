-- Converge the live workspace onto one revision/journal architecture.
--
-- This migration intentionally leaves every business entity_* table in place.
-- It removes only confirmed legacy revision writers and makes Staff identity
-- synchronization publish the same workspace delta contract as normal commits.

begin;

-- ---------------------------------------------------------------------------
-- 1. Retire the pre-atomic workspace commit architecture.
-- ---------------------------------------------------------------------------

do $guard$
begin
  if to_regclass('public."CollectionMeta"') is not null
     and exists (select 1 from public."CollectionMeta") then
    raise exception using
      errcode = '23514',
      message = 'CollectionMeta is not empty; migrate its rows before cleanup';
  end if;

  if to_regclass('public."GenericRecord"') is not null
     and exists (
       select 1
       from public."GenericRecord"
       where collection = 'workspace.snapshot'
     ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy workspace.snapshot rows still exist';
  end if;
end;
$guard$;

-- The application uses commit_workspace_operations exclusively.
drop function if exists public.commit_operations(text, jsonb, jsonb, text);

-- This function references the already-removed WorkspaceMeta table and must not
-- remain callable.
drop function if exists public.write_workspace_snapshot(text, text, integer);

drop table if exists public."CollectionMeta";

-- ---------------------------------------------------------------------------
-- 2. Wrap Staff identity synchronization with workspace journal publication.
-- ---------------------------------------------------------------------------

-- Preserve the already-hardened identity transaction as a private core
-- function. The public wrapper below keeps the same API contract.
do $rename$
begin
  if to_regprocedure(
    'public.sync_staff_identity_bundle(uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text)'
  ) is not null
  and to_regprocedure(
    'public.sync_staff_identity_bundle_core(uuid,uuid,text,text,text,text,text,uuid,timestamptz,timestamptz,text)'
  ) is null then
    alter function public.sync_staff_identity_bundle(
      uuid, uuid, text, text, text, text, text, uuid, timestamptz, timestamptz, text
    ) rename to sync_staff_identity_bundle_core;
  end if;
end;
$rename$;

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
  v_result jsonb;
  v_staff_id text;
  v_workspace_revision integer;
  v_staff_data jsonb;
  v_staff_row_revision integer;
  v_operation jsonb;
  v_row_versions jsonb;
begin
  v_result := public.sync_staff_identity_bundle_core(
    p_assignment_id,
    p_user_id,
    p_email,
    p_role,
    p_display_name,
    p_status,
    p_staff_id,
    p_approved_by,
    p_approved_at,
    p_rejected_at,
    p_workspace_id
  );

  v_staff_id := nullif(v_result ->> 'staffId', '');
  v_workspace_revision := nullif(v_result ->> 'workspaceRevision', '')::integer;

  if v_staff_id is null or v_workspace_revision is null then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_SYNC_RESULT_INCOMPLETE';
  end if;

  select data, revision
    into v_staff_data, v_staff_row_revision
  from public.entity_master_staff
  where workspace_id = p_workspace_id
    and id = v_staff_id;

  if v_staff_data is null then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_SYNC_MASTER_ROW_MISSING';
  end if;

  v_operation := jsonb_build_object(
    'collection', 'master.staff',
    'upsert', jsonb_build_array(v_staff_data),
    'deleteIds', '[]'::jsonb
  );
  v_row_versions := jsonb_build_object(
    'master.staff:' || v_staff_id,
    greatest(coalesce(v_staff_row_revision, 0), 0)
  );

  insert into public.entity_workspace_change_batches (
    workspace_id,
    revision,
    operations,
    row_versions,
    is_baseline,
    created_at
  ) values (
    p_workspace_id,
    v_workspace_revision,
    jsonb_build_array(v_operation),
    v_row_versions,
    false,
    now()
  )
  on conflict (workspace_id, revision) do update set
    operations = excluded.operations,
    row_versions = excluded.row_versions,
    is_baseline = false,
    created_at = excluded.created_at;

  return v_result;
end;
$function$;

revoke all on function public.sync_staff_identity_bundle(
  uuid, uuid, text, text, text, text, text, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.sync_staff_identity_bundle(
  uuid, uuid, text, text, text, text, text, uuid, timestamptz, timestamptz, text
) to service_role;

revoke all on function public.sync_staff_identity_bundle_core(
  uuid, uuid, text, text, text, text, text, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.sync_staff_identity_bundle_core(
  uuid, uuid, text, text, text, text, text, uuid, timestamptz, timestamptz, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Seal existing journal gaps with a full-reload baseline.
-- ---------------------------------------------------------------------------

-- Older side-channel writes advanced entity_workspace_revision without writing
-- a change batch. Mark the current state as a baseline so clients behind it are
-- explicitly told to reload instead of attempting to traverse a broken journal.
insert into public.entity_workspace_change_batches (
  workspace_id,
  revision,
  operations,
  row_versions,
  is_baseline,
  created_at
)
select
  workspace_id,
  revision,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  now()
from public.entity_workspace_revision
on conflict (workspace_id, revision) do update set
  operations = '[]'::jsonb,
  row_versions = '{}'::jsonb,
  is_baseline = true,
  created_at = excluded.created_at;

commit;
