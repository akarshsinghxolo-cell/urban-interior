import { describe, expect, test } from "bun:test";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  workspaceEntityPath,
} from "../src/lib/rdash/workspace-entity-routes";

describe("core workspace entity routes", () => {
  test("generates canonical paths for the initial entity set", () => {
    expect(workspaceEntityPath("customer", "cust-123")).toBe("/workspace/customers/cust-123");
    expect(workspaceEntityPath("site", "site-123")).toBe("/workspace/sites/site-123");
    expect(workspaceEntityPath("contractor", "cont-123")).toBe("/workspace/contractors/cont-123");
    expect(workspaceEntityPath("vendor", "vendor-123")).toBe("/workspace/vendors/vendor-123");
  });

  test("encodes and decodes stable entity IDs", () => {
    const path = workspaceEntityPath("customer", "cust north 1");
    expect(path).toBe("/workspace/customers/cust%20north%201");
    const location = resolveWorkspaceLocation(path || "");
    expect(isWorkspaceEntityLocation(location)).toBe(true);
    if (isWorkspaceEntityLocation(location)) {
      expect(location.entity).toEqual({ kind: "customer", id: "cust north 1" });
      expect(location.canonicalPath).toBe(path);
    }
  });

  test("gives exact module and submodule routes precedence", () => {
    const customerTimeline = resolveWorkspaceLocation("/workspace/customers/timeline");
    expect(isWorkspaceEntityLocation(customerTimeline)).toBe(false);
    expect(customerTimeline?.moduleId).toBe("customerTimeline");

    const contractorRates = resolveWorkspaceLocation("/workspace/contractors/rates");
    expect(isWorkspaceEntityLocation(contractorRates)).toBe(false);
    expect(contractorRates?.moduleId).toBe("contractorRates");
  });

  test("rejects malformed, nested and unsafe IDs", () => {
    expect(workspaceEntityPath("site", "site/123")).toBeUndefined();
    expect(workspaceEntityPath("vendor", "vendor\\123")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/a/b")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%2Fetc")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%E0%A4%A")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/..")).toBeUndefined();
  });

  test("does not claim entity families outside the initial rollout", () => {
    expect(resolveWorkspaceLocation("/workspace/tasks/task-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/work-orders/wo-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/purchase-orders/po-1")).toBeUndefined();
  });
});
