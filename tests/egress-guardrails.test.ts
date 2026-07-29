import { describe, expect, test } from "bun:test";

const healthWidget = await Bun.file("src/components/rdash/WorkspaceHealthWidget.tsx").text();
const pulse = await Bun.file("src/components/rdash/WorkspacePulseStrip.tsx").text();
const healthServer = await Bun.file("src/lib/rdash/server/workspace-health.ts").text();
const targeted = await Bun.file("src/lib/rdash/server/targeted-commit.ts").text();
const scopes = await Bun.file("src/lib/rdash/server/module-scoped-collections.ts").text();
const outbox = await Bun.file("src/lib/uploads/workspace-outbox.ts").text();
const rest = await Bun.file("src/lib/rdash/server/commit-rest.ts").text();

 describe("PostgREST egress guardrails", () => {
  test("dashboard health consumers do not install polling timers", () => {
    expect(healthWidget).not.toContain("setInterval(fetchSummary");
    expect(pulse).not.toContain("setInterval(() => fetchHealth");
    expect(healthWidget).toContain("useWorkspaceHealth");
    expect(pulse).toContain("useWorkspaceHealth");
  });

  test("health uses one database aggregate RPC", () => {
    expect(healthServer).toContain('.rpc("get_workspace_health_summary"');
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
    expect(rest).toContain('auditLog: 100');
    expect(rest).toContain('.order("revision", { ascending: false }).limit(limit)');
  });
});
