"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { clearSessionToken } from "@/lib/rdash/client-auth";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceReadTargetForActiveNavigation } from "@/lib/rdash/workspace-active-read-target";
import {
  applyWorkspaceDelta,
  deletedDeltaVersionKeys,
  expandedDeltaRowVersions,
  type WorkspaceDeltaPayload,
} from "@/lib/rdash/workspace-delta";
import { workspaceFoundationRevisionState } from "@/lib/rdash/workspace-foundation-revision-state";
import {
  mergeWorkspaceRowVersions,
  workspaceRowVersionState,
} from "@/lib/rdash/workspace-row-version-state";
import { WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS } from "@/lib/rdash/workspace-session-merge";
import { workspaceOutboxStore } from "@/lib/uploads/workspace-outbox";

const FOUNDATION_COLLECTION_FILTER = WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS.join(",");
const MAX_FOUNDATION_DELTA_PAGES = 5;

interface BootstrapPayload {
  error?: string;
  revision?: number;
  data?: import("@/lib/rdash/types").RDashDatabase;
  rowVersions?: Record<string, number>;
  user?: import("@/lib/rdash/store").AuthenticatedWorkspaceUser;
}

function isValidDelta(delta: WorkspaceDeltaPayload, afterRevision: number): boolean {
  return Number.isInteger(delta.fromRevision)
    && Number.isInteger(delta.revision)
    && Number.isInteger(delta.currentRevision)
    && delta.fromRevision === afterRevision
    && delta.revision >= afterRevision
    && delta.currentRevision >= delta.revision
    && typeof delta.hasMore === "boolean";
}

function deltaHasRows(delta: WorkspaceDeltaPayload): boolean {
  return Object.values(delta.changedRows).some((rows) => Boolean(rows?.length))
    || Object.values(delta.deletedRowIds).some((ids) => Boolean(ids?.length));
}

function foundationSyncIsSafe(): boolean {
  const state = useRDashStore.getState();
  const outbox = workspaceOutboxStore.getSnapshot();
  return Boolean(state.authUser)
    && state.workspaceSyncStatus === "saved"
    && outbox.ready
    && outbox.items.length === 0
    && dirtyFormRegistry.getSnapshot().dirtyForms.length === 0
    && document.visibilityState === "visible"
    && navigator.onLine;
}

async function redirectToSignin(): Promise<never> {
  workspaceFoundationRevisionState.reset();
  clearSessionToken();
  window.location.replace("/signin");
  throw new DOMException("Session expired", "AbortError");
}

async function reloadFoundation(signal: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/bootstrap", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json", "X-UC-Foundation-Refresh": "1" },
  });
  if (response.status === 401) await redirectToSignin();
  const payload = await response.json().catch(() => ({})) as BootstrapPayload;
  if (!response.ok || !payload.data || typeof payload.revision !== "number" || !payload.user) {
    return false;
  }
  if (signal.aborted || !foundationSyncIsSafe()) return false;

  const hydrated = useRDashStore.getState().hydrateSecureWorkspace({
    db: payload.data,
    revision: payload.revision,
    user: payload.user,
    rowVersions: payload.rowVersions,
  });
  if (!hydrated) return false;
  workspaceFoundationRevisionState.replace(payload.revision);
  return true;
}

/**
 * The shared Master foundation is fetched once at bootstrap and retained in the
 * session. This synchronizer consults the revision journal only after another
 * authoritative scoped/entity read discovers a newer workspace revision.
 * Unrelated commits advance the foundation revision without retransmitting
 * Master rows; actual foundation changes transfer only the changed rows.
 */
export function WorkspaceFoundationSync(): null {
  const pathname = usePathname();
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const authUser = useRDashStore((state) => state.authUser);
  const serverRevision = useRDashStore((state) => state.serverRevision);
  const target = React.useMemo(
    () => workspaceReadTargetForActiveNavigation(pathname, activeModuleId),
    [activeModuleId, pathname],
  );
  React.useEffect(() => {
    if (!authUser) {
      workspaceFoundationRevisionState.reset();
      return;
    }

    const current = useRDashStore.getState();
    const metadata = current.db as unknown as Record<string, unknown>;
    if (workspaceFoundationRevisionState.get() === 0 && metadata._workspace_foundation_embedded === true) {
      workspaceFoundationRevisionState.replace(current.serverRevision);
    }

    const knownFoundationRevision = workspaceFoundationRevisionState.get();
    if (knownFoundationRevision >= serverRevision) return;
    if (!foundationSyncIsSafe()) return;

    const controller = new AbortController();
    let disposed = false;

    const run = async () => {
      try {
        await useRDashStore.getState().awaitServerSync();
        if (disposed || controller.signal.aborted || !foundationSyncIsSafe()) return;

        let afterRevision = workspaceFoundationRevisionState.get();
        for (let page = 0; page < MAX_FOUNDATION_DELTA_PAGES; page += 1) {
          if (disposed || controller.signal.aborted || !foundationSyncIsSafe()) return;
          const params = new URLSearchParams({
            afterRevision: String(afterRevision),
            collections: FOUNDATION_COLLECTION_FILTER,
          });
          const response = await fetch(`/api/changes?${params.toString()}`, {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "X-UC-Delta-Client": "workspace-foundation",
              "X-UC-Foundation-Delta": "1",
              "X-UC-Delta-Module": target.moduleId,
            },
          });
          if (response.status === 401) await redirectToSignin();
          if (response.status === 403) {
            await reloadFoundation(controller.signal);
            return;
          }
          if (!response.ok) return;

          const delta = await response.json() as WorkspaceDeltaPayload;
          if (delta.requiresFullReload || !isValidDelta(delta, afterRevision)) {
            await reloadFoundation(controller.signal);
            return;
          }
          if (delta.revision === afterRevision) {
            workspaceFoundationRevisionState.advance(delta.revision);
            return;
          }

          if (disposed || controller.signal.aborted || !foundationSyncIsSafe()) return;
          const latest = useRDashStore.getState();
          const rowVersions = mergeWorkspaceRowVersions(
            workspaceRowVersionState.getSnapshot(),
            expandedDeltaRowVersions(delta),
            deletedDeltaVersionKeys(delta),
          );

          if (deltaHasRows(delta)) {
            const applied = applyWorkspaceDelta(latest.db, delta);
            const hydrated = latest.hydrateSecureWorkspace({
              db: applied.database,
              revision: delta.revision,
              user: latest.authUser!,
              rowVersions,
            });
            if (!hydrated) return;
          } else {
            latest.acceptWorkspaceServerRevision({
              revision: delta.revision,
              rowVersions,
            });
          }

          workspaceFoundationRevisionState.advance(delta.revision);
          afterRevision = delta.revision;
          if (!delta.hasMore) return;
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[workspace-foundation] refresh deferred:", error);
        }
      }
    };

    void run();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [authUser, serverRevision, target.moduleId]);

  return null;
}
