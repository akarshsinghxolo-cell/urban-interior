"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Database, LoaderCircle, RotateCw } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";
import { useWorkspaceReadState, workspaceReadState } from "@/lib/rdash/workspace-read-state";
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

/**
 * A scoped snapshot is interactive only while it covers the canonical route.
 * Moving from one row graph to another, closing to a module list, or crossing a
 * module family loads the destination scope before removing this blocking layer.
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
  const needsExpansion = Boolean(authUser) && !workspaceReadCoverageIsCompatible(readState, requestedTarget);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const inFlightRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const targetKey = `${requestedTarget.moduleId}:${requestedTarget.entity?.kind || "module"}:${requestedTarget.entity?.id || ""}`;

  React.useEffect(() => {
    if (!needsExpansion || !authUser || inFlightRef.current || error) return;
    inFlightRef.current = true;
    setLoading(true);

    void fetch("/api/workspace", {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "X-UC-Workspace-Path": pathname,
        "X-UC-Workspace-Module": requestedTarget.moduleId,
        "X-UC-Read-State-Deferred": "1",
      },
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
      if (response.status === 401) {
        window.location.replace("/signin");
        return;
      }
      if (!response.ok || !payload.data || typeof payload.revision !== "number" || !payload.user) {
        throw new Error(payload.error || "The requested workspace data could not be loaded.");
      }

      const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
      if (!mountedRef.current) return;
      hydrateSecureWorkspace({
        db: overlay.db,
        revision: payload.revision,
        user: payload.user,
        aggregateRevisions: payload.aggregateRevisions,
        rowVersions: payload.rowVersions,
      });
      if (overlay.pendingCount) {
        useRDashStore.setState({
          workspaceSyncStatus: "error",
          workspaceSyncError: overlay.hasConflict
            ? "Locally saved changes need review."
            : "Locally saved changes are waiting to synchronize.",
        });
      }
      workspaceReadState.recordResponse(response);
      setError(null);
    }).catch((caught) => {
      if (!mountedRef.current) return;
      setError(caught instanceof Error ? caught.message : "The requested workspace data could not be loaded.");
    }).finally(() => {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    });
  }, [authUser, error, hydrateSecureWorkspace, needsExpansion, pathname, requestedTarget.moduleId, retryNonce, targetKey]);

  if (!needsExpansion) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {error ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{error ? "Workspace data unavailable" : "Loading record data"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {error || "Loading the secure record graph without interrupting pending changes."}
            </p>
          </div>
          {!error ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : null}
        </div>
        {error ? (
          <Button
            type="button"
            size="sm"
            className="mt-4 w-full"
            onClick={() => {
              setError(null);
              setRetryNonce((value) => value + 1);
            }}
            disabled={loading}
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry workspace data
          </Button>
        ) : null}
      </div>
    </div>
  );
}
