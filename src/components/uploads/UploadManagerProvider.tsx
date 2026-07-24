"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { uploadQueueStore } from "@/lib/uploads/upload-store";
import { kickUploadManager } from "@/lib/uploads/upload-transfer";
import { PendingUploadsDialog } from "./PendingUploadsDialog";

export function UploadManagerProvider({ children }: { children: React.ReactNode }) {
  const authUser = useRDashStore((state) => state.authUser);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    void uploadQueueStore.hydrate();
    const openPending = () => setOpen(true);
    window.addEventListener("uc-open-pending-uploads", openPending);
    return () => window.removeEventListener("uc-open-pending-uploads", openPending);
  }, []);

  React.useEffect(() => {
    if (!authUser) return;
    const resume = () => void kickUploadManager();
    const handleOnline = () => {
      uploadQueueStore.setOnline(true);
      resume();
    };
    const handleOffline = () => uploadQueueStore.setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        uploadQueueStore.setOnline(navigator.onLine);
        resume();
      }
    };
    const unsubscribe = uploadQueueStore.subscribe(resume);
    const interval = window.setInterval(resume, 5_000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("uc-upload-queue-kick", resume);
    document.addEventListener("visibilitychange", handleVisibility);
    resume();

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("uc-upload-queue-kick", resume);
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
