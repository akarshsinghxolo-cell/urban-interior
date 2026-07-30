-- Frontend-only staff route capture with hourly bundle persistence.
-- This migration intentionally removes the earlier single-ping and native-device
-- tracking systems so only one GPS architecture remains.

drop function if exists public.uc_register_tracking_device(text,text,text,text,text,text);
drop table if exists public.uc_tracking_devices cascade;
drop table if exists public.uc_tracking_device_enrollments cascade;
drop table if exists public."StaffLocationPing" cascade;

create table public."StaffRouteBundle" (
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

create index "StaffRouteBundle_staffId_startedAt_idx"
  on public."StaffRouteBundle" ("staffId", "startedAt" desc);

create index "StaffRouteBundle_endedAt_idx"
  on public."StaffRouteBundle" ("endedAt");

alter table public."StaffRouteBundle" enable row level security;
revoke all on public."StaffRouteBundle" from anon, authenticated;
grant select, insert, update, delete
  on public."StaffRouteBundle"
  to service_role;
