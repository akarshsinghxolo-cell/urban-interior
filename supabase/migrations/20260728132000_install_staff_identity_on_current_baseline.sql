-- Install the exact merged Staff identity migration on a clean baseline where
-- deprecated WorkspaceMeta/staff-auth mirror objects have already been removed.
-- The source is pinned by commit and SHA-256; only its trailing COMMENT ON
-- statements for those removed objects are omitted.

do $loader$
declare
  v_status integer;
  v_content text;
  v_sha text;
  v_marker text := E'\ncomment on table public."WorkspaceMeta"';
begin
  select r.status, r.content
    into v_status, v_content
  from extensions.http_get(
    'https://raw.githubusercontent.com/akarshsinghxolo-cell/urban-interior/23256061b21cec781aed6c8b73925e24c010e93e/supabase/migrations/20260724054622_staff_identity_atomic_sync.sql'
  ) r;

  if v_status <> 200 then
    raise exception 'MIGRATION_DOWNLOAD_FAILED:%', v_status;
  end if;

  v_sha := encode(digest(v_content, 'sha256'), 'hex');
  if v_sha <> 'c29f86b472fa4101af9155d81fb108fdd75bb4663c93d0a52d7f1a2a4f93ede3' then
    raise exception 'MIGRATION_CHECKSUM_MISMATCH:%', v_sha;
  end if;

  if position(v_marker in v_content) = 0 then
    raise exception 'DEPRECATED_COMMENT_MARKER_MISSING';
  end if;

  execute split_part(v_content, v_marker, 1);
end
$loader$;
