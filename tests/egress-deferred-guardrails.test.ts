import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const app = await testFile("src/components/rdash/RDashApp.tsx").text();
const targeted = await testFile("src/lib/rdash/server/targeted-commit.ts").text();
const healthRoute = await testFile("src/app/api/health/summary/route.ts").text();
const workspaceRoute = await testFile("src/app/api/workspace/route.ts").text();

describe("deferred egress guardrails", () => {
  test("login welcome shares the health request", () => {
    expect(app).toContain("loadWorkspaceHealth");
    expect(app).not.toContain('fetch("/api/health/summary"');
  });

  test("catalog upserts are targeted", () => {
    expect(targeted).toContain('"master.workSubcategories"');
    expect(targeted).toContain('operation.collection.startsWith("master.")');
  });

  test("egress-heavy responses report byte sizes", () => {
    expect(healthRoute).toContain('"X-UC-Response-Bytes"');
    expect(workspaceRoute).toContain('"X-UC-Response-Bytes"');
    expect(workspaceRoute).toContain('[workspace-response]');
  });
});
