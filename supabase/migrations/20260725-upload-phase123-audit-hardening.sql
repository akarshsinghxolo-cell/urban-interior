-- UC Project 1 — audited hardening for direct Drive upload phases 1–3
-- Additive and idempotent. Apply after the Phase 1, Phase 2 and Phase 3 migrations.

alter table public.uc_upload_batches enable row level security;
alter table public.uc_upload_items enable row level security;
alter table public.uc_drive_folders enable row level security;
alter table public.uc_upload_events enable row level security;

revoke all on table public.uc_upload_batches from anon, authenticated;
revoke all on table public.uc_upload_items from anon, authenticated;
revoke all on table public.uc_drive_folders from anon, authenticated;
revoke all on table public.uc_upload_events from anon, authenticated;

grant all on table public.uc_upload_batches to service_role;
grant all on table public.uc_upload_items to service_role;
grant all on table public.uc_drive_folders to service_role;
grant all on table public.uc_upload_events to service_role;
grant usage, select on sequence public.uc_upload_events_id_seq to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uc_upload_batches_status_check'
  ) then
    alter table public.uc_upload_batches
      add constraint uc_upload_batches_status_check
      check (status in ('open','uploading','waiting','finalizing','completed','cancelled','failed')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_upload_items_status_check'
  ) then
    alter table public.uc_upload_items
      add constraint uc_upload_items_status_check
      check (status in (
        'queued','preparing','waiting_for_network','waiting_for_entity','starting_session',
        'uploading','paused','uploaded_unverified','verifying','finalizing','completed',
        'failed_retryable','failed_permanent','cancel_requested','cleanup_pending','cancelled'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_upload_items_progress_check'
  ) then
    alter table public.uc_upload_items
      add constraint uc_upload_items_progress_check
      check (progress between 0 and 100) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_upload_items_confirmed_size_check'
  ) then
    alter table public.uc_upload_items
      add constraint uc_upload_items_confirmed_size_check
      check (confirmed_bytes <= size_bytes) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_upload_items_attachment_mode_check'
  ) then
    alter table public.uc_upload_items
      add constraint uc_upload_items_attachment_mode_check
      check (attachment_field_mode is null or attachment_field_mode in ('set','append')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_drive_folders_status_check'
  ) then
    alter table public.uc_drive_folders
      add constraint uc_drive_folders_status_check
      check (status in ('creating','active','stale','error')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'uc_workspace_operations_status_check'
  ) then
    alter table public.uc_workspace_operations
      add constraint uc_workspace_operations_status_check
      check (status in ('processing','applied','conflict','retryable','failed')) not valid;
  end if;
end
$$;

create unique index if not exists uc_upload_items_file_asset_unique
  on public.uc_upload_items(file_asset_id)
  where file_asset_id is not null;

create unique index if not exists uc_upload_items_attachment_unique
  on public.uc_upload_items(attachment_id)
  where attachment_id is not null;

create index if not exists uc_upload_items_waiting_entity_idx
  on public.uc_upload_items(workspace_id, status, updated_at)
  where status = 'waiting_for_entity';

create or replace function public.uc_prepare_drive_folder_claim_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('stale', 'error') then
    new.updated_at := now() - interval '2 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists uc_drive_folders_prepare_claim_timestamp on public.uc_drive_folders;
create trigger uc_drive_folders_prepare_claim_timestamp
before insert or update of status on public.uc_drive_folders
for each row
execute function public.uc_prepare_drive_folder_claim_timestamp();

revoke all on function public.uc_prepare_drive_folder_claim_timestamp() from public, anon, authenticated;
grant execute on function public.uc_prepare_drive_folder_claim_timestamp() to service_role;

create or replace function public.uc_bump_workspace_revision(p_workspace_id text)
returns bigint
language sql
security invoker
set search_path = public
as $$
  insert into public.entity_workspace_revision (
    id,
    workspace_id,
    revision,
    updated_at
  )
  values (
    p_workspace_id,
    p_workspace_id,
    1,
    now()
  )
  on conflict (id) do update
  set revision = public.entity_workspace_revision.revision + 1,
      workspace_id = excluded.workspace_id,
      updated_at = now()
  returning revision;
$$;

revoke all on function public.uc_bump_workspace_revision(text) from public, anon, authenticated;
grant execute on function public.uc_bump_workspace_revision(text) to service_role;
