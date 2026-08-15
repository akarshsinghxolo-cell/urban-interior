"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Database, LoaderCircle, RotateCw } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceReadCoverageIsCompatible } from "@/lib/rdash/workspace-read-scope";
import { workspaceReadTargetForActiveNavigation } from "@/lib/rdash/workspace-active-read-target";
import { workspaceReadEndpointForTarget } from "@/lib/rdash/workspace-read-client";
import {
  useWorkspaceReadState,
  workspaceReadLoadStateForTarget,
  workspaceReadState,
  workspaceReadTargetKey,
} from "@/lib/rdash/workspace-read-state";
import { workspaceReadCache } from "@/lib/rdash/workspace-read-cache";
import { revalidateWorkspaceReadCacheEntry } from "@/lib/rdash/workspace-navigation-delta";
import {
  mergeWorkspacePage,
  workspacePageState,
} from "@/lib/rdash/workspace-page-merge";
import {
  mergeWorkspaceRowVersions,
  workspaceRowVersionState,
} from "@/lib/rdash/workspace-row-version-state";
import { restoreWorkspaceOutboxOverlay } from "@/lib/uploads/workspace-outbox";
import { Button } from "@/components/ui/button";

interface WorkspaceReadPayload {
  error?: string;
  revision?: number;
  data?: import("@/lib/rdash/types").RDashDatabase;
  aggregateRevisions?: Record<string, number>;
  rowVersions?: Record<string, number>;
  user?: {
    name: string;
    email: string;
    role: string;
    staffId?: string;
    expiresAt: number;
  };
}

const MAX_COLLECTION_PAGES_PER_REQUEST = 4;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function applyOverlayStatus(overlay: Awaited<ReturnType<typeof restoreWorkspaceOutboxOverlay>>) {
  if (!overlay.pendingCount) return;
  useRDashStore.setState({
    workspaceSyncStatus: "error",
    workspaceSyncError: overlay.hasConflict
      ? "Locally saved changes need review."
      : "Locally saved changes are waiting to synchronize.",
  });
}

/**
 * The first visit to a module/row loads its bounded server snapshot. Later
 * visits revalidate the cached target against the workspace change journal and
 * transfer only changed rows. A full scoped read remains the recovery path for
 * journal gaps, relationship-selected row graphs, limited collections, Staff
 * projection refreshes, or an unavailable/corrupt cache.
 *
 * Bounded list collections expose page cursors in workspace metadata. The
 * non-blocking Load more control requests only the next page (at most four
 * collections per click) and merges rows into the current Zustand snapshot.
 * It never replaces the module or refetches already-loaded collections.
 *
 * Module navigation state is authoritative while the browser-history pathname
 * catches up. This prevents a newly selected module from rendering against the
 * previous module's scoped snapshot or skipping its required server read.
 */
export function WorkspaceScopedReadBoundary() {
  const pathname = usePathname();
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const authUser = useRDashStore((state) => state.authUser);
  const db = useRDashStore((state) => state.db);
  const serverRevision = useRDashStore((state) => state.serverRevision);
  const hydrateSecureWorkspace = useRDashStore((state) => state.hydrateSecureWorkspace);
  const readState = useWorkspaceReadState();

  const requestedTarget = React.useMemo(
    () => workspaceReadTargetForActiveNavigation(pathname, activeModuleId),
    [activeModuleId, pathname],
  );
  const endpoint = React.useMemo(
    () => workspaceReadEndpointForTarget(requestedTarget),
    [requestedTarget],
  );
  const targetKey = workspaceReadTargetKey(requestedTarget);
  const needsExpansion = Boolean(authUser) && !workspaceReadCoverageIsCompatible(readState, requestedTarget);
  const loadState = workspaceReadLoadStateForTarget(readState, requestedTarget);
  const pageState = React.useMemo(() => workspacePageState(db), [db]);
  const pageCursors = React.useMemo(
    () => Object.entries(pageState).filter(([, cursor]) => cursor.hasMore && cursor.nextOffset != null),
    [pageState],
  );
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [pageLoading, setPageLoading] = React.useState(false);
  const [pageError, setPageError] = React.useState<string | undefined>();
  const requestSequenceRef = React.useRef(0);
  const latestTargetKeyRef = React.useRef(targetKey);
  const previousEffectTargetKeyRef = React.useRef(targetKey);

  React.useLayoutEffect(() => {
    latestTargetKeyRef.current = targetKey;
  }, [targetKey]);

  React.useEffect(() => {
    setPageError(undefined);
  }, [targetKey]);

  React.useEffect(() => {
    const enteredNewTarget = previousEffectTargetKeyRef.current !== targetKey;
    previousEffectTargetKeyRef.current = targetKey;

    if (!authUser) {
      workspaceReadCache.clear();
      queueMicrotask(() => {
        if (!useRDashStore.getState().authUser) workspaceReadState.reset();
      });
      return;
    }
    if (!needsExpansion && !enteredNewTarget) {
      queueMicrotask(() => workspaceReadState.clearRequest(requestedTarget));
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequenceRef.current;
    const requestTargetKey = targetKey;
    const requestStillCurrent = () =>
      !controller.signal.aborted &&
      requestSequenceRef.current === requestId &&
      latestTargetKeyRef.current === requestTargetKey;

    const redirectToSignin = () => {
      workspaceReadCache.clear();
      workspaceReadState.reset();
      window.location.replace("/signin");
    };

    queueMicrotask(() => {
      if (requestStillCurrent()) workspaceReadState.beginRequest(requestedTarget);
    });

    const loadFullScope = async (): Promise<void> => {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-UC-Workspace-Path": pathname,
          "X-UC-Workspace-Module": requestedTarget.moduleId,
          "X-UC-Read-State-Deferred": "1",
          "X-UC-Read-Revalidate": enteredNewTarget ? "navigation-full" : "coverage",
        },
      });
      const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
      if (response.status === 401) {
        redirectToSignin();
        return;
      }
      const hydrationUser = payload.user || authUser;
      if (!response.ok || !payload.data || typeof payload.revision !== "number" || !hydrationUser) {
        throw new Error(payload.error || "The requested workspace data could not be loaded.");
      }

      const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
      if (!requestStillCurrent()) return;

      hydrateSecureWorkspace({
        db: overlay.db,
        revision: payload.revision,
        user: hydrationUser,
        aggregateRevisions: payload.aggregateRevisions,
        rowVersions: payload.rowVersions,
      });
      workspaceReadState.recordResponse(response, requestedTarget);
      workspaceReadCache.store({
        target: requestedTarget,
        user: hydrationUser,
        revision: payload.revision,
        data: payload.data,
        aggregateRevisions: payload.aggregateRevisions,
        rowVersions: payload.rowVersions,
        readState: workspaceReadState.getSnapshot(),
      });
      applyOverlayStatus(overlay);
    };

    const revalidateCachedScope = async (): Promise<void> => {
      const cached = workspaceReadCache.get(requestedTarget, authUser);
      if (!cached) {
        await loadFullScope();
        return;
      }

      let result;
      try {
        result = await revalidateWorkspaceReadCacheEntry(cached, controller.signal);
      } catch (error) {
        if (isAbortError(error)) throw error;
        // Delta synchronization is an optimization. If its control path is
        // temporarily unavailable, preserve correctness with the normal scoped read.
        await loadFullScope();
        return;
      }
      if (result.kind === "unauthorized") {
        redirectToSignin();
        return;
      }
      if (result.kind === "reload") {
        await loadFullScope();
        return;
      }

      const overlay = await restoreWorkspaceOutboxOverlay(result.entry.data);
      if (!requestStillCurrent()) return;

      hydrateSecureWorkspace({
        db: overlay.db,
        revision: result.entry.revision,
        user: authUser,
        aggregateRevisions: result.entry.aggregateRevisions,
        rowVersions: result.entry.rowVersions,
      });
      workspaceReadCache.put(result.entry);
      workspaceReadState.restoreCached(requestedTarget, result.entry.readState);
      applyOverlayStatus(overlay);
    };

    void revalidateCachedScope().catch((caught) => {
      if (!requestStillCurrent() || isAbortError(caught)) return;
      workspaceReadState.failRequest(
        requestedTarget,
        caught instanceof Error ? caught.message : "The requested workspace data could not be loaded.",
      );
    });

    return () => {
      controller.abort();
      queueMicrotask(() => workspaceReadState.clearRequest(requestedTarget));
    };
  }, [authUser, endpoint, hydrateSecureWorkspace, needsExpansion, pathname, requestedTarget, retryNonce, targetKey]);

  const loadMore = React.useCallback(async () => {
    if (!authUser || pageLoading || needsExpansion) return;
    const cursors = Object.entries(workspacePageState(useRDashStore.getState().db))
      .filter(([, cursor]) => cursor.hasMore && cursor.nextOffset != null)
      .slice(0, MAX_COLLECTION_PAGES_PER_REQUEST);
    if (!cursors.length) return;

    setPageLoading(true);
    setPageError(undefined);
    try {
      const params = new URLSearchParams();
      for (const [collection, cursor] of cursors) {
        params.append("page", `${collection}:${cursor.nextOffset}`);
      }
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-UC-Workspace-Path": pathname,
          "X-UC-Workspace-Module": requestedTarget.moduleId,
          "X-UC-Read-Page": "1",
        },
      });
      if (response.status === 401) {
        workspaceReadCache.clear();
        workspaceReadState.reset();
        window.location.replace("/signin");
        return;
      }

      const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
      if (
        !response.ok ||
        response.headers.get("X-UC-Read-Page-Only") !== "1" ||
        !payload.data ||
        typeof payload.revision !== "number"
      ) {
        throw new Error(payload.error || "The next page could not be loaded.");
      }

      const latest = useRDashStore.getState();
      if (!latest.authUser || latest.authUser.email !== authUser.email) return;
      if (payload.revision !== latest.serverRevision || latest.serverRevision !== serverRevision) {
        // A concurrent commit means page offsets no longer describe the same
        // snapshot. Restart the normal scoped read rather than merging stale rows.
        workspaceReadState.reset();
        setRetryNonce((value) => value + 1);
        return;
      }

      const cached = workspaceReadCache.get(requestedTarget, authUser);
      const cacheBase = cached?.data || latest.db;
      const mergedCacheData = mergeWorkspacePage(cacheBase, payload.data);
      const mergedUiData = mergeWorkspacePage(latest.db, payload.data);
      const mergedRowVersions = mergeWorkspaceRowVersions(
        workspaceRowVersionState.getSnapshot(),
        payload.rowVersions || {},
      );
      const overlay = await restoreWorkspaceOutboxOverlay(mergedUiData);

      const latestAfterOverlay = useRDashStore.getState();
      if (!latestAfterOverlay.authUser || latestAfterOverlay.serverRevision !== payload.revision) return;
      latestAfterOverlay.hydrateSecureWorkspace({
        db: overlay.db,
        revision: payload.revision,
        user: authUser,
        rowVersions: mergedRowVersions,
      });
      workspaceReadCache.store({
        target: requestedTarget,
        user: authUser,
        revision: payload.revision,
        data: mergedCacheData,
        rowVersions: mergedRowVersions,
        aggregateRevisions: cached?.aggregateRevisions,
        readState: workspaceReadState.getSnapshot(),
      });
      applyOverlayStatus(overlay);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "The next page could not be loaded.");
    } finally {
      setPageLoading(false);
    }
  }, [authUser, endpoint, needsExpansion, pageLoading, pathname, requestedTarget, serverRevision]);

  if (!needsExpansion) {
    if (!pageCursors.length && !pageError) return null;
    return (
      <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,360px)] rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-start gap-2.5">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{pageError ? "More records could not be loaded" : "More records are available"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {pageError || `${pageCursors.length} bounded data ${pageCursors.length === 1 ? "set has" : "sets have"} another page.`}
            </p>
          </div>
          {pageCursors.length ? (
            <Button type="button" size="sm" variant="outline" disabled={pageLoading} onClick={() => void loadMore()}>
              {pageLoading ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
              Load more
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const error = loadState.status === "error" ? loadState.error : undefined;
  const loading = loadState.status === "not_loaded" || loadState.status === "loading";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {error ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{error ? "Workspace data unavailable" : "Refreshing module data"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error || "Checking for workspace changes before showing this screen."}
            </p>
          </div>
          {loading ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : null}
        </div>
        {error ? (
          <Button
            type="button"
            size="sm"
            className="mt-4 w-full"
            onClick={() => setRetryNonce((value) => value + 1)}
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry workspace data
          </Button>
        ) : null}
      </div>
    </div>
  );
}
