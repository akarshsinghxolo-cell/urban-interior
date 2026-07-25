"use client";

import { AlertTriangle, Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadQueue } from "@/lib/uploads/use-upload-queue";
import { useWorkspaceOutbox } from "@/lib/uploads/use-workspace-outbox";
import { ACTIVE_UPLOAD_STATUSES } from "@/lib/uploads/upload-types";

export function UploadStatusIndicator() {
  const queue = useUploadQueue();
  const outbox = useWorkspaceOutbox();
  const pendingUploads = queue.items.filter((item) => item.status !== "completed" && item.status !== "cancelled");
  const activeUploads = pendingUploads.filter((item) => ACTIVE_UPLOAD_STATUSES.has(item.status)).length;
  const activeChanges = outbox.items.filter((item) => item.status === "syncing").length;
  const needsAttention = pendingUploads.some((item) => item.status === "failed_permanent" || item.status === "cleanup_pending") ||
    outbox.items.some((item) => item.status === "conflict" || item.status === "failed_permanent");
  const totalPending = pendingUploads.length + outbox.items.length;
  const offline = !queue.online || !outbox.online;
  const active = activeUploads > 0 || activeChanges > 0 || queue.processing;
  const Icon = needsAttention ? AlertTriangle : offline ? CloudOff : active ? LoaderCircle : Cloud;

  return (
    <Button
      type="button"
      variant="outline"
      className="relative h-11 shrink-0 gap-1.5 px-2.5 text-xs"
      onClick={() => window.dispatchEvent(new CustomEvent("uc-open-pending-uploads"))}
      aria-label={`${totalPending} pending background items${needsAttention ? ", attention required" : ""}`}
      title={needsAttention ? "Background activity needs attention" : "Open Background Activity"}
    >
      <Icon className={active && !needsAttention ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      <span className="hidden xl:inline">Activity</span>
      {totalPending > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {totalPending > 99 ? "99+" : totalPending}
        </span>
      ) : null}
    </Button>
  );
}