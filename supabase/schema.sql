-- ============================================================================
-- Urban Castle — bootstrap schema for authentication, settings, staff profiles,
-- and frontend-collected GPS route bundles. Workspace business data is stored in
-- revisioned entity_* tables and committed through commit_workspace_operations().
--
-- Tables (4 total):
--   uc_user_roles       - maps Supabase Auth users to app roles/approval status
--   "GenericRecord"     - JSON key/value store for settings such as Google Drive
--   "StaffProfile"      - normalized staff identity/profile records
--   "StaffRouteBundle"  - hourly/manual browser GPS route bundles
--
-- Safe to re-run: every statement is idempotent (if not exists / or replace).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- uc_user_roles — Supabase Auth role mapping
-- ----------------------------------------------------------------------------
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
drop policy if exists "Users can read their own RDash role" on public.uc_user_roles;
drop policy if exists "Users can read their own UC role" on public.uc_user_roles;
create policy "Users can read their own UC role"
  on public.uc_user_roles for select to authenticated
  using (auth.uid() = user_id);
grant select on public.uc_user_roles to authenticated;
grant all on public.uc_user_roles to service_role;

-- ----------------------------------------------------------------------------
-- GenericRecord — JSON key/value store, keyed by (collection, id)
-- ----------------------------------------------------------------------------
create table if not exists public."GenericRecord" (
  collection text not null,
  id text not null,
  "dataJson" text not null,
  primary key (collection, id)
);
create index if not exists "GenericRecord_collection_idx"
  on public."GenericRecord" (collection);

-- ----------------------------------------------------------------------------
-- StaffProfile — real staff records.
-- ----------------------------------------------------------------------------
create table if not exists public."StaffProfile" (
  id text primary key,
  code text not null unique,
  name text not null,
  phone text,
  email text,
  "roleId" text not null,
  department text,
  designation text,
  "reportingManagerId" text,
  status text not null,
  "joiningDate" text,
  "exitDate" text,
  city text,
  address text,
  "emergencyContact" text,
  "attendancePolicyId" text,
  "salaryType" text not null,
  "monthlySalary" double precision,
  "dailyWage" double precision,
  "bankDetailsJson" text,
  "gpsTrackingEnabled" boolean not null default true,
  "dataJson" text not null
);

-- ----------------------------------------------------------------------------
-- StaffRouteBundle — one browser upload per hour or manual sync.
-- ----------------------------------------------------------------------------
create table if not exists public."StaffRouteBundle" (
  id text primary key,
  "staffId" text not null references public."StaffProfile"(id) on delete cascade,
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

-- ----------------------------------------------------------------------------
-- Row Level Security — these tables are touched only by the server-side
-- service-role client. No browser reads or writes them directly.
-- ----------------------------------------------------------------------------
alter table public."GenericRecord" enable row level security;
alter table public."StaffProfile" enable row level security;
alter table public."StaffRouteBundle" enable row level security;

revoke all on public."GenericRecord" from anon, authenticated;
revoke all on public."StaffProfile" from anon, authenticated;
revoke all on public."StaffRouteBundle" from anon, authenticated;

grant select, insert, update, delete on public."GenericRecord" to service_role;
grant select, insert, update, delete on public."StaffProfile" to service_role;
grant select, insert, update, delete on public."StaffRouteBundle" to service_role;
