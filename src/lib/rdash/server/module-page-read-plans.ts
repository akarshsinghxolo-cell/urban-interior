import type { WorkspaceReadTarget } from "../workspace-read-scope";

/**
 * Exact screen plans reduce unrelated collection reads. A plan being exact does
 * not by itself make every collection pageable: relationship/lookup collections
 * and collections that drive aggregate counters must stay complete until the
 * server supplies row-ID projections / aggregate counts for those screens.
 */
const MODULE_PAGE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  customerTimeline: Object.freeze([
    "customers", "sites", "areas", "workRequired", "quotations", "workOrders",
    "tasks", "followups", "payments", "invoices", "customerReceipts", "visits",
    "drawings", "executionLogs", "boqs", "purchaseOrders", "grns", "vendorBills",
    "blocked", "commSends", "auditLog", "entityFileAttachments", "master.fileAssets",
    "master.sourcePartners", "master.contractors", "master.vendors",
  ]),
  customerRequests: Object.freeze([
    "customers", "sites", "areas", "workRequired", "measurementRevisions", "quotations",
    "workOrders", "visits", "tasks", "followups", "threads", "entityFileAttachments",
    "master.fileAssets", "master.workCategories", "master.workSubcategories",
    "master.sourcePartners", "master.contractors", "master.vendors",
  ]),
  salesPipeline: Object.freeze([
    "customers", "sites", "workRequired", "measurementRevisions", "quotations",
    "acceptedScopes", "workOrders", "visits", "invoices", "followups", "tasks",
    "commSends", "threads", "entityFileAttachments", "master.fileAssets",
  ]),
  lostClosedReview: Object.freeze([
    "customers", "sites", "workRequired", "quotations", "workOrders", "followups", "tasks",
    "threads", "auditLog",
  ]),
  drawings: Object.freeze([
    "customers", "sites", "areas", "workOrders", "drawings", "entityFileAttachments", "master.fileAssets",
  ]),
  executionLogs: Object.freeze([
    "customers", "sites", "workOrders", "executionLogs", "variationRequests", "visits",
    "entityFileAttachments", "master.fileAssets",
  ]),
  woTimeline: Object.freeze([
    "customers", "sites", "workOrders", "quotations", "acceptedScopes", "boqs", "drawings",
    "executionLogs", "variationRequests", "vendorRfqs", "purchaseOrders", "grns", "dispatches",
    "vendorBills", "contractorBills", "invoices", "customerReceipts", "commissions", "tasks",
    "followups", "threads", "visits", "commSends", "auditLog", "entityFileAttachments",
    "master.fileAssets",
  ]),
});

/**
 * Only true history feeds are newly paged in this pass. Drawings, execution-log
 * dashboards, inbox counters, and other list screens currently calculate totals
 * from their loaded arrays; truncating those arrays would create false business
 * metrics even if a Load-more control existed.
 */
const MODULE_PAGE_LIMITS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  customerTimeline: Object.freeze({
    executionLogs: 100,
    commSends: 100,
    auditLog: 100,
  }),
});

/**
 * Report-family screens need complete inputs for correct sums/rates, but each
 * family uses only a small subset of the old Reports scope. These plans are
 * exact but intentionally unpaginated. They reduce egress without turning a
 * partial page into a false business total.
 */
const MODULE_COMPLETE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  salesAnalytics: Object.freeze([
    "customers", "sites", "workRequired", "quotations", "workOrders", "payments",
    "customerReceipts",
  ]),
  collectionAnalytics: Object.freeze([
    "customers", "sites", "workOrders", "payments", "invoices", "customerReceipts",
  ]),
  operationsAnalytics: Object.freeze([
    "customers", "sites", "workOrders", "tasks", "visits", "attendance", "master.staff",
  ]),
  financialAnalytics: Object.freeze([
    "customers", "sites", "workOrders", "quotations", "payments", "invoices", "customerReceipts",
    "vendorBills", "vendorPayments", "contractorBills", "contractorPayments", "contractorSettlements",
    "workOrderCostLines", "master.vendors",
  ]),
  reportsDesk: Object.freeze([
    "customers", "workOrders", "quotations", "payments", "invoices", "customerReceipts",
    "workOrderCostLines",
  ]),
});

export function pageCollectionsForTarget(target: WorkspaceReadTarget): readonly string[] | undefined {
  if (target.scope === "bootstrap" || target.scope === "full") return undefined;
  return MODULE_PAGE_COLLECTIONS[target.moduleId];
}

export function completeCollectionsForTarget(target: WorkspaceReadTarget): readonly string[] | undefined {
  if (target.scope === "bootstrap" || target.scope === "full") return undefined;
  return MODULE_COMPLETE_COLLECTIONS[target.moduleId];
}

export function boundedPageLimits(
  collections: readonly string[],
  moduleId: string,
): Readonly<Record<string, number>> {
  const allowedCollections = new Set(collections);
  const configured = MODULE_PAGE_LIMITS[moduleId] || {};
  const limits: Record<string, number> = {};
  for (const [collection, limit] of Object.entries(configured)) {
    if (allowedCollections.has(collection)) limits[collection] = limit;
  }
  if (moduleId === "auditLog" && allowedCollections.has("auditLog")) limits.auditLog = 250;
  return Object.freeze(limits);
}
