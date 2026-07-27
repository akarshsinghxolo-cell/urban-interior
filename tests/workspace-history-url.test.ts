import { describe, expect, test } from "bun:test";
import { navigationLayers } from "../src/lib/rdash/navigation-history";
import type { WorkspaceNavigationSnapshot } from "../src/lib/rdash/store/ui-types";
import { workspaceHistoryUrl } from "../src/lib/rdash/workspace-history-url";

function snapshot(moduleId: string): WorkspaceNavigationSnapshot {
  return {
    moduleId,
    activeTabId: `tab-${moduleId}`,
    moduleHistoryIndex: 0,
    moduleHistoryLength: 1,
    selectedCustomerId: null,
    detailPanel: { kind: null, recordId: null },
    contextHistory: [],
    contextHistoryIndex: -1,
    overlays: [],
  };
}

describe("workspace history URLs", () => {
  test("attaches canonical URLs to managed history inside the workspace namespace", () => {
    expect(workspaceHistoryUrl("customerDesk", "/workspace/customers", true)).toBe("/workspace/customers");
    expect(workspaceHistoryUrl("siteExecution", "/workspace/customers", true)).toBe("/workspace/sites");
    expect(workspaceHistoryUrl("gpsTracking", "/workspace", true)).toBe("/workspace/field/gps");
  });

  test("keeps legacy root navigation state-only during migration", () => {
    expect(workspaceHistoryUrl("customerDesk", "/", true)).toBeUndefined();
    expect(workspaceHistoryUrl("siteExecution", "/signin", true)).toBeUndefined();
  });

  test("supports the emergency URL-navigation rollback switch", () => {
    expect(workspaceHistoryUrl("customerDesk", "/workspace/customers", false)).toBeUndefined();
  });

  test("canonicalizes hidden compatibility module IDs", () => {
    expect(workspaceHistoryUrl("boq", "/workspace", true)).toBe("/workspace/procurement/boq");
    expect(workspaceHistoryUrl("staff", "/workspace", true)).toBe("/workspace/staff");
  });

  test("a direct non-root module starts with its complete layer list", () => {
    expect(navigationLayers(snapshot("customerDesk"))).toEqual([
      { type: "root" },
      { type: "module", moduleId: "customerDesk" },
    ]);
    expect(navigationLayers(snapshot("workdesk"))).toEqual([{ type: "root" }]);
  });
});
