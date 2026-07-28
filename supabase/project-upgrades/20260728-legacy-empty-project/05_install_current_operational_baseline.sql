-- Install the merged operational database baseline in release order. Sources
-- are pinned to the exact main commit and verified before execution.

do $loader$
declare
  item record;
  v_status integer;
  v_content text;
  v_sha text;
begin
  for item in
    select * from (values
      (1, '20260727_tracking_devices_and_integrity_templates.sql', 'acf21b2bcc032e9e229868f73601ab6e3b6ea16d0794f4da3c4ece3ba78997af'),
      (2, '20260727_seed_default_staff_role_permissions.sql', '71c539e6c9138b75b578907fa7810fa30b0f4d9c09357f44838437f51bd3eea5'),
      (3, '20260727_add_contractor_role_permissions.sql', 'b2bd5951722a110f783b992a3f779b2b0992ab543a2633a26a5240be67b2db1c'),
      (4, '20260728055820_workspace_revision_change_journal.sql', '7dc16f355301ffc81ac8a31f8e68bda19833d6756c25135e8545719a40d350af')
    ) as sources(sequence_no, file_name, expected_sha)
    order by sequence_no
  loop
    select r.status, r.content
      into v_status, v_content
    from extensions.http_get(
      'https://raw.githubusercontent.com/akarshsinghxolo-cell/urban-interior/23256061b21cec781aed6c8b73925e24c010e93e/supabase/migrations/' || item.file_name
    ) r;

    if v_status <> 200 then
      raise exception 'MIGRATION_DOWNLOAD_FAILED:%:%', item.file_name, v_status;
    end if;

    v_sha := encode(digest(v_content, 'sha256'), 'hex');
    if v_sha <> item.expected_sha then
      raise exception 'MIGRATION_CHECKSUM_MISMATCH:%:%', item.file_name, v_sha;
    end if;

    execute v_content;
  end loop;
end
$loader$;