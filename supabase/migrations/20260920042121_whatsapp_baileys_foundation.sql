create table if not exists public.uc_whatsapp_accounts (
  workspace_id text primary key default 'default',
  status text not null default 'disconnected'
    check (status in ('disconnected','pairing','connecting','connected','degraded','logged_out','error')),
  phone_number text,
  jid text,
  display_name text,
  pairing_requested_at timestamptz,
  connected_at timestamptz,
  last_activity_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uc_whatsapp_auth_state (
  workspace_id text not null default 'default'
    references public.uc_whatsapp_accounts(workspace_id) on delete cascade,
  auth_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, auth_key)
);

create table if not exists public.uc_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default'
    references public.uc_whatsapp_accounts(workspace_id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  remote_jid text not null,
  customer_id text references public.entity_customers(id) on delete set null,
  comm_send_id text references public."entity_commSends"(id) on delete set null,
  subject text,
  body text,
  message_type text not null default 'text',
  status text not null
    check (status in ('received','queued','sending','sent','delivered','read','failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uc_whatsapp_messages_provider_unique
  on public.uc_whatsapp_messages(workspace_id, direction, provider_message_id)
  where provider_message_id is not null;

create index if not exists uc_whatsapp_messages_customer_created_idx
  on public.uc_whatsapp_messages(customer_id, created_at desc);

create index if not exists uc_whatsapp_messages_workspace_created_idx
  on public.uc_whatsapp_messages(workspace_id, created_at desc);

create index if not exists uc_whatsapp_auth_state_workspace_idx
  on public.uc_whatsapp_auth_state(workspace_id);

alter table public.uc_whatsapp_accounts enable row level security;
alter table public.uc_whatsapp_auth_state enable row level security;
alter table public.uc_whatsapp_messages enable row level security;

revoke all on table public.uc_whatsapp_accounts from public, anon, authenticated;
revoke all on table public.uc_whatsapp_auth_state from public, anon, authenticated;
revoke all on table public.uc_whatsapp_messages from public, anon, authenticated;

grant select, insert, update, delete on table public.uc_whatsapp_accounts to service_role;
grant select, insert, update, delete on table public.uc_whatsapp_auth_state to service_role;
grant select, insert, update, delete on table public.uc_whatsapp_messages to service_role;

comment on table public.uc_whatsapp_accounts is
  'Server-only WhatsApp/Baileys account connection metadata for Urban Castle.';
comment on table public.uc_whatsapp_auth_state is
  'Server-only serialized Baileys authentication credentials and signal key material. Never expose through browser clients.';
comment on table public.uc_whatsapp_messages is
  'Server-only WhatsApp provider message journal used to bridge Urban Castle communication workflows with WhatsApp.';
