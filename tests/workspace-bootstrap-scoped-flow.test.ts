import { describe, expect, test } from "bun:test";
import { workspaceReadEndpointForTarget } from "@/lib/rdash/workspace-read-client";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeFromMode,
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";

describe("workspace bootstrap and scoped client reads", () => {
  test("treats bootstrap as session context rather than module data", () => {
    const target = workspaceReadTargetForModule("workdesk");
    expect(workspaceReadScopeFromMode("bootstrap")).toBe("bootstrap");
    expect(workspaceReadCoverageIsCompatible(
      { scope: "bootstrap", mode: "bootstrap" },
      target,
    )).toBe(false);
  });

  test("routes module families through dedicated bounded endpoints", () => {
    for (const [moduleId, endpoint] of [
      ["customerDesk", "/api/customers"],
      ["siteExecution", "/api/sites"],
      ["workdesk", "/api/tasks"],
      ["quotationDesk", "/api/quotations"],
      ["fieldOperations", "/api/field-operations"],
      ["procurementInventory", "/api/procurement"],
      ["financeDesk", "/api/finance"],
      ["mediaCommunication", "/api/media"],
      ["hrStaff", "/api/hr"],
      ["masterSetup", "/api/master"],
      ["reportsDesk", "/api/reports"],
      ["systemSettings", "/api/system"],
    ] as const) {
      expect(workspaceReadEndpointForTarget(workspaceReadTargetForModule(moduleId))).toBe(endpoint);
    }
  });

  test("keeps concrete Customer and Site URLs on the row-graph planner", () => {
    expect(workspaceReadEndpointForTarget(
      workspaceReadTargetForPath("/workspace/customers/cust-123"),
    )).toBe("/api/workspace");
    expect(workspaceReadEndpointForTarget(
      workspaceReadTargetForPath("/workspace/sites/site-123"),
    )).toBe("/api/workspace");
  });

  test("starts with the minimal bootstrap and never hydrates the full workspace", async () => {
    const app = await Bun.file("src/components/rdash/RDashApp.tsx").text();
    const bootstrap = await Bun.file("src/app/api/bootstrap/route.ts").text();
    expect(app).toContain('fetch("/api/bootstrap"');
    expect(app).not.toContain('fetch("/api/workspace"');
    expect(bootstrap).toContain("getWorkspaceSubset({})");
    expect(bootstrap).not.toContain("getWorkspaceBootstrap");
    expect(bootstrap).not.toContain("data: workspace.data");
    expect(bootstrap).toContain('readStrategy: "module-scoped"');
    expect(bootstrap).toContain('"X-UC-Response-Bytes"');
  });

  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {
    const helper = await Bun.file("src/lib/rdash/server/module-scoped-route.ts").text();
    expect(helper).toContain('request.headers.get("x-uc-workspace-module")');
    expect(helper).toContain("target.scope === endpointTarget.scope");
    expect(helper).toContain("getModuleScopedWorkspace(user, target)");
    expect(helper).toContain('"X-UC-Read-Module"');
    expect(helper).toContain('"X-UC-Response-Bytes"');
  });

  test("blocks expensive full-workspace fallback unless explicitly enabled", async () => {
    const route = await Bun.file("src/app/api/workspace/route.ts").text();
    expect(route).toContain('process.env.UC_FULL_WORKSPACE_FALLBACK === "1"');
    expect(route).toContain('"X-UC-Full-Fallback": "blocked"');
    expect(route).toContain("A full-workspace fallback was not attempted.");
  });

  test("keeps delta recovery on the same scoped data path", async () => {
    const source = await Bun.file("src/components/urban-castle/WorkspaceDeltaSync.tsx").text();
    expect(source).toContain("workspaceReadEndpointForTarget(target)");
    expect(source).not.toContain('fetch("/api/workspace"');
  });
});
