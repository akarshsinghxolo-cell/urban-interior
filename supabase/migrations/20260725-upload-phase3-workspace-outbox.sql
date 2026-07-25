-- UC Project 1 — Phase 3 durable workspace operations

create table if not exists public.uc_workspace_operations (
  id text primary key,
  workspace_id text not null default 'default',
  base_revision bigint not null,
  operations jsonb not null default '[]'::jsonb,
  status text not null default 'processing',
  created_by_user_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  applied_revision bigint,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists uc_workspace_operations_status_idx
  on public.uc_workspace_operations(workspace_id, status, updated_at desc);

create index if not exists uc_workspace_operations_created_by_idx
  on public.uc_workspace_operations(created_by_user_id, created_at desc);

alter table public.uc_workspace_operations enable row level security;

-- Application access is server-mediated through the service-role client.
revoke all on table public.uc_workspace_operations from anon, authenticated;
grant all on table public.uc_workspace_operations to service_role;
