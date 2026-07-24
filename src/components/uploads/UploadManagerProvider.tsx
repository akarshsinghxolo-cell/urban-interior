"use client";

import * as React from "react";
import { uploadQueueStore } from "@/lib/uploads/upload-store";

export function UploadManagerProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    void uploadQueueStore.hydrate();

    const handleOnline = () => uploadQueueStore.setOnline(true);
    const handleOffline = () => uploadQueueStore.setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        uploadQueueStore.setOnline(navigator.onLine);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return children;
}
