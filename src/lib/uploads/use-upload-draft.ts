"use client";

import * as React from "react";
import { uploadQueueStore } from "./upload-store";
import type { UploadBatchId } from "./upload-types";

/** Tracks locally deferred upload batches owned by a Save/Cancel draft. */
export function useUploadDraft(active: boolean) {
  const batchesRef = React.useRef(new Set<UploadBatchId>());
  const previouslyActiveRef = React.useRef(active);

  const registerBatch = React.useCallback((batchId: UploadBatchId) => {
    batchesRef.current.add(batchId);
    return batchId;
  }, []);

  const commitBatches = React.useCallback(() => {
    const batches = [...batchesRef.current];
    batchesRef.current.clear();
    for (const batchId of batches) {
      void uploadQueueStore.releaseDeferredBatch(batchId).catch((error) =>
        console.error("[UploadDraft] Could not release saved uploads", error),
      );
    }
  }, []);

  const cancelBatches = React.useCallback(async () => {
    const batches = [...batchesRef.current];
    batchesRef.current.clear();
    for (const batchId of batches) await uploadQueueStore.discardDeferredBatch(batchId);
  }, []);

  React.useEffect(() => {
    if (previouslyActiveRef.current && !active && batchesRef.current.size) {
      void cancelBatches().catch((error) => console.error("[UploadDraft] Could not cancel unsaved uploads", error));
    }
    previouslyActiveRef.current = active;
  }, [active, cancelBatches]);

  React.useEffect(() => () => {
    if (batchesRef.current.size) {
      void cancelBatches().catch((error) => console.error("[UploadDraft] Could not clean up uploads", error));
    }
  }, [cancelBatches]);

  return { registerBatch, commitBatches, cancelBatches };
}
