-- UC Project 1 — Phase 2 direct Google Drive resumable transfer
-- Extends the Phase 1 queue tables with session, routing, and finalization data.

alter table public.uc_upload_items add column if not exists source_flow text;
alter table public.uc_upload_items add column if not exists upload_purpose text;
alter table public.uc_upload_items add column if not exists target_entity_type text;
alter table public.uc_upload_items add column if not exists target_entity_id text;
alter table public.uc_upload_items add column if not exists desired_target_entity_type text;
alter table public.uc_upload_items add column if not exists kind text;
alter table public.uc_upload_items add column if not exists role text;
alter table public.uc_upload_items add column if not exists caption text;
alter table public.uc_upload_items add column if not exists visibility text;
alter table public.uc_upload_items add column if not exists customer_shareable boolean not null default false;
alter table public.uc_upload_items add column if not exists attachment_field text;
alter table public.uc_upload_items add column if not exists attachment_field_mode text;
alter table public.uc_upload_items add column if not exists required_evidence boolean not null default false;
alter table public.uc_upload_items add column if not exists session_uri text;
alter table public.uc_upload_items add column if not exists session_expires_at timestamptz;
alter table public.uc_upload_items add column if not exists staging_folder_id text;
alter table public.uc_upload_items add column if not exists final_folder_id text;
alter table public.uc_upload_items add column if not exists progress integer not null default 0;

alter table public.uc_drive_folders add column if not exists web_view_link text;

create index if not exists uc_upload_items_session_idx
  on public.uc_upload_items(status, session_expires_at)
  where session_uri is not null;

create index if not exists uc_upload_items_target_idx
  on public.uc_upload_items(workspace_id, target_entity_type, target_entity_id, updated_at desc);

create index if not exists uc_upload_items_fingerprint_idx
  on public.uc_upload_items(workspace_id, fingerprint_sha256, size_bytes)
  where fingerprint_sha256 is not null;
