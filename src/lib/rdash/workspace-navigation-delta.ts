"use client";

import {
  applyWorkspaceDelta,
  deletedDeltaVersionKeys,
  expandedDeltaRowVersions,
  workspaceCollectionFilterParam,
  type WorkspaceDeltaPayload,
} from "./workspace-delta";
import {
  mergeWorkspaceRowVersions,
} from "./workspace-row-version-state";
import type { WorkspaceReadCacheEntry } from "./workspace-read-cache";

const MAX_DELTA_PAGES_PER_NAVIGATION = 5;

export type WorkspaceNavigationRevalidationResult =
  | { kind: "fresh"; entry: WorkspaceReadCacheEntry; changed: boolean }
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
  return null;
}

export async function revalidateWorkspaceReadCacheEntry(
  input: WorkspaceReadCacheEntry,
  signal: AbortSignal,
): Promise<WorkspaceNavigationRevalidationResult> {
  // Customer/Site row snapshots are relationship-selected graphs, not complete
  // collections. A collection-wide delta could expose unrelated rows before the
  // client discovers that the graph must be rebuilt, so row graphs always go
  // back through the authenticated entity-scoped reader.
  if (input.readState.strategy === "row") {
    return { kind: "reload", reason: "row_scope_requires_server_graph" };
  }

  let entry: WorkspaceReadCacheEntry = {
    ...input,
    data: structuredClone(input.data),
    rowVersions: input.rowVersions ? { ...input.rowVersions } : undefined,
    readState: { ...input.readState },
  };
  let afterRevision = entry.revision;
  let changed = false;

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
        "X-UC-Delta-Module": entry.target.moduleId,
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
        : { kind: "fresh", entry, changed };
    }

    const reloadReason = requiresScopedReload(entry, delta);
    if (reloadReason) return { kind: "reload", reason: reloadReason };

    const deltaChanged = touchedCollections(delta).size > 0;
    changed = changed || deltaChanged;
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
    if (!delta.hasMore) return { kind: "fresh", entry, changed };
  }

  return { kind: "reload", reason: "delta_page_limit" };
}
