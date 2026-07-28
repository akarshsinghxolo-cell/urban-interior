"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
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
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";
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
  user?: import("@/lib/rdash/store").AuthenticatedWorkspaceUser;
  error?: string;
}

function requestedTarget(pathname: string, activeModuleId: string) {
  const pathTarget = workspaceReadTargetForPath(pathname);
  return pathTarget.moduleId === activeModuleId
    ? pathTarget
    : workspaceReadTargetForModule(activeModuleId);
}

function currentRunIsSafe(pathname: string, activeModuleId: string): boolean {
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
      requestedTarget(pathname, activeModuleId),
    ),
    visible: document.visibilityState === "visible",
    online: navigator.onLine,
  });
}

async function reloadCurrentWorkspace(pathname: string, activeModuleId: string): Promise<boolean> {
  const response = await fetch("/api/workspace", {
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "X-UC-Workspace-Path": pathname,
      "X-UC-Workspace-Module": activeModuleId,
      "X-UC-Delta-Fallback": "1",
    },
  });
  const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
  if (!response.ok || !payload.data || typeof payload.revision !== "number" || !payload.user) {
    return false;
  }

  const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
  if (!currentRunIsSafe(pathname, activeModuleId)) return false;
  workspaceReadState.recordResponse(response);
  useRDashStore.getState().hydrateSecureWorkspace({
    db: overlay.db,
    revision: payload.revision,
    user: payload.user,
    rowVersions: payload.rowVersions,
  });
  return true;
}

/**
 * Pulls revision journal changes while the current scoped snapshot is idle.
 * Dirty forms, local outbox items and active saves always take precedence.
 */
export function WorkspaceDeltaSync(): null {
  const pathname = usePathname();
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const authUser = useRDashStore((state) => state.authUser);
  const inFlightRef = React.useRef(false);
  const rerunRef = React.useRef(false);

  const run = React.useCallback(async () => {
    if (!DELTA_SYNC_ENABLED) return;
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }
    if (!currentRunIsSafe(pathname, activeModuleId)) return;

    inFlightRef.current = true;
    try {
      await useRDashStore.getState().awaitServerSync();
      if (!currentRunIsSafe(pathname, activeModuleId)) return;

      let afterRevision = useRDashStore.getState().serverRevision;
      for (let page = 0; page < MAX_DELTA_PAGES_PER_RUN; page += 1) {
        if (!currentRunIsSafe(pathname, activeModuleId)) return;
        const state = useRDashStore.getState();
        if (state.serverRevision !== afterRevision || !state.authUser) return;

        const params = new URLSearchParams({ afterRevision: String(afterRevision) });
        const collections = workspaceCollectionFilterParam(state.db);
        if (collections) params.set("collections", collections);
        const response = await fetch(`/api/changes?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "X-UC-Delta-Client": "workspace-shell" },
        });
        if (response.status === 401) return;
        if (!response.ok) throw new Error(`Delta request failed with ${response.status}.`);

        const delta = await response.json() as WorkspaceDeltaPayload;
        if (delta.requiresFullReload) {
          await reloadCurrentWorkspace(pathname, activeModuleId);
          return;
        }
        if (
          delta.fromRevision !== afterRevision ||
          delta.revision < afterRevision ||
          delta.revision > delta.currentRevision
        ) {
          await reloadCurrentWorkspace(pathname, activeModuleId);
          return;
        }
        if (delta.revision === afterRevision && !delta.hasMore) return;

        if (!currentRunIsSafe(pathname, activeModuleId)) return;
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
        if (!delta.hasMore) return;
      }
      rerunRef.current = true;
    } catch (error) {
      console.warn("[workspace-delta] synchronization deferred:", error);
    } finally {
      inFlightRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        window.setTimeout(() => void run(), 1_000);
      }
    }
  }, [activeModuleId, pathname]);

  React.useEffect(() => {
    if (!DELTA_SYNC_ENABLED || !authUser) return;
    let eventTimer: number | null = null;
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
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      if (eventTimer !== null) window.clearTimeout(eventTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authUser, run]);

  return null;
}
