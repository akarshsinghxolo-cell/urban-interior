begin;

-- Final canonical-runtime cutover.
-- The canonical application is already deployed and reads Google Drive
-- credentials only from uc_google_drive_credentials keyed by Storage Account ID.
-- This migration reconciles any last token rotation from the retired runtime,
-- removes the obsolete OAuth alias from workspace account JSON, and drops the
-- generic legacy store. No CASCADE is used.

do $guard$
declare
  v_payload jsonb;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if to_regclass('public."GenericRecord"') is null then
    raise exception using
      errcode = '42P01',
      message = 'CANONICAL_CUTOVER_ABORTED: GenericRecord is already missing';
  end if;

  if exists (
    select 1
    from public."GenericRecord"
    where not (collection = 'system.googleDriveVault' and id = 'default')
  ) then
    raise exception using
      errcode = '23514',
      message = 'CANONICAL_CUTOVER_ABORTED: GenericRecord contains non-Drive runtime data';
  end if;

  select "dataJson"::jsonb
    into v_payload
    from public."GenericRecord"
   where collection = 'system.googleDriveVault'
     and id = 'default';

  if v_payload is null then
    raise exception using
      errcode = 'P0001',
      message = 'CANONICAL_CUTOVER_ABORTED: Drive vault is missing';
  end if;

  -- Expired OAuth state may remain serialized in the retired vault. Only a
  -- genuinely active authorization should block destructive cleanup.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'pending', '[]'::jsonb)) p
    where nullif(p ->> 'expiresAt', '')::bigint > v_now_ms
  ) then
    raise exception using
      errcode = '55000',
      message = 'CANONICAL_CUTOVER_ABORTED: OAuth authorization is in progress';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'connections', '[]'::jsonb)) c
    where c ? 'refreshToken'
       or not (c ? 'refreshTokenEncrypted')
       or jsonb_typeof(c -> 'refreshTokenEncrypted') <> 'object'
  ) then
    raise exception using
      errcode = '23514',
      message = 'CANONICAL_CUTOVER_ABORTED: Drive credentials are not encrypted-only';
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
  v_connections integer;
  v_credentials integer;
  v_accounts_with_alias integer;
begin
  select jsonb_array_length(coalesce("dataJson"::jsonb -> 'connections', '[]'::jsonb))
    into v_connections
    from public."GenericRecord"
   where collection = 'system.googleDriveVault'
     and id = 'default';

  select count(*)
    into v_credentials
    from public.uc_google_drive_credentials;

  select count(*)
    into v_accounts_with_alias
    from public."entity_master_storageAccounts"
   where nullif(data ->> 'oauth_connection_id', '') is not null;

  if v_connections is distinct from v_credentials
     or v_connections is distinct from v_accounts_with_alias then
    raise exception using
      errcode = '23514',
      message = format(
        'CANONICAL_CUTOVER_ABORTED: Drive counts disagree (vault=%s credentials=%s mapped_accounts=%s)',
        v_connections,
        v_credentials,
        v_accounts_with_alias
      );
  end if;

  if exists (
    select 1
    from public."entity_master_storageAccounts" account
    left join public.uc_google_drive_credentials credential
      on credential.storage_account_id = account.id
    where credential.storage_account_id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'CANONICAL_CUTOVER_ABORTED: Storage Account lacks canonical credential';
  end if;
end;
$verify$;

with changed as (
  update public."entity_master_storageAccounts"
     set data = data - 'oauth_connection_id',
         revision = revision + 1,
         updated_at = now(),
         updated_by = 'canonical-architecture-cutover'
   where data ? 'oauth_connection_id'
  returning workspace_id
)
update public.entity_workspace_revision revision
   set revision = revision.revision + 1,
       updated_at = now()
 where revision.id in (select distinct workspace_id from changed);

-- No CASCADE: any unexpected dependency must abort rather than silently remove
-- something the canonical architecture still needs.
drop table public."GenericRecord";

comment on table public."entity_master_storageAccounts" is
  'Canonical Google Drive account/business metadata. Server credentials are keyed by the same ID in uc_google_drive_credentials.';

commit;
