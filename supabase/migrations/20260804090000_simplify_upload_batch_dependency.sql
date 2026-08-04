-- Simplify direct Google Drive upload orchestration.
-- Upload batches remain a browser-side grouping/correlation concept, while the
-- canonical file record is created during finalization. Keep the legacy tables
-- for rollback compatibility, but do not require a server batch row per upload.

alter table public.uc_upload_items
  drop constraint if exists uc_upload_items_batch_id_fkey;

comment on column public.uc_upload_items.batch_id is
  'Client-side upload grouping/correlation ID. Does not require a row in uc_upload_batches.';

comment on table public.uc_upload_batches is
  'Legacy upload-batch coordination table retained for rollback compatibility. New direct uploads do not require a batch row.';

comment on table public.uc_upload_events is
  'Terminal upload audit events only. Per-chunk progress is kept client-side and is not persisted for new uploads.';
