-- Collapse transient upload states into `paused` + last_error_code.
-- `waiting_for_entity` is intentionally removed: an unsynchronized target now
-- requires an explicit/manual retry instead of an automatic wait loop.

update public.uc_upload_items
set
  status = 'paused',
  last_error_code = coalesce(last_error_code, 'NETWORK'),
  last_error_message = coalesce(last_error_message, 'Upload paused until the network is available.'),
  updated_at = now()
where status = 'waiting_for_network';

update public.uc_upload_items
set
  status = 'paused',
  last_error_code = coalesce(last_error_code, 'TEMPORARY_ERROR'),
  updated_at = now()
where status = 'failed_retryable';

update public.uc_upload_items
set
  status = 'failed_permanent',
  last_error_code = coalesce(last_error_code, 'TARGET_NOT_READY'),
  updated_at = now()
where status = 'waiting_for_entity';

alter table public.uc_upload_items
  drop constraint if exists uc_upload_items_status_check;

alter table public.uc_upload_items
  add constraint uc_upload_items_status_check
  check (status in (
    'queued',
    'preparing',
    'starting_session',
    'uploading',
    'paused',
    'uploaded_unverified',
    'verifying',
    'finalizing',
    'completed',
    'failed_permanent',
    'cancel_requested',
    'cleanup_pending',
    'cancelled'
  ));

drop index if exists public.uc_upload_items_waiting_entity_idx;
drop index if exists public.uc_upload_items_retry_idx;

create index if not exists uc_upload_items_retry_idx
  on public.uc_upload_items(status, retry_at)
  where status = 'paused';

comment on column public.uc_upload_items.status is
  'Upload lifecycle state. Temporary network/API failures use paused; the reason is stored in last_error_code.';
