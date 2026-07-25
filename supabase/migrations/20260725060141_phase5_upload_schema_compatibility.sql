-- Phase 5: normalize earlier direct-upload schemas to the final Phase 4 contract.

-- Upload batches.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_batches' and column_name='purpose')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_batches' and column_name='upload_purpose') then
    alter table public.uc_upload_batches rename column purpose to upload_purpose;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_batches' and column_name='created_by')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_batches' and column_name='created_by_user_id') then
    alter table public.uc_upload_batches rename column created_by to created_by_user_id;
  end if;
end $$;

alter table public.uc_upload_batches add column if not exists source_label text;
alter table public.uc_upload_batches add column if not exists target_label text;
update public.uc_upload_batches set source_label=coalesce(source_label,source_flow,'Workspace upload');
update public.uc_upload_batches set target_entity_type=coalesce(target_entity_type,'workspace');
update public.uc_upload_batches set target_entity_id=coalesce(target_entity_id,'default');
update public.uc_upload_batches set upload_purpose=coalesce(upload_purpose,'reference_media');
alter table public.uc_upload_batches alter column source_label set not null;
alter table public.uc_upload_batches alter column target_entity_type set not null;
alter table public.uc_upload_batches alter column target_entity_id set not null;
alter table public.uc_upload_batches alter column upload_purpose set not null;
alter table public.uc_upload_batches alter column status set default 'open';

-- Upload items.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_items' and column_name='fingerprint')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_items' and column_name='fingerprint_sha256') then
    alter table public.uc_upload_items rename column fingerprint to fingerprint_sha256;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_items' and column_name='purpose')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_items' and column_name='upload_purpose') then
    alter table public.uc_upload_items rename column purpose to upload_purpose;
  end if;
end $$;

alter table public.uc_upload_items add column if not exists last_modified bigint;
alter table public.uc_upload_items add column if not exists progress integer not null default 0;
alter table public.uc_upload_items drop constraint if exists uc_upload_items_progress_check;
alter table public.uc_upload_items drop constraint if exists uc_upload_items_confirmed_size_check;
alter table public.uc_upload_items add constraint uc_upload_items_progress_check check (progress between 0 and 100) not valid;
alter table public.uc_upload_items add constraint uc_upload_items_confirmed_size_check check (confirmed_bytes>=0 and confirmed_bytes<=size_bytes) not valid;

-- Canonical folder registry.
alter table public.uc_drive_folders add column if not exists parent_folder_key text;
do $$
begin
  if exists (select 1 from pg_constraint where conrelid='public.uc_drive_folders'::regclass and conname='uc_drive_folders_pkey')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_drive_folders' and column_name='id') then
    alter table public.uc_drive_folders drop constraint uc_drive_folders_pkey;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_drive_folders' and column_name='id') then
    alter table public.uc_drive_folders drop column id;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.uc_drive_folders'::regclass and contype='p') then
    alter table public.uc_drive_folders add constraint uc_drive_folders_pkey primary key(folder_key);
  end if;
end $$;

-- Upload events.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='item_id')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='upload_item_id') then
    alter table public.uc_upload_events rename column item_id to upload_item_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='event')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='event_type') then
    alter table public.uc_upload_events rename column event to event_type;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='data')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uc_upload_events' and column_name='detail') then
    alter table public.uc_upload_events rename column data to detail;
  end if;
end $$;
alter table public.uc_upload_events alter column upload_item_id set not null;

-- Durable workspace operation receipts.
create table if not exists public.uc_workspace_operations(
  id text primary key,
  workspace_id text not null default 'default',
  base_revision bigint not null,
  operations jsonb not null default '[]'::jsonb,
  status text not null default 'processing',
  created_by_user_id text,
  attempt_count integer not null default 0 check(attempt_count>=0),
  applied_revision bigint,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.uc_upload_batches enable row level security;
alter table public.uc_upload_items enable row level security;
alter table public.uc_drive_folders enable row level security;
alter table public.uc_upload_events enable row level security;
alter table public.uc_workspace_operations enable row level security;
revoke all on table public.uc_upload_batches,public.uc_upload_items,public.uc_drive_folders,public.uc_upload_events,public.uc_workspace_operations from anon,authenticated;
grant all on table public.uc_upload_batches,public.uc_upload_items,public.uc_drive_folders,public.uc_upload_events,public.uc_workspace_operations to service_role;

-- Final status constraints.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='uc_upload_batches_status_check') then
    alter table public.uc_upload_batches add constraint uc_upload_batches_status_check check(status in ('open','uploading','waiting','finalizing','completed','cancelled','failed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='uc_upload_items_status_check') then
    alter table public.uc_upload_items add constraint uc_upload_items_status_check check(status in ('queued','preparing','waiting_for_network','waiting_for_entity','starting_session','uploading','paused','uploaded_unverified','verifying','finalizing','completed','failed_retryable','failed_permanent','cancel_requested','cleanup_pending','cancelled')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='uc_drive_folders_status_check') then
    alter table public.uc_drive_folders add constraint uc_drive_folders_status_check check(status in ('creating','active','stale','error')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='uc_workspace_operations_status_check') then
    alter table public.uc_workspace_operations add constraint uc_workspace_operations_status_check check(status in ('processing','applied','conflict','retryable','failed')) not valid;
  end if;
end $$;

create unique index if not exists uc_upload_items_file_asset_unique on public.uc_upload_items(file_asset_id) where file_asset_id is not null;
create unique index if not exists uc_upload_items_attachment_unique on public.uc_upload_items(attachment_id) where attachment_id is not null;
create index if not exists uc_upload_items_waiting_entity_idx on public.uc_upload_items(workspace_id,status,updated_at) where status='waiting_for_entity';
create index if not exists uc_upload_items_session_idx on public.uc_upload_items(status,session_expires_at) where session_uri is not null;
create index if not exists uc_upload_items_target_idx on public.uc_upload_items(workspace_id,target_entity_type,target_entity_id,updated_at desc);
create index if not exists uc_upload_items_fingerprint_sha256_idx on public.uc_upload_items(workspace_id,fingerprint_sha256,size_bytes) where fingerprint_sha256 is not null;
create index if not exists uc_upload_events_upload_item_idx on public.uc_upload_events(upload_item_id,created_at desc);
create index if not exists uc_workspace_operations_status_idx on public.uc_workspace_operations(workspace_id,status,updated_at desc);
create index if not exists uc_workspace_operations_created_by_idx on public.uc_workspace_operations(created_by_user_id,created_at desc);

create or replace function public.uc_prepare_drive_folder_claim_timestamp()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.status in ('stale','error') then new.updated_at:=now()-interval '2 minutes'; end if;
  return new;
end;
$$;
drop trigger if exists uc_drive_folders_prepare_claim_timestamp on public.uc_drive_folders;
create trigger uc_drive_folders_prepare_claim_timestamp before insert or update of status on public.uc_drive_folders for each row execute function public.uc_prepare_drive_folder_claim_timestamp();
revoke all on function public.uc_prepare_drive_folder_claim_timestamp() from public,anon,authenticated;
grant execute on function public.uc_prepare_drive_folder_claim_timestamp() to service_role;

create or replace function public.uc_bump_workspace_revision(p_workspace_id text)
returns bigint language sql security invoker set search_path=public as $$
  insert into public.entity_workspace_revision(id,workspace_id,revision,updated_at)
  values(p_workspace_id,p_workspace_id,1,now())
  on conflict(id) do update set revision=public.entity_workspace_revision.revision+1,workspace_id=excluded.workspace_id,updated_at=now()
  returning revision;
$$;
revoke all on function public.uc_bump_workspace_revision(text) from public,anon,authenticated;
grant execute on function public.uc_bump_workspace_revision(text) to service_role;
