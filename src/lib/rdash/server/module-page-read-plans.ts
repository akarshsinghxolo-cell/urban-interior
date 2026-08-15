import type { WorkspaceReadTarget } from "../workspace-read-scope";

/**
 * Exact page-level plans are limited to focused screens whose UI can explicitly
 * expose additional pages. Aggregate dashboards intentionally remain on their
 * complete scope plans until their totals are replaced by server aggregates;
 * silently paging those arrays would make business metrics incorrect.
 */
export const MODULE_PAGE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  customerTimeline: Object.freeze([
    "customers", "sites", "areas", "workRequired", "quotations", "workOrders",
    "tasks", "followups", "payments", "invoices", "customerReceipts", "visits",
    "drawings", "executionLogs", "boqs", "purchaseOrders", "grns", "vendorBills",
    "commSends", "auditLog", "entityFileAttachments", "master.fileAssets",
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

/**
 * Operational/history tables grow without a practical upper bound. Focused
 * module reads page these collections. Slow-changing taxonomy/config tables are
 * deliberately not bounded because forms require those reference sets in full.
 */
export const DEFAULT_PAGE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  customers: 50,
  sites: 50,
  areas: 100,
  workRequired: 100,
  measurementRevisions: 100,
  quotations: 75,
  acceptedScopes: 100,
  workOrders: 75,
  boqs: 75,
  vendorRfqs: 75,
  vendorBids: 75,
  purchaseOrders: 75,
  grns: 75,
  inventory: 125,
  stockMovements: 100,
  dispatches: 75,
  vendorBills: 75,
  vendorPayments: 100,
  contractorBills: 75,
  contractorPayments: 100,
  commissions: 75,
  workOrderCostLines: 100,
  contractorBids: 75,
  contractorSettlements: 75,
  drawings: 100,
  executionLogs: 100,
  variationRequests: 75,
  visits: 100,
  tasks: 100,
  followups: 100,
  actions: 100,
  payments: 100,
  invoices: 100,
  customerReceipts: 100,
  blocked: 100,
  risks: 100,
  threads: 100,
  attendance: 100,
  leaveRequests: 100,
  payrollPeriods: 50,
  payrollLines: 100,
  salaryAdjustments: 100,
  staffDocuments: 100,
  commSends: 100,
  entityFileAttachments: 100,
  entityReferenceAssignments: 100,
  auditLog: 100,
  "master.vendorRates": 100,
  "master.vendorRateHistories": 100,
  "master.storageFolderInstances": 100,
  "master.fileAssets": 100,
  "master.catalogues": 100,
  "master.catalogueArticleVendorLinks": 100,
  "master.pinterestBoards": 100,
  "master.referenceMedia": 100,
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
  const limits: Record<string, number> = {};
  for (const collection of collections) {
    const limit = DEFAULT_PAGE_LIMITS[collection];
    if (limit) limits[collection] = limit;
  }
  if (moduleId === "auditLog") limits.auditLog = 250;
  if (moduleId === "executionLogs") limits.executionLogs = 100;
  return Object.freeze(limits);
}
