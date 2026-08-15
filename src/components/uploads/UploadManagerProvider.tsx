"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { deletedWorkspaceOperationVersionKeys } from "@/lib/rdash/workspace-row-version-state";
import { uploadQueueStore } from "@/lib/uploads/upload-store";
import { kickUploadManager } from "@/lib/uploads/upload-transfer";
import {
  flushWorkspaceOutbox,
  restoreWorkspaceOutboxOverlay,
  workspaceOutboxStore,
} from "@/lib/uploads/workspace-outbox";
import { PendingUploadsDialog } from "./PendingUploadsDialog";

export function UploadManagerProvider({ children }: { children: React.ReactNode }) {
  const authUser = useRDashStore((state) => state.authUser);
  const [open, setOpen] = React.useState(false);
  const restoredSessionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    void Promise.all([uploadQueueStore.hydrate(), workspaceOutboxStore.hydrate()]).catch((error) => {
      console.error("[BackgroundActivity] Could not restore local background work", error);
    });
    const openPending = () => setOpen(true);
    window.addEventListener("uc-open-pending-uploads", openPending);
    return () => window.removeEventListener("uc-open-pending-uploads", openPending);
  }, []);

  React.useEffect(() => {
    if (!authUser) return;
    const sessionKey = `${authUser.email}:${authUser.expiresAt}`;
    let active = true;

    const reportBackgroundError = (error: unknown, fallback: string) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : fallback;
      console.error("[BackgroundActivity]", error);
      useRDashStore.setState({
        workspaceSyncStatus: "error",
        workspaceSyncError: message,
      });
    };

    const applyPendingOverlay = async () => {
      if (restoredSessionRef.current === sessionKey) return;
      const current = useRDashStore.getState().db;
      const overlay = await restoreWorkspaceOutboxOverlay(current);
      if (!active) return;
      restoredSessionRef.current = sessionKey;
      if (overlay.pendingCount) {
        useRDashStore.setState({
          db: overlay.db,
          workspaceSyncStatus: "error",
          workspaceSyncError: overlay.hasConflict
            ? "Locally saved changes need review."
            : "Locally saved changes are waiting to synchronize.",
        });
      }
    };

    const resume = async () => {
      const result = await flushWorkspaceOutbox();
      if (!active) return;
      if (result.replayed && typeof result.payload?.revision === "number") {
        useRDashStore.getState().acceptWorkspaceServerRevision({
          revision: result.payload.revision,
          rowVersions: result.payload.rowVersions,
          deletedRowVersionKeys: deletedWorkspaceOperationVersionKeys(result.payload.patches || []),
        });
        restoredSessionRef.current = null;
        await applyPendingOverlay();
      } else if (result.conflict) {
        useRDashStore.setState({
          workspaceSyncStatus: "error",
          workspaceSyncError: result.payload?.error || "Locally saved changes need conflict review.",
        });
      }
      await kickUploadManager();
    };

    const safeResume = () => {
      void resume().catch((error) => reportBackgroundError(error, "Background synchronization could not continue."));
    };
    const safeUploadKick = () => {
      void kickUploadManager().catch((error) => reportBackgroundError(error, "Pending uploads could not continue."));
    };

    const handleOnline = () => {
      uploadQueueStore.setOnline(true);
      workspaceOutboxStore.setOnline(true);
      safeResume();
    };
    const handleOffline = () => {
      uploadQueueStore.setOnline(false);
      workspaceOutboxStore.setOnline(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        uploadQueueStore.setOnline(navigator.onLine);
        workspaceOutboxStore.setOnline(navigator.onLine);
        safeResume();
      }
    };

    const interval = window.setInterval(safeResume, 10_000);
    void applyPendingOverlay()
      .then(() => safeResume())
      .catch((error) => reportBackgroundError(error, "Locally saved changes could not be restored."));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("uc-upload-queue-kick", safeUploadKick);
    window.addEventListener("uc-workspace-outbox-kick", safeResume);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("uc-upload-queue-kick", safeUploadKick);
      window.removeEventListener("uc-workspace-outbox-kick", safeResume);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authUser]);

  return (
    <>
      {children}
      <PendingUploadsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}