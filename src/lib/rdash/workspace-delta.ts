import type { RDashDatabase } from "./types";
import {
  applyWorkspaceOperations,
  masterCollections,
  topLevelCollections,
  type WorkspaceOperation,
} from "./workspace-operations";

export interface WorkspaceDeltaPayload {
  fromRevision: number;
  revision: number;
  currentRevision: number;
  baselineRevision: number;
  changedRows: Record<string, Array<Record<string, unknown>>>;
  deletedRowIds: Record<string, string[]>;
  rowVersions: Record<string, number>;
  collectionRevisions: Record<string, number>;
  hasMore: boolean;
  requiresFullReload: boolean;
  reason?: "journal_gap" | "revision_too_old" | "client_ahead" | "invalid_journal";
  batchCount: number;
  queryCount?: number;
  loadMs?: number;
}

export type StaffDeltaProjection = "directory" | "full";

const KNOWN_COLLECTIONS = new Set<string>([
  ...topLevelCollections.map(String),
  ...masterCollections.map((key) => `master.${String(key)}`),
]);
const SCOPED_BOOTSTRAP_COLLECTIONS = [
  "staffRolePermissions",
  "master.staff",
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
] as const;

export function knownWorkspaceCollection(collection: string): boolean {
  return KNOWN_COLLECTIONS.has(collection);
}

/**
 * Staff deltas must follow the same projection as the snapshot that the client
 * currently holds. Missing/legacy metadata fails closed to the safe directory.
 */
export function workspaceStaffProjectionParam(
  database: RDashDatabase,
): StaffDeltaProjection {
  const metadata = database as unknown as Record<string, unknown>;
  return metadata._workspace_staff_projection === "full" ? "full" : "directory";
}

/**
 * Returns the collections represented by the current scoped snapshot. Full and
 * legacy snapshots without explicit metadata are treated as complete. Permission,
 * safe Staff directory and foundational work-taxonomy rows are always part of
 * every authenticated scoped snapshot so global create/edit pickers stay populated.
 */
export function loadedWorkspaceCollections(database: RDashDatabase): Set<string> | null {
  const metadata = database as unknown as Record<string, unknown>;
  const scope = String(metadata._workspace_read_scope || "full");
  const raw = metadata._workspace_read_collections;
  if (scope === "full" || !Array.isArray(raw)) return null;
  return new Set([
    ...SCOPED_BOOTSTRAP_COLLECTIONS,
    ...raw.map((value) => String(value || "").trim()).filter(knownWorkspaceCollection),
  ]);
}

export function workspaceCollectionFilterParam(database: RDashDatabase): string | undefined {
  const collections = loadedWorkspaceCollections(database);
  if (!collections) return undefined;
  // Journal operations contain canonical full Staff rows. Directory-scoped
  // clients intentionally skip master.staff deltas so a later HR edit cannot
  // replace a projected row with salary/bank/auth data. Route/module reloads
  // refresh the projected directory from the canonical Staff table.
  if (workspaceStaffProjectionParam(database) === "directory") {
    collections.delete("master.staff");
  }
  return [...collections].sort().join(",");
}

/** Converts a delta response into the same operation format used by local commits. */
export function workspaceDeltaOperations(
  delta: WorkspaceDeltaPayload,
  loadedCollections: Set<string> | null = null,
): WorkspaceOperation[] {
  const collections = new Set([
    ...Object.keys(delta.changedRows || {}),
    ...Object.keys(delta.deletedRowIds || {}),
  ]);
  const operations: WorkspaceOperation[] = [];
  for (const collection of collections) {
    if (!knownWorkspaceCollection(collection)) continue;
    if (loadedCollections && !loadedCollections.has(collection)) continue;
    const upsert = Array.isArray(delta.changedRows?.[collection])
      ? delta.changedRows[collection]
      : [];
    const deleteIds = Array.isArray(delta.deletedRowIds?.[collection])
      ? delta.deletedRowIds[collection]
      : [];
    if (upsert.length || deleteIds.length) {
      operations.push({ collection, upsert, deleteIds });
    }
  }
  return operations;
}

export function applyWorkspaceDelta(
  database: RDashDatabase,
  delta: WorkspaceDeltaPayload,
): { database: RDashDatabase; operations: WorkspaceOperation[] } {
  const operations = workspaceDeltaOperations(delta, loadedWorkspaceCollections(database));
  return {
    database: operations.length ? applyWorkspaceOperations(database, operations) : database,
    operations,
  };
}

export function deletedDeltaVersionKeys(delta: WorkspaceDeltaPayload): string[] {
  const keys: string[] = [];
  for (const [collection, ids] of Object.entries(delta.deletedRowIds || {})) {
    if (!knownWorkspaceCollection(collection) || !Array.isArray(ids)) continue;
    for (const rawId of ids) {
      const id = String(rawId || "").trim();
      if (!id) continue;
      keys.push(`${collection}:${id}`, id);
    }
  }
  return keys;
}

export function expandedDeltaRowVersions(delta: WorkspaceDeltaPayload): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, rawVersion] of Object.entries(delta.rowVersions || {})) {
    const version = Number(rawVersion);
    if (!key.includes(":") || !Number.isInteger(version) || version < 0) continue;
    result[key] = version;
    const id = key.slice(key.indexOf(":") + 1);
    if (id) result[id] = version;
  }
  return result;
}
