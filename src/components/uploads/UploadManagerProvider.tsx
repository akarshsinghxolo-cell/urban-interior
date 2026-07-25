"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
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
    void Promise.all([uploadQueueStore.hydrate(), workspaceOutboxStore.hydrate()]);
    const openPending = () => setOpen(true);
    window.addEventListener("uc-open-pending-uploads", openPending);
    return () => window.removeEventListener("uc-open-pending-uploads", openPending);
  }, []);

  React.useEffect(() => {
    if (!authUser) return;
    const sessionKey = `${authUser.email}:${authUser.expiresAt}`;
    let active = true;

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
            ? "Locally saved changes need conflict review."
            : "Locally saved changes are waiting to synchronize.",
        });
      }
    };

    const resume = async () => {
      const result = await flushWorkspaceOutbox();
      if (!active) return;
      if (result.replayed && result.payload?.data && typeof result.payload.revision === "number") {
        useRDashStore.getState().hydrateSecureWorkspace({
          db: result.payload.data,
          revision: result.payload.revision,
          user: authUser,
          rowVersions: result.payload.rowVersions,
          aggregateRevisions: result.payload.bumpedAggregateRevisions,
        });
        restoredSessionRef.current = null;
        await applyPendingOverlay();
        window.dispatchEvent(new CustomEvent("uc-upload-queue-kick"));
      } else if (result.conflict) {
        useRDashStore.setState({
          workspaceSyncStatus: "error",
          workspaceSyncError: result.payload?.error || "Locally saved changes need conflict review.",
        });
      }
      await kickUploadManager();
    };

    const handleOnline = () => {
      uploadQueueStore.setOnline(true);
      workspaceOutboxStore.setOnline(true);
      void resume();
    };
    const handleOffline = () => {
      uploadQueueStore.setOnline(false);
      workspaceOutboxStore.setOnline(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        uploadQueueStore.setOnline(navigator.onLine);
        workspaceOutboxStore.setOnline(navigator.onLine);
        void resume();
      }
    };
    const handleOutboxKick = () => void resume();
    const uploadUnsubscribe = uploadQueueStore.subscribe(() => void kickUploadManager());
    const interval = window.setInterval(() => void resume(), 10_000);

    void applyPendingOverlay().then(resume);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("uc-upload-queue-kick", handleOutboxKick);
    window.addEventListener("uc-workspace-outbox-kick", handleOutboxKick);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      uploadUnsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("uc-upload-queue-kick", handleOutboxKick);
      window.removeEventListener("uc-workspace-outbox-kick", handleOutboxKick);
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
