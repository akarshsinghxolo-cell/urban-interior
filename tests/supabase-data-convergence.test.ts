import { expectNoTokens, expectTokens } from "./helpers/source-contract";
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

    expectTokens(migration, ["drop function if exists public.commit_operations"]);
    expectTokens(migration, ["drop function if exists public.write_workspace_snapshot"]);
    expectTokens(migration, ["drop function if exists public.uc_bump_workspace_revision"]);
    expectTokens(migration, ['drop table if exists public."CollectionMeta"']);
    expectNoTokens(migration, ['drop table if exists public."GenericRecord"']);

    expect(server).toContain('admin.rpc("commit_workspace_operations"');
    expect(server).not.toContain('admin.rpc("commit_operations"');
    expect(drive).toContain('.from("GenericRecord")');
  });

  test("binds every workspace collection to its canonical entity table", async () => {
    const migration = await testFile(MIGRATION).text();

    expectTokens(migration, ["rename to commit_workspace_operations_internal"]);
    expectTokens(migration, ["v_expected_table := 'entity_' || replace(v_collection, '.', '_')"]);
    expectTokens(migration, ["v_table is distinct from v_expected_table"]);
    expect(migration).toContain("INVALID_COLLECTION_TABLE");
    expectTokens(migration, ["perform set_config('uc.write_source', 'workspace-commit', true)"]);
    expectTokens(migration, ["return public.commit_workspace_operations_internal("]);
    expectTokens(migration, ["revoke all on function public.commit_workspace_operations_internal"]);
    expectTokens(migration, ["from public, anon, authenticated, service_role"]);
  });

  test("sanitizes Staff credentials before response, persistence and journaling", async () => {
    const tableGuard = await testFile(STAFF_MIRROR_MIGRATION).text();
    const operationGuard = await testFile(OPERATION_SANITIZE_MIGRATION).text();
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();

    expectTokens(tableGuard, ["new.data := coalesce(new.data, '{}'::jsonb)"]);
    expectTokens(tableGuard, ["- 'temporary_password'"]);
    expectTokens(tableGuard, ["- 'force_password_change'"]);
    expectTokens(operationGuard, ["create or replace function public.uc_sanitize_workspace_operations"]);
    expectTokens(operationGuard, ["v_row - 'temporary_password' - 'force_password_change'"]);
    expectTokens(operationGuard, ["v_operations := public.uc_sanitize_workspace_operations(p_operations)"]);
    expectTokens(operationGuard, ["v_operations := public.uc_expand_contractor_rate_operations"]);
    expectTokens(operationGuard, ["return public.commit_workspace_operations_internal("]);

    expectTokens(authorized, ["function sanitizeWorkspaceOperations("]);
    expectTokens(authorized, ["delete safe.temporary_password;"]);
    expectTokens(authorized, ["delete safe.force_password_change;"]);
    expectTokens(authorized, ["let commitOperations = sanitizeWorkspaceOperations(operations);"]);
  });

  test("journals auth-driven master staff synchronization exactly once", async () => {
    const migration = await testFile(MIGRATION).text();
    const staffIdentity = await testFile(
      "supabase/migrations/20260724054622_staff_identity_atomic_sync.sql",
    ).text();

    expectTokens(staffIdentity, ["for update;"]);
    expect(staffIdentity).toContain("'auth-system'");
    expectTokens(staffIdentity, ["v_next_workspace_revision := v_workspace_revision + 1"]);

    expectTokens(migration, ["create or replace function public.uc_journal_auth_staff_master_write()"]);
    expectTokens(migration, ["current_setting('uc.write_source', true) = 'workspace-commit'"]);
    expectTokens(migration, ["if new.updated_by is distinct from 'auth-system'"]);
    expectTokens(migration, ["v_next_revision := v_current_revision + 1"]);
    expectTokens(migration, ["'collection', 'master.staff'"]);
    expectTokens(migration, ["'master.staff:' || new.id"]);
    expectTokens(migration, ["create trigger entity_master_staff_auth_journal"]);
  });

  test("keeps workspace Staff and auth/profile mirrors on explicit ownership boundaries", async () => {
    const migration = await testFile(STAFF_MIRROR_MIGRATION).text();

    expectTokens(migration, ["create or replace function public.uc_sanitize_workspace_staff_auth_fields()"]);
    expectTokens(migration, ["create trigger entity_master_staff_workspace_auth_sanitize"]);
    expectTokens(migration, ["create or replace function public.uc_sync_workspace_staff_mirrors()"]);
    expectTokens(migration, ["current_setting('uc.write_source', true) is distinct from 'workspace-commit'"]);
    expect(migration).toContain("STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_EMAIL_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_LOGIN_ACCESS_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_ACCESS_MUST_USE_AUTH_FLOW");
    expect(migration).toContain("STAFF_ROLE_ASSIGNMENT_NOT_FOUND");
    expectTokens(migration, ['insert into public."StaffProfile"']);
    expectTokens(migration, ["update public.uc_user_roles"]);
    expectTokens(migration, ["where id = v_role_assignment_id"]);
    expectTokens(migration, ["create trigger entity_master_staff_workspace_mirror"]);
    expect(migration).toContain("STAFF_AUTH_LINK_DELETE_MUST_USE_AUTH_FLOW");
    expectTokens(migration, ["create trigger entity_master_staff_workspace_delete_guard"]);
  });

  test("routes Staff login changes to User Approvals and declares the persisted auth link", async () => {
    const dialog = await testFile("src/components/rdash/StaffEditDialog.tsx").text();
    const types = await testFile("src/lib/rdash/types.ts").text();

    expectTokens(dialog, ["Login access is managed in User Approvals"]);
    expectTokens(dialog, ["Passwords are never stored in Staff workspace data"]);
    expectTokens(dialog, ["temporary_password: undefined"]);
    expectTokens(dialog, ["force_password_change: undefined"]);
    expectNoTokens(dialog, ["Temporary password"]);
    expect(dialog).not.toContain("ChangeMe_UrbanCastle_2026!");
    expectTokens(types, ["auth_user_id?: string;"]);
  });

  test("makes Contractor Rates an atomic projection visible to server and database", async () => {
    const migration = await testFile(CONTRACTOR_RATE_MIGRATION).text();
    const revisionFix = await testFile(CONTRACTOR_RATE_REVISION_MIGRATION).text();
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();
    const profile = await testFile("src/lib/rdash/contractor-profile.ts").text();

    expectTokens(migration, ["create or replace function public.uc_contractor_rate_projection_rows"]);
    expectTokens(migration, ["p_contractor -> 'work_capabilities'"]);
    expectTokens(migration, ["p_contractor -> 'capabilities_v2'"]);
    expectTokens(migration, ["'crate-' || v_contractor_id || '-' || v_subcategory_id"]);
    expectTokens(migration, ["create or replace function public.uc_expand_contractor_rate_operations"]);
    expectTokens(migration, ["v_op ->> 'collection' <> 'master.contractors'"]);
    expectTokens(migration, ["'collection', 'master.contractorRates'"]);
    expectTokens(migration, ["'table', 'entity_master_contractorRates'"]);
    expectTokens(migration, ["v_operations := public.uc_expand_contractor_rate_operations"]);
    expectTokens(migration, ["return public.commit_workspace_operations_internal("]);
    expectTokens(migration, ["One-time live-data convergence"]);
    expect(migration).toContain("'contractor-rate-projection'");
    expectTokens(migration, ["v_next_revision := v_current_revision + 1"]);
    expect(migration).toContain("is_baseline");

    expectTokens(revisionFix, ["v_projection_ids text[]"]);
    expectTokens(revisionFix, ["v_contractor_projection := public.uc_contractor_rate_projection_rows"]);
    expectTokens(revisionFix, ["not (v_existing_id = any(v_projection_ids))"]);
    expectTokens(revisionFix, ["preserving stable row revisions"]);

    expectTokens(authorized, ['import { contractorRateProjection } from "../contractor-profile";']);
    expectTokens(authorized, ["function canonicalizeContractorRateOperations("]);
    expectTokens(authorized, ["contractorRates = contractorRateProjection("]);
    expectTokens(authorized, ["canonicalizeContractorRateOperations(current.data, commitOperations)"]);
    expect(profile).toContain("workTypesForSubcategory(subcategory)");
    expectTokens(profile, ["rate.work_type_id === workTypeRate.work_type_id"]);
    expectTokens(profile, ["work_type_name: workTypeName"]);
  });

  test("persists the work catalog in Supabase and stops runtime JSON replacement", async () => {
    const migration = await testFile(WORK_CATALOG_MIGRATION).text();
    const commitRest = await testFile("src/lib/rdash/server/commit-rest.ts").text();

    expectTokens(migration, ['insert into public."entity_master_units"']);
    expectTokens(migration, ['insert into public."entity_master_workCategories"']);
    expectTokens(migration, ['insert into public."entity_master_workSubcategories"']);
    expectTokens(migration, ['insert into public."entity_master_articles"']);
    expectTokens(migration, ['insert into public."entity_master_subcategoryArticleMap"']);
    expectTokens(migration, ["data = excluded.data ||"]);
    expect(migration).toContain("'work-catalog-seed'");
    expectTokens(migration, ["is_baseline = true"]);

    expectTokens(commitRest, ['import { WORK_CATALOG_VERSION } from "../work-category-master";']);
    expectTokens(commitRest, ["master.catalog_version = WORK_CATALOG_VERSION;"]);
  });

  test("establishes a fresh journal baseline after historical gaps", async () => {
    const migration = await testFile(MIGRATION).text();
    const delta = await testFile("src/lib/rdash/server/workspace-changes.ts").text();

    expectTokens(migration, ["from public.entity_workspace_revision r"]);
    expectTokens(migration, ["on conflict (workspace_id, revision) do update"]);
    expectTokens(migration, ["set is_baseline = true"]);

    expectTokens(delta, ["afterRevision < baselineRevision"]);
    expectTokens(delta, ['reason: "revision_too_old"']);
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
