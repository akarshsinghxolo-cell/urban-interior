"use client";

import * as React from "react";
import { uploadQueueStore } from "./upload-store";

export function useUploadQueue() {
  return React.useSyncExternalStore(
    uploadQueueStore.subscribe,
    uploadQueueStore.getSnapshot,
    uploadQueueStore.getSnapshot,
  );
}
