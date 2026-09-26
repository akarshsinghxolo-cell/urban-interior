/**
 * Supabase REST workspace data layer.
 *
 * Full reads remain available for reset/compatibility paths. Normal workspace
 * navigation uses bounded or row-scoped reads so the browser never needs a
 * growing copy of every workspace table.
 *
 * Writes are delegated to the commit_workspace_operations PostgreSQL function
 * so one logical workspace save is atomic and workspace/row CAS checks occur
 * in the same transaction.
 */
import { getSupabaseAdminClient } from "../../supabase/server";
import { topLevelCollections, masterCollections, type WorkspaceOperation } from "../workspace-operations";
import type { RDashDatabase } from "../types";
import { WORK_CATALOG_VERSION } from "../work-category-master";
import type { WorkspacePagination } from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";
const DEFAULT_COLLECTION_LIMITS: Record<string, number> = {
  auditLog: 100,
  executionLogs: 200,
  commSends: 100,
  "master.vendorRateHistories": 100,
};

// Storage names come from the same allowlist used by workspace diffs.
export const COLLECTION_TO_TABLE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...topLevelCollections.map(String),
    ...masterCollections.map((key) => `master.${key}`),
  ].map((collection) => [collection, `entity_${collection.replace(".", "_")}`])),
);

function tableFor(collection: string): string | null {
  return COLLECTION_TO_TABLE[collection] || null;
}

export type RestEntityRow = {
  id: string;
  revision?: number;
  data: unknown;
};

type RestWorkspaceReadPlan = {
  fullCollections?: string[];
  rowsByCollection?: Record<string, string[]>;
  limitsByCollection?: Record<string, number>;
  offsetsByCollection?: Record<string, number>;
};

type RestWorkspaceSubset = {
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions: Record<string, number>;
  queryCount: number;
  pagination?: WorkspacePagination;
};

export function emptyWorkspaceData(): RDashDatabase {
  const data: Record<string, unknown> = { master: {} };
  const master = data.master as Record<string, unknown>;
  for (const collection of Object.keys(COLLECTION_TO_TABLE)) {
    if (collection.startsWith("master.")) {
      master[collection.slice("master.".length)] = [];
    } else {
      data[collection] = [];
    }
  }
  data._workspace_mode = "rest";
  data._data_source = "supabase-rest";
  return data as unknown as RDashDatabase;
}

function decodeRow(row: RestEntityRow): Record<string, unknown> | null {
  try {
    const value = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function putCollectionRows(
  data: RDashDatabase,
  rowVersions: Record<string, number>,
  collection: string,
  rows: RestEntityRow[],
): void {
  const decoded = rows.map((row) => {
    if (typeof row.revision === "number") {
      rowVersions[row.id] = row.revision;
      rowVersions[`${collection}:${row.id}`] = row.revision;
    }
    return decodeRow(row);
  }).filter(Boolean) as Array<Record<string, unknown>>;

  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    (data.master as unknown as Record<string, unknown>)[key] = decoded;
  } else {
    (data as unknown as Record<string, unknown>)[collection] = decoded;
  }
}

function normalizedLimit(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(500, Math.floor(parsed));
}

function normalizedOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(1_000_000, Math.floor(parsed));
}

export async function readRevision(): Promise<{ revision: number; updatedAt: string }> {
  const admin = getSupabaseAdminClient();
  const { data: wsRevRow, error } = await admin
    .from("entity_workspace_revision")
    .select("revision,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not read workspace revision: ${error.message}`);
  return {
    revision: typeof wsRevRow?.revision === "number" ? wsRevRow.revision : 0,
    updatedAt: (wsRevRow?.updated_at as string) || new Date().toISOString(),
  };
}

export async function getRestWorkspaceSubset(plan: RestWorkspaceReadPlan): Promise<RestWorkspaceSubset> {
  const admin = getSupabaseAdminClient();
  const revisionState = await readRevision();
  const fullCollections = new Set((plan.fullCollections || []).filter(Boolean));
  const rowsByCollection = new Map<string, string[]>();

  for (const [collection, rawIds] of Object.entries(plan.rowsByCollection || {})) {
    if (fullCollections.has(collection)) continue;
    const ids = Array.from(new Set((rawIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (ids.length) rowsByCollection.set(collection, ids);
  }

  const requestedCollections = Array.from(new Set([
    ...fullCollections,
    ...rowsByCollection.keys(),
  ]));

  const results = await Promise.all(requestedCollections.map(async (collection) => {
    const table = tableFor(collection);
    if (!table) throw new Error(`INVALID:Unknown workspace collection ${collection}.`);

    const isFullCollection = fullCollections.has(collection);
    const configuredLimit = isFullCollection
      ? normalizedLimit(plan.limitsByCollection?.[collection] ?? DEFAULT_COLLECTION_LIMITS[collection])
      : undefined;
    const offset = configuredLimit ? normalizedOffset(plan.offsetsByCollection?.[collection]) : 0;

    let query = admin.from(table)
      .select("id,revision,data")
      .eq("workspace_id", workspaceId);

    if (!isFullCollection) {
      query = query.in("id", rowsByCollection.get(collection) || []);
    } else if (configuredLimit) {
      // Fetch one extra row instead of issuing a COUNT query. That tells the
      // client whether a next page exists while keeping database/egress work bounded.
      query = query
        .order("revision", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + configuredLimit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Could not read targeted collection ${collection}: ${error.message}`);

    const rawRows = (data || []) as RestEntityRow[];
    const rows = configuredLimit ? rawRows.slice(0, configuredLimit) : rawRows;
    return {
      collection,
      rows,
      pagination: configuredLimit
        ? {
            offset,
            limit: configuredLimit,
            returned: rows.length,
            hasMore: rawRows.length > configuredLimit,
            ...(rawRows.length > configuredLimit ? { nextOffset: offset + rows.length } : {}),
          }
        : undefined,
    };
  }));

  const data = emptyWorkspaceData();
  const master = data.master;
  master.catalog_version = WORK_CATALOG_VERSION;
  const rowVersions: Record<string, number> = {};
  const pagination: WorkspacePagination = {};
  for (const result of results) {
    putCollectionRows(data, rowVersions, result.collection, result.rows);
    if (result.pagination) pagination[result.collection] = result.pagination;
  }

  return {
    revision: revisionState.revision,
    updatedAt: revisionState.updatedAt,
    data,
    rowVersions,
    queryCount: 1 + requestedCollections.length,
    ...(Object.keys(pagination).length ? { pagination } : {}),
  };
}

export async function getRestWorkspace(): Promise<{
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions: Record<string, number>;
}> {
  const admin = getSupabaseAdminClient();
  const revisionState = await readRevision();

  const readCollection = async (collection: string): Promise<{ collection: string; rows: RestEntityRow[] }> => {
    const table = tableFor(collection);
    if (!table) return { collection, rows: [] };
    const { data, error } = await admin
      .from(table)
      .select("id,revision,data")
      .eq("workspace_id", workspaceId);
    if (error) {
      throw new Error(`Could not read workspace collection ${collection}: ${error.message}`);
    }
    return { collection, rows: (data || []) as RestEntityRow[] };
  };

  const results = await Promise.all(Object.keys(COLLECTION_TO_TABLE).map(readCollection));
  const data = emptyWorkspaceData();
  const master = data.master;
  master.catalog_version = WORK_CATALOG_VERSION;
  const rowVersions: Record<string, number> = {};
  for (const result of results) {
    putCollectionRows(data, rowVersions, result.collection, result.rows);
  }

  let normalizedData: RDashDatabase;
  try {
    const { prepareWorkspaceData } = await import("../work-category-master");
    const { attachCustomerLabels } = await import("../customer");
    normalizedData = attachCustomerLabels(prepareWorkspaceData(data as Partial<RDashDatabase>));
  } catch (error) {
    console.error("[getRestWorkspace] prepareWorkspaceData failed, returning raw data:", error);
    normalizedData = data;
  }

  return {
    revision: revisionState.revision,
    data: normalizedData,
    updatedAt: revisionState.updatedAt,
    rowVersions,
  };
}

interface AtomicCommitResult {
  upserted: number;
  deleted: number;
  conflicts: number;
  bumpedRowVersions: Record<string, number>;
  newRevision: number;
}

export async function commitRestOperations(
  operations: WorkspaceOperation[],
  expectedWorkspaceRevision: number,
  expectedRowVersions: Record<string, number> = {},
): Promise<AtomicCommitResult> {
  const mappedOperations = operations.map((operation) => {
    const table = tableFor(operation.collection);
    if (!table) throw new Error(`INVALID:Unknown workspace collection ${operation.collection}.`);
    return {
      collection: operation.collection,
      table,
      upsert: operation.upsert || [],
      deleteIds: operation.deleteIds || [],
    };
  });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("commit_workspace_operations", {
    p_workspace_id: workspaceId,
    p_expected_workspace_revision: expectedWorkspaceRevision,
    p_operations: mappedOperations,
    p_expected_row_versions: expectedRowVersions,
  });

  if (error) {
    const message = `${error.message || ""} ${error.details || ""}`;
    if (message.includes("WORKSPACE_CONFLICT") || message.includes("ROW_CONFLICT")) {
      throw new Error("CONFLICT");
    }
    if (message.includes("INVALID_")) {
      throw new Error(`INVALID:${error.message}`);
    }
    throw new Error(`Workspace transaction failed: ${error.message}`);
  }

  const result = (data || {}) as Partial<AtomicCommitResult>;
  if (typeof result.newRevision !== "number") {
    throw new Error("Workspace transaction returned no revision.");
  }

  return {
    upserted: result.upserted || 0,
    deleted: result.deleted || 0,
    conflicts: result.conflicts || 0,
    bumpedRowVersions: result.bumpedRowVersions || {},
    newRevision: result.newRevision,
  };
}

export async function resetRestWorkspace(): Promise<{
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
}> {
  // RESET is a normal canonical workspace transaction with a larger operation
  // set. Reading first and committing against that exact revision means the
  // existing PostgreSQL revision-row lock serializes RESET with every normal
  // commit. If anything changes while the snapshot is being assembled, the
  // atomic commit fails with CONFLICT instead of producing a mixed workspace.
  const current = await getRestWorkspace();
  const { buildSeedDatabase } = await import("../seed");
  const { diffWorkspaceOperations } = await import("../workspace-operations");
  const seedData = buildSeedDatabase() as RDashDatabase;

  // Reset data must already use the one canonical Customer conversation ID.
  // Doing this before the atomic diff avoids a second post-reset transaction.
  const customerIds = new Set(seedData.customers.map((customer) => customer.id));
  seedData.threads = seedData.threads.map((thread) => (
    thread.kind === "generic" && customerIds.has(thread.record_id)
      ? { ...thread, record_id: `customer-conversation:${thread.record_id}` }
      : thread
  ));

  const operations = diffWorkspaceOperations(current.data, seedData);
  if (!operations.length) return current;

  await commitRestOperations(operations, current.revision, {});
  return getRestWorkspace();
}

