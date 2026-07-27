import { describe, expect, test } from "bun:test";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  workspaceEntityPath,
} from "../src/lib/rdash/workspace-entity-routes";

describe("workspace entity routes", () => {
  test("generates canonical paths for core and transaction entities", () => {
    expect(workspaceEntityPath("customer", "cust-123")).toBe("/workspace/customers/cust-123");
    expect(workspaceEntityPath("site", "site-123")).toBe("/workspace/sites/site-123");
    expect(workspaceEntityPath("contractor", "cont-123")).toBe("/workspace/contractors/cont-123");
    expect(workspaceEntityPath("vendor", "vendor-123")).toBe("/workspace/vendors/vendor-123");
    expect(workspaceEntityPath("workOrder", "wo-123")).toBe("/workspace/work-orders/wo-123");
    expect(workspaceEntityPath("quotation", "quote-123")).toBe("/workspace/quotations/quote-123");
    expect(workspaceEntityPath("po", "po-123")).toBe("/workspace/purchase-orders/po-123");
    expect(workspaceEntityPath("visit", "visit-123")).toBe("/workspace/visits/visit-123");
  });

  test("encodes IDs and returns entity-specific permission context", () => {
    const path = workspaceEntityPath("customer", "cust north 1");
    expect(path).toBe("/workspace/customers/cust%20north%201");
    const location = resolveWorkspaceLocation(path || "");
    expect(isWorkspaceEntityLocation(location)).toBe(true);
    if (isWorkspaceEntityLocation(location)) {
      expect(location.entity).toEqual({
        kind: "customer",
        id: "cust north 1",
        permissionModule: "customers",
      });
      expect(location.canonicalPath).toBe(path);
    }

    const purchaseOrder = resolveWorkspaceLocation("/workspace/purchase-orders/po-1");
    expect(isWorkspaceEntityLocation(purchaseOrder)).toBe(true);
    if (isWorkspaceEntityLocation(purchaseOrder)) {
      expect(purchaseOrder.moduleId).toBe("procurementInventory");
      expect(purchaseOrder.entity.permissionModule).toBe("purchaseOrders");
    }
  });

  test("maps transaction URLs onto their existing parent modules", () => {
    expect(resolveWorkspaceLocation("/workspace/work-orders/wo-1")?.moduleId).toBe("woTimeline");
    expect(resolveWorkspaceLocation("/workspace/quotations/q-1")?.moduleId).toBe("quotationDesk");
    expect(resolveWorkspaceLocation("/workspace/purchase-orders/po-1")?.moduleId).toBe("procurementInventory");
    expect(resolveWorkspaceLocation("/workspace/visits/visit-1")?.moduleId).toBe("fieldOperations");
  });

  test("gives exact module and submodule routes precedence", () => {
    const customerTimeline = resolveWorkspaceLocation("/workspace/customers/timeline");
    expect(isWorkspaceEntityLocation(customerTimeline)).toBe(false);
    expect(customerTimeline?.moduleId).toBe("customerTimeline");

    const contractorRates = resolveWorkspaceLocation("/workspace/contractors/rates");
    expect(isWorkspaceEntityLocation(contractorRates)).toBe(false);
    expect(contractorRates?.moduleId).toBe("contractorRates");

    const visitsRoot = resolveWorkspaceLocation("/workspace/visits");
    expect(isWorkspaceEntityLocation(visitsRoot)).toBe(false);
    expect(visitsRoot?.moduleId).toBe("fieldOperations");
  });

  test("rejects malformed, nested and unsafe IDs", () => {
    expect(workspaceEntityPath("site", "site/123")).toBeUndefined();
    expect(workspaceEntityPath("vendor", "vendor\\123")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/a/b")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%2Fetc")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%E0%A4%A")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/..")).toBeUndefined();
  });

  test("does not claim later entity families", () => {
    expect(resolveWorkspaceLocation("/workspace/tasks/task-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/followups/followup-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/invoices/invoice-1")).toBeUndefined();
  });
});
