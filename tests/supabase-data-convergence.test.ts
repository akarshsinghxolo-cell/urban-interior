import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

describe("Supabase persistence convergence", () => {
  test("keeps current runtime on canonical workspace and Drive persistence only", async () => {
    const server = await testFile("src/lib/rdash/server/commit-rest.ts").text();
    const drive = await testFile("src/lib/rdash/server/drive-connections.ts").text();

    expect(server).toContain('admin.rpc("commit_workspace_operations"');
    expect(server).not.toContain('admin.rpc("commit_operations"');
    expect(server).not.toContain("write_workspace_snapshot");
    expect(drive).toContain('.from("uc_google_drive_credentials")');
    expect(drive).not.toContain("GenericRecord");
    expect(drive).not.toContain("oauth_connection_id");
  });

  test("sanitizes Staff credentials before canonical persistence", async () => {
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();

    expectTokens(authorized, ["function sanitizeWorkspaceOperations("]);
    expectTokens(authorized, ["delete safe.temporary_password;"]);
    expectTokens(authorized, ["delete safe.force_password_change;"]);
    expectTokens(authorized, ["let commitOperations = sanitizeWorkspaceOperations(operations);"]);
  });

  test("routes Staff login changes to User Approvals", async () => {
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

  test("keeps Contractor Rates on the canonical projection", async () => {
    const authorized = await testFile("src/lib/rdash/server/authorized-commit.ts").text();
    const profile = await testFile("src/lib/rdash/contractor-profile.ts").text();

    expectTokens(authorized, ['import { contractorRateProjection } from "../contractor-profile";']);
    expectTokens(authorized, ["function canonicalizeContractorRateOperations("]);
    expectTokens(authorized, ["contractorRates = contractorRateProjection("]);
    expectTokens(authorized, ["canonicalizeContractorRateOperations(current.data, commitOperations)"]);
    expect(profile).toContain("workTypesForSubcategory(subcategory)");
    expectTokens(profile, ["rate.work_type_id === workTypeRate.work_type_id"]);
    expectTokens(profile, ["work_type_name: workTypeName"]);
    expectNoTokens(profile, ["capabilities_v2"]);
  });

  test("keeps the persisted work catalog version canonical", async () => {
    const commitRest = await testFile("src/lib/rdash/server/commit-rest.ts").text();

    expectTokens(commitRest, ['import { WORK_CATALOG_VERSION } from "../work-category-master";']);
    expectTokens(commitRest, ["master.catalog_version = WORK_CATALOG_VERSION;"]);
  });

  test("requires a fresh scoped read when a journal baseline is too old", async () => {
    const delta = await testFile("src/lib/rdash/server/workspace-changes.ts").text();

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
