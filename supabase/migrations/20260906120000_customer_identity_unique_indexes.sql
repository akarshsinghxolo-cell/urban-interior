-- Customer identity uniqueness at the database level.
--
-- The UI already rejects duplicate contact identities client-side
-- (customer-identity.ts: normalizePhone/normalizeEmail + conflict error), but
-- bulk/API writes, older clients, and concurrent creates bypass it. These
-- indexes are the backstop: the same normalized phone or email cannot exist
-- twice within one workspace.
--
-- uc_normalize_phone mirrors normalizePhone in customer-identity.ts exactly:
-- strip non-digits, drop a leading 00, then a 91 prefix on 12 digits, then a
-- 0 prefix on 11 digits. Keep the two in sync; changing the function requires
-- rebuilding both phone indexes.
--
-- Applied after verifying production has zero duplicate rows under this
-- normalization (checked 2026-09-06: 28 customers, 0 phone/email dupes).

create or replace function public.uc_normalize_phone(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(d3, '') from (
    select case
      when char_length(d2) = 11 and left(d2, 1) = '0' then substr(d2, 2)
      else d2
    end as d3
    from (
      select case
        when char_length(d1) = 12 and left(d1, 2) = '91' then substr(d1, 3)
        else d1
      end as d2
      from (
        select case when d0 like '00%' then substr(d0, 3) else d0 end as d1
        from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d0) s
      ) t1
    ) t2
  ) t3;
$$;

create unique index if not exists entity_customers_phone_uidx
  on public.entity_customers (workspace_id, public.uc_normalize_phone(data->>'phone'))
  where public.uc_normalize_phone(data->>'phone') is not null;

create unique index if not exists entity_customers_email_uidx
  on public.entity_customers (workspace_id, nullif(lower(btrim(data->>'email')), ''))
  where coalesce(data->>'email', '') <> '';
