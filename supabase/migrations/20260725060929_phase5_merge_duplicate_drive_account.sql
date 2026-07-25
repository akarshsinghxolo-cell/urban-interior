-- Consolidate the historical duplicate records that represented one OAuth Drive connection.
do $$
declare
  canonical_id constant text := 'storage-drive-connection-tctWdmt-zGBnRfJl';
  duplicate_id constant text := 'storage-271dc97d7e25b7ca9f400a6b';
  canonical_data jsonb;
  duplicate_data jsonb;
  canonical_created jsonb;
begin
  select data,data->'created_at' into canonical_data,canonical_created
  from public."entity_master_storageAccounts" where id=canonical_id for update;
  select data into duplicate_data
  from public."entity_master_storageAccounts" where id=duplicate_id for update;

  -- Already reconciled, or this installation never contained the project-specific duplicate.
  if duplicate_data is null then return; end if;

  -- If only the duplicate exists, retain it rather than guessing a replacement identity.
  if canonical_data is null then return; end if;

  update public."entity_master_storageAccounts"
  set data=duplicate_data || jsonb_build_object(
        'id',canonical_id,
        'created_at',canonical_created,
        'updated_at',to_jsonb(now()::text)
      ),
      revision=greatest(revision,13)+1,
      updated_at=now(),
      updated_by='Phase 5 Drive account reconciliation'
  where id=canonical_id;

  update public."entity_master_storageFolderInstances"
  set data=jsonb_set(data,'{storage_account_id}',to_jsonb(canonical_id),true),
      revision=revision+1,
      updated_at=now(),
      updated_by='Phase 5 Drive account reconciliation'
  where data->>'storage_account_id'=duplicate_id;

  update public.uc_upload_batches set storage_account_id=canonical_id where storage_account_id=duplicate_id;
  update public.uc_upload_items set storage_account_id=canonical_id where storage_account_id=duplicate_id;
  update public.uc_drive_folders set storage_account_id=canonical_id where storage_account_id=duplicate_id;

  delete from public."entity_master_storageAccounts" where id=duplicate_id;
  perform public.uc_bump_workspace_revision('default');
end $$;
