import { getSupabaseAdminClient } from "../../supabase/server";
import type { WorkspaceDeltaPayload } from "../workspace-delta";
import { COLLECTION_TO_TABLE } from "./commit-rest";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";
export const MAX_WORKSPACE_DELTA_BATCHES = 100;

export interface WorkspaceChangeBatch {
  revision: number;
  operations: unknown;
  row_versions: unknown;
  is_baseline?: boolean;
}

type JournalOperation = {
  collection: string;
  upsert: Array<Record<string, unknown>>;
  deleteIds: string[];
};

function emptyDelta(
  afterRevision: number,
  revision: number,
  currentRevision: number,
  baselineRevision: number,
  overrides: Partial<WorkspaceDeltaPayload> = {},
): WorkspaceDeltaPayload {
  return {
    fromRevision: afterRevision,
    revision,
    currentRevision,
    baselineRevision,
    changedRows: {},
    deletedRowIds: {},
    rowVersions: {},
    collectionRevisions: {},
    hasMore: false,
    requiresFullReload: false,
    batchCount: 0,
    ...overrides,
  };
}

function normalizedOperations(value: unknown): JournalOperation[] | null {
  if (!Array.isArray(value)) return null;
  const operations: JournalOperation[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const collection = String(record.collection || "").trim();
    if (!collection || !COLLECTION_TO_TABLE[collection]) return null;
    const rawUpsert = record.upsert ?? [];
    const rawDeleteIds = record.deleteIds ?? [];
    if (!Array.isArray(rawUpsert) || !Array.isArray(rawDeleteIds)) return null;

    const upsert: Array<Record<string, unknown>> = [];
    for (const row of rawUpsert) {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const id = String((row as Record<string, unknown>).id || "").trim();
      if (!id) return null;
      upsert.push(row as Record<string, unknown>);
    }
    const deleteIds = rawDeleteIds
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    operations.push({ collection, upsert, deleteIds });
  }
  return operations;
}

function normalizedRowVersions(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const version = Number(raw);
    if (key.includes(":") && Number.isInteger(version) && version >= 0) result[key] = version;
  }
  return result;
}

/**
 * Collapses a contiguous revision journal into the latest row state per ID.
 * Each atomic commit deletes first and then upserts, so a recreated row wins
 * over a delete recorded in the same revision. When allowedCollections is set,
 * unrelated operations are validated but omitted while the delivered revision
 * still advances across every contiguous batch.
 *
 * refreshOnOmittedCollections is used for projected data that is represented in
 * a scoped snapshot but intentionally omitted from the delta payload itself. If
 * one of those collections changed, the caller must reload the projection.
 */
export function aggregateWorkspaceChangeBatches(input: {
  afterRevision: number;
  currentRevision: number;
  baselineRevision: number;
  batches: WorkspaceChangeBatch[];
  maxBatches?: number;
  allowedCollections?: ReadonlySet<string>;
  refreshOnOmittedCollections?: ReadonlySet<string>;
}): WorkspaceDeltaPayload {
  const {
    afterRevision,
    currentRevision,
    baselineRevision,
    batches,
    maxBatches = MAX_WORKSPACE_DELTA_BATCHES,
    allowedCollections,
    refreshOnOmittedCollections,
  } = input;

  if (afterRevision > currentRevision) {
    return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
      requiresFullReload: true,
      reason: "client_ahead",
    });
  }
  if (afterRevision < baselineRevision) {
    return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
      requiresFullReload: true,
      reason: "revision_too_old",
    });
  }
  if (afterRevision === currentRevision) {
    return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision);
  }

  const ordered = batches
    .filter((batch) => !batch.is_baseline && batch.revision > afterRevision && batch.revision <= currentRevision)
    .sort((a, b) => a.revision - b.revision);
  if (!ordered.length || ordered[0].revision !== afterRevision + 1) {
    return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
      requiresFullReload: true,
      reason: "journal_gap",
    });
  }

  const available = ordered.slice(0, Math.max(1, maxBatches));
  for (let index = 1; index < available.length; index += 1) {
    if (available[index].revision !== available[index - 1].revision + 1) {
      return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
        requiresFullReload: true,
        reason: "journal_gap",
      });
    }
  }

  const changed = new Map<string, Map<string, Record<string, unknown>>>();
  const deleted = new Map<string, Set<string>>();
  const rowVersions: Record<string, number> = {};
  const collectionRevisions: Record<string, number> = {};

  for (const batch of available) {
    const parsedOperations = normalizedOperations(batch.operations);
    if (!parsedOperations) {
      return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
        requiresFullReload: true,
        reason: "invalid_journal",
      });
    }
    if (allowedCollections && refreshOnOmittedCollections?.size) {
      const projectedCollectionChanged = parsedOperations.some((operation) =>
        !allowedCollections.has(operation.collection) &&
        refreshOnOmittedCollections.has(operation.collection) &&
        (operation.upsert.length > 0 || operation.deleteIds.length > 0),
      );
      if (projectedCollectionChanged) {
        return emptyDelta(afterRevision, currentRevision, currentRevision, baselineRevision, {
          requiresFullReload: true,
          reason: "projection_changed",
        });
      }
    }
    const operations = allowedCollections
      ? parsedOperations.filter((operation) => allowedCollections.has(operation.collection))
      : parsedOperations;
    const batchVersions = normalizedRowVersions(batch.row_versions);

    // PostgreSQL deletes every collection in reverse dependency order first.
    for (const operation of operations) {
      const rows = changed.get(operation.collection) || new Map<string, Record<string, unknown>>();
      const deletedIds = deleted.get(operation.collection) || new Set<string>();
      for (const id of operation.deleteIds) {
        rows.delete(id);
        deletedIds.add(id);
        delete rowVersions[`${operation.collection}:${id}`];
      }
      changed.set(operation.collection, rows);
      deleted.set(operation.collection, deletedIds);
      collectionRevisions[operation.collection] = batch.revision;
    }

    // Then every upsert is applied, including rows recreated in this revision.
    for (const operation of operations) {
      const rows = changed.get(operation.collection) || new Map<string, Record<string, unknown>>();
      const deletedIds = deleted.get(operation.collection) || new Set<string>();
      for (const row of operation.upsert) {
        const id = String(row.id).trim();
        rows.set(id, row);
        deletedIds.delete(id);
        const versionKey = `${operation.collection}:${id}`;
        if (typeof batchVersions[versionKey] === "number") {
          rowVersions[versionKey] = batchVersions[versionKey];
        }
      }
      changed.set(operation.collection, rows);
      deleted.set(operation.collection, deletedIds);
      collectionRevisions[operation.collection] = batch.revision;
    }
  }

  const changedRows: WorkspaceDeltaPayload["changedRows"] = {};
  const deletedRowIds: WorkspaceDeltaPayload["deletedRowIds"] = {};
  for (const [collection, rows] of changed) {
    if (rows.size) changedRows[collection] = [...rows.values()];
  }
  for (const [collection, ids] of deleted) {
    if (ids.size) deletedRowIds[collection] = [...ids];
  }

  const revision = available[available.length - 1].revision;
  return {
    fromRevision: afterRevision,
    revision,
    currentRevision,
    baselineRevision,
    changedRows,
    deletedRowIds,
    rowVersions,
    collectionRevisions,
    hasMore: revision < currentRevision,
    requiresFullReload: false,
    batchCount: available.length,
  };
}

export async function getWorkspaceChanges(
  afterRevision: number,
  allowedCollections?: ReadonlySet<string>,
  refreshOnOmittedCollections?: ReadonlySet<string>,
): Promise<WorkspaceDeltaPayload> {
  const startedAt = performance.now();
  const admin = getSupabaseAdminClient();

  const [revisionResult, baselineResult] = await Promise.all([
    admin
      .from("entity_workspace_revision")
      .select("revision")
      .eq("id", workspaceId)
      .maybeSingle(),
    admin
      .from("entity_workspace_change_batches")
      .select("revision")
      .eq("workspace_id", workspaceId)
      .eq("is_baseline", true)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (revisionResult.error) {
    throw new Error(`Could not read workspace revision: ${revisionResult.error.message}`);
  }
  if (baselineResult.error) {
    throw new Error(`Could not read workspace journal baseline: ${baselineResult.error.message}`);
  }

  const currentRevision = Number(revisionResult.data?.revision || 0);
  const baselineRevision = Number(baselineResult.data?.revision || 0);
  if (afterRevision >= currentRevision || afterRevision < baselineRevision) {
    const payload = aggregateWorkspaceChangeBatches({
      afterRevision,
      currentRevision,
      baselineRevision,
      batches: [],
      allowedCollections,
      refreshOnOmittedCollections,
    });
    return {
      ...payload,
      queryCount: 2,
      loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  }

  const { data, error } = await admin
    .from("entity_workspace_change_batches")
    .select("revision,operations,row_versions,is_baseline")
    .eq("workspace_id", workspaceId)
    .eq("is_baseline", false)
    .gt("revision", afterRevision)
    .lte("revision", currentRevision)
    .order("revision", { ascending: true })
    .limit(MAX_WORKSPACE_DELTA_BATCHES + 1);
  if (error) throw new Error(`Could not read workspace changes: ${error.message}`);

  const payload = aggregateWorkspaceChangeBatches({
    afterRevision,
    currentRevision,
    baselineRevision,
    batches: (data || []) as WorkspaceChangeBatch[],
    allowedCollections,
    refreshOnOmittedCollections,
  });
  return {
    ...payload,
    queryCount: 3,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
