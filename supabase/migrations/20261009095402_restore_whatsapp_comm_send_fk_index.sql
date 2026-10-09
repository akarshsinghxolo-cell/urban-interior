-- The partial unique index protects outbound idempotency. This general index
-- separately covers every comm_send_id foreign-key maintenance path.
create index if not exists uc_whatsapp_messages_comm_send_idx
  on public.uc_whatsapp_messages (comm_send_id);
