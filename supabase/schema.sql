-- ============================================================================
-- Urban Castle — canonical Supabase schema. Run this ONCE in Supabase
-- Dashboard -> SQL Editor. This is now the ONLY place the app's database
-- structure is defined — Prisma has been removed entirely.
--
-- Tables (5 total, everything the app actually uses):
--   rdash_user_roles    - maps Supabase Auth users to app roles/approval status
--   "GenericRecord"     - JSON key/value store (the workspace snapshot + misc
--                          settings such as Google Drive config live here)
--   "WorkspaceMeta"     - one row per workspace, tracks the snapshot revision
--   "StaffProfile"      - real staff records used for login/attendance/GPS
--   "StaffLocationPing" - GPS pings, references StaffProfile
--
-- Plus one RPC function, write_workspace_snapshot(), used to atomically
-- persist a new workspace snapshot + bump the revision counter in one
-- transaction (this replaces Prisma's $transaction()).
--
-- Safe to re-run: every statement is idempotent (if not exists / or replace).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- rdash_user_roles — Supabase Auth role mapping
-- ----------------------------------------------------------------------------
create table if not exists public.rdash_user_roles (
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

alter table public.rdash_user_roles drop constraint if exists rdash_user_roles_role_check;
alter table public.rdash_user_roles add constraint rdash_user_roles_role_check check (
  role in (
    'OWNER', 'OPERATIONS_MANAGER', 'FIELD_STAFF', 'SALES_TELECALLER',
    'PROCUREMENT_STAFF', 'FINANCE', 'ACCOUNTS_ADMIN',
    'Owner', 'Operations Manager', 'Field Staff', 'Sales / Telecaller',
    'Procurement Staff', 'Finance', 'Accounts / Admin'
  )
);

alter table public.rdash_user_roles drop constraint if exists rdash_user_roles_status_check;
alter table public.rdash_user_roles add constraint rdash_user_roles_status_check
  check (status in ('pending', 'active', 'rejected', 'inactive'));

create unique index if not exists rdash_user_roles_one_active_role
  on public.rdash_user_roles (user_id) where status = 'active';
create unique index if not exists rdash_user_roles_one_open_request
  on public.rdash_user_roles (user_id) where status in ('pending', 'active');
create index if not exists rdash_user_roles_email_idx
  on public.rdash_user_roles (lower(email));

alter table public.rdash_user_roles enable row level security;
drop policy if exists "Users can read their own RDash role" on public.rdash_user_roles;
create policy "Users can read their own RDash role"
  on public.rdash_user_roles for select to authenticated
  using (auth.uid() = user_id);
grant select on public.rdash_user_roles to authenticated;
grant all on public.rdash_user_roles to service_role;

-- ----------------------------------------------------------------------------
-- GenericRecord — JSON key/value store, keyed by (collection, id)
-- ----------------------------------------------------------------------------
create table if not exists public."GenericRecord" (
  collection text not null,
  id text not null,
  "dataJson" text not null,
  primary key (collection, id)
);
create index if not exists "GenericRecord_collection_idx" on public."GenericRecord" (collection);

-- ----------------------------------------------------------------------------
-- WorkspaceMeta — one row per workspace, tracks the snapshot revision
-- ----------------------------------------------------------------------------
create table if not exists public."WorkspaceMeta" (
  id text primary key,
  revision integer not null default 0,
  "updatedAt" timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- StaffProfile — real staff records. (roleId / attendancePolicyId are kept as
-- plain reference strings; the StaffRole / AttendancePolicy tables they used
-- to point to were part of the unused legacy schema and are not recreated.)
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
-- StaffLocationPing — GPS pings
-- ----------------------------------------------------------------------------
create table if not exists public."StaffLocationPing" (
  id text primary key,
  "staffId" text not null references public."StaffProfile"(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  "accuracyM" double precision,
  speed double precision,
  battery double precision,
  "capturedAt" text not null,
  source text not null,
  "dataJson" text not null
);
create index if not exists "StaffLocationPing_staffId_capturedAt_idx"
  on public."StaffLocationPing" ("staffId", "capturedAt");

-- ----------------------------------------------------------------------------
-- Row Level Security — these 4 tables are only ever touched by the app's
-- server-side Supabase admin (service-role) client, never directly by a
-- browser. RLS is enabled with NO policies for anon/authenticated on purpose,
-- which denies them all access by default; service_role bypasses RLS.
-- ----------------------------------------------------------------------------
alter table public."GenericRecord" enable row level security;
alter table public."WorkspaceMeta" enable row level security;
alter table public."StaffProfile" enable row level security;
alter table public."StaffLocationPing" enable row level security;

-- ----------------------------------------------------------------------------
-- write_workspace_snapshot — atomically writes a new workspace snapshot and
-- bumps the revision counter. Called via admin.rpc(...) from the app; this is
-- what replaces Prisma's $transaction() for the one place the app needed
-- multi-statement atomicity.
-- ----------------------------------------------------------------------------
create or replace function public.write_workspace_snapshot(
  p_workspace_id text,
  p_data_json text,
  p_revision integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection text := 'workspace.snapshot';
begin
  insert into public."GenericRecord" (collection, id, "dataJson")
    values (v_collection, p_workspace_id, p_data_json)
    on conflict (collection, id) do update set "dataJson" = excluded."dataJson";

  insert into public."WorkspaceMeta" (id, revision, "updatedAt")
    values (p_workspace_id, p_revision, now())
    on conflict (id) do update set revision = excluded.revision, "updatedAt" = now();
end;
$$;

revoke all on function public.write_workspace_snapshot(text, text, integer) from public;
grant execute on function public.write_workspace_snapshot(text, text, integer) to service_role;
