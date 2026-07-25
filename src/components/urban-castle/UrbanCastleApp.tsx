"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RDashApp } from "../rdash/RDashApp";
import { UploadManagerProvider } from "@/components/uploads/UploadManagerProvider";
import { useRDashStore } from "@/lib/rdash/store";
import { useBrowserHistorySync } from "@/lib/rdash/use-browser-history-sync";

/** Urban Castle application shell. */
export function UrbanCastleApp() {
  React.useEffect(() => {
    document.title = "Urban Castle";
  }, []);

  useBrowserHistorySync();

  const authUser = useRDashStore((s) => s.authUser);
  const reconcileWorkspace = useRDashStore((s) => s.reconcileWorkspace);
  const reconciledSessionRef = React.useRef<string | null>(null);
  const authSessionKey = authUser ? `${authUser.email}:${authUser.expiresAt}` : null;

  React.useEffect(() => {
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
  }, [authSessionKey, reconcileWorkspace]);

  return (
    <UploadManagerProvider>
      <RDashApp />
      <ReconcileWorkspaceButton />
    </UploadManagerProvider>
  );
}

function ReconcileWorkspaceButton() {
  const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
  const reconcileWorkspace = useRDashStore((s) => s.reconcileWorkspace);
  const [running, setRunning] = React.useState(false);
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
