"use client";

import { AlertCircle, CheckCircle2, CloudOff, File, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadQueueStore } from "@/lib/uploads/upload-store";
import { useUploadQueue } from "@/lib/uploads/use-upload-queue";
import type { UploadItemRecord } from "@/lib/uploads/upload-types";

export function PendingUploadsPanel() {
  const queue = useUploadQueue();
  const pendingItems = queue.items.filter((item) => item.status !== "completed");
  const batchMap = new Map(queue.batches.map((batch) => [batch.id, batch]));

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold"><UploadCloud className="h-4 w-4 text-primary" /> Pending Uploads</h3>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Files stored on this device remain here until Drive upload, verification, final placement, and business attachment registration are complete.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", queue.online ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{queue.online ? "Online" : "Waiting for network"}</span>
            <Button size="sm" variant="outline" onClick={() => void uploadQueueStore.retryAll()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry all</Button>
          </div>
        </div>
      </section>

      {!queue.ready ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Restoring pending uploads from this device…</section>
      ) : pendingItems.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <p className="mt-2 text-sm font-semibold">No pending uploads</p>
          <p className="mt-1 text-xs text-muted-foreground">Queued files will appear here as upload-enabled forms are migrated to the new system.</p>
        </section>
      ) : (
        <div className="grid gap-3">
          {pendingItems.map((item) => {
            const batch = batchMap.get(item.batchId);
            return <PendingUploadRow key={item.id} item={item} sourceLabel={batch?.sourceLabel || "Workspace upload"} targetLabel={batch?.targetLabel || batch?.targetEntityType || "Unassigned record"} online={queue.online} />;
          })}
        </div>
      )}
    </div>
  );
}

function PendingUploadRow({ item, sourceLabel, targetLabel, online }: { item: UploadItemRecord; sourceLabel: string; targetLabel: string; online: boolean }) {
  const percentage = item.sizeBytes > 0 ? Math.min(100, Math.round((item.confirmedBytes / item.sizeBytes) * 100)) : 0;
  const retryable = item.status === "failed_retryable" || item.status === "waiting_for_network" || item.status === "paused";

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><File className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.fileName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{sourceLabel} · {targetLabel} · {formatBytes(item.sizeBytes)}</p>
            </div>
            <StatusBadge item={item} online={online} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} /></div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{percentage}% · {formatBytes(item.confirmedBytes)} of {formatBytes(item.sizeBytes)}</span>
            <span>{item.retryCount ? `${item.retryCount} retr${item.retryCount === 1 ? "y" : "ies"}` : "Not retried"}</span>
          </div>
          {item.lastErrorMessage ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{item.lastErrorMessage}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {retryable ? <Button size="sm" variant="outline" onClick={() => void uploadQueueStore.retryItem(item.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry now</Button> : null}
            {item.status !== "cancel_requested" && item.status !== "failed_permanent" ? <Button size="sm" variant="ghost" onClick={() => void uploadQueueStore.cancelItem(item.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Cancel</Button> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ item, online }: { item: UploadItemRecord; online: boolean }) {
  const failed = item.status === "failed_retryable" || item.status === "failed_permanent";
  const waiting = item.status === "waiting_for_network" || !online;
  const Icon = failed ? AlertCircle : waiting ? CloudOff : UploadCloud;
  const label = item.status.replaceAll("_", " ");
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold capitalize", failed ? "bg-destructive/10 text-destructive" : waiting ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary")}><Icon className="h-3 w-3" />{label}</span>;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
