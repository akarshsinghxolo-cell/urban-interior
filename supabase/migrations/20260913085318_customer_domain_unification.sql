-- Customer-domain cutover: remove transitional data shapes, enforce relational
-- integrity, and keep privileged workspace RPCs server-only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The canonical entity writer starts new row revisions at zero. Make schema
-- defaults agree with that implementation for every entity table still at 1.
do $$
declare r record;
begin
  for r in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name like 'entity\_%' escape '\'
      and column_name = 'revision'
      and column_default = '1'
  loop
    execute format('alter table public.%I alter column revision set default 0', r.table_name);
  end loop;
end $$;

-- Keep the phone normalizer deterministic and independent of caller search_path.
alter function public.uc_normalize_phone(text) set search_path = pg_catalog, public;

-- Remove retired customer-interest fields before enforcing the canonical shape.
update public.entity_customers
set data = data - 'interest_category_ids' - 'interest_work_subcategory_ids'
where data ? 'interest_category_ids' or data ? 'interest_work_subcategory_ids';

-- Existing real source-partner IDs are authoritative.
update public.entity_customers
set data = data || jsonb_strip_nulls(jsonb_build_object(
  'referrer_type', 'source_partner',
  'referrer_id', nullif(btrim(data->>'source_partner_id'), ''),
  'referrer_name', nullif(btrim(data->>'source_partner_name'), '')
))
where coalesce(btrim(data->>'referrer_type'), '') = ''
  and coalesce(btrim(data->>'source_partner_id'), '') <> '';

-- Resolve old name-only referrers once. A unique exact entity-name match becomes
-- typed; ambiguous/unmatched text becomes an explicit external referrer.
with legacy as (
  select id as customer_id, lower(btrim(data->>'source_partner_name')) as normalized_name,
         btrim(data->>'source_partner_name') as legacy_name
  from public.entity_customers
  where coalesce(btrim(data->>'referrer_type'), '') = ''
    and coalesce(btrim(data->>'source_partner_id'), '') = ''
    and coalesce(btrim(data->>'source_partner_name'), '') <> ''
), candidates as (
  select l.customer_id, 'customer'::text as referrer_type, c.id as referrer_id, c.data->>'name' as referrer_name
  from legacy l join public.entity_customers c
    on c.id <> l.customer_id and lower(btrim(c.data->>'name')) = l.normalized_name
  union all
  select l.customer_id, 'contractor', c.id, c.data->>'name'
  from legacy l join public."entity_master_contractors" c on lower(btrim(c.data->>'name')) = l.normalized_name
  union all
  select l.customer_id, 'vendor', v.id, v.data->>'name'
  from legacy l join public."entity_master_vendors" v on lower(btrim(v.data->>'name')) = l.normalized_name
  union all
  select l.customer_id, 'source_partner', s.id, s.data->>'name'
  from legacy l join public."entity_master_sourcePartners" s on lower(btrim(s.data->>'name')) = l.normalized_name
), resolved as (
  select l.customer_id, l.legacy_name,
         count(c.referrer_id) as match_count,
         min(c.referrer_type) filter (where c.referrer_id is not null) as referrer_type,
         min(c.referrer_id) filter (where c.referrer_id is not null) as referrer_id,
         min(c.referrer_name) filter (where c.referrer_id is not null) as referrer_name
  from legacy l left join candidates c on c.customer_id = l.customer_id
  group by l.customer_id, l.legacy_name
)
update public.entity_customers customer
set data = case
  when r.match_count = 1 then
    (customer.data - 'source_partner_id' - 'source_partner_name')
      || jsonb_build_object('referrer_type', r.referrer_type, 'referrer_id', r.referrer_id, 'referrer_name', r.referrer_name)
      || case when r.referrer_type = 'source_partner'
              then jsonb_build_object('source_partner_id', r.referrer_id, 'source_partner_name', r.referrer_name)
              else '{}'::jsonb end
  else
    (customer.data - 'source_partner_id' - 'source_partner_name')
      || jsonb_build_object('referrer_type', 'external', 'referrer_name', r.legacy_name)
end
from resolved r
where customer.id = r.customer_id;

-- Remove Site source-partner text that was merely inherited from a non-source
-- Customer referrer; genuine Site source-partner IDs are preserved.
update public.entity_sites site
set data = site.data - 'source_partner_id' - 'source_partner_name'
from public.entity_customers customer
where site.data->>'customer_id' = customer.id
  and coalesce(customer.data->>'referrer_type', '') <> 'source_partner'
  and coalesce(btrim(site.data->>'source_partner_id'), '') = ''
  and coalesce(btrim(site.data->>'source_partner_name'), '') <> ''
  and lower(btrim(site.data->>'source_partner_name')) = lower(btrim(customer.data->>'referrer_name'));

-- Future writes are canonicalized even if an old seed/import payload reaches the
-- database. Generic referrer fields are authoritative; source_partner_* remains
-- only a commission projection for actual Source Partners.
create or replace function private.uc_canonicalize_customer_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_id text;
  v_name text;
  v_exists boolean;
begin
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DATA';
  end if;

  new.data := new.data - 'interest_category_ids' - 'interest_work_subcategory_ids';
  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id), true);
  if coalesce(btrim(new.data->>'status'), '') = '' then
    new.data := jsonb_set(new.data, '{status}', '"active"'::jsonb, true);
  end if;

  v_type := nullif(btrim(new.data->>'referrer_type'), '');
  v_id := nullif(btrim(new.data->>'referrer_id'), '');
  v_name := nullif(btrim(new.data->>'referrer_name'), '');

  if v_type is null then
    if nullif(btrim(new.data->>'source_partner_id'), '') is not null then
      v_type := 'source_partner';
      v_id := nullif(btrim(new.data->>'source_partner_id'), '');
      v_name := coalesce(nullif(btrim(new.data->>'source_partner_name'), ''), v_name);
    elsif nullif(btrim(new.data->>'source_partner_name'), '') is not null then
      v_type := 'external';
      v_name := btrim(new.data->>'source_partner_name');
      v_id := null;
    end if;
  end if;

  if v_type is null then
    new.data := new.data - 'referrer_type' - 'referrer_id' - 'referrer_name' - 'source_partner_id' - 'source_partner_name';
    return new;
  end if;

  if v_type not in ('customer','contractor','vendor','source_partner','external') then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_TYPE';
  end if;
  if v_name is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_NAME';
  end if;

  if v_type = 'external' then
    if v_id is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_EXTERNAL_REFERRER_ID';
    end if;
    new.data := (new.data - 'source_partner_id' - 'source_partner_name' - 'referrer_id')
      || jsonb_build_object('referrer_type', v_type, 'referrer_name', v_name);
    return new;
  end if;

  if v_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_ID';
  end if;

  if v_type = 'customer' then
    select exists(select 1 from public.entity_customers x where x.workspace_id = new.workspace_id and x.id = v_id and x.id <> new.id) into v_exists;
  elsif v_type = 'contractor' then
    select exists(select 1 from public."entity_master_contractors" x where x.workspace_id = new.workspace_id and x.id = v_id) into v_exists;
  elsif v_type = 'vendor' then
    select exists(select 1 from public."entity_master_vendors" x where x.workspace_id = new.workspace_id and x.id = v_id) into v_exists;
  else
    select exists(select 1 from public."entity_master_sourcePartners" x where x.workspace_id = new.workspace_id and x.id = v_id) into v_exists;
  end if;
  if not v_exists then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER';
  end if;

  new.data := (new.data - 'source_partner_id' - 'source_partner_name')
    || jsonb_build_object('referrer_type', v_type, 'referrer_id', v_id, 'referrer_name', v_name);
  if v_type = 'source_partner' then
    new.data := new.data || jsonb_build_object('source_partner_id', v_id, 'source_partner_name', v_name);
  end if;
  return new;
end;
$$;

drop trigger if exists entity_customers_canonicalize on public.entity_customers;
create trigger entity_customers_canonicalize
before insert or update of data, workspace_id, id on public.entity_customers
for each row execute function private.uc_canonicalize_customer_row();

-- Canonical Customer shape. Phone is optional, but every supplied number must
-- normalize to an Indian mobile number; email is optional but structurally sane.
alter table public.entity_customers drop constraint if exists entity_customers_data_shape_chk;
alter table public.entity_customers add constraint entity_customers_data_shape_chk check (
  jsonb_typeof(data) = 'object'
  and data->>'id' = id
  and coalesce(btrim(data->>'name'), '') <> ''
  and data->>'status' in ('active','inactive','blocked')
  and (nullif(btrim(data->>'phone'), '') is null or public.uc_normalize_phone(data->>'phone') ~ '^[6-9][0-9]{9}$')
  and (nullif(btrim(data->>'whatsapp'), '') is null or public.uc_normalize_phone(data->>'whatsapp') ~ '^[6-9][0-9]{9}$')
  and (nullif(btrim(data->>'alternate_phone'), '') is null or public.uc_normalize_phone(data->>'alternate_phone') ~ '^[6-9][0-9]{9}$')
  and (nullif(btrim(data->>'email'), '') is null or position('@' in data->>'email') > 1)
  and not (data ? 'interest_category_ids')
  and not (data ? 'interest_work_subcategory_ids')
  and (
    nullif(btrim(data->>'referrer_type'), '') is null
    or (
      data->>'referrer_type' in ('customer','contractor','vendor','source_partner','external')
      and nullif(btrim(data->>'referrer_name'), '') is not null
      and (
        (data->>'referrer_type' = 'external' and nullif(btrim(data->>'referrer_id'), '') is null)
        or (data->>'referrer_type' <> 'external' and nullif(btrim(data->>'referrer_id'), '') is not null)
      )
      and (
        (data->>'referrer_type' = 'source_partner'
          and nullif(btrim(data->>'source_partner_id'), '') = nullif(btrim(data->>'referrer_id'), '')
          and nullif(btrim(data->>'source_partner_name'), '') = nullif(btrim(data->>'referrer_name'), ''))
        or (data->>'referrer_type' <> 'source_partner'
          and nullif(btrim(data->>'source_partner_id'), '') is null
          and nullif(btrim(data->>'source_partner_name'), '') is null)
      )
    )
  )
) not valid;
alter table public.entity_customers validate constraint entity_customers_data_shape_chk;

-- Work Required has one canonical two-shape taxonomy contract: either a
-- general scope (no category/subcategory/work type) or a fully scoped record.
alter table public."entity_workRequired" drop constraint if exists entity_workRequired_data_shape_chk;
alter table public."entity_workRequired" add constraint entity_workRequired_data_shape_chk check (
  jsonb_typeof(data) = 'object'
  and data->>'id' = id
  and coalesce(btrim(data->>'customer_id'), '') <> ''
  and coalesce(btrim(data->>'title'), '') <> ''
  and (data->'area_ids' is null or jsonb_typeof(data->'area_ids') = 'array')
  and (data->'work_subcategory_ids' is null or jsonb_typeof(data->'work_subcategory_ids') = 'array')
  and (data->'work_type_ids' is null or jsonb_typeof(data->'work_type_ids') = 'array')
  and (
    (nullif(btrim(data->>'work_category_id'), '') is null
      and jsonb_array_length(coalesce(data->'work_subcategory_ids', '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(data->'work_type_ids', '[]'::jsonb)) = 0)
    or
    (nullif(btrim(data->>'work_category_id'), '') is not null
      and jsonb_array_length(coalesce(data->'work_subcategory_ids', '[]'::jsonb)) > 0)
  )
) not valid;
alter table public."entity_workRequired" validate constraint entity_workRequired_data_shape_chk;

-- Transactional identity backstop across phone/WhatsApp/alternate phone/email.
create unique index if not exists entity_customers_workspace_id_uidx
  on public.entity_customers(workspace_id, id);

create table if not exists private.customer_contact_identities (
  workspace_id text not null,
  customer_id text not null,
  identity_kind text not null check (identity_kind in ('phone','email')),
  identity_value text not null,
  primary key (workspace_id, customer_id, identity_kind, identity_value),
  constraint customer_contact_identities_unique_identity unique (workspace_id, identity_kind, identity_value),
  constraint customer_contact_identities_customer_fkey foreign key (workspace_id, customer_id)
    references public.entity_customers(workspace_id, id) on delete cascade
);
revoke all on private.customer_contact_identities from public, anon, authenticated;

create or replace function private.uc_sync_customer_contact_identities()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'UPDATE' then
    delete from private.customer_contact_identities
    where workspace_id = old.workspace_id and customer_id = old.id;
  end if;

  begin
    insert into private.customer_contact_identities(workspace_id, customer_id, identity_kind, identity_value)
    select distinct new.workspace_id, new.id, x.identity_kind, x.identity_value
    from (
      values
        ('phone'::text, public.uc_normalize_phone(new.data->>'phone')),
        ('phone'::text, public.uc_normalize_phone(new.data->>'whatsapp')),
        ('phone'::text, public.uc_normalize_phone(new.data->>'alternate_phone')),
        ('email'::text, nullif(lower(btrim(new.data->>'email')), ''))
    ) as x(identity_kind, identity_value)
    where x.identity_value is not null;
  exception when unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_IDENTITY_DUPLICATE';
  end;
  return new;
end;
$$;

drop trigger if exists entity_customers_sync_identities on public.entity_customers;
create trigger entity_customers_sync_identities
after insert or update of data, workspace_id, id on public.entity_customers
for each row execute function private.uc_sync_customer_contact_identities();

truncate table private.customer_contact_identities;
insert into private.customer_contact_identities(workspace_id, customer_id, identity_kind, identity_value)
select distinct c.workspace_id, c.id, x.identity_kind, x.identity_value
from public.entity_customers c
cross join lateral (
  values
    ('phone'::text, public.uc_normalize_phone(c.data->>'phone')),
    ('phone'::text, public.uc_normalize_phone(c.data->>'whatsapp')),
    ('phone'::text, public.uc_normalize_phone(c.data->>'alternate_phone')),
    ('email'::text, nullif(lower(btrim(c.data->>'email')), ''))
) as x(identity_kind, identity_value)
where x.identity_value is not null;

-- Generated FK/index backstops for direct Customer references.
do $$
declare
  r record;
  v_constraint text;
  v_index text;
begin
  for r in select * from (values
    ('entity_sites'), ('entity_workRequired'), ('entity_quotations'), ('entity_acceptedScopes'),
    ('entity_workOrders'), ('entity_visits'), ('entity_tasks'), ('entity_followups'),
    ('entity_actions'), ('entity_risks'), ('entity_blocked'), ('entity_payments'),
    ('entity_invoices'), ('entity_customerReceipts'), ('entity_contractorBills'),
    ('entity_commissions'), ('entity_variationRequests'), ('entity_commSends'),
    ('entity_entityReferenceAssignments')
  ) as t(table_name)
  loop
    execute format('alter table public.%I add column if not exists customer_id_gen text generated always as (nullif(data->>''customer_id'', '''')) stored', r.table_name);
    v_index := r.table_name || '_customer_id_idx';
    execute format('create index if not exists %I on public.%I(workspace_id, customer_id_gen)', v_index, r.table_name);
    v_constraint := r.table_name || '_customer_id_fkey';
    execute format('alter table public.%I drop constraint if exists %I', r.table_name, v_constraint);
    execute format('alter table public.%I add constraint %I foreign key (customer_id_gen) references public.entity_customers(id) not valid', r.table_name, v_constraint);
    execute format('alter table public.%I validate constraint %I', r.table_name, v_constraint);
  end loop;
end $$;

-- Site graph backstops and indexes for entity-scoped reads.
do $$
declare
  r record;
  v_constraint text;
  v_index text;
begin
  for r in select * from (values
    ('entity_areas'), ('entity_workRequired'), ('entity_quotations'), ('entity_acceptedScopes'),
    ('entity_workOrders'), ('entity_visits'), ('entity_tasks'), ('entity_followups'),
    ('entity_actions'), ('entity_risks'), ('entity_blocked'), ('entity_payments'),
    ('entity_invoices'), ('entity_customerReceipts'), ('entity_contractorBills'),
    ('entity_commissions'), ('entity_variationRequests'), ('entity_commSends'),
    ('entity_entityReferenceAssignments')
  ) as t(table_name)
  loop
    execute format('alter table public.%I add column if not exists site_id_gen text generated always as (nullif(data->>''site_id'', '''')) stored', r.table_name);
    v_index := r.table_name || '_site_id_idx';
    execute format('create index if not exists %I on public.%I(workspace_id, site_id_gen)', v_index, r.table_name);
    v_constraint := r.table_name || '_site_id_fkey';
    execute format('alter table public.%I drop constraint if exists %I', r.table_name, v_constraint);
    execute format('alter table public.%I add constraint %I foreign key (site_id_gen) references public.entity_sites(id) not valid', r.table_name, v_constraint);
    execute format('alter table public.%I validate constraint %I', r.table_name, v_constraint);
  end loop;
end $$;

-- Internal public-schema RPCs are server implementation details. Every current
-- caller uses the service-role admin client; remove browser/anonymous execute.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name, p.proname, p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %I.%I(%s) from public, anon, authenticated',
      r.schema_name, r.proname, pg_get_function_identity_arguments(r.oid));
    execute format('grant execute on function %I.%I(%s) to service_role',
      r.schema_name, r.proname, pg_get_function_identity_arguments(r.oid));
  end loop;
end $$;

revoke execute on function public.commit_workspace_operations_internal(text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_workspace_operations_internal(text, integer, jsonb, jsonb) to service_role;
revoke execute on function public.uc_normalize_phone(text) from public, anon, authenticated;
grant execute on function public.uc_normalize_phone(text) to service_role;

alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;

notify pgrst, 'reload schema';