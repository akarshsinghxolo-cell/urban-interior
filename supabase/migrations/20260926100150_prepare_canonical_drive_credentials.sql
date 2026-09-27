begin;

-- Stage the canonical Google Drive credential store before the application
-- switches away from GenericRecord. This migration copies encrypted secrets
-- only; it does not create a runtime fallback.
create table if not exists public.uc_google_drive_credentials (
  storage_account_id text primary key,
  google_account_id text,
  refresh_token_encrypted jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uc_google_drive_credentials_storage_account_fkey
    foreign key (storage_account_id)
    references public."entity_master_storageAccounts"(id)
    on delete cascade
);

alter table public.uc_google_drive_credentials enable row level security;

revoke all on table public.uc_google_drive_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.uc_google_drive_credentials to service_role;

create unique index if not exists uc_google_drive_credentials_google_account_uidx
  on public.uc_google_drive_credentials(google_account_id)
  where google_account_id is not null;

do $guard$
declare
  v_payload jsonb;
begin
  select "dataJson"::jsonb
    into v_payload
    from public."GenericRecord"
   where collection = 'system.googleDriveVault'
     and id = 'default';

  if v_payload is null then
    raise exception using
      errcode = 'P0001',
      message = 'CANONICAL_DRIVE_CUTOVER_ABORTED: Google Drive vault is missing';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'connections', '[]'::jsonb)) c
    where c ? 'refreshToken'
  ) then
    raise exception using
      errcode = '23514',
      message = 'CANONICAL_DRIVE_CUTOVER_ABORTED: plaintext Drive refresh token exists';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'connections', '[]'::jsonb)) c
    where not (c ? 'refreshTokenEncrypted')
       or jsonb_typeof(c -> 'refreshTokenEncrypted') <> 'object'
  ) then
    raise exception using
      errcode = '23514',
      message = 'CANONICAL_DRIVE_CUTOVER_ABORTED: Drive connection lacks encrypted credential';
  end if;

  if jsonb_array_length(coalesce(v_payload -> 'pending', '[]'::jsonb)) <> 0 then
    raise exception using
      errcode = '55000',
      message = 'CANONICAL_DRIVE_CUTOVER_ABORTED: OAuth connection request is pending';
  end if;
end;
$guard$;

with vault as (
  select "dataJson"::jsonb as data
  from public."GenericRecord"
  where collection = 'system.googleDriveVault'
    and id = 'default'
),
connections as (
  select c
  from vault,
       lateral jsonb_array_elements(coalesce(data -> 'connections', '[]'::jsonb)) c
),
mapped as (
  select
    account.id as storage_account_id,
    nullif(connection.c ->> 'googleAccountId', '') as google_account_id,
    connection.c -> 'refreshTokenEncrypted' as refresh_token_encrypted,
    coalesce(nullif(connection.c ->> 'createdAt', '')::timestamptz, now()) as created_at,
    coalesce(nullif(connection.c ->> 'updatedAt', '')::timestamptz, now()) as updated_at
  from connections connection
  join public."entity_master_storageAccounts" account
    on account.data ->> 'oauth_connection_id' = connection.c ->> 'id'
)
insert into public.uc_google_drive_credentials (
  storage_account_id,
  google_account_id,
  refresh_token_encrypted,
  created_at,
  updated_at
)
select
  storage_account_id,
  google_account_id,
  refresh_token_encrypted,
  created_at,
  updated_at
from mapped
on conflict (storage_account_id) do update
set google_account_id = excluded.google_account_id,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    updated_at = excluded.updated_at;

do $verify$
declare
  v_connection_count integer;
  v_credential_count integer;
  v_mapped_count integer;
begin
  select jsonb_array_length(coalesce("dataJson"::jsonb -> 'connections', '[]'::jsonb))
    into v_connection_count
    from public."GenericRecord"
   where collection = 'system.googleDriveVault'
     and id = 'default';

  select count(*)
    into v_credential_count
    from public.uc_google_drive_credentials;

  select count(*)
    into v_mapped_count
    from public."entity_master_storageAccounts" account
    join public.uc_google_drive_credentials credential
      on credential.storage_account_id = account.id
   where nullif(account.data ->> 'oauth_connection_id', '') is not null;

  if v_connection_count is distinct from v_credential_count
     or v_connection_count is distinct from v_mapped_count then
    raise exception using
      errcode = '23514',
      message = format(
        'CANONICAL_DRIVE_CUTOVER_ABORTED: expected %s migrated credentials, found %s credentials and %s mappings',
        v_connection_count,
        v_credential_count,
        v_mapped_count
      );
  end if;
end;
$verify$;

comment on table public.uc_google_drive_credentials is
  'Server-only encrypted Google Drive refresh credentials keyed directly by canonical storage account ID.';

commit;
