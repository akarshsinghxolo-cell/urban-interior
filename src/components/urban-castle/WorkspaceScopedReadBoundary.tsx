"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Database, LoaderCircle, RotateCw } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";
import { workspaceReadEndpointForTarget } from "@/lib/rdash/workspace-read-client";
import {
  useWorkspaceReadState,
  workspaceReadLoadStateForTarget,
  workspaceReadState,
} from "@/lib/rdash/workspace-read-state";
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * A scoped snapshot is interactive only while it covers the canonical route.
 * Moving from one row graph to another, closing to a module list, or crossing a
 * module family loads the destination scope before removing this blocking layer.
 * The shared read-state machine distinguishes not-loaded/loading/error from a
 * successfully loaded response whose collections may legitimately be empty.
 */
export function WorkspaceScopedReadBoundary() {
  const pathname = usePathname();
  const authUser = useRDashStore((state) => state.authUser);
  const hydrateSecureWorkspace = useRDashStore((state) => state.hydrateSecureWorkspace);
  const readState = useWorkspaceReadState();

  // The browser URL is the canonical navigation source. The Zustand module can
  // lag one render behind router navigation, so falling back to it here can load
  // the previous module graph (for example Tasks while the URL is Quotations).
  const requestedTarget = React.useMemo(
    () => workspaceReadTargetForPath(pathname),
    [pathname],
  );
  const endpoint = React.useMemo(
    () => workspaceReadEndpointForTarget(requestedTarget),
    [requestedTarget],
  );
  const needsExpansion = Boolean(authUser) && !workspaceReadCoverageIsCompatible(readState, requestedTarget);
  const loadState = workspaceReadLoadStateForTarget(readState, requestedTarget);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const requestSequenceRef = React.useRef(0);
  const latestTargetRef = React.useRef(requestedTarget);
  const latestTargetIdentity = `${requestedTarget.scope}:${requestedTarget.moduleId}:${requestedTarget.entity?.kind || "module"}:${requestedTarget.entity?.id || ""}`;

  React.useLayoutEffect(() => {
    latestTargetRef.current = requestedTarget;
  }, [requestedTarget]);

  React.useEffect(() => {
    if (!authUser) {
      workspaceReadState.reset();
      return;
    }
    if (!needsExpansion) {
      workspaceReadState.clearRequest(requestedTarget);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequenceRef.current;
    const requestTargetIdentity = latestTargetIdentity;
    workspaceReadState.beginRequest(requestedTarget);

    void fetch(endpoint, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-UC-Workspace-Path": pathname,
        "X-UC-Workspace-Module": requestedTarget.moduleId,
        "X-UC-Read-State-Deferred": "1",
      },
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
      if (response.status === 401) {
        workspaceReadState.reset();
        window.location.replace("/signin");
        return;
      }
      const hydrationUser = payload.user || authUser;
      if (!response.ok || !payload.data || typeof payload.revision !== "number" || !hydrationUser) {
        throw new Error(payload.error || "The requested workspace data could not be loaded.");
      }

      const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
      const latest = latestTargetRef.current;
      const latestIdentity = `${latest.scope}:${latest.moduleId}:${latest.entity?.kind || "module"}:${latest.entity?.id || ""}`;
      if (
        controller.signal.aborted ||
        requestSequenceRef.current !== requestId ||
        latestIdentity !== requestTargetIdentity
      ) return;

      hydrateSecureWorkspace({
        db: overlay.db,
        revision: payload.revision,
        user: hydrationUser,
        aggregateRevisions: payload.aggregateRevisions,
        rowVersions: payload.rowVersions,
      });
      workspaceReadState.recordResponse(response, requestedTarget);
      if (overlay.pendingCount) {
        useRDashStore.setState({
          workspaceSyncStatus: "error",
          workspaceSyncError: overlay.hasConflict
            ? "Locally saved changes need review."
            : "Locally saved changes are waiting to synchronize.",
        });
      }
    }).catch((caught) => {
      const latest = latestTargetRef.current;
      const latestIdentity = `${latest.scope}:${latest.moduleId}:${latest.entity?.kind || "module"}:${latest.entity?.id || ""}`;
      if (
        controller.signal.aborted ||
        isAbortError(caught) ||
        requestSequenceRef.current !== requestId ||
        latestIdentity !== requestTargetIdentity
      ) return;
      workspaceReadState.failRequest(
        requestedTarget,
        caught instanceof Error ? caught.message : "The requested workspace data could not be loaded.",
      );
    });

    return () => {
      controller.abort();
      workspaceReadState.clearRequest(requestedTarget);
    };
  }, [authUser, endpoint, hydrateSecureWorkspace, latestTargetIdentity, needsExpansion, pathname, requestedTarget, retryNonce]);

  if (!needsExpansion) return null;
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
            <p className="text-sm font-bold">{error ? "Workspace data unavailable" : "Loading module data"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error || "Loading only the secure records required for this screen."}
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
