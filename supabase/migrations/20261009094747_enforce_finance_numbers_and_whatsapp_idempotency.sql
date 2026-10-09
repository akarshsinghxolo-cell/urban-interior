-- Public financial document numbers are allocated server-side while the workspace
-- revision row is locked. These indexes are the final database backstop.
create unique index if not exists entity_invoices_workspace_invoice_no_unique
  on public.entity_invoices (
    workspace_id,
    (nullif(btrim(data ->> 'invoice_no'), ''))
  )
  where nullif(btrim(data ->> 'invoice_no'), '') is not null;

create unique index if not exists entity_customer_receipts_workspace_receipt_no_unique
  on public."entity_customerReceipts" (
    workspace_id,
    (nullif(btrim(data ->> 'receipt_no'), ''))
  )
  where nullif(btrim(data ->> 'receipt_no'), '') is not null;

-- One canonical application send may reach the external WhatsApp provider once.
create unique index if not exists uc_whatsapp_messages_outbound_comm_send_unique
  on public.uc_whatsapp_messages (workspace_id, comm_send_id)
  where direction = 'outbound' and comm_send_id is not null;

drop index if exists public.uc_whatsapp_messages_comm_send_idx;
