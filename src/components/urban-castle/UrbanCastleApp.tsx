"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { RDashApp } from "../rdash/RDashApp";
import { useRDashStore } from "@/lib/rdash/store";

/**
 * Urban Castle application shell.
 *
 * The underlying workspace engine (`RDashApp`) is the historical internal
 * name for the Urban Castle workspace. All user-visible branding has been
 * migrated to "Urban Castle" at the source level — this wrapper renders the
 * app, keeps the document title in sync, and adds two workspace-wide
 * concerns that the spec assigns to UrbanCastleApp:
 *
 *  1. Reconciliation-on-load: when the secure workspace hydrates (authUser
 *     transitions from null → user), automatically run `reconcileWorkspace()`
 *     so auto-absent / missed-visit / overdue-followup / recurring-task
 *     reconciliation fires even if no manager ever opens the corresponding
 *     module. This makes the daily workspace state match reality on login.
 *
 *  2. A "Refresh workspace" floating button (top-right) that any manager can
 *     press to re-run reconciliation on demand, with a toast summary.
 *
 *  3. A small "Recent activity" mini-feed (last 5 audit log entries) that
 *     floats at the bottom-right so the dashboard KPIs / activity are
 *     reachable from anywhere in the app.
 *
 * The cross-module deep-link wiring, global search index expansion, and
 * dashboard KPI enhancements live in their respective modules
 * (CommandPalette, WorkdeskDashboard) — this wrapper only adds the
 * reconciliation hook + refresh button + recent-activity overlay.
 */
export function UrbanCastleApp() {
  React.useEffect(() => {
    document.title = "Urban Castle";
  }, []);

  // Track whether reconciliation has already been run for the current
  // session so we don't fire it on every authUser re-render.
  const authUser = useRDashStore((s) => s.authUser);
  const reconcileWorkspace = useRDashStore((s) => s.reconcileWorkspace);
  const reconcileRanRef = React.useRef(false);

  React.useEffect(() => {
    if (!authUser || reconcileRanRef.current) return;
    reconcileRanRef.current = true;
    // Defer to next tick so hydration completes before reconciliation runs.
    const handle = window.setTimeout(() => {
      try {
        const summary = reconcileWorkspace();
        if (summary.total > 0) {
          toast.success(`Workspace reconciled`, {
            description: `${summary.attendance} attendance · ${summary.followups} follow-ups · ${summary.visits} visits · ${summary.recurringTasks} recurring tasks`,
            duration: 5000,
          });
        }
      }
      catch {
        // Reconciliation errors are non-fatal — workspace is still usable.
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [authUser, reconcileWorkspace]);

  return (
    <>
      <RDashApp />
      <RefreshWorkspaceButton />
      <RecentActivityOverlay />
    </>
  );
}

/**
 * Floating "Refresh workspace" button — only visible to Owner/Operations
 * Manager (reconciliation is a no-op for other roles). Positioned top-right
 * so it doesn't overlap the mobile bottom nav or the quick-add FAB.
 */
function RefreshWorkspaceButton() {
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
    }
    catch (error) {
      toast.error("Reconciliation failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
    finally {
      // Brief spin animation even on no-op for visual feedback.
      window.setTimeout(() => setRunning(false), 400);
    }
  };
  return (
    <button
      type="button"
      aria-label="Refresh workspace"
      title="Run attendance, follow-up, visit and recurring-task reconciliation"
      onClick={onClick}
      className="fixed right-3 top-3 z-[55] inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 text-[11px] font-semibold text-muted-foreground shadow-soft backdrop-blur-sm transition-all hover:bg-card hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}

/**
 * Recent activity overlay — a small, dismissible pill at the bottom-right
 * showing the last 5 audit log entries. Clicking an entry opens the audit
 * detail. This makes the "recent activity feed" requirement reachable from
 * any module without modifying WorkdeskDashboard (which Agent B owns).
 */
function RecentActivityOverlay() {
  const auditLog = useRDashStore((s) => s.db.auditLog);
  const openDetail = useRDashStore((s) => s.openDetail);
  const [open, setOpen] = React.useState(false);
  const recent = React.useMemo(() => {
    return [...auditLog]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5);
  }, [auditLog]);
  if (recent.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-3 z-[55] hidden lg:block">
      {open ? (
        <div className="w-72 overflow-hidden rounded-lg border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent activity</span>
            <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Hide</button>
          </div>
          <div className="max-h-72 overflow-y-auto rd-scroll">
            {recent.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { openDetail("audit" as any, e.id); setOpen(false); }}
                className="block w-full border-b border-border px-3 py-1.5 text-left text-[10px] transition-colors last:border-0 hover:bg-accent/30"
              >
                <p className="truncate font-medium text-foreground">{e.action}</p>
                <p className="truncate text-muted-foreground">{e.actor} · {e.entity_label || e.entity_type}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground shadow-soft backdrop-blur-sm transition-all hover:bg-card hover:text-foreground"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          {recent.length} recent events
        </button>
      )}
    </div>
  );
}
