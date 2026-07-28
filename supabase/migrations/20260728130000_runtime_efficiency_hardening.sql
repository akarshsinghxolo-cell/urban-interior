-- Runtime efficiency hardening for health snapshots and GPS retention.

create index if not exists "StaffLocationPing_capturedAt_idx"
  on public."StaffLocationPing" ("capturedAt" desc);

create index if not exists "StaffLocationPing_staffId_capturedAt_desc_idx"
  on public."StaffLocationPing" ("staffId", "capturedAt" desc);

create table if not exists public.workspace_health_snapshot (
  workspace_id text primary key,
  workspace_revision integer not null default 0,
  health_score integer not null default 100,
  total_issues integer not null default 0,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  info_count integer not null default 0,
  total_records integer not null default 0,
  total_references integer not null default 0,
  business_rule_issues integer not null default 0,
  report_json jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_health_snapshot enable row level security;

comment on table public.workspace_health_snapshot is
  'Latest daily or manually requested workspace integrity snapshot. Server service-role access only.';
