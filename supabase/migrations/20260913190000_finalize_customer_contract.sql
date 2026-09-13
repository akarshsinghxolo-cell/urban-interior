-- Finalize the Customer cutover.
-- Customer stores only canonical referrer_type/referrer_id/referrer_name fields.
-- source_partner_* remains a projection on Site/commission records, never Customer.

update public.entity_customers
set data = data - 'source_partner_id' - 'source_partner_name'
where data ? 'source_partner_id' or data ? 'source_partner_name';

create or replace function private.uc_canonicalize_customer_row()
returns trigger
language plpgsql
security definer
set search_path = ''
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

  if new.data ? 'source_partner_id' or new.data ? 'source_partner_name' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_LEGACY_REFERRER_FIELDS';
  end if;
  if new.data ? 'interest_category_ids' or new.data ? 'interest_work_subcategory_ids' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_RETIRED_FIELDS';
  end if;

  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id), true);
  if coalesce(btrim(new.data->>'status'), '') = '' then
    new.data := jsonb_set(new.data, '{status}', '"active"'::jsonb, true);
  end if;

  v_type := nullif(btrim(new.data->>'referrer_type'), '');
  v_id := nullif(btrim(new.data->>'referrer_id'), '');
  v_name := nullif(btrim(new.data->>'referrer_name'), '');

  if v_type is null then
    if v_id is not null or v_name is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_PARTIAL';
    end if;
    new.data := new.data - 'referrer_type' - 'referrer_id' - 'referrer_name';
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
    new.data := (new.data - 'referrer_id')
      || jsonb_build_object('referrer_type', v_type, 'referrer_name', v_name);
    return new;
  end if;

  if v_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_ID';
  end if;

  if v_type = 'customer' then
    select exists(
      select 1
      from public.entity_customers x
      where x.workspace_id = new.workspace_id
        and x.id = v_id
        and x.id <> new.id
    ) into v_exists;
  elsif v_type = 'contractor' then
    select exists(
      select 1 from public."entity_master_contractors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  elsif v_type = 'vendor' then
    select exists(
      select 1 from public."entity_master_vendors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  else
    select exists(
      select 1 from public."entity_master_sourcePartners" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER';
  end if;

  new.data := new.data
    || jsonb_build_object(
      'referrer_type', v_type,
      'referrer_id', v_id,
      'referrer_name', v_name
    );
  return new;
end;
$$;

alter function private.uc_sync_customer_contact_identities() set search_path = '';

revoke execute on function private.uc_canonicalize_customer_row() from public, anon, authenticated;
revoke execute on function private.uc_sync_customer_contact_identities() from public, anon, authenticated;

alter table public.entity_customers
  drop constraint if exists entity_customers_data_shape_chk;

alter table public.entity_customers
  add constraint entity_customers_data_shape_chk check (
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
    and not (data ? 'source_partner_id')
    and not (data ? 'source_partner_name')
    and (
      (
        nullif(btrim(data->>'referrer_type'), '') is null
        and nullif(btrim(data->>'referrer_id'), '') is null
        and nullif(btrim(data->>'referrer_name'), '') is null
      )
      or (
        data->>'referrer_type' in ('customer','contractor','vendor','source_partner','external')
        and nullif(btrim(data->>'referrer_name'), '') is not null
        and (
          (data->>'referrer_type' = 'external' and nullif(btrim(data->>'referrer_id'), '') is null)
          or
          (data->>'referrer_type' <> 'external' and nullif(btrim(data->>'referrer_id'), '') is not null)
        )
      )
    )
  ) not valid;

alter table public.entity_customers
  validate constraint entity_customers_data_shape_chk;
