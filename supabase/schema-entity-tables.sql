-- ============================================================================
-- Urban Castle — entity_* REST schema (Path B)
-- ============================================================================
-- One table per collection (86 total). Each table has the same structure:
--   id           text PRIMARY KEY
--   workspace_id text (default 'default')
--   revision     int  (per-row CAS counter, bumped on every update)
--   updated_at   timestamptz
--   updated_by   text
--   data         jsonb (full entity JSON)
--
-- The app reads/writes via Supabase REST API (@supabase/supabase-js).
-- Per-row CAS: PATCH /entity_<table>?id=eq.X&revision=eq.N
--   → 0 rows updated = concurrent edit = CONFLICT (409)
--
-- Safe to re-run: every statement is idempotent (if not exists).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- uc_user_roles — Supabase Auth role mapping (unchanged from original)
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

-- ----------------------------------------------------------------------------
-- StaffProfile — real staff records (login/attendance/GPS)
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
  "dataJson" text not null,
  "workspace_id" text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists "StaffProfile_workspace_idx" on public."StaffProfile" (workspace_id);
create index if not exists "StaffProfile_status_idx" on public."StaffProfile" (workspace_id, status);

-- ----------------------------------------------------------------------------
-- StaffLocationPing — GPS pings
-- ----------------------------------------------------------------------------
create table if not exists public."StaffLocationPing" (
  id text primary key,
  "staffId" text not null references public."StaffProfile"(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  "accuracyM" double precision not null,
  "capturedAt" timestamptz not null,
  source text not null default 'browser_foreground',
  "dataJson" text not null,
  "workspace_id" text not null default 'default'
);

create index if not exists "StaffLocationPing_staffId_capturedAt_idx"
  on public."StaffLocationPing" ("staffId", "capturedAt");

-- ----------------------------------------------------------------------------
-- entity_workspace_revision — whole-workspace CAS counter (single row)
-- ----------------------------------------------------------------------------
create table if not exists public.entity_workspace_revision (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists entity_workspace_revision_ws_idx
  on public.entity_workspace_revision (workspace_id);

-- ----------------------------------------------------------------------------
-- entity_* tables — one per collection (86 total)
-- ----------------------------------------------------------------------------
create table if not exists public."entity_customers" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_customers_workspace_idx" on public."entity_customers" (workspace_id);
create index if not exists "entity_customers_revision_idx" on public."entity_customers" (revision);

create table if not exists public."entity_sites" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_sites_workspace_idx" on public."entity_sites" (workspace_id);
create index if not exists "entity_sites_revision_idx" on public."entity_sites" (revision);

create table if not exists public."entity_areas" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_areas_workspace_idx" on public."entity_areas" (workspace_id);
create index if not exists "entity_areas_revision_idx" on public."entity_areas" (revision);

create table if not exists public."entity_workRequired" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_workRequired_workspace_idx" on public."entity_workRequired" (workspace_id);
create index if not exists "entity_workRequired_revision_idx" on public."entity_workRequired" (revision);

create table if not exists public."entity_measurementRevisions" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_measurementRevisions_workspace_idx" on public."entity_measurementRevisions" (workspace_id);
create index if not exists "entity_measurementRevisions_revision_idx" on public."entity_measurementRevisions" (revision);

create table if not exists public."entity_quotations" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_quotations_workspace_idx" on public."entity_quotations" (workspace_id);
create index if not exists "entity_quotations_revision_idx" on public."entity_quotations" (revision);

create table if not exists public."entity_acceptedScopes" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_acceptedScopes_workspace_idx" on public."entity_acceptedScopes" (workspace_id);
create index if not exists "entity_acceptedScopes_revision_idx" on public."entity_acceptedScopes" (revision);

create table if not exists public."entity_workOrders" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_workOrders_workspace_idx" on public."entity_workOrders" (workspace_id);
create index if not exists "entity_workOrders_revision_idx" on public."entity_workOrders" (revision);

create table if not exists public."entity_boqs" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_boqs_workspace_idx" on public."entity_boqs" (workspace_id);
create index if not exists "entity_boqs_revision_idx" on public."entity_boqs" (revision);

create table if not exists public."entity_vendorRfqs" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_vendorRfqs_workspace_idx" on public."entity_vendorRfqs" (workspace_id);
create index if not exists "entity_vendorRfqs_revision_idx" on public."entity_vendorRfqs" (revision);

create table if not exists public."entity_vendorBids" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_vendorBids_workspace_idx" on public."entity_vendorBids" (workspace_id);
create index if not exists "entity_vendorBids_revision_idx" on public."entity_vendorBids" (revision);

create table if not exists public."entity_purchaseOrders" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_purchaseOrders_workspace_idx" on public."entity_purchaseOrders" (workspace_id);
create index if not exists "entity_purchaseOrders_revision_idx" on public."entity_purchaseOrders" (revision);

create table if not exists public."entity_grns" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_grns_workspace_idx" on public."entity_grns" (workspace_id);
create index if not exists "entity_grns_revision_idx" on public."entity_grns" (revision);

create table if not exists public."entity_inventory" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_inventory_workspace_idx" on public."entity_inventory" (workspace_id);
create index if not exists "entity_inventory_revision_idx" on public."entity_inventory" (revision);

create table if not exists public."entity_stockMovements" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_stockMovements_workspace_idx" on public."entity_stockMovements" (workspace_id);
create index if not exists "entity_stockMovements_revision_idx" on public."entity_stockMovements" (revision);

create table if not exists public."entity_dispatches" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_dispatches_workspace_idx" on public."entity_dispatches" (workspace_id);
create index if not exists "entity_dispatches_revision_idx" on public."entity_dispatches" (revision);

create table if not exists public."entity_vendorBills" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_vendorBills_workspace_idx" on public."entity_vendorBills" (workspace_id);
create index if not exists "entity_vendorBills_revision_idx" on public."entity_vendorBills" (revision);

create table if not exists public."entity_vendorPayments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_vendorPayments_workspace_idx" on public."entity_vendorPayments" (workspace_id);
create index if not exists "entity_vendorPayments_revision_idx" on public."entity_vendorPayments" (revision);

create table if not exists public."entity_contractorBills" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_contractorBills_workspace_idx" on public."entity_contractorBills" (workspace_id);
create index if not exists "entity_contractorBills_revision_idx" on public."entity_contractorBills" (revision);

create table if not exists public."entity_contractorPayments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_contractorPayments_workspace_idx" on public."entity_contractorPayments" (workspace_id);
create index if not exists "entity_contractorPayments_revision_idx" on public."entity_contractorPayments" (revision);

create table if not exists public."entity_commissions" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_commissions_workspace_idx" on public."entity_commissions" (workspace_id);
create index if not exists "entity_commissions_revision_idx" on public."entity_commissions" (revision);

create table if not exists public."entity_workOrderCostLines" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_workOrderCostLines_workspace_idx" on public."entity_workOrderCostLines" (workspace_id);
create index if not exists "entity_workOrderCostLines_revision_idx" on public."entity_workOrderCostLines" (revision);

create table if not exists public."entity_contractorBids" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_contractorBids_workspace_idx" on public."entity_contractorBids" (workspace_id);
create index if not exists "entity_contractorBids_revision_idx" on public."entity_contractorBids" (revision);

create table if not exists public."entity_contractorSettlements" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_contractorSettlements_workspace_idx" on public."entity_contractorSettlements" (workspace_id);
create index if not exists "entity_contractorSettlements_revision_idx" on public."entity_contractorSettlements" (revision);

create table if not exists public."entity_drawings" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_drawings_workspace_idx" on public."entity_drawings" (workspace_id);
create index if not exists "entity_drawings_revision_idx" on public."entity_drawings" (revision);

create table if not exists public."entity_executionLogs" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_executionLogs_workspace_idx" on public."entity_executionLogs" (workspace_id);
create index if not exists "entity_executionLogs_revision_idx" on public."entity_executionLogs" (revision);

create table if not exists public."entity_variationRequests" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_variationRequests_workspace_idx" on public."entity_variationRequests" (workspace_id);
create index if not exists "entity_variationRequests_revision_idx" on public."entity_variationRequests" (revision);

create table if not exists public."entity_visits" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_visits_workspace_idx" on public."entity_visits" (workspace_id);
create index if not exists "entity_visits_revision_idx" on public."entity_visits" (revision);

create table if not exists public."entity_tasks" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_tasks_workspace_idx" on public."entity_tasks" (workspace_id);
create index if not exists "entity_tasks_revision_idx" on public."entity_tasks" (revision);

create table if not exists public."entity_followups" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_followups_workspace_idx" on public."entity_followups" (workspace_id);
create index if not exists "entity_followups_revision_idx" on public."entity_followups" (revision);

create table if not exists public."entity_actions" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_actions_workspace_idx" on public."entity_actions" (workspace_id);
create index if not exists "entity_actions_revision_idx" on public."entity_actions" (revision);

create table if not exists public."entity_payments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_payments_workspace_idx" on public."entity_payments" (workspace_id);
create index if not exists "entity_payments_revision_idx" on public."entity_payments" (revision);

create table if not exists public."entity_invoices" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_invoices_workspace_idx" on public."entity_invoices" (workspace_id);
create index if not exists "entity_invoices_revision_idx" on public."entity_invoices" (revision);

create table if not exists public."entity_customerReceipts" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_customerReceipts_workspace_idx" on public."entity_customerReceipts" (workspace_id);
create index if not exists "entity_customerReceipts_revision_idx" on public."entity_customerReceipts" (revision);

create table if not exists public."entity_blocked" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_blocked_workspace_idx" on public."entity_blocked" (workspace_id);
create index if not exists "entity_blocked_revision_idx" on public."entity_blocked" (revision);

create table if not exists public."entity_risks" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_risks_workspace_idx" on public."entity_risks" (workspace_id);
create index if not exists "entity_risks_revision_idx" on public."entity_risks" (revision);

create table if not exists public."entity_threads" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_threads_workspace_idx" on public."entity_threads" (workspace_id);
create index if not exists "entity_threads_revision_idx" on public."entity_threads" (revision);

create table if not exists public."entity_attendance" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_attendance_workspace_idx" on public."entity_attendance" (workspace_id);
create index if not exists "entity_attendance_revision_idx" on public."entity_attendance" (revision);

create table if not exists public."entity_staffLocationPings" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_staffLocationPings_workspace_idx" on public."entity_staffLocationPings" (workspace_id);
create index if not exists "entity_staffLocationPings_revision_idx" on public."entity_staffLocationPings" (revision);

create table if not exists public."entity_staffRolePermissions" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_staffRolePermissions_workspace_idx" on public."entity_staffRolePermissions" (workspace_id);
create index if not exists "entity_staffRolePermissions_revision_idx" on public."entity_staffRolePermissions" (revision);

create table if not exists public."entity_staffAuthUsers" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_staffAuthUsers_workspace_idx" on public."entity_staffAuthUsers" (workspace_id);
create index if not exists "entity_staffAuthUsers_revision_idx" on public."entity_staffAuthUsers" (revision);

create table if not exists public."entity_leaveRequests" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_leaveRequests_workspace_idx" on public."entity_leaveRequests" (workspace_id);
create index if not exists "entity_leaveRequests_revision_idx" on public."entity_leaveRequests" (revision);

create table if not exists public."entity_payrollPeriods" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_payrollPeriods_workspace_idx" on public."entity_payrollPeriods" (workspace_id);
create index if not exists "entity_payrollPeriods_revision_idx" on public."entity_payrollPeriods" (revision);

create table if not exists public."entity_payrollLines" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_payrollLines_workspace_idx" on public."entity_payrollLines" (workspace_id);
create index if not exists "entity_payrollLines_revision_idx" on public."entity_payrollLines" (revision);

create table if not exists public."entity_salaryAdjustments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_salaryAdjustments_workspace_idx" on public."entity_salaryAdjustments" (workspace_id);
create index if not exists "entity_salaryAdjustments_revision_idx" on public."entity_salaryAdjustments" (revision);

create table if not exists public."entity_staffDocuments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_staffDocuments_workspace_idx" on public."entity_staffDocuments" (workspace_id);
create index if not exists "entity_staffDocuments_revision_idx" on public."entity_staffDocuments" (revision);

create table if not exists public."entity_approvalPolicies" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_approvalPolicies_workspace_idx" on public."entity_approvalPolicies" (workspace_id);
create index if not exists "entity_approvalPolicies_revision_idx" on public."entity_approvalPolicies" (revision);

create table if not exists public."entity_automationRules" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_automationRules_workspace_idx" on public."entity_automationRules" (workspace_id);
create index if not exists "entity_automationRules_revision_idx" on public."entity_automationRules" (revision);

create table if not exists public."entity_recurringTasks" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_recurringTasks_workspace_idx" on public."entity_recurringTasks" (workspace_id);
create index if not exists "entity_recurringTasks_revision_idx" on public."entity_recurringTasks" (revision);

create table if not exists public."entity_commSends" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_commSends_workspace_idx" on public."entity_commSends" (workspace_id);
create index if not exists "entity_commSends_revision_idx" on public."entity_commSends" (revision);

create table if not exists public."entity_entityFileAttachments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_entityFileAttachments_workspace_idx" on public."entity_entityFileAttachments" (workspace_id);
create index if not exists "entity_entityFileAttachments_revision_idx" on public."entity_entityFileAttachments" (revision);

create table if not exists public."entity_entityReferenceAssignments" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_entityReferenceAssignments_workspace_idx" on public."entity_entityReferenceAssignments" (workspace_id);
create index if not exists "entity_entityReferenceAssignments_revision_idx" on public."entity_entityReferenceAssignments" (revision);

create table if not exists public."entity_commercialTerms" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_commercialTerms_workspace_idx" on public."entity_commercialTerms" (workspace_id);
create index if not exists "entity_commercialTerms_revision_idx" on public."entity_commercialTerms" (revision);

create table if not exists public."entity_paymentTermTemplates" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_paymentTermTemplates_workspace_idx" on public."entity_paymentTermTemplates" (workspace_id);
create index if not exists "entity_paymentTermTemplates_revision_idx" on public."entity_paymentTermTemplates" (revision);

create table if not exists public."entity_taxConfigs" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_taxConfigs_workspace_idx" on public."entity_taxConfigs" (workspace_id);
create index if not exists "entity_taxConfigs_revision_idx" on public."entity_taxConfigs" (revision);

create table if not exists public."entity_validityConfigs" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_validityConfigs_workspace_idx" on public."entity_validityConfigs" (workspace_id);
create index if not exists "entity_validityConfigs_revision_idx" on public."entity_validityConfigs" (revision);

create table if not exists public."entity_master_units" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_units_workspace_idx" on public."entity_master_units" (workspace_id);
create index if not exists "entity_master_units_revision_idx" on public."entity_master_units" (revision);

create table if not exists public."entity_master_workCategories" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_workCategories_workspace_idx" on public."entity_master_workCategories" (workspace_id);
create index if not exists "entity_master_workCategories_revision_idx" on public."entity_master_workCategories" (revision);

create table if not exists public."entity_master_workSubcategories" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_workSubcategories_workspace_idx" on public."entity_master_workSubcategories" (workspace_id);
create index if not exists "entity_master_workSubcategories_revision_idx" on public."entity_master_workSubcategories" (revision);

create table if not exists public."entity_master_articles" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_articles_workspace_idx" on public."entity_master_articles" (workspace_id);
create index if not exists "entity_master_articles_revision_idx" on public."entity_master_articles" (revision);

create table if not exists public."entity_master_articleVariants" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_articleVariants_workspace_idx" on public."entity_master_articleVariants" (workspace_id);
create index if not exists "entity_master_articleVariants_revision_idx" on public."entity_master_articleVariants" (revision);

create table if not exists public."entity_master_subcategoryArticleMap" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_subcategoryArticleMap_workspace_idx" on public."entity_master_subcategoryArticleMap" (workspace_id);
create index if not exists "entity_master_subcategoryArticleMap_revision_idx" on public."entity_master_subcategoryArticleMap" (revision);

create table if not exists public."entity_master_workOptionGroups" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_workOptionGroups_workspace_idx" on public."entity_master_workOptionGroups" (workspace_id);
create index if not exists "entity_master_workOptionGroups_revision_idx" on public."entity_master_workOptionGroups" (revision);

create table if not exists public."entity_master_workOptionValues" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_workOptionValues_workspace_idx" on public."entity_master_workOptionValues" (workspace_id);
create index if not exists "entity_master_workOptionValues_revision_idx" on public."entity_master_workOptionValues" (revision);

create table if not exists public."entity_master_vendors" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_vendors_workspace_idx" on public."entity_master_vendors" (workspace_id);
create index if not exists "entity_master_vendors_revision_idx" on public."entity_master_vendors" (revision);

create table if not exists public."entity_master_contractors" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_contractors_workspace_idx" on public."entity_master_contractors" (workspace_id);
create index if not exists "entity_master_contractors_revision_idx" on public."entity_master_contractors" (revision);

create table if not exists public."entity_master_staff" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_staff_workspace_idx" on public."entity_master_staff" (workspace_id);
create index if not exists "entity_master_staff_revision_idx" on public."entity_master_staff" (revision);

create table if not exists public."entity_master_sourcePartners" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_sourcePartners_workspace_idx" on public."entity_master_sourcePartners" (workspace_id);
create index if not exists "entity_master_sourcePartners_revision_idx" on public."entity_master_sourcePartners" (revision);

create table if not exists public."entity_master_commissionRules" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_commissionRules_workspace_idx" on public."entity_master_commissionRules" (workspace_id);
create index if not exists "entity_master_commissionRules_revision_idx" on public."entity_master_commissionRules" (revision);

create table if not exists public."entity_master_vendorRates" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_vendorRates_workspace_idx" on public."entity_master_vendorRates" (workspace_id);
create index if not exists "entity_master_vendorRates_revision_idx" on public."entity_master_vendorRates" (revision);

create table if not exists public."entity_master_contractorRates" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_contractorRates_workspace_idx" on public."entity_master_contractorRates" (workspace_id);
create index if not exists "entity_master_contractorRates_revision_idx" on public."entity_master_contractorRates" (revision);

create table if not exists public."entity_master_customerRateSuggestions" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_customerRateSuggestions_workspace_idx" on public."entity_master_customerRateSuggestions" (workspace_id);
create index if not exists "entity_master_customerRateSuggestions_revision_idx" on public."entity_master_customerRateSuggestions" (revision);

create table if not exists public."entity_master_vendorRateHistories" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_vendorRateHistories_workspace_idx" on public."entity_master_vendorRateHistories" (workspace_id);
create index if not exists "entity_master_vendorRateHistories_revision_idx" on public."entity_master_vendorRateHistories" (revision);

create table if not exists public."entity_master_storageAccounts" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_storageAccounts_workspace_idx" on public."entity_master_storageAccounts" (workspace_id);
create index if not exists "entity_master_storageAccounts_revision_idx" on public."entity_master_storageAccounts" (revision);

create table if not exists public."entity_master_storageFolderTemplates" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_storageFolderTemplates_workspace_idx" on public."entity_master_storageFolderTemplates" (workspace_id);
create index if not exists "entity_master_storageFolderTemplates_revision_idx" on public."entity_master_storageFolderTemplates" (revision);

create table if not exists public."entity_master_storageFolderInstances" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_storageFolderInstances_workspace_idx" on public."entity_master_storageFolderInstances" (workspace_id);
create index if not exists "entity_master_storageFolderInstances_revision_idx" on public."entity_master_storageFolderInstances" (revision);

create table if not exists public."entity_master_fileAssets" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_fileAssets_workspace_idx" on public."entity_master_fileAssets" (workspace_id);
create index if not exists "entity_master_fileAssets_revision_idx" on public."entity_master_fileAssets" (revision);

create table if not exists public."entity_master_catalogues" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_catalogues_workspace_idx" on public."entity_master_catalogues" (workspace_id);
create index if not exists "entity_master_catalogues_revision_idx" on public."entity_master_catalogues" (revision);

create table if not exists public."entity_master_catalogueArticleVendorLinks" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_catalogueArticleVendorLinks_workspace_idx" on public."entity_master_catalogueArticleVendorLinks" (workspace_id);
create index if not exists "entity_master_catalogueArticleVendorLinks_revision_idx" on public."entity_master_catalogueArticleVendorLinks" (revision);

create table if not exists public."entity_master_pinterestBoards" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_pinterestBoards_workspace_idx" on public."entity_master_pinterestBoards" (workspace_id);
create index if not exists "entity_master_pinterestBoards_revision_idx" on public."entity_master_pinterestBoards" (revision);

create table if not exists public."entity_master_referenceMedia" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_master_referenceMedia_workspace_idx" on public."entity_master_referenceMedia" (workspace_id);
create index if not exists "entity_master_referenceMedia_revision_idx" on public."entity_master_referenceMedia" (revision);

-- FIX-ANALYSIS-001: entity_auditLog — was missing from DDL, causing silent
-- audit-log insert failures in production. Every commit-rest audit insert
-- silently failed (commit-rest.ts:282-286 only catches 23505 duplicate-key
-- errors, swallowing all others). Audit entries vanished on workspace reload.
create table if not exists public."entity_auditLog" (
  id text primary key,
  workspace_id text not null default 'default',
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  data jsonb not null
);

create index if not exists "entity_auditLog_workspace_idx" on public."entity_auditLog" (workspace_id);
create index if not exists "entity_auditLog_revision_idx" on public."entity_auditLog" (revision);


-- ============================================================================
-- RLS policies — workspace-scoped access for authenticated users
-- ============================================================================
-- The app uses the service_role key (bypasses RLS). These policies apply to
-- direct Postgres connections with anon/authenticated keys.
-- ============================================================================

-- Helper: resolve current user's active role
create or replace function public.rdash_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.uc_user_roles
  where user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- Helper: is the current user privileged (Owner / Operations Manager)?
create or replace function public.rdash_is_privileged()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.rdash_current_role() in ('OWNER', 'Owner', 'Operations Manager', 'OPERATIONS_MANAGER'), false);
$$;

-- Enable RLS + workspace-scoped policies on all entity_* tables
do $$
declare
  tbl text;
  tables text[] := ARRAY[
    'entity_customers',
    'entity_sites',
    'entity_areas',
    'entity_workRequired',
    'entity_measurementRevisions',
    'entity_quotations',
    'entity_acceptedScopes',
    'entity_workOrders',
    'entity_boqs',
    'entity_vendorRfqs',
    'entity_vendorBids',
    'entity_purchaseOrders',
    'entity_grns',
    'entity_inventory',
    'entity_stockMovements',
    'entity_dispatches',
    'entity_vendorBills',
    'entity_vendorPayments',
    'entity_contractorBills',
    'entity_contractorPayments',
    'entity_commissions',
    'entity_workOrderCostLines',
    'entity_contractorBids',
    'entity_contractorSettlements',
    'entity_drawings',
    'entity_executionLogs',
    'entity_variationRequests',
    'entity_visits',
    'entity_tasks',
    'entity_followups',
    'entity_actions',
    'entity_payments',
    'entity_invoices',
    'entity_customerReceipts',
    'entity_blocked',
    'entity_risks',
    'entity_threads',
    'entity_attendance',
    'entity_staffLocationPings',
    'entity_staffRolePermissions',
    'entity_staffAuthUsers',
    'entity_leaveRequests',
    'entity_payrollPeriods',
    'entity_payrollLines',
    'entity_salaryAdjustments',
    'entity_staffDocuments',
    'entity_approvalPolicies',
    'entity_automationRules',
    'entity_recurringTasks',
    'entity_commSends',
    'entity_entityFileAttachments',
    'entity_entityReferenceAssignments',
    'entity_commercialTerms',
    'entity_paymentTermTemplates',
    'entity_taxConfigs',
    'entity_validityConfigs',
    'entity_master_units',
    'entity_master_workCategories',
    'entity_master_workSubcategories',
    'entity_master_articles',
    'entity_master_articleVariants',
    'entity_master_subcategoryArticleMap',
    'entity_master_workOptionGroups',
    'entity_master_workOptionValues',
    'entity_master_vendors',
    'entity_master_contractors',
    'entity_master_staff',
    'entity_master_sourcePartners',
    'entity_master_commissionRules',
    'entity_master_vendorRates',
    'entity_master_contractorRates',
    'entity_master_customerRateSuggestions',
    'entity_master_vendorRateHistories',
    'entity_master_storageAccounts',
    'entity_master_storageFolderTemplates',
    'entity_master_storageFolderInstances',
    'entity_master_fileAssets',
    'entity_master_catalogues',
    'entity_master_catalogueArticleVendorLinks',
    'entity_master_pinterestBoards',
    'entity_master_referenceMedia',
    'entity_auditLog',
    'entity_workspace_revision'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table if exists public."%s" enable row level security;', tbl);
    execute format('drop policy if exists "%s_ws_read" on public."%s";', tbl, tbl);
    execute format('drop policy if exists "%s_ws_write" on public."%s";', tbl, tbl);
    execute format('create policy "%s_ws_read" on public."%s" for select to authenticated using (workspace_id = current_setting(''app.workspace_id'', true) or current_setting(''app.workspace_id'', true) is null);', tbl, tbl);
    execute format('create policy "%s_ws_write" on public."%s" for all to authenticated using (public.rdash_is_privileged()) with check (public.rdash_is_privileged());', tbl, tbl);
  end loop;
end $$;

-- ============================================================================
-- Grants
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema public to authenticated;

-- ============================================================================
-- Done. 87 entity_* tables (including entity_auditLog) + entity_workspace_revision
-- + StaffProfile + StaffLocationPing + uc_user_roles + RLS policies.
-- ============================================================================
