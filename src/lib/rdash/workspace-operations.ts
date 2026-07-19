import type { Master, RDashDatabase } from "./types";

export type WorkspaceOperation = {
  collection: string;
  upsert?: Array<Record<string, unknown>>;
  deleteIds?: string[];
};

export const topLevelCollections: Array<keyof RDashDatabase> = [
  "customers", "sites", "areas", "workRequired", "measurementRevisions", "quotations", "acceptedScopes",
  "workOrders", "boqs", "vendorRfqs", "vendorBids", "purchaseOrders", "grns", "inventory", "stockMovements",
  "dispatches", "vendorBills", "vendorPayments", "contractorBills", "contractorPayments", "commissions", "workOrderCostLines",
  "contractorBids", "contractorSettlements", "drawings", "executionLogs", "variationRequests", "visits", "tasks", "followups",
  "actions", "payments", "invoices", "customerReceipts", "blocked", "risks", "threads", "attendance", "staffLocationPings",
  "staffRolePermissions", "staffAuthUsers", "leaveRequests", "payrollPeriods", "payrollLines", "salaryAdjustments", "staffDocuments", "approvalPolicies",
  "automationRules", "recurringTasks", "commSends", "entityFileAttachments", "entityReferenceAssignments", "commercialTerms",
  "paymentTermTemplates", "taxConfigs", "validityConfigs", "auditLog",
];

export const masterCollections: Array<keyof Master> = [
  "units", "workCategories", "workSubcategories", "articles", "articleVariants", "subcategoryArticleMap", "workOptionGroups",
  "workOptionValues", "vendors", "contractors", "staff", "sourcePartners", "commissionRules", "vendorRates", "contractorRates",
  "customerRateSuggestions", "vendorRateHistories", "storageAccounts", "storageFolderTemplates", "storageFolderInstances", "fileAssets", "catalogues",
  "catalogueArticleVendorLinks", "pinterestBoards", "referenceMedia",
];

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && typeof (row as Record<string, unknown>).id === "string") : [];
}

function diffRows(collection: string, before: unknown, after: unknown): WorkspaceOperation | null {
  const oldRows = asRows(before);
  const newRows = asRows(after);
  const oldById = new Map(oldRows.map((row) => [String(row.id), row]));
  const newById = new Map(newRows.map((row) => [String(row.id), row]));
  const upsert = newRows.filter((row) => JSON.stringify(oldById.get(String(row.id))) !== JSON.stringify(row));
  const deleteIds = oldRows.map((row) => String(row.id)).filter((id) => !newById.has(id));
  return upsert.length || deleteIds.length ? { collection, upsert, deleteIds } : null;
}

export function diffWorkspaceOperations(before: RDashDatabase, after: RDashDatabase): WorkspaceOperation[] {
  const ops: WorkspaceOperation[] = [];
  for (const key of topLevelCollections) {
    const op = diffRows(String(key), before[key], after[key]);
    if (op) ops.push(op);
  }
  for (const key of masterCollections) {
    const op = diffRows(`master.${String(key)}`, before.master?.[key], after.master?.[key]);
    if (op) ops.push(op);
  }
  return ops;
}

function applyRows<T extends { id: string }>(rows: T[], operation: WorkspaceOperation): T[] {
  const deleteIds = new Set(operation.deleteIds || []);
  const byId = new Map(rows.filter((row) => !deleteIds.has(row.id)).map((row) => [row.id, row]));
  for (const row of (operation.upsert || []) as T[]) byId.set(row.id, row);
  return Array.from(byId.values());
}

export function applyWorkspaceOperations(base: RDashDatabase, operations: WorkspaceOperation[]): RDashDatabase {
  const next = structuredClone(base) as RDashDatabase;
  for (const operation of operations) {
    if (operation.collection.startsWith("master.")) {
      const key = operation.collection.slice("master.".length) as keyof Master;
      const current = Array.isArray(next.master[key]) ? next.master[key] as Array<{ id: string }> : [];
      (next.master as unknown as Record<string, unknown>)[key] = applyRows(current, operation);
      continue;
    }
    const key = operation.collection as keyof RDashDatabase;
    const current = Array.isArray(next[key]) ? next[key] as Array<{ id: string }> : [];
    (next as unknown as Record<string, unknown>)[key] = applyRows(current, operation);
  }
  return next;
}

export function operationSummary(operations: WorkspaceOperation[]) {
  return operations
    .map((operation) => `${operation.collection}:${operation.upsert?.length || 0} upsert/${operation.deleteIds?.length || 0} delete`)
    .join(", ");
}
