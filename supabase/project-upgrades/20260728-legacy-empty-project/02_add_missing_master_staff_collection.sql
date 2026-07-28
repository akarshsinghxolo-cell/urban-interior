-- The July 11 preview baseline omitted the master Staff collection used by
-- current authentication, permissions and Staff Operations.

create table if not exists public.entity_master_staff (
  id text primary key,
  workspace_id text not null default 'default',
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists entity_master_staff_workspace_idx
  on public.entity_master_staff (workspace_id);
create index if not exists entity_master_staff_revision_idx
  on public.entity_master_staff (revision);

alter table public.entity_master_staff enable row level security;
revoke all on table public.entity_master_staff from public, anon, authenticated;
grant all on table public.entity_master_staff to service_role;