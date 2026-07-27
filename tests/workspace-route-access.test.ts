import { describe, expect, test } from "bun:test";
import { createDefaultStaffPermissions } from "../src/lib/rdash/staff-operations";
import { workspaceRouteAccessDecision } from "../src/lib/rdash/workspace-route-access";

describe("workspace route access", () => {
  test("waits for the authenticated role before deciding", () => {
    expect(workspaceRouteAccessDecision("customerDesk", null, []).status).toBe("pending");
  });

  test("allows Owner routes through the normalized default matrix", () => {
    const decision = workspaceRouteAccessDecision("systemSettings", "Owner", []);
    expect(decision.status).toBe("allowed");
    expect(decision.permissionModule).toBe("system");
  });

  test("allows Field Staff operational routes and denies system routes", () => {
    expect(workspaceRouteAccessDecision("gpsTracking", "Field Staff", []).status).toBe("allowed");
    expect(workspaceRouteAccessDecision("siteExecution", "Field Staff", []).status).toBe("allowed");
    expect(workspaceRouteAccessDecision("systemSettings", "Field Staff", []).status).toBe("denied");
  });

  test("keeps canonical URL routes aligned with Sidebar permission modules", () => {
    const customer = workspaceRouteAccessDecision("customerDesk", "Sales / Telecaller", []);
    const finance = workspaceRouteAccessDecision("financeDesk", "Sales / Telecaller", []);
    expect(customer.status).toBe("allowed");
    expect(customer.permissionModule).toBe("customers");
    expect(finance.status).toBe("denied");
    expect(finance.permissionModule).toBe("finance");
  });

  test("uses narrower transaction permission keys than the parent module", () => {
    const fieldProcurement = workspaceRouteAccessDecision(
      "procurementInventory",
      "Field Staff",
      [],
      "procurement",
    );
    const fieldPurchaseOrder = workspaceRouteAccessDecision(
      "procurementInventory",
      "Field Staff",
      [],
      "purchaseOrders",
    );
    expect(fieldProcurement.status).toBe("allowed");
    expect(fieldPurchaseOrder.status).toBe("denied");
    expect(fieldPurchaseOrder.permissionModule).toBe("purchaseOrders");

    const operationsWorkOrder = workspaceRouteAccessDecision(
      "woTimeline",
      "Operations Manager",
      [],
      "workOrders",
    );
    expect(operationsWorkOrder.status).toBe("allowed");
  });

  test("enforces task and finance permissions for remaining entity links", () => {
    const salesTask = workspaceRouteAccessDecision("tasks", "Sales / Telecaller", [], "tasks");
    const financeTask = workspaceRouteAccessDecision("tasks", "Finance", [], "tasks");
    expect(salesTask.status).toBe("allowed");
    expect(financeTask.status).toBe("denied");

    const financeInvoice = workspaceRouteAccessDecision("invoices", "Finance", [], "finance");
    const salesInvoice = workspaceRouteAccessDecision("invoices", "Sales / Telecaller", [], "finance");
    const fieldVendorBill = workspaceRouteAccessDecision("vendorBills", "Field Staff", [], "finance");
    expect(financeInvoice.status).toBe("allowed");
    expect(financeInvoice.permissionModule).toBe("finance");
    expect(salesInvoice.status).toBe("denied");
    expect(fieldVendorBill.status).toBe("denied");
  });

  test("applies customized permission rows instead of only built-in defaults", () => {
    const permissions = createDefaultStaffPermissions().map((row) =>
      row.role_key === "SALES_TELECALLER" && row.module_key === "customers"
        ? { ...row, can_view: false }
        : row,
    );
    expect(workspaceRouteAccessDecision("customerDesk", "Sales / Telecaller", permissions).status).toBe("denied");
  });

  test("canonicalizes compatibility module IDs before checking access", () => {
    const decision = workspaceRouteAccessDecision("contractors", "Field Staff", []);
    expect(decision.moduleId).toBe("contractors");
    expect(decision.permissionModule).toBe("contractors");
    expect(decision.status).toBe("denied");
  });
});
