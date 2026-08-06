"use client";

import * as React from "react";
import type {
  RowScopedWorkspaceEntityKind,
  WorkspaceReadCoverage,
  WorkspaceReadTarget,
} from "./workspace-read-scope";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeFromMode,
} from "./workspace-read-scope";

export type WorkspaceDataLoadStatus =
  | "not_loaded"
  | "loading"
  | "loaded"
  | "error";

export interface WorkspaceTargetLoadState {
  status: WorkspaceDataLoadStatus;
  error?: string;
}

export interface WorkspaceReadStateSnapshot extends WorkspaceReadCoverage {
  queryCount?: number;
  rowCount?: number;
  collectionCount?: number;
  scopeCollectionCount?: number;
  requestStatus: "idle" | "loading" | "error";
  requestTargetKey?: string;
  requestError?: string;
}

const INITIAL_SNAPSHOT: WorkspaceReadStateSnapshot = Object.freeze({
  scope: "bootstrap",
  mode: "unknown",
  strategy: "unknown",
  requestStatus: "idle",
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

/** Stable identity for one module/row read destination. */
export function workspaceReadTargetKey(target: WorkspaceReadTarget): string {
  return [
    target.scope,
    target.moduleId,
    target.entity?.kind || "module",
    target.entity?.id || "",
  ].join(":");
}

/**
 * Converts read coverage + the current request lifecycle into a semantic UI
 * state. An empty array is meaningful only when this returns `loaded`.
 */
export function workspaceReadLoadStateForTarget(
  current: WorkspaceReadStateSnapshot,
  target: WorkspaceReadTarget,
): WorkspaceTargetLoadState {
  if (workspaceReadCoverageIsCompatible(current, target)) {
    return { status: "loaded" };
  }

  if (current.requestTargetKey === workspaceReadTargetKey(target)) {
    if (current.requestStatus === "loading") return { status: "loading" };
    if (current.requestStatus === "error") {
      return {
        status: "error",
        error: current.requestError || "The requested workspace data could not be loaded.",
      };
    }
  }

  return { status: "not_loaded" };
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
    snapshot.entityId === next.entityId &&
    snapshot.requestStatus === next.requestStatus &&
    snapshot.requestTargetKey === next.requestTargetKey &&
    snapshot.requestError === next.requestError
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
  beginRequest(target: WorkspaceReadTarget): void {
    emit({
      ...snapshot,
      requestStatus: "loading",
      requestTargetKey: workspaceReadTargetKey(target),
      requestError: undefined,
    });
  },
  failRequest(target: WorkspaceReadTarget, error: string): void {
    const targetKey = workspaceReadTargetKey(target);
    if (snapshot.requestTargetKey !== targetKey) return;
    emit({
      ...snapshot,
      requestStatus: "error",
      requestTargetKey: targetKey,
      requestError: error,
    });
  },
  clearRequest(target: WorkspaceReadTarget): void {
    if (snapshot.requestTargetKey !== workspaceReadTargetKey(target)) return;
    emit({
      ...snapshot,
      requestStatus: "idle",
      requestTargetKey: undefined,
      requestError: undefined,
    });
  },
  restoreCached(target: WorkspaceReadTarget, cached: WorkspaceReadStateSnapshot): void {
    emit({
      ...cached,
      moduleId: cached.moduleId || target.moduleId,
      requestStatus: "idle",
      requestTargetKey: undefined,
      requestError: undefined,
    });
  },
  recordResponse(response: Response, target?: WorkspaceReadTarget): boolean {
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
    const nextScope = workspaceReadScopeFromMode(mode);
    const nextModuleId = boundedHeader(response.headers.get("X-UC-Read-Module"));
    const nextEntityKind = rowEntityKind(response.headers.get("X-UC-Read-Entity-Kind"));
    const nextEntityId = boundedHeader(response.headers.get("X-UC-Read-Entity-Id"));
    const completedTargetKey = target
      ? workspaceReadTargetKey(target)
      : nextModuleId
        ? [nextScope, nextModuleId, nextEntityKind || "module", nextEntityId || ""].join(":")
        : undefined;
    const completedCurrentRequest = Boolean(
      completedTargetKey && snapshot.requestTargetKey === completedTargetKey,
    );

    emit({
      scope: nextScope,
      mode,
      strategy,
      moduleId: nextModuleId,
      queryCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Queries")),
      rowCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Rows")),
      collectionCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Collections")),
      scopeCollectionCount: optionalNonNegativeNumber(response.headers.get("X-UC-Read-Scope-Collections")),
      entityKind: nextEntityKind,
      entityId: nextEntityId,
      requestStatus: completedCurrentRequest ? "idle" : snapshot.requestStatus,
      requestTargetKey: completedCurrentRequest ? undefined : snapshot.requestTargetKey,
      requestError: completedCurrentRequest ? undefined : snapshot.requestError,
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
