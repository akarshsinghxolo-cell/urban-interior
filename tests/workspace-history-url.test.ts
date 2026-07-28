import { describe, expect, test } from "bun:test";
import { navigationLayers } from "../src/lib/rdash/navigation-history";
import type {
  ContextCustomerTab,
  ContextDetailTab,
  DetailPanelKind,
  WorkspaceNavigationSnapshot,
} from "../src/lib/rdash/store/ui-types";
import { workspaceHistoryUrl } from "../src/lib/rdash/workspace-history-url";

function snapshot(
  moduleId: string,
  detailPanel: {
    kind: DetailPanelKind;
    recordId: string | null;
    panelTab?: ContextDetailTab;
  } = { kind: null, recordId: null },
  customerTab: ContextCustomerTab = "overview",
): WorkspaceNavigationSnapshot {
  const customerContext = detailPanel.kind === "customer" && detailPanel.recordId
    ? [{
        kind: "customer" as const,
        recordId: detailPanel.recordId,
        customerId: detailPanel.recordId,
        sourceModule: moduleId,
        customerTab,
        detailTab: "overview" as const,
      }]
    : [];
  return {
    moduleId,
    activeTabId: `tab-${moduleId}`,
    moduleHistoryIndex: 0,
    moduleHistoryLength: 1,
    selectedCustomerId: detailPanel.kind === "customer" ? detailPanel.recordId : null,
    detailPanel: { ...detailPanel },
    contextHistory: customerContext,
    contextHistoryIndex: customerContext.length ? 0 : -1,
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

  test("attaches stable URLs to transaction detail snapshots", () => {
    expect(workspaceHistoryUrl(
      snapshot("woTimeline", { kind: "workOrder", recordId: "wo-1" }),
      "/workspace/sites/work-order-timeline",
      true,
    )).toBe("/workspace/work-orders/wo-1");
    expect(workspaceHistoryUrl(
      snapshot("quotationDesk", { kind: "quotation", recordId: "q-1" }),
      "/workspace/quotations",
      true,
    )).toBe("/workspace/quotations/q-1");
    expect(workspaceHistoryUrl(
      snapshot("procurementInventory", { kind: "po", recordId: "po-1" }),
      "/workspace/procurement",
      true,
    )).toBe("/workspace/purchase-orders/po-1");
    expect(workspaceHistoryUrl(
      snapshot("fieldOperations", { kind: "visit", recordId: "visit-1" }),
      "/workspace/field",
      true,
    )).toBe("/workspace/visits/visit-1");
  });

  test("attaches stable URLs to operational and finance detail snapshots", () => {
    expect(workspaceHistoryUrl(
      snapshot("tasks", { kind: "task", recordId: "task-1" }),
      "/workspace/tasks",
      true,
    )).toBe("/workspace/tasks/task-1");
    expect(workspaceHistoryUrl(
      snapshot("tasks", { kind: "followup", recordId: "followup-1" }),
      "/workspace/tasks",
      true,
    )).toBe("/workspace/followups/followup-1");
    expect(workspaceHistoryUrl(
      snapshot("payments", { kind: "payment", recordId: "payment-1" }),
      "/workspace/finance/collections",
      true,
    )).toBe("/workspace/payments/payment-1");
    expect(workspaceHistoryUrl(
      snapshot("invoices", { kind: "invoice", recordId: "invoice-1" }),
      "/workspace/finance/invoices",
      true,
    )).toBe("/workspace/invoices/invoice-1");
    expect(workspaceHistoryUrl(
      snapshot("vendorBills", { kind: "vendorBill", recordId: "vendor-bill-1" }),
      "/workspace/finance/vendor-bills",
      true,
    )).toBe("/workspace/vendor-bills/vendor-bill-1");
    expect(workspaceHistoryUrl(
      snapshot("contractorPayments", { kind: "contractorBill", recordId: "contractor-bill-1" }),
      "/workspace/finance/contractor-bills",
      true,
    )).toBe("/workspace/contractor-bills/contractor-bill-1");
  });

  test("adds only rendered record tabs to the same entity history entry", () => {
    expect(workspaceHistoryUrl(
      snapshot("tasks", { kind: "task", recordId: "task-1", panelTab: "thread" }),
      "/workspace/tasks/task-1",
      true,
      "?source=notification",
    )).toBe("/workspace/tasks/task-1?source=notification&tab=thread");
    expect(workspaceHistoryUrl(
      snapshot("invoices", { kind: "invoice", recordId: "invoice-1", panelTab: "history" }),
      "/workspace/invoices/invoice-1",
      true,
      "?tab=thread&source=search",
    )).toBe("/workspace/invoices/invoice-1?source=search");
  });

  test("adds durable customer workspace tabs from the active context entry", () => {
    expect(workspaceHistoryUrl(
      snapshot("customerDesk", { kind: "customer", recordId: "cust-1" }, "activity"),
      "/workspace/customers/cust-1",
      true,
      "?source=notification",
    )).toBe("/workspace/customers/cust-1?source=notification&tab=activity");
    expect(workspaceHistoryUrl(
      snapshot("customerDesk", { kind: "customer", recordId: "cust-1" }, "payments"),
      "/workspace/customers/cust-1",
      true,
      "?tab=sites",
    )).toBe("/workspace/customers/cust-1?tab=payments");
  });

  test("keeps overview clean for both detail and customer workspaces", () => {
    expect(workspaceHistoryUrl(
      snapshot("tasks", { kind: "task", recordId: "task-1", panelTab: "overview" }),
      "/workspace/tasks/task-1",
      true,
      "?tab=history",
    )).toBe("/workspace/tasks/task-1");
    expect(workspaceHistoryUrl(
      snapshot("customerDesk", { kind: "customer", recordId: "cust-1" }, "overview"),
      "/workspace/customers/cust-1",
      true,
      "?tab=activity&source=share",
    )).toBe("/workspace/customers/cust-1?source=share");
  });

  test("does not carry tab query state across a different destination", () => {
    expect(workspaceHistoryUrl(
      snapshot("siteExecution", { kind: "site", recordId: "site-1", panelTab: "thread" }),
      "/workspace/tasks/task-1",
      true,
      "?source=notification&tab=history",
    )).toBe("/workspace/sites/site-1?tab=thread");
    expect(workspaceHistoryUrl(
      snapshot("customerDesk", { kind: "customer", recordId: "cust-1" }, "sites"),
      "/workspace/tasks/task-1",
      true,
      "?source=notification&tab=history",
    )).toBe("/workspace/customers/cust-1?tab=sites");
    expect(workspaceHistoryUrl(
      snapshot("workdesk"),
      "/workspace/tasks/task-1",
      true,
      "?tab=history",
    )).toBe("/workspace");
  });

  test("keeps unsupported detail kinds on their parent module URL", () => {
    expect(workspaceHistoryUrl(
      snapshot("procurementInventory", { kind: "grn", recordId: "grn-1" }),
      "/workspace/procurement",
      true,
    )).toBe("/workspace/procurement");
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

  test("a direct entity starts with complete module and detail layers", () => {
    expect(navigationLayers(snapshot("woTimeline", { kind: "workOrder", recordId: "wo-1" }))).toEqual([
      { type: "root" },
      { type: "module", moduleId: "woTimeline" },
      { type: "detail", kind: "workOrder", recordId: "wo-1" },
    ]);
    expect(navigationLayers(snapshot("tasks", { kind: "followup", recordId: "followup-1" }))).toEqual([
      { type: "root" },
      { type: "module", moduleId: "tasks" },
      { type: "detail", kind: "followup", recordId: "followup-1" },
    ]);
    expect(navigationLayers(snapshot("workdesk"))).toEqual([{ type: "root" }]);
  });
});
