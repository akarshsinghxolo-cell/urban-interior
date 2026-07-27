import { describe, expect, test } from "bun:test";
import { navigationLayers } from "../src/lib/rdash/navigation-history";
import type { DetailPanelKind, WorkspaceNavigationSnapshot } from "../src/lib/rdash/store/ui-types";
import { workspaceHistoryUrl } from "../src/lib/rdash/workspace-history-url";

function snapshot(
  moduleId: string,
  detailPanel: { kind: DetailPanelKind; recordId: string | null } = { kind: null, recordId: null },
): WorkspaceNavigationSnapshot {
  return {
    moduleId,
    activeTabId: `tab-${moduleId}`,
    moduleHistoryIndex: 0,
    moduleHistoryLength: 1,
    selectedCustomerId: detailPanel.kind === "customer" ? detailPanel.recordId : null,
    detailPanel: { ...detailPanel },
    contextHistory: [],
    contextHistoryIndex: -1,
    overlays: [],
  };
}

describe("workspace history URLs", () => {
  test("attaches canonical URLs to managed module history", () => {
    expect(workspaceHistoryUrl(snapshot("customerDesk"), "/workspace/customers", true)).toBe("/workspace/customers");
    expect(workspaceHistoryUrl(snapshot("siteExecution"), "/workspace/customers", true)).toBe("/workspace/sites");
    expect(workspaceHistoryUrl(snapshot("gpsTracking"), "/workspace", true)).toBe("/workspace/field/gps");
  });

  test("attaches stable URLs to core entity detail snapshots", () => {
    expect(workspaceHistoryUrl(
      snapshot("customerDesk", { kind: "customer", recordId: "cust-123" }),
      "/workspace/customers",
      true,
    )).toBe("/workspace/customers/cust-123");
    expect(workspaceHistoryUrl(
      snapshot("siteExecution", { kind: "site", recordId: "site 123" }),
      "/workspace/sites",
      true,
    )).toBe("/workspace/sites/site%20123");
    expect(workspaceHistoryUrl(
      snapshot("contractorDetail", { kind: "contractor", recordId: "cont-1" }),
      "/workspace/contractors",
      true,
    )).toBe("/workspace/contractors/cont-1");
    expect(workspaceHistoryUrl(
      snapshot("vendors", { kind: "vendor", recordId: "vendor-1" }),
      "/workspace/vendors",
      true,
    )).toBe("/workspace/vendors/vendor-1");
  });

  test("keeps non-core detail kinds on their parent module URL", () => {
    expect(workspaceHistoryUrl(
      snapshot("tasks", { kind: "task", recordId: "task-1" }),
      "/workspace/tasks",
      true,
    )).toBe("/workspace/tasks");
  });

  test("keeps legacy root navigation state-only during migration", () => {
    expect(workspaceHistoryUrl(snapshot("customerDesk"), "/", true)).toBeUndefined();
    expect(workspaceHistoryUrl(snapshot("siteExecution"), "/signin", true)).toBeUndefined();
  });

  test("supports the emergency URL-navigation rollback switch", () => {
    expect(workspaceHistoryUrl(snapshot("customerDesk"), "/workspace/customers", false)).toBeUndefined();
  });

  test("canonicalizes hidden compatibility module IDs", () => {
    expect(workspaceHistoryUrl(snapshot("boq"), "/workspace", true)).toBe("/workspace/procurement/boq");
    expect(workspaceHistoryUrl(snapshot("staff"), "/workspace", true)).toBe("/workspace/staff");
  });

  test("a direct entity starts with its complete module and detail layers", () => {
    expect(navigationLayers(snapshot("customerDesk", { kind: "customer", recordId: "cust-123" }))).toEqual([
      { type: "root" },
      { type: "module", moduleId: "customerDesk" },
      { type: "detail", kind: "customer", recordId: "cust-123" },
    ]);
    expect(navigationLayers(snapshot("workdesk"))).toEqual([{ type: "root" }]);
  });
});
