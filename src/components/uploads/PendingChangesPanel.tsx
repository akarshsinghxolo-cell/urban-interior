"use client";

import { AlertTriangle, CheckCircle2, CloudOff, Database, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWorkspaceOutbox } from "@/lib/uploads/use-workspace-outbox";
import { discardWorkspaceOutbox, retryWorkspaceOutbox } from "@/lib/uploads/workspace-outbox";
import type { WorkspaceCommitOutboxRecord } from "@/lib/uploads/workspace-outbox-types";

export function PendingChangesPanel() {
  const outbox = useWorkspaceOutbox();

  return (
    <div className="grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold"><Database className="h-4 w-4 text-primary" /> Pending Changes</h3>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Business changes saved on this device remain here until PostgreSQL accepts them.</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {outbox.items.length} pending
          </span>
        </div>
      </section>

      {!outbox.ready ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Restoring locally saved changes…</section>
      ) : outbox.items.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 text-sm font-semibold">All record changes synchronized</p>
          <p className="mt-1 text-xs text-muted-foreground">Offline and interrupted saves will appear here automatically.</p>
        </section>
      ) : (
        outbox.items.map((item) => <PendingChangeRow key={item.operationId} item={item} />)
      )}
    </div>
  );
}

function PendingChangeRow({ item }: { item: WorkspaceCommitOutboxRecord }) {
  const conflict = item.status === "conflict";
  const waiting = item.status === "waiting_for_network";
  const failed = item.status === "failed_retryable" || item.status === "failed_permanent";
  const syncing = item.status === "syncing";
  const Icon = conflict || failed ? AlertTriangle : waiting ? CloudOff : Database;
  const changedRecords = item.summary.reduce((sum, row) => sum + row.upsertIds.length + row.deleteIds.length, 0);

  const retry = async () => {
    if (conflict && !window.confirm("Apply your locally saved version over the latest server records? Review the affected records afterward because this can replace fields changed on another device.")) return;
    try {
      await retryWorkspaceOutbox(item.operationId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The locally saved change could not be retried.");
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard every locally pending workspace change and reload the authoritative server version? This cannot be undone.")) return;
    try {
      await discardWorkspaceOutbox();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The locally saved changes could not be discarded.");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Workspace change · {changedRecords} record{changedRecords === 1 ? "" : "s"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.summary.map((row) => row.collection).join(" · ")}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${conflict || failed ? "bg-destructive/10 text-destructive" : waiting ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
              {item.status.replaceAll("_", " ")}
            </span>
          </div>
          {item.lastErrorMessage ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{item.lastErrorMessage}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void retry()} disabled={syncing}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />{conflict ? "Apply my version to latest" : syncing ? "Synchronizing" : "Retry now"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void discard()} disabled={syncing}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />Discard all local changes
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}