import type {
  ModuleWorkspaceReadScope,
  WorkspaceReadTarget,
} from "../workspace-read-scope";
import { COLLECTIONS_BY_SCOPE } from "./module-scoped-collections";
import {
  boundedPageLimits,
  pageCollectionsForTarget,
} from "./module-page-read-plans";

export interface WorkspaceModuleReadPlan {
  collections: readonly string[];
  limitsByCollection?: Readonly<Record<string, number>>;
  strategy: "module" | "scope";
}

const HISTORY_LIMITS = Object.freeze({
  auditLog: 100,
  executionLogs: 100,
  commSends: 100,
  "master.vendorRateHistories": 100,
} as const);

const EXACT_MODULE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  tasks: Object.freeze([
    "customers",
    "sites",
    "tasks",
    "followups",
    "actions",
    "blocked",
    "risks",
    "threads",
    "recurringTasks",
    "entityFileAttachments",
  ]),
  blockedRisks: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "tasks",
    "blocked",
    "risks",
    "threads",
    "entityFileAttachments",
  ]),
  approvals: Object.freeze([
    "customers",
    "sites",
    "quotations",
    "workOrders",
    "purchaseOrders",
    "vendorBills",
    "contractorPayments",
    "actions",
    "approvalPolicies",
    "threads",
    "entityFileAttachments",
  ]),
  calendarRecurring: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "tasks",
    "recurringTasks",
    "visits",
    "payments",
    "purchaseOrders",
    "attendance",
    "entityFileAttachments",
    "master.vendors",
  ]),
  quotationConfig: Object.freeze([
    "commercialTerms",
    "paymentTermTemplates",
    "taxConfigs",
    "validityConfigs",
    "master.units",
    "master.workCategories",
    "master.workSubcategories",
    "master.articles",
    "master.articleVariants",
    "master.workOptionGroups",
    "master.workOptionValues",
    "master.customerRateSuggestions",
  ]),
  siteMeasurement: Object.freeze([
    "customers",
    "sites",
    "areas",
    "workRequired",
    "measurementRevisions",
    "visits",
    "entityFileAttachments",
    "master.units",
  ]),
  visitProofs: Object.freeze([
    "customers",
    "sites",
    "visits",
    "entityFileAttachments",
    "master.fileAssets",
  ]),
  fieldMode: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "visits",
    "tasks",
    "attendance",
    "entityFileAttachments",
  ]),
  gpsTracking: Object.freeze([
    "customers",
    "sites",
    "visits",
    "attendance",
    "entityFileAttachments",
    "master.vendors",
  ]),
  grn: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "purchaseOrders",
    "grns",
    "inventory",
    "stockMovements",
    "vendorBills",
    "threads",
    "master.articles",
    "master.vendors",
    "master.fileAssets",
  ]),
  inventory: Object.freeze([
    "inventory",
    "stockMovements",
    "grns",
    "dispatches",
    "purchaseOrders",
    "entityFileAttachments",
    "master.articles",
    "master.vendors",
  ]),
  dispatch: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "inventory",
    "stockMovements",
    "dispatches",
    "threads",
    "entityFileAttachments",
  ]),
  vendorRates: Object.freeze([
    "entityFileAttachments",
    "master.units",
    "master.articles",
    "master.articleVariants",
    "master.vendors",
    "master.vendorRates",
    "master.vendorRateHistories",
  ]),
  rateFinder: Object.freeze([
    "entityFileAttachments",
    "master.units",
    "master.articles",
    "master.articleVariants",
    "master.vendors",
    "master.vendorRates",
    "master.vendorRateHistories",
  ]),
  payments: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "payments",
    "invoices",
    "customerReceipts",
    "followups",
    "threads",
    "entityFileAttachments",
    "commercialTerms",
    "paymentTermTemplates",
  ]),
  invoices: Object.freeze([
    "customers",
    "sites",
    "workOrders",
    "payments",
    "invoices",
    "customerReceipts",
    "threads",
    "entityFileAttachments",
    "taxConfigs",
  ]),
  vendorBills: Object.freeze([
    "purchaseOrders",
    "grns",
    "vendorBills",
    "vendorPayments",
    "threads",
    "entityFileAttachments",
    "master.vendors",
  ]),
  contractorPayments: Object.freeze([
    "workOrders",
    "contractorBills",
    "contractorPayments",
    "contractorSettlements",
    "threads",
    "entityFileAttachments",
    "master.contractors",
  ]),
  commissions: Object.freeze([
    "customers",
    "workOrders",
    "commissions",
    "threads",
    "entityFileAttachments",
    "master.sourcePartners",
    "master.commissionRules",
  ]),
  gstReturns: Object.freeze([
    "invoices",
    "customerReceipts",
    "vendorBills",
    "vendorPayments",
    "taxConfigs",
    "master.vendors",
  ]),
  driveManager: Object.freeze([
    "entityFileAttachments",
    "staffDocuments",
    "master.storageAccounts",
    "master.storageFolderTemplates",
    "master.storageFolderInstances",
    "master.fileAssets",
  ]),
  communicationCentre: Object.freeze([
    "customers",
    "quotations",
    "tasks",
    "followups",
    "threads",
    "commSends",
    "entityFileAttachments",
    "entityReferenceAssignments",
    "master.articles",
    "master.vendors",
    "master.fileAssets",
    "master.catalogues",
    "master.catalogueArticleVendorLinks",
    "master.referenceMedia",
  ]),
  attendancePayroll: Object.freeze([
    "attendance",
    "leaveRequests",
    "payrollPeriods",
    "approvalPolicies",
    "auditLog",
    "master.staff",
  ]),
  staffSalary: Object.freeze([
    "attendance",
    "leaveRequests",
    "payrollPeriods",
    "payrollLines",
    "salaryAdjustments",
    "staffDocuments",
    "auditLog",
    "master.staff",
  ]),
  articleVariants: Object.freeze([
    "auditLog",
    "master.units",
    "master.workCategories",
    "master.workSubcategories",
    "master.articles",
    "master.articleVariants",
    "master.subcategoryArticleMap",
  ]),
  userApprovals: Object.freeze([
    "staffRolePermissions",
    "auditLog",
  ]),
  approvalPolicies: Object.freeze([
    "actions",
    "approvalPolicies",
    "auditLog",
  ]),
  auditLog: Object.freeze([
    "auditLog",
  ]),
});

function limitsForModule(
  moduleId: string,
  collections: readonly string[],
): Readonly<Record<string, number>> {
  const limits = {
    ...HISTORY_LIMITS,
    ...boundedPageLimits(collections, moduleId),
  };
  return Object.freeze(limits);
}

function completeFileJoin(collections: readonly string[]): readonly string[] {
  const hasAttachments = collections.includes("entityFileAttachments");
  const hasAssets = collections.includes("master.fileAssets");
  if (!hasAttachments && !hasAssets) return collections;
  const joined = [...collections];
  if (!hasAttachments) joined.push("entityFileAttachments");
  if (!hasAssets) joined.push("master.fileAssets");
  return Object.freeze(joined);
}

function exactCollections(target: WorkspaceReadTarget): readonly string[] | undefined {
  return pageCollectionsForTarget(target) || EXACT_MODULE_COLLECTIONS[target.moduleId];
}

export function collectionsForWorkspaceReadTarget(
  target: WorkspaceReadTarget,
): readonly string[] {
  if (target.scope === "bootstrap" || target.scope === "full") return [];
  const exact = exactCollections(target);
  return exact ? completeFileJoin(exact) : COLLECTIONS_BY_SCOPE[target.scope];
}

export function workspaceModuleReadPlan(
  target: WorkspaceReadTarget,
): WorkspaceModuleReadPlan {
  if (target.scope === "bootstrap" || target.scope === "full") {
    throw new Error("INVALID:Bootstrap and full reads do not use module read plans.");
  }
  const exact = exactCollections(target);
  const collections = exact ? completeFileJoin(exact) : COLLECTIONS_BY_SCOPE[target.scope];
  return Object.freeze({
    collections,
    limitsByCollection: limitsForModule(target.moduleId, collections),
    strategy: exact ? "module" : "scope",
  });
}

export function moduleReadPlanSavings(
  target: WorkspaceReadTarget,
): { selected: number; scope: number } {
  if (target.scope === "bootstrap" || target.scope === "full") {
    return { selected: 0, scope: 0 };
  }
  return {
    selected: collectionsForWorkspaceReadTarget(target).length,
    scope: COLLECTIONS_BY_SCOPE[target.scope].length,
  };
}

export function scopeCollectionCount(scope: ModuleWorkspaceReadScope): number {
  return COLLECTIONS_BY_SCOPE[scope].length;
}
