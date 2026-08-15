import { canReadFullStaffData } from "../staff-directory";
import { hydrateStaffReferenceLabels } from "../staff-reference-labels";
import type { RDashDatabase } from "../types";
import { workspaceRouteAccessDecision } from "../workspace-route-access";
import type {
  ModuleWorkspaceReadScope,
  WorkspaceReadTarget,
} from "../workspace-read-scope";
import type { AuthenticatedUser } from "./auth";
import {
  COLLECTIONS_BY_SCOPE,
  WORKSPACE_BOOTSTRAP_COLLECTIONS,
} from "./module-scoped-collections";
import {
  collectionsForWorkspaceReadTarget,
  moduleReadPlanSavings,
  workspaceModuleReadPlan,
} from "./module-read-plans";
import { getProjectedWorkspaceBootstrap } from "./projected-workspace-bootstrap";
import {
  getWorkspaceSubset,
  type WorkspacePagination,
  type WorkspaceSubset,
} from "./workspace";

export * from "./module-scoped-collections";
export * from "./module-read-plans";
export * from "./projected-workspace-bootstrap";

export const MODULE_SCOPED_READS_ENABLED = process.env.UC_MODULE_SCOPED_READS !== "0";

export interface ModuleScopedWorkspace extends WorkspaceSubset {
  scope: ModuleWorkspaceReadScope;
  collectionCount: number;
  scopeCollectionCount: number;
  readStrategy: "module" | "scope";
  limitedCollections: Record<string, number>;
  loadMs: number;
  pageOnly?: boolean;
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

function mergedPagination(
  current?: WorkspacePagination,
  incoming?: WorkspacePagination,
): WorkspacePagination | undefined {
  const merged = { ...(current || {}), ...(incoming || {}) };
  return Object.keys(merged).length ? merged : undefined;
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

  hydrateStaffReferenceLabels(data);

  return {
    revision: target.revision,
    updatedAt: source.updatedAt || target.updatedAt,
    data,
    rowVersions: { ...(target.rowVersions || {}), ...(source.rowVersions || {}) },
    queryCount: target.queryCount + source.queryCount,
    pagination: mergedPagination(target.pagination, source.pagination),
  };
}

export function collectionsForWorkspaceReadScope(
  scope: ModuleWorkspaceReadScope,
): readonly string[] {
  return COLLECTIONS_BY_SCOPE[scope];
}

export async function getWorkspaceBootstrap(user: AuthenticatedUser): Promise<WorkspaceSubset> {
  return getProjectedWorkspaceBootstrap(user.staffId);
}

function assertModuleTarget(target: WorkspaceReadTarget): asserts target is WorkspaceReadTarget & { scope: ModuleWorkspaceReadScope } {
  if (target.scope === "full" || target.scope === "bootstrap") {
    throw new Error("INVALID:Bootstrap and full reads do not use the module-scoped planner.");
  }
}

function moduleMetadata(input: {
  database: RDashDatabase;
  target: WorkspaceReadTarget & { scope: ModuleWorkspaceReadScope };
  readStrategy: "module" | "scope";
  readCollections: readonly string[];
  limitedCollections: Record<string, number>;
  pagination?: WorkspacePagination;
  fullStaffAllowed?: boolean;
  pageOnly?: boolean;
}) {
  const metadata = input.database as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = input.target.scope;
  metadata._workspace_read_mode = input.target.scope;
  metadata._workspace_read_module = input.target.moduleId;
  metadata._workspace_read_strategy = input.readStrategy;
  metadata._workspace_read_collections = [...input.readCollections];
  metadata._workspace_read_limits = { ...input.limitedCollections };
  metadata._workspace_pagination = { ...(input.pagination || {}) };
  if (input.pageOnly) metadata._workspace_page_only = true;
  if (typeof input.fullStaffAllowed === "boolean") {
    metadata._workspace_staff_projection = input.fullStaffAllowed ? "full" : "directory";
  }
}

async function authorizedBootstrap(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget & { scope: ModuleWorkspaceReadScope },
): Promise<WorkspaceSubset> {
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
  return bootstrap;
}

async function readAuthorizedScope(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<ModuleScopedWorkspace> {
  assertModuleTarget(target);

  const startedAt = performance.now();
  const bootstrap = await authorizedBootstrap(user, target);
  const plan = workspaceModuleReadPlan(target);
  const plannedCollections = collectionsForWorkspaceReadTarget(target);
  const plannedFullStaff = plannedCollections.includes("master.staff");
  const fullStaffAllowed = plannedFullStaff && canReadFullStaffData(user.role);
  const fullCollections = fullStaffAllowed
    ? [...plannedCollections]
    : plannedCollections.filter((collection) => collection !== "master.staff");
  const scoped = await getWorkspaceSubset({
    fullCollections,
    rowsByCollection:
      plannedFullStaff && !fullStaffAllowed && user.staffId
        ? { "master.staff": [user.staffId] }
        : undefined,
    limitsByCollection: { ...(plan.limitsByCollection || {}) },
  });
  const merged = mergeWorkspaceSubsets(bootstrap, scoped);
  const savings = moduleReadPlanSavings(target);
  const limitedCollections = Object.fromEntries(
    Object.entries(plan.limitsByCollection || {}).filter(([collection]) =>
      plannedCollections.includes(collection),
    ),
  );
  const readCollections = [...new Set([
    ...WORKSPACE_BOOTSTRAP_COLLECTIONS,
    ...plannedCollections,
  ])];

  moduleMetadata({
    database: merged.data,
    target,
    readStrategy: plan.strategy,
    readCollections,
    limitedCollections,
    pagination: merged.pagination,
    fullStaffAllowed,
  });

  return {
    ...merged,
    scope: target.scope,
    collectionCount: readCollections.length,
    scopeCollectionCount: savings.scope + WORKSPACE_BOOTSTRAP_COLLECTIONS.length,
    readStrategy: plan.strategy,
    limitedCollections,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

function sanitizePageOffsets(
  requested: Record<string, number>,
  limitedCollections: Record<string, number>,
): Record<string, number> {
  const offsets: Record<string, number> = {};
  for (const [collection, rawOffset] of Object.entries(requested)) {
    if (!(collection in limitedCollections)) continue;
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset <= 0 || offset > 1_000_000) continue;
    offsets[collection] = offset;
  }
  return offsets;
}

async function readAuthorizedPage(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
  requestedOffsets: Record<string, number>,
): Promise<ModuleScopedWorkspace> {
  assertModuleTarget(target);

  const startedAt = performance.now();
  const bootstrap = await authorizedBootstrap(user, target);
  const plan = workspaceModuleReadPlan(target);
  const plannedCollections = collectionsForWorkspaceReadTarget(target);
  const limitedCollections = Object.fromEntries(
    Object.entries(plan.limitsByCollection || {}).filter(([collection]) =>
      plannedCollections.includes(collection),
    ),
  );
  const offsets = sanitizePageOffsets(requestedOffsets, limitedCollections);
  const pageCollections = Object.keys(offsets);
  if (!pageCollections.length) {
    throw new Error("INVALID:No valid bounded collection page was requested.");
  }

  const page = await getWorkspaceSubset({
    fullCollections: pageCollections,
    limitsByCollection: Object.fromEntries(
      pageCollections.map((collection) => [collection, limitedCollections[collection]]),
    ),
    offsetsByCollection: offsets,
  });
  if (page.revision !== bootstrap.revision) throw new Error("READ_CONFLICT");

  const savings = moduleReadPlanSavings(target);
  moduleMetadata({
    database: page.data,
    target,
    readStrategy: plan.strategy,
    readCollections: pageCollections,
    limitedCollections: Object.fromEntries(
      pageCollections.map((collection) => [collection, limitedCollections[collection]]),
    ),
    pagination: page.pagination,
    pageOnly: true,
  });

  return {
    ...page,
    scope: target.scope,
    collectionCount: pageCollections.length,
    scopeCollectionCount: savings.scope + WORKSPACE_BOOTSTRAP_COLLECTIONS.length,
    readStrategy: plan.strategy,
    limitedCollections: Object.fromEntries(
      pageCollections.map((collection) => [collection, limitedCollections[collection]]),
    ),
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    pageOnly: true,
  };
}

/**
 * Reads a projected permission/bootstrap first, then the route's exact module
 * plan (or bounded scope fallback) at the same workspace revision. Staff is
 * directory-projected by default; only privileged HR reads receive all Staff
 * HR fields, while ordinary Staff can receive their own full row on HR screens.
 * A concurrent write causes one clean retry.
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

/**
 * Loads only the next page of bounded collections that are already part of the
 * current module. Bootstrap/permissions are used for authorization but are not
 * retransmitted to the client; the returned page is designed to merge into the
 * existing scoped snapshot.
 */
export async function getModuleScopedWorkspacePage(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
  offsets: Record<string, number>,
): Promise<ModuleScopedWorkspace> {
  try {
    return await readAuthorizedPage(user, target, offsets);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "READ_CONFLICT") throw error;
    return readAuthorizedPage(user, target, offsets);
  }
}
