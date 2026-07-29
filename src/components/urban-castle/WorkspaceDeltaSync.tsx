"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { clearSessionToken } from "@/lib/rdash/client-auth";
import { useRDashStore } from "@/lib/rdash/store";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import {
  applyWorkspaceDelta,
  deletedDeltaVersionKeys,
  expandedDeltaRowVersions,
  workspaceCollectionFilterParam,
  type WorkspaceDeltaPayload,
} from "@/lib/rdash/workspace-delta";
import { workspaceDeltaSyncIsSafe } from "@/lib/rdash/workspace-delta-sync-policy";
import {
  mergeWorkspaceRowVersions,
  workspaceRowVersionState,
} from "@/lib/rdash/workspace-row-version-state";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";
import { workspaceReadEndpointForTarget } from "@/lib/rdash/workspace-read-client";
import { workspaceReadState } from "@/lib/rdash/workspace-read-state";
import {
  restoreWorkspaceOutboxOverlay,
  workspaceOutboxStore,
} from "@/lib/uploads/workspace-outbox";

const DELTA_SYNC_ENABLED = process.env.NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED !== "0";
const DELTA_POLL_INTERVAL_MS = 5 * 60_000;
const DELTA_EVENT_DEBOUNCE_MS = 750;
const MAX_DELTA_PAGES_PER_RUN = 5;

interface WorkspaceReadPayload {
  revision?: number;
  data?: import("@/lib/rdash/types").RDashDatabase;
  rowVersions?: Record<string, number>;
  aggregateRevisions?: Record<string, number>;
  user?: import("@/lib/rdash/store").AuthenticatedWorkspaceUser;
  error?: string;
}

function currentRunIsSafe(pathname: string): boolean {
  const state = useRDashStore.getState();
  const outbox = workspaceOutboxStore.getSnapshot();
  const readCoverage = workspaceReadState.getSnapshot();
  return workspaceDeltaSyncIsSafe({
    authenticated: Boolean(state.authUser),
    workspaceSyncStatus: state.workspaceSyncStatus,
    outboxReady: outbox.ready,
    outboxCount: outbox.items.length,
    dirtyFormCount: dirtyFormRegistry.getSnapshot().dirtyForms.length,
    routeCovered: workspaceReadCoverageIsCompatible(
      readCoverage,
      workspaceReadTargetForPath(pathname),
    ),
    visible: document.visibilityState === "visible",
    online: navigator.onLine,
  });
}

function isValidDelta(delta: WorkspaceDeltaPayload, afterRevision: number): boolean {
  return Number.isInteger(delta.fromRevision) &&
    Number.isInteger(delta.revision) &&
    Number.isInteger(delta.currentRevision) &&
    delta.fromRevision === afterRevision &&
    delta.revision >= afterRevision &&
    delta.currentRevision >= delta.revision &&
    typeof delta.hasMore === "boolean";
}

async function redirectToSignin(): Promise<never> {
  workspaceReadState.reset();
  clearSessionToken();
  window.location.replace("/signin");
  throw new DOMException("Session expired", "AbortError");
}

async function reloadCurrentWorkspace(
  pathname: string,
  signal: AbortSignal,
): Promise<boolean> {
  const target = workspaceReadTargetForPath(pathname);
  const response = await fetch(workspaceReadEndpointForTarget(target), {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      "X-UC-Workspace-Path": pathname,
      "X-UC-Workspace-Module": target.moduleId,
      "X-UC-Delta-Fallback": "1",
    },
  });
  if (response.status === 401) await redirectToSignin();

  const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
  const hydrationUser = payload.user || useRDashStore.getState().authUser;
  if (!response.ok || !payload.data || typeof payload.revision !== "number" || !hydrationUser) {
    return false;
  }

  const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
  if (signal.aborted || !currentRunIsSafe(pathname)) return false;
  useRDashStore.getState().hydrateSecureWorkspace({
    db: overlay.db,
    revision: payload.revision,
    user: hydrationUser,
    aggregateRevisions: payload.aggregateRevisions,
    rowVersions: payload.rowVersions,
  });
  workspaceReadState.recordResponse(response);
  if (overlay.pendingCount) {
    useRDashStore.setState({
      workspaceSyncStatus: "error",
      workspaceSyncError: overlay.hasConflict
        ? "Locally saved changes need review."
        : "Locally saved changes are waiting to synchronize.",
    });
  }
  return true;
}

/**
 * Pulls revision journal changes while the current scoped snapshot is idle.
 * Dirty forms, local outbox items and active saves always take precedence.
 */
export function WorkspaceDeltaSync(): null {
  const pathname = usePathname();
  const authUser = useRDashStore((state) => state.authUser);

  React.useEffect(() => {
    if (!DELTA_SYNC_ENABLED || !authUser) return;

    let disposed = false;
    let inFlight = false;
    let rerunRequested = false;
    let activeController: AbortController | null = null;
    let rerunTimer: number | null = null;
    let eventTimer: number | null = null;

    const scheduleRerun = () => {
      if (disposed || rerunTimer !== null) return;
      rerunTimer = window.setTimeout(() => {
        rerunTimer = null;
        void run();
      }, 1_000);
    };

    async function run(): Promise<void> {
      if (disposed || !currentRunIsSafe(pathname)) return;
      if (inFlight) {
        rerunRequested = true;
        return;
      }

      const controller = new AbortController();
      activeController?.abort();
      activeController = controller;
      inFlight = true;
      let advanced = false;

      try {
        await useRDashStore.getState().awaitServerSync();
        if (disposed || controller.signal.aborted || !currentRunIsSafe(pathname)) return;

        let afterRevision = useRDashStore.getState().serverRevision;
        if (!Number.isInteger(afterRevision) || afterRevision < 0) {
          if (!await reloadCurrentWorkspace(pathname, controller.signal)) {
            throw new Error("Workspace revision was invalid and reload failed.");
          }
          return;
        }

        for (let page = 0; page < MAX_DELTA_PAGES_PER_RUN; page += 1) {
          if (disposed || controller.signal.aborted || !currentRunIsSafe(pathname)) return;
          const state = useRDashStore.getState();
          if (state.serverRevision !== afterRevision || !state.authUser) return;

          const params = new URLSearchParams({ afterRevision: String(afterRevision) });
          const collections = workspaceCollectionFilterParam(state.db);
          if (collections) params.set("collections", collections);
          const response = await fetch(`/api/changes?${params.toString()}`, {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "X-UC-Delta-Client": "workspace-shell",
            },
          });
          if (response.status === 401) await redirectToSignin();
          if (!response.ok) throw new Error(`Delta request failed with ${response.status}.`);

          const delta = await response.json() as WorkspaceDeltaPayload;
          if (delta.requiresFullReload || !isValidDelta(delta, afterRevision)) {
            if (!await reloadCurrentWorkspace(pathname, controller.signal)) {
              throw new Error("Delta recovery reload failed.");
            }
            return;
          }
          if (delta.revision === afterRevision) {
            if (delta.hasMore && !await reloadCurrentWorkspace(pathname, controller.signal)) {
              throw new Error("Delta journal did not advance and recovery reload failed.");
            }
            return;
          }

          if (disposed || controller.signal.aborted || !currentRunIsSafe(pathname)) return;
          const latest = useRDashStore.getState();
          if (latest.serverRevision !== afterRevision || !latest.authUser) return;

          const applied = applyWorkspaceDelta(latest.db, delta);
          const mergedRowVersions = mergeWorkspaceRowVersions(
            workspaceRowVersionState.getSnapshot(),
            expandedDeltaRowVersions(delta),
            deletedDeltaVersionKeys(delta),
          );
          latest.hydrateSecureWorkspace({
            db: applied.database,
            revision: delta.revision,
            user: latest.authUser,
            rowVersions: mergedRowVersions,
          });
          afterRevision = delta.revision;
          advanced = true;
          if (!delta.hasMore) return;
        }
        if (advanced) rerunRequested = true;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[workspace-delta] synchronization deferred:", error);
        }
      } finally {
        if (activeController === controller) activeController = null;
        inFlight = false;
        if (!disposed && rerunRequested) {
          rerunRequested = false;
          scheduleRerun();
        }
      }
    }

    const scheduleRun = () => {
      if (eventTimer !== null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => {
        eventTimer = null;
        void run();
      }, DELTA_EVENT_DEBOUNCE_MS);
    };
    const initialTimer = window.setTimeout(() => void run(), 3_000);
    const interval = window.setInterval(() => void run(), DELTA_POLL_INTERVAL_MS);
    const onFocus = () => scheduleRun();
    const onOnline = () => scheduleRun();
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRun();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      activeController?.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      if (eventTimer !== null) window.clearTimeout(eventTimer);
      if (rerunTimer !== null) window.clearTimeout(rerunTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authUser, pathname]);

  return null;
}
