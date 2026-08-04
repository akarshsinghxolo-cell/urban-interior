import { canReadFullStaffData } from "../staff-directory";
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
  scope: ModuleWorkspaceReadScope,
): readonly string[] {
  return COLLECTIONS_BY_SCOPE[scope];
}

export async function getWorkspaceBootstrap(user: AuthenticatedUser): Promise<WorkspaceSubset> {
  return getProjectedWorkspaceBootstrap(user.staffId);
}

async function readAuthorizedScope(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<ModuleScopedWorkspace> {
  if (target.scope === "full" || target.scope === "bootstrap") {
    throw new Error("INVALID:Bootstrap and full reads do not use the module-scoped planner.");
  }

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

  (merged.data as unknown as Record<string, unknown>)._workspace_read_scope = target.scope;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_mode = target.scope;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_module = target.moduleId;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_strategy = plan.strategy;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_collections = readCollections;
  (merged.data as unknown as Record<string, unknown>)._workspace_read_limits = limitedCollections;
  (merged.data as unknown as Record<string, unknown>)._workspace_staff_projection = fullStaffAllowed
    ? "full"
    : "directory";

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
