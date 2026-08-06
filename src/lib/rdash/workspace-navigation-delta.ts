"use client";

import {
  applyWorkspaceDelta,
  deletedDeltaVersionKeys,
  expandedDeltaRowVersions,
  workspaceCollectionFilterParam,
  WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS,
  type WorkspaceDeltaPayload,
} from "./workspace-delta";
import {
  mergeWorkspaceRowVersions,
} from "./workspace-row-version-state";
import type { WorkspaceReadCacheEntry } from "./workspace-read-cache";

const MAX_DELTA_PAGES_PER_NAVIGATION = 5;
const ROW_SAFE_COLLECTIONS = new Set<string>(WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS);

export type WorkspaceNavigationRevalidationResult =
  | { kind: "fresh"; entry: WorkspaceReadCacheEntry }
  | { kind: "reload"; reason: string }
  | { kind: "unauthorized" };

function isValidDelta(delta: WorkspaceDeltaPayload, afterRevision: number): boolean {
  return Number.isInteger(delta.fromRevision) &&
    Number.isInteger(delta.revision) &&
    Number.isInteger(delta.currentRevision) &&
    delta.fromRevision === afterRevision &&
    delta.revision >= afterRevision &&
    delta.currentRevision >= delta.revision &&
    typeof delta.hasMore === "boolean";
}

function touchedCollections(delta: WorkspaceDeltaPayload): Set<string> {
  const touched = new Set<string>();
  for (const [collection, rows] of Object.entries(delta.changedRows || {})) {
    if (Array.isArray(rows) && rows.length) touched.add(collection);
  }
  for (const [collection, ids] of Object.entries(delta.deletedRowIds || {})) {
    if (Array.isArray(ids) && ids.length) touched.add(collection);
  }
  return touched;
}

function limitedCollections(entry: WorkspaceReadCacheEntry): Set<string> {
  const metadata = entry.data as unknown as Record<string, unknown>;
  const raw = metadata._workspace_read_limits;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Set();
  return new Set(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => Number(value) > 0)
      .map(([collection]) => collection),
  );
}

function requiresScopedReload(
  entry: WorkspaceReadCacheEntry,
  delta: WorkspaceDeltaPayload,
): string | null {
  const touched = touchedCollections(delta);
  if (!touched.size) return null;

  const limited = limitedCollections(entry);
  for (const collection of touched) {
    if (limited.has(collection)) return `limited_collection:${collection}`;
  }

  if (entry.readState.strategy === "row") {
    for (const collection of touched) {
      if (!ROW_SAFE_COLLECTIONS.has(collection)) {
        // A row-scoped Customer/Site graph is selected by relationships, not
        // just by collection. A changed row elsewhere in the same collection
        // cannot be merged safely without re-evaluating that graph server-side.
        return `row_graph_changed:${collection}`;
      }
    }
  }
  return null;
}

export async function revalidateWorkspaceReadCacheEntry(
  input: WorkspaceReadCacheEntry,
  signal: AbortSignal,
): Promise<WorkspaceNavigationRevalidationResult> {
  let entry: WorkspaceReadCacheEntry = {
    ...input,
    data: structuredClone(input.data),
    rowVersions: input.rowVersions ? { ...input.rowVersions } : undefined,
    aggregateRevisions: input.aggregateRevisions ? { ...input.aggregateRevisions } : undefined,
    readState: { ...input.readState },
  };
  let afterRevision = entry.revision;

  for (let page = 0; page < MAX_DELTA_PAGES_PER_NAVIGATION; page += 1) {
    if (signal.aborted) throw new DOMException("Navigation delta aborted", "AbortError");

    const params = new URLSearchParams({ afterRevision: String(afterRevision) });
    const collections = workspaceCollectionFilterParam(entry.data);
    if (collections) params.set("collections", collections);

    const response = await fetch(`/api/changes?${params.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        Accept: "application/json",
        "X-UC-Delta-Client": "navigation-cache",
      },
    });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) {
      throw new Error(`Navigation delta request failed with ${response.status}.`);
    }

    const delta = await response.json() as WorkspaceDeltaPayload;
    if (!isValidDelta(delta, afterRevision)) {
      return { kind: "reload", reason: "invalid_delta" };
    }
    if (delta.requiresFullReload) {
      return { kind: "reload", reason: delta.reason || "server_requested_reload" };
    }
    if (delta.revision === afterRevision) {
      return delta.hasMore
        ? { kind: "reload", reason: "delta_did_not_advance" }
        : { kind: "fresh", entry };
    }

    const reloadReason = requiresScopedReload(entry, delta);
    if (reloadReason) return { kind: "reload", reason: reloadReason };

    const applied = applyWorkspaceDelta(entry.data, delta);
    const rowVersions = mergeWorkspaceRowVersions(
      entry.rowVersions || {},
      expandedDeltaRowVersions(delta),
      deletedDeltaVersionKeys(delta),
    );
    entry = {
      ...entry,
      revision: delta.revision,
      data: applied.database,
      rowVersions,
      cachedAt: Date.now(),
    };
    afterRevision = delta.revision;
    if (!delta.hasMore) return { kind: "fresh", entry };
  }

  return { kind: "reload", reason: "delta_page_limit" };
}
