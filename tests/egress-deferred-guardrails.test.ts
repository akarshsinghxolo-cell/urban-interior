import { expectNoTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const app = await testFile("src/components/rdash/RDashApp.tsx").text();
const notifications = await testFile("src/components/rdash/NotificationCenter.tsx").text();
const targeted = await testFile("src/lib/rdash/server/targeted-commit.ts").text();
const healthRoute = await testFile("src/app/api/health/summary/route.ts").text();
const workspaceRoute = await testFile("src/app/api/workspace/route.ts").text();

describe("deferred egress guardrails", () => {
  test("notifications share the cached health request without a refresh toast", () => {
    expect(notifications).toContain("useWorkspaceHealth");
    expect(app).not.toContain("loadWorkspaceHealth");
    expect(app).not.toContain('fetch("/api/health/summary"');
    expectNoTokens(app, ['toast.warning("Workspace needs attention"']);
  });

  test("catalog upserts keep reverse-reference validation", () => {
    expect(targeted).toContain('"master.workSubcategories"');
    expect(targeted).toContain('operation.collection.startsWith("master.")');
    const eligible = targeted.slice(targeted.indexOf("const TARGETED_COLLECTIONS"), targeted.indexOf("const TARGETED_THREAD_KINDS"));
    expect(eligible).not.toContain('"master.workSubcategories"');
  });

  test("egress-heavy responses report byte sizes", () => {
    expect(healthRoute).toContain('"X-UC-Response-Bytes"');
    expect(workspaceRoute).toContain('"X-UC-Response-Bytes"');
    expect(workspaceRoute).toContain('[workspace-response]');
  });
});
