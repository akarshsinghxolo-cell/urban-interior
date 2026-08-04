import { describe, expect, test } from "bun:test";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  workspaceEntityPath,
} from "../src/lib/rdash/workspace-entity-routes";

describe("workspace entity routes", () => {
  test("generates canonical paths for supported entity families", () => {
    expect(workspaceEntityPath("customer", "cust-123")).toBe("/workspace/customers/cust-123");
    expect(workspaceEntityPath("site", "site-123")).toBe("/workspace/sites/site-123");
    expect(workspaceEntityPath("contractor", "cont-123")).toBe("/workspace/contractors/cont-123");
    expect(workspaceEntityPath("vendor", "vendor-123")).toBe("/workspace/vendors/vendor-123");
    expect(workspaceEntityPath("workOrder", "wo-123")).toBe("/workspace/work-orders/wo-123");
    expect(workspaceEntityPath("quotation", "quote-123")).toBe("/workspace/quotations/quote-123");
    expect(workspaceEntityPath("po", "po-123")).toBe("/workspace/purchase-orders/po-123");
    expect(workspaceEntityPath("visit", "visit-123")).toBe("/workspace/visits/visit-123");
    expect(workspaceEntityPath("task", "task-123")).toBe("/workspace/tasks/task-123");
    expect(workspaceEntityPath("followup", "followup-123")).toBe("/workspace/followups/followup-123");
    expect(workspaceEntityPath("payment", "payment-123")).toBe("/workspace/payments/payment-123");
    expect(workspaceEntityPath("invoice", "invoice-123")).toBe("/workspace/invoices/invoice-123");
    expect(workspaceEntityPath("vendorBill", "vendor-bill-123")).toBe("/workspace/vendor-bills/vendor-bill-123");
    expect(workspaceEntityPath("contractorBill", "contractor-bill-123")).toBe("/workspace/contractor-bills/contractor-bill-123");
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
      expect(location.canonicalPath).toBe(path!);
    }

    const purchaseOrder = resolveWorkspaceLocation("/workspace/purchase-orders/po-1");
    expect(isWorkspaceEntityLocation(purchaseOrder)).toBe(true);
    if (isWorkspaceEntityLocation(purchaseOrder)) {
      expect(purchaseOrder.moduleId).toBe("procurementInventory");
      expect(purchaseOrder.entity.permissionModule).toBe("purchaseOrders");
    }

    const task = resolveWorkspaceLocation("/workspace/tasks/task-1");
    expect(isWorkspaceEntityLocation(task)).toBe(true);
    if (isWorkspaceEntityLocation(task)) expect(task.entity.permissionModule).toBe("tasks");

    const vendorBill = resolveWorkspaceLocation("/workspace/vendor-bills/vb-1");
    expect(isWorkspaceEntityLocation(vendorBill)).toBe(true);
    if (isWorkspaceEntityLocation(vendorBill)) expect(vendorBill.entity.permissionModule).toBe("finance");
  });

  test("maps entity URLs onto their existing parent modules", () => {
    expect(resolveWorkspaceLocation("/workspace/work-orders/wo-1")?.moduleId).toBe("woTimeline");
    expect(resolveWorkspaceLocation("/workspace/quotations/q-1")?.moduleId).toBe("quotationDesk");
    expect(resolveWorkspaceLocation("/workspace/purchase-orders/po-1")?.moduleId).toBe("procurementInventory");
    expect(resolveWorkspaceLocation("/workspace/visits/visit-1")?.moduleId).toBe("fieldOperations");
    expect(resolveWorkspaceLocation("/workspace/tasks/task-1")?.moduleId).toBe("tasks");
    expect(resolveWorkspaceLocation("/workspace/followups/followup-1")?.moduleId).toBe("tasks");
    expect(resolveWorkspaceLocation("/workspace/payments/payment-1")?.moduleId).toBe("payments");
    expect(resolveWorkspaceLocation("/workspace/invoices/invoice-1")?.moduleId).toBe("invoices");
    expect(resolveWorkspaceLocation("/workspace/vendor-bills/vb-1")?.moduleId).toBe("vendorBills");
    expect(resolveWorkspaceLocation("/workspace/contractor-bills/cb-1")?.moduleId).toBe("contractorPayments");
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

    const tasksRoot = resolveWorkspaceLocation("/workspace/tasks");
    expect(isWorkspaceEntityLocation(tasksRoot)).toBe(false);
    expect(tasksRoot?.moduleId).toBe("tasks");
  });

  test("rejects malformed, nested and unsafe IDs", () => {
    expect(workspaceEntityPath("site", "site/123")).toBeUndefined();
    expect(workspaceEntityPath("vendor", "vendor\\123")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/a/b")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%2Fetc")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/%E0%A4%A")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/customers/..")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/vendor-bills/a/b")).toBeUndefined();
  });

  test("does not claim entity families outside this rollout", () => {
    expect(resolveWorkspaceLocation("/workspace/grns/grn-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/contractor-payments/payment-1")).toBeUndefined();
    expect(resolveWorkspaceLocation("/workspace/commissions/commission-1")).toBeUndefined();
  });
});
