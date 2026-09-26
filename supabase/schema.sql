-- ============================================================================
-- Urban Castle — canonical bootstrap surfaces outside the revisioned entity_*
-- workspace tables.
--
-- Business/profile truth lives in entity_* tables. This file intentionally
-- contains no compatibility mirrors, generic key/value persistence, or legacy
-- StaffProfile table.
--
-- Canonical auxiliary tables:
--   uc_user_roles                 - Auth user ↔ canonical Staff access approval
--   uc_google_drive_credentials   - server-only encrypted Drive credentials
--   "StaffRouteBundle"            - historical GPS route bundles keyed to Staff
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Access approval/link state only. Staff email, name, role and profile data live
-- exclusively in entity_master_staff.
-- ----------------------------------------------------------------------------
create table if not exists public.uc_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_id text not null references public.entity_master_staff(id) on delete restrict,
  status text not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uc_user_roles_status_check
    check (status in ('pending', 'active', 'rejected', 'inactive'))
);

create unique index if not exists uc_user_roles_one_active_role
  on public.uc_user_roles (user_id) where status = 'active';
create unique index if not exists uc_user_roles_one_open_request
  on public.uc_user_roles (user_id) where status in ('pending', 'active');
create index if not exists uc_user_roles_staff_id_idx
  on public.uc_user_roles (staff_id);
create index if not exists uc_user_roles_approved_by_idx
  on public.uc_user_roles (approved_by);

alter table public.uc_user_roles enable row level security;
drop policy if exists "Users can read their own RDash role" on public.uc_user_roles;
drop policy if exists "Users can read their own UC role" on public.uc_user_roles;
create policy "Users can read their own UC role"
  on public.uc_user_roles for select to authenticated
  using (auth.uid() = user_id);
grant select on public.uc_user_roles to authenticated;
grant all on public.uc_user_roles to service_role;

-- ----------------------------------------------------------------------------
-- Google Drive credentials. Canonical workspace account metadata lives in
-- entity_master_storageAccounts; only encrypted server secrets live here.
-- ----------------------------------------------------------------------------
create table if not exists public.uc_google_drive_credentials (
  storage_account_id text primary key
    references public."entity_master_storageAccounts"(id) on delete cascade,
  google_account_id text,
  refresh_token_encrypted jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uc_google_drive_credentials_google_account_uidx
  on public.uc_google_drive_credentials(google_account_id)
  where google_account_id is not null;

alter table public.uc_google_drive_credentials enable row level security;
revoke all on public.uc_google_drive_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.uc_google_drive_credentials to service_role;

-- ----------------------------------------------------------------------------
-- Route history references canonical Staff directly. Route history survives
-- Staff lifecycle changes, so deletes remain restricted.
-- ----------------------------------------------------------------------------
create table if not exists public."StaffRouteBundle" (
  id text primary key,
  "staffId" text not null references public.entity_master_staff(id) on delete restrict,
  "startedAt" timestamptz not null,
  "endedAt" timestamptz not null,
  "pointCount" integer not null check ("pointCount" between 1 and 6000),
  "distanceM" double precision not null default 0 check ("distanceM" >= 0),
  "dataJson" text not null,
  "createdAt" timestamptz not null default now(),
  constraint "StaffRouteBundle_time_order_check"
    check ("endedAt" >= "startedAt")
);

create index if not exists "StaffRouteBundle_staffId_startedAt_idx"
  on public."StaffRouteBundle" ("staffId", "startedAt" desc);
create index if not exists "StaffRouteBundle_endedAt_idx"
  on public."StaffRouteBundle" ("endedAt");

alter table public."StaffRouteBundle" enable row level security;
revoke all on public."StaffRouteBundle" from anon, authenticated;
grant select, insert, update, delete on public."StaffRouteBundle" to service_role;
