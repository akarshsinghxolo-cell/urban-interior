begin;

-- Final hard cutover: the new architecture owns Drive credentials and storage
-- account identity. Reconcile any token rotation that happened during the
-- release window, then remove legacy persistence and compatibility fields.

do $guard$
begin
  if to_regclass('public.uc_google_drive_credentials') is null then
    raise exception using
      errcode = '42P01',
      message = 'CANONICAL_CUTOVER_ABORTED: uc_google_drive_credentials is missing';
  end if;

  if to_regclass('public."GenericRecord"') is null then
    raise exception using
      errcode = '42P01',
      message = 'CANONICAL_CUTOVER_ABORTED: GenericRecord is missing before reconciliation';
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
    coalesce(nullif(connection.c ->> 'updatedAt', '')::timestamptz, now()) as updated_at
  from connections connection
  join public."entity_master_storageAccounts" account
    on account.data ->> 'oauth_connection_id' = connection.c ->> 'id'
  where connection.c ? 'refreshTokenEncrypted'
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
  now(),
  updated_at
from mapped
on conflict (storage_account_id) do update
set google_account_id = excluded.google_account_id,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    updated_at = greatest(public.uc_google_drive_credentials.updated_at, excluded.updated_at);

do $verify$
declare
  v_accounts integer;
  v_credentials integer;
  v_missing integer;
begin
  select count(*)
    into v_accounts
    from public."entity_master_storageAccounts";

  select count(*)
    into v_credentials
    from public.uc_google_drive_credentials;

  select count(*)
    into v_missing
    from public."entity_master_storageAccounts" account
    left join public.uc_google_drive_credentials credential
      on credential.storage_account_id = account.id
   where credential.storage_account_id is null;

  if v_accounts <> v_credentials or v_missing <> 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'CANONICAL_CUTOVER_ABORTED: %s storage accounts, %s credentials, %s missing',
        v_accounts,
        v_credentials,
        v_missing
      );
  end if;
end;
$verify$;

update public."entity_master_storageAccounts"
set data = data - 'oauth_connection_id'
where data ? 'oauth_connection_id';

drop table public."GenericRecord";

comment on table public.uc_google_drive_credentials is
  'Canonical server-only encrypted Google Drive credential store keyed by entity_master_storageAccounts.id. No GenericRecord or OAuth alias compatibility remains.';

commit;
