"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RDashApp } from "../rdash/RDashApp";
import { UploadManagerProvider } from "@/components/uploads/UploadManagerProvider";
import { useRDashStore } from "@/lib/rdash/store";
import { useBrowserHistorySync } from "@/lib/rdash/use-browser-history-sync";
import { useInstallDirtyFormNavigationGuards } from "@/lib/rdash/use-dirty-form-guard";
import { useWorkspaceExitGuard } from "@/lib/uploads/use-workspace-exit-guard";
import { useWorkspaceReadState } from "@/lib/rdash/workspace-read-state";
import type { WorkspaceReadScope } from "@/lib/rdash/workspace-read-scope";
import { DirtyFormNavigationGuard } from "./DirtyFormNavigationGuard";
import { LegacyDirtyFormAdapter } from "./LegacyDirtyFormAdapter";
import { WorkspaceDeltaSync } from "./WorkspaceDeltaSync";
import { WorkspaceScopedReadBoundary } from "./WorkspaceScopedReadBoundary";

function scopeSupportsReconciliation(scope: WorkspaceReadScope): boolean {
  return scope === "full" || scope === "workdesk";
}

/** Urban Castle application shell. */
export function UrbanCastleApp({ historyEnabled = true }: { historyEnabled?: boolean }) {
  React.useEffect(() => {
    // /workspace routes set a module-specific title in WorkspaceRouteShell.
    // Keep the generic title only for the legacy root route during migration.
    if (!window.location.pathname.startsWith("/workspace")) {
      document.title = "Urban Castle";
    }
  }, []);

  useInstallDirtyFormNavigationGuards();
  useBrowserHistorySync(historyEnabled);
  useWorkspaceExitGuard();

  const authUser = useRDashStore((s) => s.authUser);
  const reconcileWorkspace = useRDashStore((s) => s.reconcileWorkspace);
  const readState = useWorkspaceReadState();
  const reconciledSessionRef = React.useRef<string | null>(null);
  const authSessionKey = authUser ? `${authUser.email}:${authUser.expiresAt}` : null;

  React.useEffect(() => {
    // The bounded Workdesk scope contains every attendance, follow-up, Visit and
    // recurring-task dependency required by reconciliation. Other narrow scopes
    // wait until Workdesk or a full compatibility module is opened.
    if (!scopeSupportsReconciliation(readState.scope)) return;
    if (!authSessionKey || reconciledSessionRef.current === authSessionKey) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempt = 0;
    const retryDelays = [800, 2_000, 5_000, 15_000];

    const runReconciliation = () => {
      if (cancelled) return;
      try {
        const summary = reconcileWorkspace();
        reconciledSessionRef.current = authSessionKey;
        if (summary.total > 0) {
          toast.success("Workspace reconciled", {
            description: `${summary.attendance} attendance · ${summary.followups} follow-ups · ${summary.visits} visits · ${summary.recurringTasks} recurring tasks`,
            duration: 5000,
          });
        }
      } catch (error) {
        attempt += 1;
        if (attempt < retryDelays.length) {
          retryTimer = window.setTimeout(runReconciliation, retryDelays[attempt]);
          return;
        }
        console.error("[UrbanCastleApp] automatic reconciliation exhausted retries:", error);
        toast.error("Automatic reconciliation could not complete", {
          description: "The workspace remains available. Use Reconcile to retry after checking the connection.",
          duration: 7000,
        });
      }
    };

    retryTimer = window.setTimeout(runReconciliation, retryDelays[0]);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [authSessionKey, readState.scope, reconcileWorkspace]);

  return (
    <UploadManagerProvider>
      <RDashApp />
      <LegacyDirtyFormAdapter />
      <DirtyFormNavigationGuard />
      <WorkspaceScopedReadBoundary />
      <WorkspaceDeltaSync />
      <ReconcileWorkspaceButton />
    </UploadManagerProvider>
  );
}

function ReconcileWorkspaceButton() {
  const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
  const reconcileWorkspace = useRDashStore((s) => s.reconcileWorkspace);
  const readState = useWorkspaceReadState();
  const [running, setRunning] = React.useState(false);
  if (!scopeSupportsReconciliation(readState.scope)) return null;
  if (role !== "Owner" && role !== "Operations Manager") return null;
  const onClick = () => {
    setRunning(true);
    try {
      const summary = reconcileWorkspace();
      const parts: string[] = [];
      if (summary.attendance) parts.push(`${summary.attendance} attendance`);
      if (summary.followups) parts.push(`${summary.followups} follow-ups`);
      if (summary.visits) parts.push(`${summary.visits} visits`);
      if (summary.recurringTasks) parts.push(`${summary.recurringTasks} recurring`);
      toast.success("Workspace reconciled", {
        description: parts.length ? parts.join(" · ") : "No pending items to reconcile.",
        duration: 4000,
      });
    } catch (error) {
      toast.error("Reconciliation failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      window.setTimeout(() => setRunning(false), 400);
    }
  };
  return (
    <button
      type="button"
      aria-label="Reconcile workspace"
      title="Run attendance, follow-up, visit and recurring-task reconciliation"
      onClick={onClick}
      className="fixed bottom-20 right-3 z-[55] hidden h-8 items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 text-[11px] font-semibold text-muted-foreground shadow-soft backdrop-blur-sm transition-all hover:bg-card hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:inline-flex"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">Reconcile</span>
    </button>
  );
}
