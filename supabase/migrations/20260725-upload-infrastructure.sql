-- UC Project 1 — Phase 1 direct Drive upload infrastructure
-- Idempotent foundation tables. File-transfer and finalization routes are added in Phase 2.

create table if not exists public.uc_upload_batches (
  id text primary key,
  workspace_id text not null default 'default',
  source_flow text not null,
  source_label text not null,
  target_entity_type text not null,
  target_entity_id text not null,
  target_label text,
  upload_purpose text not null,
  status text not null default 'open',
  required_evidence boolean not null default false,
  storage_account_id text,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uc_upload_items (
  id text primary key,
  batch_id text not null references public.uc_upload_batches(id) on delete cascade,
  workspace_id text not null default 'default',
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  last_modified bigint,
  fingerprint_sha256 text,
  status text not null default 'queued',
  confirmed_bytes bigint not null default 0 check (confirmed_bytes >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  storage_account_id text,
  google_file_id text,
  file_asset_id text,
  attachment_id text,
  verified_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uc_drive_folders (
  folder_key text primary key,
  workspace_id text not null default 'default',
  storage_account_id text not null,
  google_folder_id text not null,
  parent_folder_key text,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_account_id, google_folder_id)
);

create table if not exists public.uc_upload_events (
  id bigint generated always as identity primary key,
  upload_item_id text not null references public.uc_upload_items(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uc_upload_items_google_file_unique
  on public.uc_upload_items(storage_account_id, google_file_id)
  where google_file_id is not null;

create index if not exists uc_upload_batches_status_idx
  on public.uc_upload_batches(workspace_id, status, updated_at desc);

create index if not exists uc_upload_items_batch_status_idx
  on public.uc_upload_items(batch_id, status, updated_at desc);

create index if not exists uc_upload_items_retry_idx
  on public.uc_upload_items(status, retry_at)
  where status in ('waiting_for_network', 'failed_retryable', 'paused');

create index if not exists uc_upload_events_item_idx
  on public.uc_upload_events(upload_item_id, created_at desc);
