"use client";

import * as React from "react";
import type { WorkspaceReadScope } from "./workspace-read-scope";

export interface WorkspaceReadStateSnapshot {
  scope: WorkspaceReadScope;
  mode: string;
  queryCount?: number;
}

let snapshot: WorkspaceReadStateSnapshot = { scope: "full", mode: "unknown" };
const listeners = new Set<() => void>();

function scopeFromMode(mode: string): WorkspaceReadScope {
  if (mode === "customer") return "customer";
  if (mode === "site") return "site";
  return "full";
}

function emit(next: WorkspaceReadStateSnapshot): void {
  if (
    snapshot.scope === next.scope &&
    snapshot.mode === next.mode &&
    snapshot.queryCount === next.queryCount
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
    emit({
      scope: scopeFromMode(mode),
      mode,
      queryCount: Number.isFinite(rawQueryCount) ? rawQueryCount : undefined,
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
