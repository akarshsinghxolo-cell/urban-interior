"use client";

import * as React from "react";
import { Database, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import {
  workspaceReadScopeForModule,
  workspaceReadScopeIsCompatible,
} from "@/lib/rdash/workspace-read-scope";
import { useWorkspaceReadState } from "@/lib/rdash/workspace-read-state";
import { restoreWorkspaceOutboxOverlay } from "@/lib/uploads/workspace-outbox";

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
 * A scoped initial snapshot is safe while the user remains inside that module
 * family. Moving to another family loads its server scope (or the full fallback)
 * before allowing interaction, then reapplies IndexedDB-backed pending changes.
 */
export function WorkspaceScopedReadBoundary() {
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const authUser = useRDashStore((state) => state.authUser);
  const hydrateSecureWorkspace = useRDashStore((state) => state.hydrateSecureWorkspace);
  const readState = useWorkspaceReadState();
  const requestedScope = workspaceReadScopeForModule(activeModuleId);
  const [loading, setLoading] = React.useState(false);
  const attemptedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!authUser || loading) return;
    if (workspaceReadScopeIsCompatible(readState.scope, requestedScope)) {
      attemptedRef.current = null;
      return;
    }

    const attemptKey = `${readState.scope}->${requestedScope}:${activeModuleId}`;
    if (attemptedRef.current === attemptKey) return;
    attemptedRef.current = attemptKey;
    let active = true;
    setLoading(true);

    void fetch("/api/workspace", {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "X-UC-Workspace-Module": activeModuleId,
      },
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as WorkspaceReadPayload;
      if (response.status === 401) {
        window.location.replace("/signin");
        return;
      }
      if (!response.ok || !payload.data || typeof payload.revision !== "number" || !payload.user) {
        throw new Error(payload.error || "The requested workspace module could not be loaded.");
      }

      const overlay = await restoreWorkspaceOutboxOverlay(payload.data);
      if (!active) return;
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
      attemptedRef.current = null;
    }).catch((error) => {
      if (!active) return;
      toast.error("Module data could not be loaded", {
        description: error instanceof Error ? error.message : undefined,
        duration: 7000,
      });
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [activeModuleId, authUser, hydrateSecureWorkspace, loading, readState.scope, requestedScope]);

  if (!loading) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Database className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Loading module data</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Expanding the secure workspace without interrupting pending changes.</p>
        </div>
        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
      </div>
    </div>
  );
}
