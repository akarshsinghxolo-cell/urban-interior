-- The earlier combined upload migration already created the equivalent item/time index.
drop index if exists public.uc_upload_events_upload_item_idx;
