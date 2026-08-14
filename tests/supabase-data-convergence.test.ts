import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const MIGRATION = "supabase/migrations/20260801143000_converge_workspace_persistence.sql";
const STAFF_MIRROR_MIGRATION = "supabase/migrations/20260801144500_sync_workspace_staff_mirrors.sql";
const CONTRACTOR_RATE_MIGRATION = "supabase/migrations/20260801150000_canonical_contractor_rate_projection.sql";
const CONTRACTOR_RATE_REVISION_MIGRATION = "supabase/migrations/20260801151000_preserve_contractor_rate_row_versions.sql";
const OPERATION_SANITIZE_MIGRATION = "supabase/migrations/20260801152000_sanitize_workspace_operation_payloads.sql";
const WORK_CATALOG_MIGRATION = "supabase/migrations/20260801153000_persist_work_catalog_master.sql";

describe("Supabase persistence convergence", () => {
  test("removes obsolete workspace writers without removing active GenericRecord", async () => {
    const migration = await testFile(MIGRATION).text();
    const server = await testFile("src/lib/rdash/server/commit-rest.ts").text();
    const drive = await testFile("src/lib/rdash/server/drive-connections.ts").text();

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
    const migration = await testFile(MIGRATION).text();

    expect(migration).toContain("rename to commit_workspace_operations_internal");
    expect(migration).toContain("v_expected_table := 'entity_' || replace(v_collection, '.', '_')");
    expect(migration).toContain("v_table is distinct from v_expected_table");
    expect(migration).toContain("INVALID_COLLECTION_TABLE");
    expect(migration).toContain("perform set_config('uc.write_source', 'workspace-commit', true)");
    expect(migration).toContain("return public.commit_workspace_operations_internal(");
    expect(migration).toContain("revoke all on function public.commit_workspace_operations_internal");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  test("sanitizes Staff credentials before response, persistence and journaling", async () => {
    const tableGuard = await testFile(STAFF_MIRROR_MIGRATION).text();
    const operationGuard = await testFile(OPERATION_SANITIZE_MIGRATION).text();
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();

    expect(tableGuard).toContain("new.data := coalesce(new.data, '{}'::jsonb)");
    expect(tableGuard).toContain("- 'temporary_password'");
    expect(tableGuard).toContain("- 'force_password_change'");
    expect(operationGuard).toContain("create or replace function public.uc_sanitize_workspace_operations");
    expect(operationGuard).toContain("v_row - 'temporary_password' - 'force_password_change'");
    expect(operationGuard).toContain("v_operations := public.uc_sanitize_workspace_operations(p_operations)");
    expect(operationGuard).toContain("v_operations := public.uc_expand_contractor_rate_operations");
    expect(operationGuard).toContain("return public.commit_workspace_operations_internal(");

    expect(authorized).toContain("function sanitizeWorkspaceOperations(");
    expect(authorized).toContain("delete safe.temporary_password;");
    expect(authorized).toContain("delete safe.force_password_change;");
    expect(authorized).toContain("let commitOperations = sanitizeWorkspaceOperations(operations);");
  });

  test("journals auth-driven master staff synchronization exactly once", async () => {
    const migration = await testFile(MIGRATION).text();
    const staffIdentity = await testFile(
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
    const migration = await testFile(STAFF_MIRROR_MIGRATION).text();

    expect(migration).toContain("create or replace function public.uc_sanitize_workspace_staff_auth_fields()");
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

  test("routes Staff login changes to User Approvals and declares the persisted auth link", async () => {
    const dialog = await testFile("src/components/rdash/StaffEditDialog.tsx").text();
    const types = await testFile("src/lib/rdash/types.ts").text();

    expect(dialog).toContain("Login access is managed in User Approvals");
    expect(dialog).toContain("Passwords are never stored in Staff workspace data");
    expect(dialog).toContain("temporary_password: undefined");
    expect(dialog).toContain("force_password_change: undefined");
    expect(dialog).not.toContain("Temporary password");
    expect(dialog).not.toContain("ChangeMe_UrbanCastle_2026!");
    expect(types).toContain("auth_user_id?: string;");
  });

  test("makes Contractor Rates an atomic projection visible to server and database", async () => {
    const migration = await testFile(CONTRACTOR_RATE_MIGRATION).text();
    const revisionFix = await testFile(CONTRACTOR_RATE_REVISION_MIGRATION).text();
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();
    const profile = await testFile("src/lib/rdash/contractor-profile.ts").text();

    expect(migration).toContain("create or replace function public.uc_contractor_rate_projection_rows");
    expect(migration).toContain("p_contractor -> 'work_capabilities'");
    expect(migration).toContain("p_contractor -> 'capabilities_v2'");
    expect(migration).toContain("'crate-' || v_contractor_id || '-' || v_subcategory_id");
    expect(migration).toContain("create or replace function public.uc_expand_contractor_rate_operations");
    expect(migration).toContain("v_op ->> 'collection' <> 'master.contractors'");
    expect(migration).toContain("'collection', 'master.contractorRates'");
    expect(migration).toContain("'table', 'entity_master_contractorRates'");
    expect(migration).toContain("v_operations := public.uc_expand_contractor_rate_operations");
    expect(migration).toContain("return public.commit_workspace_operations_internal(");
    expect(migration).toContain("One-time live-data convergence");
    expect(migration).toContain("'contractor-rate-projection'");
    expect(migration).toContain("v_next_revision := v_current_revision + 1");
    expect(migration).toContain("is_baseline");

    expect(revisionFix).toContain("v_projection_ids text[]");
    expect(revisionFix).toContain("v_contractor_projection := public.uc_contractor_rate_projection_rows");
    expect(revisionFix).toContain("not (v_existing_id = any(v_projection_ids))");
    expect(revisionFix).toContain("preserving stable row revisions");

    expect(authorized).toContain('import { contractorRateProjection } from "../contractor-profile";');
    expect(authorized).toContain("function canonicalizeContractorRateOperations(");
    expect(authorized).toContain("contractorRates = contractorRateProjection(");
    expect(authorized).toContain("canonicalizeContractorRateOperations(current.data, commitOperations)");
    expect(profile).toContain("db.master.workSubcategories.find((row) => row.id === capability.subcategory_id)?.unit_id");
  });

  test("persists the work catalog in Supabase and stops runtime JSON replacement", async () => {
    const migration = await testFile(WORK_CATALOG_MIGRATION).text();
    const commitRest = await testFile("src/lib/rdash/server/commit-rest.ts").text();

    expect(migration).toContain('insert into public."entity_master_units"');
    expect(migration).toContain('insert into public."entity_master_workCategories"');
    expect(migration).toContain('insert into public."entity_master_workSubcategories"');
    expect(migration).toContain('insert into public."entity_master_articles"');
    expect(migration).toContain('insert into public."entity_master_subcategoryArticleMap"');
    expect(migration).toContain("data = excluded.data ||");
    expect(migration).toContain("'work-catalog-seed'");
    expect(migration).toContain("is_baseline = true");

    expect(commitRest).toContain('import { WORK_CATALOG_VERSION } from "../work-category-master";');
    expect(commitRest).toContain("master.catalog_version = WORK_CATALOG_VERSION;");
  });

  test("establishes a fresh journal baseline after historical gaps", async () => {
    const migration = await testFile(MIGRATION).text();
    const delta = await testFile("src/lib/rdash/server/workspace-changes.ts").text();

    expect(migration).toContain("from public.entity_workspace_revision r");
    expect(migration).toContain("on conflict (workspace_id, revision) do update");
    expect(migration).toContain("set is_baseline = true");

    expect(delta).toContain("afterRevision < baselineRevision");
    expect(delta).toContain('reason: "revision_too_old"');
  });

  test("keeps the current application on one workspace commit RPC", async () => {
    const workspace = await testFile("src/lib/rdash/server/workspace.ts").text();
    const commit = await testFile("src/lib/rdash/server/commit-rest.ts").text();

    expect(workspace).toContain("commitRestOperations");
    expect(commit).toContain('admin.rpc("commit_workspace_operations"');
    expect(commit).not.toContain("commit_operations(");
    expect(commit).not.toContain("write_workspace_snapshot");
  });
});
