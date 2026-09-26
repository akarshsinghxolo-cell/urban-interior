import { describe, expect, test } from "vitest";
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
  test("covers every internal module route", () => {
    expect(validateWorkspaceRouteRegistry()).toEqual([]);
    const moduleIds = [...MODULE_ROUTE_REGISTRY.values()]
      .map((route) => route.id)
      .sort();
    expect(WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.moduleId).sort()).toEqual(moduleIds);
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

  test("rejects retired compatibility module paths", () => {
    for (const path of [
      "/workspace/customerDesk",
      "/workspace/salesPipeline",
      "/workspace/fieldOperations",
      "/workspace/siteExecution",
      "/workspace/procurementInventory",
      "/workspace/contractorDetail",
      "/workspace/masterSetup",
      "/workspace/financeDesk",
      "/workspace/mediaCommunication",
      "/workspace/hrStaff",
      "/workspace/reportsDesk",
      "/workspace/systemSettings",
      "/workspace/boq",
      "/workspace/workOrderPnl",
    ]) {
      expect(resolveWorkspacePath(path)).toBeUndefined();
    }
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
