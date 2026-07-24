"use client";

import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadQueue } from "@/lib/uploads/use-upload-queue";
import { ACTIVE_UPLOAD_STATUSES } from "@/lib/uploads/upload-types";

export function UploadStatusIndicator() {
  const queue = useUploadQueue();
  const pendingItems = queue.items.filter((item) => item.status !== "completed" && item.status !== "failed_permanent");
  const activeCount = pendingItems.filter((item) => ACTIVE_UPLOAD_STATUSES.has(item.status)).length;
  const Icon = !queue.online ? CloudOff : activeCount > 0 || queue.processing ? LoaderCircle : Cloud;

  return (
    <Button
      type="button"
      variant="outline"
      className="relative h-11 shrink-0 gap-1.5 px-2.5 text-xs"
      onClick={() => window.dispatchEvent(new CustomEvent("uc-open-pending-uploads"))}
      aria-label={`${pendingItems.length} pending uploads`}
      title="Open Pending Uploads"
    >
      <Icon className={activeCount > 0 || queue.processing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      <span className="hidden xl:inline">Uploads</span>
      {pendingItems.length > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {pendingItems.length > 99 ? "99+" : pendingItems.length}
        </span>
      ) : null}
    </Button>
  );
}
