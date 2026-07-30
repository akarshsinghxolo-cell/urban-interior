"use client";

import * as React from "react";
import type {
  RowScopedWorkspaceEntityKind,
  WorkspaceReadCoverage,
} from "./workspace-read-scope";
import { workspaceReadScopeFromMode } from "./workspace-read-scope";

export interface WorkspaceReadStateSnapshot extends WorkspaceReadCoverage {
  queryCount?: number;
  rowCount?: number;
  collectionCount?: number;
  scopeCollectionCount?: number;
}

const INITIAL_SNAPSHOT: WorkspaceReadStateSnapshot = Object.freeze({
  scope: "bootstrap",
  mode: "unknown",
  strategy: "unknown",
});

let snapshot: WorkspaceReadStateSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

function rowEntityKind(value: string | null): RowScopedWorkspaceEntityKind | undefined {
  return value === "customer" || value === "site" ? value : undefined;
}

function optionalNonNegativeNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function boundedHeader(value: string | null, maxLength = 200): string | undefined {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function emit(next: WorkspaceReadStateSnapshot): void {
  if (
    snapshot.scope === next.scope &&
    snapshot.mode === next.mode &&
    snapshot.strategy === next.strategy &&
    snapshot.moduleId === next.moduleId &&
    snapshot.queryCount === next.queryCount &&
    snapshot.rowCount === next.rowCount &&
    snapshot.collectionCount === next.collectionCount &&
    snapshot.scopeCollectionCount === next.scopeCollectionCount &&
    snapshot.entityKind === next.entityKind &&
    snapshot.entityId === next.entityId
  ) return;

  snapshot = Object.freeze({ ...next });
  for (const listener of [...listeners]) listener();
}

export const workspaceReadState = {
  getSnapshot(): WorkspaceReadStateSnapshot {
    return snapshot;
  },
  getServerSnapshot(): WorkspaceReadStateSnapshot {
    return INITIAL_SNAPSHOT;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reset(): void {
    emit(INITIAL_SNAPSHOT);
  },
  recordResponse(response: Response): boolean {
    if (!response.ok) return false;

    const mode = boundedHeader(response.headers.get("X-UC-Read-Mode")) || "unknown";
    const strategyHeader = boundedHeader(response.headers.get("X-UC-Read-Strategy"), 32);
    const strategy = strategyHeader === "module" || strategyHeader === "scope"
      ? strategyHeader
      : mode === "bootstrap"
        ? "bootstrap"
        : mode === "full"
          ? "full"
          : mode.endsWith("-row")
            ? "row"
            : "unknown";

    emit({
      scope: workspaceReadScopeFromMode(mode),
      mode,
      strategy,
      moduleId: boundedHeader(response.headers.get("X-UC-Read-Module")),
      queryCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Queries")),
      rowCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Rows")),
      collectionCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Collections")),
      scopeCollectionCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Scope-Collections")),
      entityKind: rowEntityKind(response.headers.get("X-UC-Read-Entity-Kind")),
      entityId: boundedHeader(response.headers.get("X-UC-Read-Entity-Id")),
    });
    return true;
  },
};

export function useWorkspaceReadState(): WorkspaceReadStateSnapshot {
  return React.useSyncExternalStore(
    workspaceReadState.subscribe,
    workspaceReadState.getSnapshot,
    workspaceReadState.getServerSnapshot,
  );
}
