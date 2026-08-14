import { describe, expect, test } from "vitest";
import { selectWorkspaceRoute } from "../src/lib/rdash/workspace-route-adapter";

describe("workspace route adapter", () => {
  test("selects an existing module from a canonical URL", () => {
    expect(selectWorkspaceRoute("/workspace/customers", "workdesk")).toEqual({
      moduleId: "customerDesk",
      canonicalPath: "/workspace/customers",
      title: "Customer Desk · Urban Castle",
      shouldActivate: true,
    });
  });

  test("does not reactivate a module already selected by the URL", () => {
    expect(selectWorkspaceRoute("/workspace/field/gps", "gpsTracking")?.shouldActivate).toBe(false);
  });

  test("resolves compatibility aliases through the canonical registry", () => {
    const selection = selectWorkspaceRoute("/workspace/boq", "workdesk");
    expect(selection?.moduleId).toBe("boqControlCentre");
    expect(selection?.canonicalPath).toBe("/workspace/procurement/boq");
  });

  test("selects entities without inventing separate page components", () => {
    expect(selectWorkspaceRoute("/workspace/customers/cust-123", "workdesk")).toEqual({
      moduleId: "customerDesk",
      canonicalPath: "/workspace/customers/cust-123",
      title: "Customer Desk · Urban Castle",
      shouldActivate: true,
      entity: { kind: "customer", id: "cust-123", permissionModule: "customers" },
    });
    expect(selectWorkspaceRoute("/workspace/sites/site-123", "siteExecution")?.entity).toEqual({
      kind: "site",
      id: "site-123",
      permissionModule: "sites",
    });
    expect(selectWorkspaceRoute("/workspace/work-orders/wo-123", "siteExecution")).toMatchObject({
      moduleId: "woTimeline",
      canonicalPath: "/workspace/work-orders/wo-123",
      entity: { kind: "workOrder", id: "wo-123", permissionModule: "workOrders" },
    });
    expect(selectWorkspaceRoute("/workspace/purchase-orders/po-123", "procurementInventory")?.entity).toEqual({
      kind: "po",
      id: "po-123",
      permissionModule: "purchaseOrders",
    });
  });

  test("selects remaining operational and finance entities through existing modules", () => {
    expect(selectWorkspaceRoute("/workspace/tasks/task-1", "workdesk")).toMatchObject({
      moduleId: "tasks",
      canonicalPath: "/workspace/tasks/task-1",
      entity: { kind: "task", id: "task-1", permissionModule: "tasks" },
    });
    expect(selectWorkspaceRoute("/workspace/followups/followup-1", "tasks")).toMatchObject({
      moduleId: "tasks",
      shouldActivate: false,
      entity: { kind: "followup", id: "followup-1", permissionModule: "tasks" },
    });
    expect(selectWorkspaceRoute("/workspace/invoices/invoice-1", "financeDesk")).toMatchObject({
      moduleId: "invoices",
      canonicalPath: "/workspace/invoices/invoice-1",
      entity: { kind: "invoice", id: "invoice-1", permissionModule: "finance" },
    });
    expect(selectWorkspaceRoute("/workspace/vendor-bills/vendor-bill-1", "vendorBills")).toMatchObject({
      moduleId: "vendorBills",
      shouldActivate: false,
      entity: { kind: "vendorBill", id: "vendor-bill-1", permissionModule: "finance" },
    });
    expect(selectWorkspaceRoute("/workspace/contractor-bills/contractor-bill-1", "contractorPayments")).toMatchObject({
      moduleId: "contractorPayments",
      entity: { kind: "contractorBill", id: "contractor-bill-1", permissionModule: "finance" },
    });
  });

  test("does not treat unrelated application paths as workspace modules", () => {
    expect(selectWorkspaceRoute("/signin", "workdesk")).toBeUndefined();
    expect(selectWorkspaceRoute("/api/workspace", "workdesk")).toBeUndefined();
  });
});
