import type { WorkspaceReadTarget } from "../workspace-read-scope";

/**
 * Exact screen plans reduce unrelated collection reads. A plan being exact does
 * not by itself make every collection pageable: relationship/lookup collections
 * must stay complete until the server can project exactly the IDs needed by the
 * current primary page.
 */
export const MODULE_PAGE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  customerTimeline: Object.freeze([
    "customers", "sites", "areas", "workRequired", "quotations", "workOrders",
    "tasks", "followups", "payments", "invoices", "customerReceipts", "visits",
    "drawings", "executionLogs", "boqs", "purchaseOrders", "grns", "vendorBills",
    "blocked", "commSends", "auditLog", "entityFileAttachments", "master.fileAssets",
  ]),
  customerRequests: Object.freeze([
    "customers", "sites", "areas", "workRequired", "measurementRevisions", "quotations",
    "visits", "tasks", "followups", "threads", "entityFileAttachments", "master.fileAssets",
    "master.workCategories", "master.workSubcategories",
  ]),
  salesPipeline: Object.freeze([
    "customers", "sites", "workRequired", "quotations", "acceptedScopes", "workOrders",
    "followups", "tasks", "commSends", "threads", "entityFileAttachments", "master.fileAssets",
  ]),
  lostClosedReview: Object.freeze([
    "customers", "sites", "workRequired", "quotations", "workOrders", "followups", "tasks",
    "threads", "auditLog",
  ]),
  drawings: Object.freeze([
    "customers", "sites", "workOrders", "drawings", "entityFileAttachments", "master.fileAssets",
  ]),
  executionLogs: Object.freeze([
    "customers", "sites", "workOrders", "executionLogs", "variationRequests", "visits",
    "entityFileAttachments", "master.fileAssets",
  ]),
  woTimeline: Object.freeze([
    "customers", "sites", "workOrders", "boqs", "purchaseOrders", "grns", "dispatches",
    "vendorBills", "vendorPayments", "contractorBills", "contractorPayments", "drawings",
    "executionLogs", "visits", "tasks", "threads", "entityFileAttachments", "master.fileAssets",
  ]),
  contractorDetail: Object.freeze([
    "customers", "sites", "workOrders", "contractorBills", "contractorPayments", "contractorBids",
    "contractorSettlements", "entityFileAttachments", "master.units", "master.workCategories",
    "master.workSubcategories", "master.contractors", "master.contractorRates", "master.fileAssets",
  ]),
  contractorRates: Object.freeze([
    "entityFileAttachments", "master.units", "master.workCategories", "master.workSubcategories",
    "master.contractors", "master.contractorRates", "master.fileAssets",
  ]),
  unifiedThreadInbox: Object.freeze([
    "customers", "sites", "quotations", "workOrders", "tasks", "followups", "visits", "payments",
    "invoices", "threads", "commSends", "entityFileAttachments", "master.fileAssets",
  ]),
  boqControlCentre: Object.freeze([
    "customers", "sites", "workOrders", "boqs", "vendorRfqs", "vendorBids", "purchaseOrders",
    "entityFileAttachments", "master.units", "master.articles", "master.vendors", "master.fileAssets",
  ]),
  vendors: Object.freeze([
    "entityFileAttachments", "master.units", "master.workCategories", "master.workSubcategories",
    "master.articles", "master.articleVariants", "master.subcategoryArticleMap", "master.vendors",
    "master.vendorRates", "master.fileAssets",
  ]),
});

/**
 * Only these primary/history collections are safe to page with the current UI.
 * Lookup collections such as customers, sites, vendors, articles and file-join
 * tables are deliberately absent: independently truncating them can orphan a
 * visible row from its label/relationship data.
 */
export const MODULE_PAGE_LIMITS: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({
  customerTimeline: Object.freeze({
    executionLogs: 100,
    commSends: 100,
    auditLog: 100,
  }),
  drawings: Object.freeze({ drawings: 100 }),
  executionLogs: Object.freeze({ executionLogs: 100 }),
  woTimeline: Object.freeze({ executionLogs: 100 }),
  unifiedThreadInbox: Object.freeze({
    threads: 100,
    commSends: 100,
  }),
  vendors: Object.freeze({ "master.vendorRates": 100 }),
});

/**
 * Report-family screens need complete inputs for correct sums/rates, but each
 * family uses only a small subset of the old Reports scope. These plans are
 * exact but intentionally unpaginated. They reduce egress without turning a
 * partial page into a false business total.
 */
export const MODULE_COMPLETE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
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
