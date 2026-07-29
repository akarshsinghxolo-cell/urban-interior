import { describe, expect, test } from "bun:test";
import { MODULE_ROUTE_REGISTRY } from "../src/lib/rdash/modules";
import {
  WORKSPACE_ROUTE_DEFINITIONS,
  canonicalWorkspacePath,
  isWorkspacePath,
  resolveWorkspacePath,
  validateWorkspaceRouteRegistry,
  workspacePathForModule,
} from "../src/lib/rdash/workspace-routes";

describe("workspace route registry", () => {
  test("covers every visible internal module route", () => {
    expect(validateWorkspaceRouteRegistry()).toEqual([]);
    const visibleIds = [...MODULE_ROUTE_REGISTRY.values()]
      .filter((route) => !route.hidden)
      .map((route) => route.id)
      .sort();
    expect(WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.moduleId).sort()).toEqual(visibleIds);
  });

  test("round-trips every canonical path", () => {
    for (const definition of WORKSPACE_ROUTE_DEFINITIONS) {
      const match = resolveWorkspacePath(definition.canonicalPath);
      expect(match?.moduleId).toBe(definition.moduleId);
      expect(match?.canonicalPath).toBe(definition.canonicalPath);
      expect(match?.isAlias).toBe(false);
      expect(workspacePathForModule(definition.moduleId)).toBe(definition.canonicalPath);
    }
  });

  test("uses professional canonical paths instead of implementation IDs", () => {
    expect(workspacePathForModule("customerDesk")).toBe("/workspace/customers");
    expect(workspacePathForModule("siteExecution")).toBe("/workspace/sites");
    expect(workspacePathForModule("procurementInventory")).toBe("/workspace/procurement");
    expect(workspacePathForModule("financeDesk")).toBe("/workspace/finance");
    expect(workspacePathForModule("systemSettings")).toBe("/workspace/settings");
    expect(workspacePathForModule("lostClosedReview")).toBe("/workspace/sales/lost-closed-review");
    expect(workspacePathForModule("articleVariants")).toBe("/workspace/masters/article-variants");
  });

  test("keeps internal-ID paths as aliases", () => {
    const match = resolveWorkspacePath("/workspace/customerDesk");
    expect(match?.moduleId).toBe("customerDesk");
    expect(match?.canonicalPath).toBe("/workspace/customers");
    expect(match?.isAlias).toBe(true);
  });

  test("maps hidden compatibility module IDs to canonical destinations", () => {
    expect(workspacePathForModule("boq")).toBe("/workspace/procurement/boq");
    expect(workspacePathForModule("contractors")).toBe("/workspace/contractors");
    expect(workspacePathForModule("vendorPerformance")).toBe("/workspace/vendors");
    expect(workspacePathForModule("staff")).toBe("/workspace/staff");
    expect(workspacePathForModule("siteProfitability")).toBe("/workspace/finance/profitability");
    expect(workspacePathForModule("salesReport")).toBe("/workspace/reports/sales");
    expect(workspacePathForModule("agingReportRep")).toBe("/workspace/reports/collections");
    expect(workspacePathForModule("taskThroughput")).toBe("/workspace/reports/operations");
    expect(workspacePathForModule("taxReport")).toBe("/workspace/reports/financial");
  });

  test("normalizes query strings, hashes, duplicate slashes and trailing slashes", () => {
    expect(canonicalWorkspacePath("/workspace//customers/?tab=activity#summary")).toBe("/workspace/customers");
    expect(resolveWorkspacePath("workspace/sites/")?.moduleId).toBe("siteExecution");
  });

  test("does not claim future entity-deep-link paths yet", () => {
    expect(resolveWorkspacePath("/workspace/customers/cust-123")).toBeUndefined();
    expect(resolveWorkspacePath("/workspace/sites/site-123")).toBeUndefined();
  });

  test("recognizes the workspace namespace without accepting unrelated paths", () => {
    expect(isWorkspacePath("/workspace")).toBe(true);
    expect(isWorkspacePath("/workspace/customers")).toBe(true);
    expect(isWorkspacePath("/signin")).toBe(false);
    expect(isWorkspacePath("/api/workspace")).toBe(false);
  });

  test("falls back unknown module IDs to Workdesk without inventing URLs", () => {
    expect(workspacePathForModule("unknown-module")).toBe("/workspace");
  });
});
