import type { WorkspaceReadTarget } from "../workspace-read-scope";

/**
 * Exact screen-level collection plans for the broad module families that used
 * to fall back to an entire scope. These are intentionally conservative: each
 * screen still receives the related records it currently renders, but unrelated
 * ERP areas are no longer transferred merely because they share a scope.
 */
export const MODULE_PAGE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  customerDesk: Object.freeze([
    "customers", "sites", "workRequired", "quotations", "workOrders", "invoices",
  ]),
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
  siteExecution: Object.freeze([
    "customers", "sites", "areas", "workRequired", "measurementRevisions", "quotations",
    "acceptedScopes", "workOrders", "boqs", "vendorRfqs", "vendorBids", "purchaseOrders",
    "grns", "payments", "invoices", "customerReceipts", "contractorBills", "contractorBids",
    "visits", "tasks", "threads", "entityFileAttachments", "master.units",
    "master.workCategories", "master.workSubcategories", "master.articles", "master.vendors",
    "master.contractors", "master.fileAssets",
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
  quotationDesk: Object.freeze([
    "customers", "sites", "areas", "workRequired", "measurementRevisions", "quotations",
    "acceptedScopes", "workOrders", "tasks", "followups", "actions", "payments", "invoices",
    "threads", "commercialTerms", "paymentTermTemplates", "taxConfigs", "validityConfigs",
    "entityFileAttachments", "master.units", "master.workCategories", "master.workSubcategories",
    "master.articles", "master.articleVariants", "master.subcategoryArticleMap",
    "master.workOptionGroups", "master.workOptionValues", "master.customerRateSuggestions",
    "master.fileAssets",
  ]),
  fieldOperations: Object.freeze([
    "customers", "sites", "workRequired", "workOrders", "visits", "tasks", "followups", "attendance",
    "blocked", "risks", "threads", "entityFileAttachments", "master.staff", "master.vendors",
    "master.contractors", "master.fileAssets",
  ]),
  procurementInventory: Object.freeze([
    "customers", "sites", "workOrders", "boqs", "vendorRfqs", "vendorBids", "purchaseOrders",
    "grns", "inventory", "stockMovements", "dispatches", "vendorBills", "vendorPayments", "tasks",
    "threads", "entityFileAttachments", "taxConfigs", "master.units", "master.articles",
    "master.articleVariants", "master.vendors", "master.vendorRates", "master.fileAssets",
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
  financeDesk: Object.freeze([
    "customers", "sites", "workOrders", "payments", "invoices", "customerReceipts", "vendorBills",
    "vendorPayments", "contractorBills", "contractorPayments", "contractorSettlements", "commissions",
    "workOrderCostLines", "tasks", "followups", "threads", "entityFileAttachments", "commercialTerms",
    "paymentTermTemplates", "taxConfigs", "master.vendors", "master.contractors", "master.sourcePartners",
    "master.fileAssets",
  ]),
  profitability: Object.freeze([
    "customers", "sites", "workOrders", "boqs", "purchaseOrders", "grns", "inventory", "stockMovements",
    "dispatches", "vendorBills", "vendorPayments", "contractorBills", "contractorPayments", "commissions",
    "workOrderCostLines", "contractorSettlements", "payments", "invoices", "customerReceipts",
    "master.vendors", "master.contractors", "master.sourcePartners",
  ]),
  mediaCommunication: Object.freeze([
    "customers", "sites", "quotations", "tasks", "followups", "threads", "commSends",
    "entityFileAttachments", "entityReferenceAssignments", "master.storageAccounts",
    "master.storageFolderTemplates", "master.storageFolderInstances", "master.fileAssets",
    "master.catalogues", "master.catalogueArticleVendorLinks", "master.pinterestBoards", "master.referenceMedia",
  ]),
  hrStaff: Object.freeze([
    "customers", "sites", "workOrders", "visits", "tasks", "followups", "threads", "attendance",
    "leaveRequests", "payrollPeriods", "payrollLines", "salaryAdjustments", "staffDocuments",
    "approvalPolicies", "entityFileAttachments", "master.contractors", "master.staff", "master.fileAssets",
  ]),
  systemSettings: Object.freeze([
    "staffRolePermissions", "approvalPolicies", "automationRules", "recurringTasks", "taxConfigs",
    "paymentTermTemplates", "validityConfigs", "master.storageAccounts", "master.storageFolderTemplates",
  ]),
});

/**
 * Operational/history tables grow without a practical upper bound. Normal
 * module reads therefore page them instead of mirroring the complete table.
 * Small taxonomy/config tables deliberately remain unbounded because they are
 * required as complete reference sets by forms and are slow-changing.
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

export function boundedPageLimits(
  collections: readonly string[],
  moduleId: string,
): Readonly<Record<string, number>> {
  const limits: Record<string, number> = {};
  for (const collection of collections) {
    const limit = DEFAULT_PAGE_LIMITS[collection];
    if (limit) limits[collection] = limit;
  }
  if (moduleId === "auditLog") limits.auditLog = 100;
  if (moduleId === "executionLogs") limits.executionLogs = 100;
  return Object.freeze(limits);
}
