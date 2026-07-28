"use client";

import * as React from "react";
import type {
  RowScopedWorkspaceEntityKind,
  WorkspaceReadCoverage,
  WorkspaceReadScope,
} from "./workspace-read-scope";

export interface WorkspaceReadStateSnapshot extends WorkspaceReadCoverage {
  queryCount?: number;
  rowCount?: number;
}

let snapshot: WorkspaceReadStateSnapshot = { scope: "full", mode: "unknown" };
const listeners = new Set<() => void>();

function scopeFromMode(mode: string): WorkspaceReadScope {
  if (mode === "customer" || mode === "customer-row") return "customer";
  if (mode === "site" || mode === "site-row") return "site";
  return "full";
}

function rowEntityKind(value: string | null): RowScopedWorkspaceEntityKind | undefined {
  return value === "customer" || value === "site" ? value : undefined;
}

function emit(next: WorkspaceReadStateSnapshot): void {
  if (
    snapshot.scope === next.scope &&
    snapshot.mode === next.mode &&
    snapshot.queryCount === next.queryCount &&
    snapshot.rowCount === next.rowCount &&
    snapshot.entityKind === next.entityKind &&
    snapshot.entityId === next.entityId
  ) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export const workspaceReadState = {
  getSnapshot(): WorkspaceReadStateSnapshot {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  recordResponse(response: Response): void {
    const mode = response.headers.get("X-UC-Read-Mode") || "full";
    const rawQueryCount = Number(response.headers.get("X-UC-Read-Queries"));
    const rawRowCount = Number(response.headers.get("X-UC-Read-Rows"));
    emit({
      scope: scopeFromMode(mode),
      mode,
      queryCount: Number.isFinite(rawQueryCount) ? rawQueryCount : undefined,
      rowCount: Number.isFinite(rawRowCount) ? rawRowCount : undefined,
      entityKind: rowEntityKind(response.headers.get("X-UC-Read-Entity-Kind")),
      entityId: response.headers.get("X-UC-Read-Entity-Id") || undefined,
    });
  },
};

export function useWorkspaceReadState(): WorkspaceReadStateSnapshot {
  return React.useSyncExternalStore(
    workspaceReadState.subscribe,
    workspaceReadState.getSnapshot,
    workspaceReadState.getSnapshot,
  );
}
