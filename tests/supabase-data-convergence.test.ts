import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260801143000_converge_workspace_persistence.sql";
const STAFF_MIRROR_MIGRATION = "supabase/migrations/20260801144500_sync_workspace_staff_mirrors.sql";

describe("Supabase persistence convergence", () => {
  test("removes obsolete workspace writers without removing active GenericRecord", async () => {
    const migration = await Bun.file(MIGRATION).text();
    const server = await Bun.file("src/lib/rdash/server/commit-rest.ts").text();
    const drive = await Bun.file("src/lib/rdash/server/drive-connections.ts").text();

    expect(migration).toContain("drop function if exists public.commit_operations");
    expect(migration).toContain("drop function if exists public.write_workspace_snapshot");
    expect(migration).toContain("drop function if exists public.uc_bump_workspace_revision");
    expect(migration).toContain('drop table if exists public."CollectionMeta"');
    expect(migration).not.toContain('drop table if exists public."GenericRecord"');

    expect(server).toContain('admin.rpc("commit_workspace_operations"');
    expect(server).not.toContain('admin.rpc("commit_operations"');
    expect(drive).toContain('.from("GenericRecord")');
  });

  test("binds every workspace collection to its canonical entity table", async () => {
    const migration = await Bun.file(MIGRATION).text();

    expect(migration).toContain("rename to commit_workspace_operations_internal");
    expect(migration).toContain("v_expected_table := 'entity_' || replace(v_collection, '.', '_')");
    expect(migration).toContain("v_table is distinct from v_expected_table");
    expect(migration).toContain("INVALID_COLLECTION_TABLE");
    expect(migration).toContain("perform set_config('uc.write_source', 'workspace-commit', true)");
    expect(migration).toContain("return public.commit_workspace_operations_internal(");
    expect(migration).toContain("revoke all on function public.commit_workspace_operations_internal");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  test("journals auth-driven master staff synchronization exactly once", async () => {
    const migration = await Bun.file(MIGRATION).text();
    const staffIdentity = await Bun.file(
      "supabase/migrations/20260724054622_staff_identity_atomic_sync.sql",
    ).text();

    expect(staffIdentity).toContain("for update;");
    expect(staffIdentity).toContain("'auth-system'");
    expect(staffIdentity).toContain("v_next_workspace_revision := v_workspace_revision + 1");

    expect(migration).toContain("create or replace function public.uc_journal_auth_staff_master_write()");
    expect(migration).toContain("current_setting('uc.write_source', true) = 'workspace-commit'");
    expect(migration).toContain("if new.updated_by is distinct from 'auth-system'");
    expect(migration).toContain("v_next_revision := v_current_revision + 1");
    expect(migration).toContain("'collection', 'master.staff'");
    expect(migration).toContain("'master.staff:' || new.id");
    expect(migration).toContain("create trigger entity_master_staff_auth_journal");
  });

  test("keeps workspace Staff and auth/profile mirrors on explicit ownership boundaries", async () => {
    const migration = await Bun.file(STAFF_MIRROR_MIGRATION).text();

    expect(migration).toContain("create or replace function public.uc_sanitize_workspace_staff_auth_fields()");
    expect(migration).toContain("- 'temporary_password'");
    expect(migration).toContain("- 'force_password_change'");
    expect(migration).toContain("create trigger entity_master_staff_workspace_auth_sanitize");
    expect(migration).toContain("create or replace function public.uc_sync_workspace_staff_mirrors()");
    expect(migration).toContain("current_setting('uc.write_source', true) is distinct from 'workspace-commit'");
    expect(migration).toContain("STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_EMAIL_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_ACCESS_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_ACCESS_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_ROLE_ASSIGNMENT_NOT_FOUND");
    expect(migration).toContain('insert into public."StaffProfile"');
    expect(migration).toContain("update public.uc_user_roles");
    expect(migration).toContain("where id = v_role_assignment_id");
    expect(migration).toContain("create trigger entity_master_staff_workspace_mirror");
    expect(migration).toContain("STAFF_AUTH_LINK_DELETE_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("create trigger entity_master_staff_workspace_delete_guard");
  });

  test("establishes a fresh journal baseline after historical gaps", async () => {
    const migration = await Bun.file(MIGRATION).text();
    const delta = await Bun.file("src/lib/rdash/server/workspace-changes.ts").text();

    expect(migration).toContain("from public.entity_workspace_revision r");
    expect(migration).toContain("on conflict (workspace_id, revision) do update");
    expect(migration).toContain("set is_baseline = true");

    expect(delta).toContain("afterRevision < baselineRevision");
    expect(delta).toContain('reason: "revision_too_old"');
  });

  test("keeps the current application on one workspace commit RPC", async () => {
    const workspace = await Bun.file("src/lib/rdash/server/workspace.ts").text();
    const commit = await Bun.file("src/lib/rdash/server/commit-rest.ts").text();

    expect(workspace).toContain("commitRestOperations");
    expect(commit).toContain('admin.rpc("commit_workspace_operations"');
    expect(commit).not.toContain("commit_operations(");
    expect(commit).not.toContain("write_workspace_snapshot");
  });
});
