-- Install the merged upload/outbox schema in its original order. Each source
-- file is pinned to the exact main commit and verified by SHA-256 before it is
-- executed. Historical production-data repair migrations are intentionally not
-- included because this clean project contains no Drive or Site data.

do $loader$
declare
  item record;
  v_status integer;
  v_content text;
  v_sha text;
begin
  for item in
    select * from (values
      (1, '20260725-upload-infrastructure.sql', '6c8062ad916b5b5245aa62efe2cf4f297a2608a36b4f4fed240a3167a9ff8b7f'),
      (2, '20260725-upload-phase2-resumable.sql', 'ce2b3439424db3a83c8990bed76ee56391bd2712fa8f3c0fcf6aa70a27461541'),
      (3, '20260725-upload-phase3-workspace-outbox.sql', 'c5662b3176fc139b4fbdf874e765cbbcc97d2bc70d38f61f62207fc827167dbe'),
      (4, '20260725-upload-phase123-audit-hardening.sql', '462d54569117d12d4965b45fc6c6c00c7799d7edec53dbcc512b76f9adc1bc1b'),
      (5, '20260725060141_phase5_upload_schema_compatibility.sql', '0c6288e8770453b0afd00506b0bc06132f6d4963e27158e714db4753759d466f'),
      (6, '20260725060347_phase5_upload_index_cleanup.sql', '726b1ff62e64bbbf9068c0929fe43c1f9d441cf8f374a9f29bec5e148aed34de'),
      (7, '20260725072400_phase5_clear_terminal_upload_sessions.sql', '198a61ea25169d07be291cf146b07944e02e77678156b4b92049ff32335b8bc9'),
      (8, '20260725094500_bind_drive_sessions_to_browser_origin.sql', '1449e6913d7e5d372b0e5dfcd6bcf25c4258e139f2e3b7617c864324b501787d')
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
