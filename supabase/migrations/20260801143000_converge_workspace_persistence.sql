-- Converge the live workspace persistence model onto the current atomic
-- entity_* + workspace revision/change-journal architecture.
--
-- This migration intentionally does NOT drop GenericRecord: Google Drive OAuth
-- and vault state still use that table. It also leaves Supabase-owned schemas
-- (auth/storage/realtime/vault/supabase_migrations) untouched.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove obsolete writers from the pre-workspace-journal architecture.
-- ---------------------------------------------------------------------------
-- commit_operations() writes through CollectionMeta and contains stale special
-- cases for tables that no longer exist. The application uses
-- commit_workspace_operations() instead.
drop function if exists public.commit_operations(text, jsonb, jsonb, text);

-- write_workspace_snapshot() targets the removed WorkspaceMeta table and is no
-- longer part of the application persistence path.
drop function if exists public.write_workspace_snapshot(text, text, integer);

-- CollectionMeta belonged to commit_operations(). The current optimistic
-- concurrency source is entity_workspace_revision + per-row revision columns.
drop table if exists public."CollectionMeta";

-- ---------------------------------------------------------------------------
-- 2. Make auth-driven Staff master writes participate in the workspace journal.
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
-- 3. Reset the delta baseline at the current revision.
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
