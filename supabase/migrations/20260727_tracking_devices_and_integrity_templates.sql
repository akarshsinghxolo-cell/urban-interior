create extension if not exists pgcrypto;

create table if not exists public.uc_tracking_device_enrollments (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  staff_id text not null references public."StaffProfile"(id) on delete cascade,
  staff_name text not null,
  device_name text not null,
  created_by_user_id text not null,
  created_by_name text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.uc_tracking_devices (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references public."StaffProfile"(id) on delete cascade,
  device_name text not null,
  platform text not null check (platform in ('android','ios')),
  installation_id text,
  token_hash text not null unique,
  token_prefix text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  last_seen_at timestamptz,
  last_batch_size integer not null default 0 check (last_batch_size between 0 and 200),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists uc_tracking_enrollments_staff_idx
  on public.uc_tracking_device_enrollments (staff_id, expires_at desc);
create index if not exists uc_tracking_devices_staff_status_idx
  on public.uc_tracking_devices (staff_id, status, last_seen_at desc);
create unique index if not exists uc_tracking_devices_active_installation_uidx
  on public.uc_tracking_devices (staff_id, installation_id)
  where installation_id is not null and status = 'active';

alter table public.uc_tracking_device_enrollments enable row level security;
alter table public.uc_tracking_devices enable row level security;
revoke all on public.uc_tracking_device_enrollments from anon, authenticated;
revoke all on public.uc_tracking_devices from anon, authenticated;
grant select, insert, update, delete on public.uc_tracking_device_enrollments to service_role;
grant select, insert, update, delete on public.uc_tracking_devices to service_role;

create or replace function public.uc_register_tracking_device(
  p_code_hash text,
  p_token_hash text,
  p_token_prefix text,
  p_device_name text,
  p_platform text,
  p_installation_id text default null
)
returns table(device_id uuid, staff_id text, staff_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.uc_tracking_device_enrollments%rowtype;
  created public.uc_tracking_devices%rowtype;
begin
  if p_platform not in ('android','ios') then
    raise exception 'Unsupported tracking platform.';
  end if;

  select * into enrollment
  from public.uc_tracking_device_enrollments
  where code_hash = p_code_hash
    and consumed_at is null
    and expires_at > now()
  for update;

  if enrollment.id is null then
    raise exception 'The enrollment code is invalid, expired, or already used.';
  end if;

  if p_installation_id is not null then
    update public.uc_tracking_devices
      set status = 'revoked', revoked_at = now()
      where staff_id = enrollment.staff_id
        and installation_id = p_installation_id
        and status = 'active';
  end if;

  insert into public.uc_tracking_devices (
    staff_id, device_name, platform, installation_id, token_hash, token_prefix
  ) values (
    enrollment.staff_id,
    coalesce(nullif(trim(p_device_name), ''), enrollment.device_name),
    p_platform,
    nullif(trim(p_installation_id), ''),
    p_token_hash,
    p_token_prefix
  ) returning * into created;

  update public.uc_tracking_device_enrollments
    set consumed_at = now()
    where id = enrollment.id;

  return query select created.id, created.staff_id, enrollment.staff_name;
end;
$$;

revoke all on function public.uc_register_tracking_device(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.uc_register_tracking_device(text,text,text,text,text,text) to service_role;

insert into public."StaffProfile" (
  id, code, name, email, "roleId", status, "salaryType", "gpsTrackingEnabled", "dataJson"
)
values (
  'staff-owner', 'OWNER', 'Akarsh Singh', 'akarshsingh4@gmail.com',
  'OWNER', 'active', 'monthly', true,
  '{"id":"staff-owner","code":"OWNER","name":"Akarsh Singh","email":"akarshsingh4@gmail.com","role":"Owner","role_key":"OWNER","status":"active","salary_type":"monthly","gps_tracking_enabled":true}'::text
)
on conflict (id) do update set
  status = 'active',
  "gpsTrackingEnabled" = true,
  "dataJson" = excluded."dataJson";

insert into public.entity_master_staff (id, workspace_id, revision, updated_at, updated_by, data)
values (
  'staff-owner', 'default', 0, now(), 'system',
  '{"id":"staff-owner","code":"OWNER","name":"Akarsh Singh","email":"akarshsingh4@gmail.com","role":"Owner","role_key":"OWNER","status":"active","salary_type":"monthly","gps_tracking_enabled":true,"created_at":"2026-07-27T00:00:00.000Z","updated_at":"2026-07-27T00:00:00.000Z"}'::jsonb
)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  data = excluded.data,
  updated_at = now(),
  updated_by = 'system',
  revision = public.entity_master_staff.revision + 1;

insert into public."entity_master_storageFolderTemplates" (id, workspace_id, revision, updated_at, updated_by, data)
values
('canonical-site_evidence', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-site_evidence','label','Site evidence','status','active','purpose','site_evidence','path_template','Managed Uploads/Site evidence','created_at',now()::text,'updated_at',now()::text)),
('canonical-visit_evidence', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-visit_evidence','label','Visit evidence','status','active','purpose','visit_evidence','path_template','Managed Uploads/Visit evidence','created_at',now()::text,'updated_at',now()::text)),
('canonical-measurement', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-measurement','label','Measurements','status','active','purpose','measurement','path_template','Managed Uploads/Measurements','created_at',now()::text,'updated_at',now()::text)),
('canonical-drawing', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-drawing','label','Drawings','status','active','purpose','drawing','path_template','Managed Uploads/Drawings','created_at',now()::text,'updated_at',now()::text)),
('canonical-quotation_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-quotation_document','label','Quotation documents','status','active','purpose','quotation_document','path_template','Managed Uploads/Quotation documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-work_order_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-work_order_document','label','Work order documents','status','active','purpose','work_order_document','path_template','Managed Uploads/Work order documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-execution_evidence', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-execution_evidence','label','Execution evidence','status','active','purpose','execution_evidence','path_template','Managed Uploads/Execution evidence','created_at',now()::text,'updated_at',now()::text)),
('canonical-purchase_order', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-purchase_order','label','Purchase orders','status','active','purpose','purchase_order','path_template','Managed Uploads/Purchase orders','created_at',now()::text,'updated_at',now()::text)),
('canonical-grn_evidence', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-grn_evidence','label','GRN evidence','status','active','purpose','grn_evidence','path_template','Managed Uploads/GRN evidence','created_at',now()::text,'updated_at',now()::text)),
('canonical-vendor_bill', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-vendor_bill','label','Vendor bills','status','active','purpose','vendor_bill','path_template','Managed Uploads/Vendor bills','created_at',now()::text,'updated_at',now()::text)),
('canonical-customer_invoice', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-customer_invoice','label','Customer invoices','status','active','purpose','customer_invoice','path_template','Managed Uploads/Customer invoices','created_at',now()::text,'updated_at',now()::text)),
('canonical-customer_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-customer_document','label','Customer documents','status','active','purpose','customer_document','path_template','Managed Uploads/Customer documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-vendor_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-vendor_document','label','Vendor documents','status','active','purpose','vendor_document','path_template','Managed Uploads/Vendor documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-contractor_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-contractor_document','label','Contractor documents','status','active','purpose','contractor_document','path_template','Managed Uploads/Contractor documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-staff_document', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-staff_document','label','Staff documents','status','active','purpose','staff_document','path_template','Managed Uploads/Staff documents','created_at',now()::text,'updated_at',now()::text)),
('canonical-communication_attachment', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-communication_attachment','label','Communication attachments','status','active','purpose','communication_attachment','path_template','Managed Uploads/Communication attachments','created_at',now()::text,'updated_at',now()::text)),
('canonical-import_source', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-import_source','label','Import sources','status','active','purpose','import_source','path_template','Managed Uploads/Import sources','created_at',now()::text,'updated_at',now()::text)),
('canonical-catalogue', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-catalogue','label','Catalogues','status','active','purpose','catalogue','path_template','Managed Uploads/Catalogues','created_at',now()::text,'updated_at',now()::text)),
('canonical-reference_media', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-reference_media','label','Reference media','status','active','purpose','reference_media','path_template','Managed Uploads/Reference media','created_at',now()::text,'updated_at',now()::text)),
('canonical-diagnostic', 'default', 0, now(), 'system', jsonb_build_object('id','canonical-diagnostic','label','Diagnostics','status','active','purpose','diagnostic','path_template','Managed Uploads/Diagnostics','created_at',now()::text,'updated_at',now()::text))
on conflict (id) do nothing;
