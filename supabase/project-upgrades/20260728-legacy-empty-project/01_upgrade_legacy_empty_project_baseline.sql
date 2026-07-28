-- Upgrade an empty July 11 Urban Castle project to the current bootstrap names.
-- This migration is deliberately guarded: it refuses to remove legacy tables
-- when they contain rows. It is safe for a newly reset project and idempotent.

do $$
declare
  row_count bigint;
begin
  if to_regclass('public.rdash_user_roles') is not null then
    execute 'select count(*) from public.rdash_user_roles' into row_count;
    if row_count <> 0 then
      raise exception 'LEGACY_ROLE_TABLE_NOT_EMPTY';
    end if;
    drop table public.rdash_user_roles cascade;
  end if;

  if to_regclass('public."WorkspaceMeta"') is not null then
    execute 'select count(*) from public."WorkspaceMeta"' into row_count;
    if row_count <> 0 then
      raise exception 'LEGACY_WORKSPACE_META_NOT_EMPTY';
    end if;
    drop table public."WorkspaceMeta" cascade;
  end if;

  if to_regclass('public."entity_staffAuthUsers"') is not null then
    execute 'select count(*) from public."entity_staffAuthUsers"' into row_count;
    if row_count <> 0 then
      raise exception 'LEGACY_STAFF_AUTH_USERS_NOT_EMPTY';
    end if;
    drop table public."entity_staffAuthUsers" cascade;
  end if;
end
$$;

create extension if not exists pgcrypto;

create table if not exists public.uc_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null,
  staff_id text,
  display_name text,
  status text not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.uc_user_roles drop constraint if exists uc_user_roles_role_check;
alter table public.uc_user_roles add constraint uc_user_roles_role_check check (
  role in (
    'OWNER', 'OPERATIONS_MANAGER', 'FIELD_STAFF', 'SALES_TELECALLER',
    'PROCUREMENT_STAFF', 'FINANCE', 'ACCOUNTS_ADMIN',
    'Owner', 'Operations Manager', 'Field Staff', 'Sales / Telecaller',
    'Procurement Staff', 'Finance', 'Accounts / Admin'
  )
);

alter table public.uc_user_roles drop constraint if exists uc_user_roles_status_check;
alter table public.uc_user_roles add constraint uc_user_roles_status_check
  check (status in ('pending', 'active', 'rejected', 'inactive'));

create unique index if not exists uc_user_roles_one_active_role
  on public.uc_user_roles (user_id) where status = 'active';
create unique index if not exists uc_user_roles_one_open_request
  on public.uc_user_roles (user_id) where status in ('pending', 'active');
create index if not exists uc_user_roles_email_idx
  on public.uc_user_roles (lower(email));

alter table public.uc_user_roles enable row level security;
drop policy if exists "Users can read their own UC role" on public.uc_user_roles;
create policy "Users can read their own UC role"
  on public.uc_user_roles for select to authenticated
  using (auth.uid() = user_id);
grant select on public.uc_user_roles to authenticated;
grant all on public.uc_user_roles to service_role;

create table if not exists public.entity_workspace_revision (
  id text primary key,
  workspace_id text not null default 'default',
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists entity_workspace_revision_ws_idx
  on public.entity_workspace_revision (workspace_id);

insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
values ('default', 'default', 0, now())
on conflict (id) do nothing;

alter table public.entity_workspace_revision enable row level security;
revoke all on table public.entity_workspace_revision from public, anon, authenticated;
grant select, insert, update, delete on table public.entity_workspace_revision to service_role;