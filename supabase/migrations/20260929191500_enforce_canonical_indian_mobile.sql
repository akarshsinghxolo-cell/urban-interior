create or replace function public.uc_is_canonical_indian_mobile(value text)
returns boolean
language sql
immutable
parallel safe
as $$
  select value is null
    or btrim(value) = ''
    or value ~ '^[6-9][0-9]{9}$';
$$;

comment on function public.uc_is_canonical_indian_mobile(text)
is 'Urban Castle canonical Indian mobile check: optional or exactly 10 digits starting 6-9; stored without country/trunk prefix.';

alter table public.entity_customers
  drop constraint if exists entity_customers_indian_mobile_chk;
alter table public.entity_customers
  add constraint entity_customers_indian_mobile_chk
  check (
    public.uc_is_canonical_indian_mobile(data->>'phone')
    and public.uc_is_canonical_indian_mobile(data->>'whatsapp')
    and public.uc_is_canonical_indian_mobile(data->>'alternate_phone')
  ) not valid;
alter table public.entity_customers
  validate constraint entity_customers_indian_mobile_chk;

alter table public.entity_master_vendors
  drop constraint if exists entity_master_vendors_indian_mobile_chk;
alter table public.entity_master_vendors
  add constraint entity_master_vendors_indian_mobile_chk
  check (public.uc_is_canonical_indian_mobile(data->>'phone')) not valid;
alter table public.entity_master_vendors
  validate constraint entity_master_vendors_indian_mobile_chk;

alter table public.entity_master_contractors
  drop constraint if exists entity_master_contractors_indian_mobile_chk;
alter table public.entity_master_contractors
  add constraint entity_master_contractors_indian_mobile_chk
  check (
    public.uc_is_canonical_indian_mobile(data->>'phone')
    and public.uc_is_canonical_indian_mobile(data->>'alternate_phone')
  ) not valid;
alter table public.entity_master_contractors
  validate constraint entity_master_contractors_indian_mobile_chk;

alter table public.entity_master_staff
  drop constraint if exists entity_master_staff_indian_mobile_chk;
alter table public.entity_master_staff
  add constraint entity_master_staff_indian_mobile_chk
  check (
    public.uc_is_canonical_indian_mobile(data->>'phone')
    and public.uc_is_canonical_indian_mobile(data->>'emergency_contact')
  ) not valid;
alter table public.entity_master_staff
  validate constraint entity_master_staff_indian_mobile_chk;

alter table public."entity_master_sourcePartners"
  drop constraint if exists entity_master_source_partners_indian_mobile_chk;
alter table public."entity_master_sourcePartners"
  add constraint entity_master_source_partners_indian_mobile_chk
  check (public.uc_is_canonical_indian_mobile(data->>'phone')) not valid;
alter table public."entity_master_sourcePartners"
  validate constraint entity_master_source_partners_indian_mobile_chk;
