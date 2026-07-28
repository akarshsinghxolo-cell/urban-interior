import type { RDashDatabase } from "../types";
import { workspaceRouteAccessDecision } from "../workspace-route-access";
import type { WorkspaceReadScope, WorkspaceReadTarget } from "../workspace-read-scope";
import type { AuthenticatedUser } from "./auth";
import {
  getWorkspaceSubset,
  type WorkspaceSubset,
} from "./workspace";

export const MODULE_SCOPED_READS_ENABLED = process.env.UC_MODULE_SCOPED_READS !== "0";

export const WORKSPACE_BOOTSTRAP_COLLECTIONS = Object.freeze([
  "staffRolePermissions",
] as const);

export const CUSTOMER_SCOPE_COLLECTIONS = Object.freeze([
  "customers",
  "sites",
  "areas",
  "workRequired",
  "measurementRevisions",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "boqs",
  "purchaseOrders",
  "grns",
  "dispatches",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorBids",
  "contractorSettlements",
  "workOrderCostLines",
  "drawings",
  "executionLogs",
  "variationRequests",
  "visits",
  "tasks",
  "followups",
  "actions",
  "payments",
  "invoices",
  "customerReceipts",
  "blocked",
  "risks",
  "threads",
  "commSends",
  "entityFileAttachments",
  "entityReferenceAssignments",
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
  "auditLog",
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.vendors",
  "master.contractors",
  "master.staff",
  "master.sourcePartners",
  "master.fileAssets",
] as const);

export const SITE_SCOPE_COLLECTIONS = Object.freeze([
  "customers",
  "sites",
  "areas",
  "workRequired",
  "measurementRevisions",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "boqs",
  "vendorRfqs",
  "vendorBids",
  "purchaseOrders",
  "grns",
  "dispatches",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorBids",
  "contractorSettlements",
  "workOrderCostLines",
  "drawings",
  "executionLogs",
  "variationRequests",
  "visits",
  "tasks",
  "followups",
  "actions",
  "payments",
  "invoices",
  "customerReceipts",
  "blocked",
  "risks",
  "threads",
  "entityFileAttachments",
  "entityReferenceAssignments",
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
  "auditLog",
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.subcategoryArticleMap",
  "master.workOptionGroups",
  "master.workOptionValues",
  "master.vendors",
  "master.contractors",
  "master.staff",
  "master.vendorRates",
  "master.contractorRates",
  "master.fileAssets",
] as const);

export interface ModuleScopedWorkspace extends WorkspaceSubset {
  scope: Exclude<WorkspaceReadScope, "full">;
  collectionCount: number;
  loadMs: number;
}

function rowsFor(database: RDashDatabase, collection: string): Array<Record<string, unknown>> {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    const value = (database.master as unknown as Record<string, unknown>)?.[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function mergeRows(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of current) {
    const id = String(row.id || "").trim();
    if (id) merged.set(id, row);
  }
  for (const row of incoming) {
    const id = String(row.id || "").trim();
    if (id) merged.set(id, row);
  }
  return [...merged.values()];
}

export function mergeWorkspaceSubsets(target: WorkspaceSubset, source: WorkspaceSubset): WorkspaceSubset {
  if (target.revision !== source.revision) {
    throw new Error("READ_CONFLICT");
  }

  const data = structuredClone(target.data) as RDashDatabase;
  for (const [key, value] of Object.entries(source.data as unknown as Record<string, unknown>)) {
    if (key === "master" || !Array.isArray(value) || value.length === 0) continue;
    (data as unknown as Record<string, unknown>)[key] = mergeRows(
      rowsFor(data, key),
      value as Array<Record<string, unknown>>,
    );
  }
  for (const [key, value] of Object.entries(source.data.master as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const collection = `master.${key}`;
    (data.master as unknown as Record<string, unknown>)[key] = mergeRows(
      rowsFor(data, collection),
      value as Array<Record<string, unknown>>,
    );
  }

  return {
    revision: target.revision,
    updatedAt: source.updatedAt || target.updatedAt,
    data,
    rowVersions: { ...(target.rowVersions || {}), ...(source.rowVersions || {}) },
    queryCount: target.queryCount + source.queryCount,
  };
}

export function collectionsForWorkspaceReadScope(
  scope: Exclude<WorkspaceReadScope, "full">,
): readonly string[] {
  return scope === "customer" ? CUSTOMER_SCOPE_COLLECTIONS : SITE_SCOPE_COLLECTIONS;
}

export async function getWorkspaceBootstrap(user: AuthenticatedUser): Promise<WorkspaceSubset> {
  return getWorkspaceSubset({
    fullCollections: [...WORKSPACE_BOOTSTRAP_COLLECTIONS],
    rowsByCollection: user.staffId ? { "master.staff": [user.staffId] } : undefined,
  });
}

async function readAuthorizedScope(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<ModuleScopedWorkspace> {
  if (target.scope === "full") throw new Error("INVALID:Full reads do not use the module-scoped planner.");

  const startedAt = performance.now();
  const bootstrap = await getWorkspaceBootstrap(user);
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    bootstrap.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
  if (access.status !== "allowed") {
    throw new Error(`FORBIDDEN:Your role cannot open ${access.moduleLabel}.`);
  }

  const collections = collectionsForWorkspaceReadScope(target.scope);
  const scoped = await getWorkspaceSubset({ fullCollections: [...collections] });
  const merged = mergeWorkspaceSubsets(bootstrap, scoped);
  (merged.data as unknown as Record<string, unknown>)._workspace_read_scope = target.scope;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_collections = [...new Set([
    ...WORKSPACE_BOOTSTRAP_COLLECTIONS,
    ...(user.staffId ? ["master.staff"] : []),
    ...collections,
  ])];

  return {
    ...merged,
    scope: target.scope,
    collectionCount: new Set([
      ...WORKSPACE_BOOTSTRAP_COLLECTIONS,
      ...(user.staffId ? ["master.staff"] : []),
      ...collections,
    ]).size,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

/**
 * Reads a permission bootstrap first, then the Customer/Site module collection
 * set at the same workspace revision. A concurrent write causes one clean retry;
 * callers may fall back to the compatibility full read if the workspace remains
 * too active to produce a coherent scoped snapshot.
 */
export async function getModuleScopedWorkspace(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<ModuleScopedWorkspace> {
  try {
    return await readAuthorizedScope(user, target);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "READ_CONFLICT") throw error;
    return readAuthorizedScope(user, target);
  }
}
