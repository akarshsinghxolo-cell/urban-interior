import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const healthWidget = await testFile("src/components/rdash/WorkspaceHealthWidget.tsx").text();
const pulse = await testFile("src/components/rdash/WorkspacePulseStrip.tsx").text();
const healthServer = await testFile("src/lib/rdash/server/workspace-health.ts").text();
const targeted = await testFile("src/lib/rdash/server/targeted-commit.ts").text();
const scopes = await testFile("src/lib/rdash/server/module-scoped-collections.ts").text();
const outbox = await testFile("src/lib/uploads/workspace-outbox.ts").text();
const rest = await testFile("src/lib/rdash/server/commit-rest.ts").text();

 describe("PostgREST egress guardrails", () => {
  test("dashboard health consumers do not install polling timers", () => {
    expect(healthWidget).not.toContain("setInterval(fetchSummary");
    expectNoTokens(pulse, ["setInterval(() => fetchHealth"]);
    expect(healthWidget).toContain("useWorkspaceHealth");
    expect(pulse).toContain("useWorkspaceHealth");
  });

  // These objects were removed from the live database; health must stay on the bounded read path.
  test("health avoids removed database fast paths", () => {
    expect(healthServer).toContain('admin.rpc("get_workspace_health_summary_v2"');
    expect(healthServer).not.toContain('.rpc("get_workspace_health_summary"');
    expect(healthServer).not.toContain('.from("workspace_health_snapshot")');
    expect(healthServer).not.toContain("getWorkspaceSubset");
  });

  test("Work & Rate Master edits use targeted validation", () => {
    expect(targeted).toContain('"master.workSubcategories"');
    expect(targeted).toContain('operation.collection.startsWith("master.")');
  });

  test("Master Setup excludes unrelated vendor, storage and media collections", () => {
    const block = scopes.slice(scopes.indexOf("export const MASTER_SCOPE_COLLECTIONS"), scopes.indexOf("export const REPORTS_SCOPE_COLLECTIONS"));
    expect(block).toContain('"master.workSubcategories"');
    expect(block).not.toContain('"master.vendorRateHistories"');
    expect(block).not.toContain('"master.storageAccounts"');
    expect(block).not.toContain('"master.referenceMedia"');
  });

  test("successful acknowledgements clear IndexedDB before adaptation", () => {
    const success = outbox.slice(outbox.indexOf("  if (response.ok) {"), outbox.indexOf("  const retryCount", outbox.indexOf("  if (response.ok) {")));
    expect(success.indexOf("deleteWorkspaceOutbox(operationId)")).toBeLessThan(success.indexOf("acceptCompactCommit(current, payload)"));
  });

  test("history-heavy reads have server limits", () => {
    expect(rest).toContain("DEFAULT_COLLECTION_LIMITS");
    expectTokens(rest, ["auditLog: 100"]);
    expectTokens(rest, ['.order("revision", { ascending: false })']);
    expectTokens(rest, [".range(offset, offset + configuredLimit)"]);
  });
});
