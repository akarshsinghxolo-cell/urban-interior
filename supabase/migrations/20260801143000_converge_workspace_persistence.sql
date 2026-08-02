-- Converge the live workspace persistence model onto the current atomic
-- entity_* + workspace revision/change-journal architecture.
--
-- This migration intentionally does NOT drop GenericRecord: Google Drive OAuth
-- and vault state still use that table. It also leaves Supabase-owned schemas
-- (auth/storage/realtime/vault/supabase_migrations) untouched.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove obsolete or unsafe writers outside the current journaled path.
-- ---------------------------------------------------------------------------
-- commit_operations() writes through CollectionMeta and contains stale special
-- cases for tables that no longer exist. The application uses
-- commit_workspace_operations() instead.
drop function if exists public.commit_operations(text, jsonb, jsonb, text);

-- write_workspace_snapshot() targets the removed WorkspaceMeta table and is no
-- longer part of the application persistence path.
drop function if exists public.write_workspace_snapshot(text, text, integer);

-- This helper increments the global workspace revision without writing the
-- corresponding delta batch. No current application code calls it; keeping it
-- available would permit the exact journal-gap failure this migration fixes.
drop function if exists public.uc_bump_workspace_revision(text);

-- CollectionMeta belonged to commit_operations(). The current optimistic
-- concurrency source is entity_workspace_revision + per-row revision columns.
drop table if exists public."CollectionMeta";

-- ---------------------------------------------------------------------------
-- 2. Harden the atomic commit RPC's collection -> physical table relationship.
-- ---------------------------------------------------------------------------
-- The existing function validates that the caller supplied an entity_* table,
-- but it does not prove that the table belongs to the declared collection.
-- Preserve the proven atomic implementation as an internal function and expose
-- a wrapper that derives the only valid table name from the collection.
do $guard$
begin
  if to_regprocedure('public.commit_workspace_operations_internal(text,integer,jsonb,jsonb)') is null then
    if to_regprocedure('public.commit_workspace_operations(text,integer,jsonb,jsonb)') is null then
      raise exception using errcode = 'P0002', message = 'COMMIT_WORKSPACE_OPERATIONS_NOT_FOUND';
    end if;
    execute 'alter function public.commit_workspace_operations(text, integer, jsonb, jsonb) rename to commit_workspace_operations_internal';
  end if;
end;
$guard$;

create or replace function public.commit_workspace_operations(
  p_workspace_id text,
  p_expected_workspace_revision integer,
  p_operations jsonb,
  p_expected_row_versions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_op jsonb;
  v_collection text;
  v_table text;
  v_expected_table text;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    v_collection := nullif(btrim(v_op ->> 'collection'), '');
    v_table := nullif(btrim(v_op ->> 'table'), '');
    if v_collection is null or v_table is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION';
    end if;

    v_expected_table := 'entity_' || replace(v_collection, '.', '_');
    if v_table is distinct from v_expected_table
       or v_expected_table !~ '^entity_[A-Za-z0-9_]+$'
       or to_regclass(format('public.%I', v_expected_table)) is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION_TABLE';
    end if;
  end loop;

  -- Transaction-local provenance lets table triggers distinguish a normal
  -- workspace commit from an auth-system mirror write even when updated_by on
  -- the existing row still contains an older source value.
  perform set_config('uc.write_source', 'workspace-commit', true);

  return public.commit_workspace_operations_internal(
    p_workspace_id,
    p_expected_workspace_revision,
    p_operations,
    coalesce(p_expected_row_versions, '{}'::jsonb)
  );
end;
$function$;

-- The internal implementation is deliberately not executable by the app role.
-- Only the validating SECURITY DEFINER wrapper above is part of the API surface.
revoke all on function public.commit_workspace_operations_internal(text, integer, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_workspace_operations(text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_workspace_operations(text, integer, jsonb, jsonb)
  to service_role;

comment on function public.commit_workspace_operations(text, integer, jsonb, jsonb) is
  'Canonical workspace commit entrypoint. Validates collection-to-entity-table routing and marks workspace-origin writes before delegating to the sealed atomic implementation.';
comment on function public.commit_workspace_operations_internal(text, integer, jsonb, jsonb) is
  'Sealed internal atomic workspace implementation. Not executable by application roles; use commit_workspace_operations.';

-- ---------------------------------------------------------------------------
-- 3. Make auth-driven Staff master writes participate in the workspace journal.
-- ---------------------------------------------------------------------------
-- sync_staff_identity_bundle() intentionally writes three coordinated records:
-- uc_user_roles, StaffProfile and entity_master_staff. Only entity_master_staff
-- is part of the normal workspace collection model (master.staff). The RPC
-- already locks entity_workspace_revision and advances it after the master row
-- is written. This AFTER trigger writes the matching change batch at exactly
-- that next revision so clients can consume a contiguous delta stream.
create or replace function public.uc_journal_auth_staff_master_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_current_revision integer;
  v_next_revision integer;
begin
  -- Normal workspace commits already write their own atomic journal batch. The
  -- transaction-local source marker is authoritative; updated_by may contain a
  -- historical auth-system value because ordinary entity updates preserve it.
  if current_setting('uc.write_source', true) = 'workspace-commit' then
    return new;
  end if;

  if new.updated_by is distinct from 'auth-system' then
    return new;
  end if;

  select revision
    into v_current_revision
    from public.entity_workspace_revision
   where id = new.workspace_id;

  if v_current_revision is null then
    raise exception using errcode = 'P0002', message = 'WORKSPACE_REVISION_NOT_FOUND';
  end if;

  v_next_revision := v_current_revision + 1;

  insert into public.entity_workspace_change_batches (
    workspace_id,
    revision,
    operations,
    row_versions,
    is_baseline,
    created_at
  ) values (
    new.workspace_id,
    v_next_revision,
    jsonb_build_array(
      jsonb_build_object(
        'collection', 'master.staff',
        'upsert', jsonb_build_array(new.data),
        'deleteIds', '[]'::jsonb
      )
    ),
    jsonb_build_object('master.staff:' || new.id, new.revision),
    false,
    now()
  );

  return new;
end;
$function$;

revoke all on function public.uc_journal_auth_staff_master_write() from public, anon, authenticated;
grant execute on function public.uc_journal_auth_staff_master_write() to service_role;

drop trigger if exists entity_master_staff_auth_journal on public.entity_master_staff;
create trigger entity_master_staff_auth_journal
after insert or update on public.entity_master_staff
for each row
when (new.updated_by = 'auth-system')
execute function public.uc_journal_auth_staff_master_write();

-- ---------------------------------------------------------------------------
-- 4. Reset the delta baseline at the current revision.
-- ---------------------------------------------------------------------------
-- Older deployments contain revision gaps created before the Staff journal fix.
-- Turning the current revision into the new baseline makes every older client
-- perform one safe full reload, after which future revisions are contiguous.
insert into public.entity_workspace_change_batches (
  workspace_id,
  revision,
  operations,
  row_versions,
  is_baseline,
  created_at
)
select
  r.workspace_id,
  r.revision,
  '[]'::jsonb,
  '{}'::jsonb,
  true,
  now()
from public.entity_workspace_revision r
on conflict (workspace_id, revision) do update
set is_baseline = true;

comment on function public.uc_journal_auth_staff_master_write() is
  'Journals auth-system writes to entity_master_staff as master.staff workspace deltas. Normal workspace commits are already journaled by commit_workspace_operations.';

comment on table public.entity_workspace_revision is
  'Canonical global workspace revision. Do not advance this outside a write path that also records entity_workspace_change_batches.';

comment on table public.entity_workspace_change_batches is
  'Canonical workspace delta journal. Every revision visible to workspace clients must be represented here unless it is the current baseline.';

commit;
