import { uploadPurposeAllowedForEntity } from "./upload-purpose";
import { uploadIndexedDb } from "./upload-indexed-db";
import { fingerprintUploadBlob } from "./upload-fingerprint";
import {
  makeAttachmentId,
  makeFileAssetId,
  makeUploadBatchId,
  makeUploadItemId,
  type EnqueueUploadBatchInput,
  type UploadBatchId,
  type UploadBatchRecord,
  type UploadItemId,
  type UploadItemRecord,
  type UploadQueueSnapshot,
} from "./upload-types";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const NETWORK_ERROR_CODE = "NETWORK";
const EMPTY_SNAPSHOT: UploadQueueSnapshot = {
  ready: false,
  online: true,
  processing: false,
  batches: [],
  items: [],
};

let snapshot: UploadQueueSnapshot = EMPTY_SNAPSHOT;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: UploadQueueSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("uc-upload-queue-kick"));
}

function updateItemInMemory(item: UploadItemRecord): void {
  emit({
    ...snapshot,
    items: snapshot.items.some((entry) => entry.id === item.id)
      ? snapshot.items.map((entry) => entry.id === item.id ? item : entry)
      : [...snapshot.items, item],
  });
}

function updateBatchInMemory(batch: UploadBatchRecord): void {
  emit({
    ...snapshot,
    batches: snapshot.batches.some((entry) => entry.id === batch.id)
      ? snapshot.batches.map((entry) => entry.id === batch.id ? batch : entry)
      : [...snapshot.batches, batch],
  });
}

async function persistItem(item: UploadItemRecord): Promise<UploadItemRecord> {
  await uploadIndexedDb.putItem(item);
  updateItemInMemory(item);
  return item;
}

async function persistBatch(batch: UploadBatchRecord): Promise<UploadBatchRecord> {
  await uploadIndexedDb.putBatch(batch);
  updateBatchInMemory(batch);
  return batch;
}

function itemIsProcessable(item: UploadItemRecord): boolean {
  if (item.deferred) return false;
  if (["completed", "cancelled", "failed_permanent", "cleanup_pending"].includes(item.status)) return false;
  if (item.retryAt && Date.parse(item.retryAt) > Date.now()) return false;
  return true;
}

function validateFiles(files: File[]): void {
  if (!files.length) throw new Error("Choose at least one file to upload.");
  const empty = files.find((file) => file.size <= 0);
  if (empty) throw new Error(`${empty.name || "The selected file"} is empty and cannot be uploaded.`);
  const tooLarge = files.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (tooLarge) throw new Error(`${tooLarge.name} exceeds the 100 MB upload limit.`);
}

export const uploadQueueStore = {
  getSnapshot(): UploadQueueSnapshot {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async hydrate(): Promise<void> {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        const [batches, items] = await Promise.all([
          uploadIndexedDb.readBatches(),
          uploadIndexedDb.readItems(),
        ]);

        // Deferred batches belong to an in-memory Save/Cancel draft. If the page
        // was reloaded, that draft no longer exists, so keeping its private file
        // bytes would create uploads the user never committed. Discard them.
        const staleDraftItems = items.filter((item) => item.deferred);
        const staleDraftIds = new Set(staleDraftItems.map((item) => item.id));
        let restoredItems = items.filter((item) => !staleDraftIds.has(item.id));
        if (staleDraftItems.length) {
          await Promise.all(staleDraftItems.flatMap((item) => [
            uploadIndexedDb.deleteBlob(item.id),
            uploadIndexedDb.deleteItem(item.id),
          ]));
        }
        // File bytes live only in this browser. Older releases could leave a
        // retrying record behind after those bytes disappeared; stop it once
        // instead of retrying forever on every workspace refresh.
        const transferableItems = restoredItems.filter((item) => !item.deferred
          && !item.googleFileId
          && !["completed", "cancelled", "cancel_requested", "failed_permanent", "cleanup_pending"].includes(item.status));
        const missingBlobIds = await uploadIndexedDb.findMissingBlobIds(transferableItems.map((item) => item.id));
        if (missingBlobIds.size) {
          const updatedAt = new Date().toISOString();
          restoredItems = restoredItems.map((item) => missingBlobIds.has(item.id) ? {
            ...item,
            status: "failed_permanent" as const,
            retryAt: undefined,
            lastErrorCode: "FILE_MISSING",
            lastErrorMessage: "The original file is no longer available on this device. Select it again or remove this upload.",
            updatedAt,
          } : item);
          await uploadIndexedDb.putItems(restoredItems.filter((item) => missingBlobIds.has(item.id)));
        }
        const restoredBatchIds = new Set(restoredItems.map((item) => item.batchId));
        const staleDraftBatches = batches.filter((batch) =>
          items.some((item) => item.batchId === batch.id && item.deferred) &&
          !restoredBatchIds.has(batch.id),
        );
        if (staleDraftBatches.length) {
          await Promise.all(staleDraftBatches.map((batch) => uploadIndexedDb.deleteBatch(batch.id)));
        }
        const staleBatchIds = new Set(staleDraftBatches.map((batch) => batch.id));
        const restoredBatches = batches.filter((batch) => !staleBatchIds.has(batch.id));

        emit({
          ready: true,
          online: typeof navigator === "undefined" ? true : navigator.onLine,
          processing: false,
          batches: restoredBatches.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          items: restoredItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        });
      } catch (error) {
        hydratePromise = null;
        console.error("[UploadQueue] Could not restore the durable upload queue", error);
        emit({ ...snapshot, ready: true });
        throw error;
      }
    })();
    return hydratePromise;
  },
  setProcessing(processing: boolean): void {
    if (snapshot.processing === processing) return;
    emit({ ...snapshot, processing });
  },
  setOnline(online: boolean): void {
    if (snapshot.online === online) return;
    emit({ ...snapshot, online });
    const transition = online ? this.resumeNetworkPausedItems() : this.pauseTransfersForNetwork();
    void transition.catch((error) => console.error("[UploadQueue] Connectivity transition failed", error));
  },
  async enqueueBatch(input: EnqueueUploadBatchInput): Promise<UploadBatchId> {
    validateFiles(input.files);
    if (!uploadPurposeAllowedForEntity(input.targetEntityType, input.purpose)) {
      throw new Error(`Upload purpose "${input.purpose}" does not belong to ${input.targetEntityType}.`);
    }
    await this.hydrate();
    const createdAt = new Date().toISOString();
    const batchId = makeUploadBatchId();
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const batch: UploadBatchRecord = {
      id: batchId,
      workspaceId: input.workspaceId || "default",
      sourceFlow: input.sourceFlow,
      sourceLabel: input.sourceLabel,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      targetLabel: input.targetLabel,
      purpose: input.purpose,
      status: input.deferProcessing ? "waiting" : online ? "open" : "waiting",
      requiredEvidence: Boolean(input.requiredEvidence),
      createdAt,
      updatedAt: createdAt,
    };
    const items: UploadItemRecord[] = [];
    const blobs: import("./upload-types").UploadBlobRecord[] = [];
      for (const [fileIndex, file] of input.files.entries()) {
        const itemOptions = input.fileOptions?.[fileIndex];
        const fingerprint = await fingerprintUploadBlob(file, file.name);
        const duplicate = [...snapshot.items, ...items].find((entry) =>
          entry.fingerprint === fingerprint &&
          entry.fileName === file.name &&
          entry.sizeBytes === file.size &&
          entry.targetEntityType === batch.targetEntityType &&
          entry.targetEntityId === batch.targetEntityId &&
          entry.purpose === batch.purpose &&
          !["completed", "cancelled", "failed_permanent"].includes(entry.status),
        );
        if (duplicate) continue;

        const itemId = makeUploadItemId();
        const item: UploadItemRecord = {
          id: itemId,
          batchId,
          workspaceId: batch.workspaceId,
          fileAssetId: makeFileAssetId(itemId),
          attachmentId: makeAttachmentId(itemId),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          lastModified: file.lastModified,
          fingerprint,
          sourceFlow: batch.sourceFlow,
          purpose: batch.purpose,
          targetEntityType: batch.targetEntityType,
          targetEntityId: batch.targetEntityId,
          desiredTargetEntityType: input.desiredTargetEntityType,
          kind: itemOptions?.kind || input.kind || "document",
          role: itemOptions?.role || input.role || "document",
          caption: itemOptions?.caption ?? input.caption,
          visibility: itemOptions?.visibility || input.visibility || "internal",
          customerShareable: itemOptions?.customerShareable ?? Boolean(input.customerShareable),
          attachmentField: itemOptions?.attachmentField ?? input.attachmentField,
          attachmentFieldMode: itemOptions?.attachmentFieldMode ?? input.attachmentFieldMode,
          requiredEvidence: batch.requiredEvidence,
          deferred: Boolean(input.deferProcessing),
          status: input.deferProcessing ? "paused" : online ? "queued" : "paused",
          confirmedBytes: 0,
          progress: 0,
          retryCount: 0,
          lastErrorCode: input.deferProcessing ? undefined : online ? undefined : NETWORK_ERROR_CODE,
          lastErrorMessage: input.deferProcessing ? undefined : online ? undefined : "Upload paused until the network is available.",
          createdAt,
          updatedAt: createdAt,
        };

        items.push(item);
        blobs.push({ uploadItemId: itemId, blob: file, createdAt });
      }
    if (!items.length) {
      throw new Error("Every selected file is already pending for this record on this device.");
    }
    // No transfer starts until every file in this batch is durably stored.
    await uploadIndexedDb.putUploadBatch(batch, items, blobs);
    emit({ ...snapshot, batches: [...snapshot.batches, batch], items: [...snapshot.items, ...items] });
    return batchId;
  },
  async patchItem(uploadItemId: UploadItemId, patch: Partial<UploadItemRecord>): Promise<UploadItemRecord> {
    const item = snapshot.items.find((entry) => entry.id === uploadItemId) || await uploadIndexedDb.getItem(uploadItemId);
    if (!item) throw new Error("Pending upload was not found on this device.");
    return persistItem({ ...item, ...patch, updatedAt: new Date().toISOString() });
  },
  async patchBatch(uploadBatchId: UploadBatchId, patch: Partial<UploadBatchRecord>): Promise<UploadBatchRecord> {
    const batch = snapshot.batches.find((entry) => entry.id === uploadBatchId) || await uploadIndexedDb.getBatch(uploadBatchId);
    if (!batch) throw new Error("Upload batch was not found on this device.");
    return persistBatch({ ...batch, ...patch, updatedAt: new Date().toISOString() });
  },
  getBatch(uploadBatchId: UploadBatchId): UploadBatchRecord | undefined {
    return snapshot.batches.find((entry) => entry.id === uploadBatchId);
  },
  getItem(uploadItemId: UploadItemId): UploadItemRecord | undefined {
    return snapshot.items.find((entry) => entry.id === uploadItemId);
  },
  getNextProcessableItem(): UploadItemRecord | undefined {
    for (const batch of snapshot.batches) {
      const item = snapshot.items.find((entry) => entry.batchId === batch.id && itemIsProcessable(entry));
      if (item) return item;
    }
    return undefined;
  },
  batchSizeBytes(uploadBatchId: UploadBatchId): number {
    return snapshot.items.filter((item) => item.batchId === uploadBatchId).reduce((sum, item) => sum + item.sizeBytes, 0);
  },
  getBlob(uploadItemId: UploadItemId): Promise<Blob | null> {
    return uploadIndexedDb.getBlob(uploadItemId);
  },
  async completeItem(uploadItemId: UploadItemId): Promise<void> {
    const item = this.getItem(uploadItemId) || await uploadIndexedDb.getItem(uploadItemId);
    if (!item) return;
    await uploadIndexedDb.deleteBlob(uploadItemId);
    await uploadIndexedDb.deleteItem(uploadItemId);
    const remainingItems = snapshot.items.filter((entry) => entry.id !== uploadItemId);
    let remainingBatches = snapshot.batches;
    if (!remainingItems.some((entry) => entry.batchId === item.batchId)) {
      await uploadIndexedDb.deleteBatch(item.batchId);
      remainingBatches = snapshot.batches.filter((entry) => entry.id !== item.batchId);
    }
    emit({ ...snapshot, items: remainingItems, batches: remainingBatches });
  },
  async releaseDeferredBatch(uploadBatchId: UploadBatchId): Promise<void> {
    await this.hydrate();
    const batch = this.getBatch(uploadBatchId);
    if (!batch) return;
    const deferredItems = snapshot.items.filter((item) => item.batchId === uploadBatchId && item.deferred);
    if (!deferredItems.length) return;
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    await this.patchBatch(uploadBatchId, { status: online ? "open" : "waiting" });
    for (const item of deferredItems) {
      await this.patchItem(item.id, {
        deferred: false,
        status: online ? "queued" : "paused",
        retryAt: undefined,
        lastErrorCode: online ? undefined : NETWORK_ERROR_CODE,
        lastErrorMessage: online ? undefined : "Upload paused until the network is available.",
      });
    }
  },
  async discardDeferredBatch(uploadBatchId: UploadBatchId): Promise<void> {
    await this.hydrate();
    const batchItems = snapshot.items.filter((item) => item.batchId === uploadBatchId);
    const deferredItems = batchItems.filter((item) => item.deferred);
    for (const item of deferredItems) {
      await uploadIndexedDb.deleteBlob(item.id).catch(() => undefined);
      await uploadIndexedDb.deleteItem(item.id).catch(() => undefined);
    }

    const deferredIds = new Set(deferredItems.map((item) => item.id));
    const remainingItems = snapshot.items.filter((item) => !deferredIds.has(item.id));
    const remainingInBatch = remainingItems.filter((item) => item.batchId === uploadBatchId);
    if (!remainingInBatch.length) {
      await uploadIndexedDb.deleteBatch(uploadBatchId).catch(() => undefined);
      emit({
        ...snapshot,
        items: remainingItems,
        batches: snapshot.batches.filter((batch) => batch.id !== uploadBatchId),
      });
      return;
    }

    // Defensive fallback for an unexpected mixed batch: locally discard only
    // draft-held items and cancel any already-released items through the normal
    // cleanup path.
    emit({ ...snapshot, items: remainingItems });
    await this.cancelBatch(uploadBatchId);
  },
  async retryItem(uploadItemId: UploadItemId): Promise<void> {
    const item = this.getItem(uploadItemId);
    if (!item || item.deferred || !["paused", "failed_permanent"].includes(item.status)) return;
    if (item.lastErrorCode === "FILE_MISSING") throw new Error("Select the original file again before retrying.");
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    await this.patchItem(uploadItemId, {
      status: online ? "queued" : "paused",
      retryCount: 0,
      retryAt: undefined,
      lastErrorCode: online ? undefined : NETWORK_ERROR_CODE,
      lastErrorMessage: online ? undefined : "Upload paused until the network is available.",
    });
  },
  async retryAll(): Promise<void> {
    const retryable = snapshot.items.filter((item) => !item.deferred && item.lastErrorCode !== "FILE_MISSING" && (item.status === "paused" || item.status === "failed_permanent"));
    for (const item of retryable) await this.retryItem(item.id);
  },
  async reselectFile(uploadItemId: UploadItemId, file: File): Promise<void> {
    const item = this.getItem(uploadItemId);
    if (!item || item.lastErrorCode !== "FILE_MISSING") throw new Error("This upload is not waiting for a replacement file.");
    const fingerprint = await fingerprintUploadBlob(file, item.fileName);
    if (file.size !== item.sizeBytes || fingerprint !== item.fingerprint) {
      throw new Error(`Choose the original ${item.fileName}. This file does not match the pending upload.`);
    }
    await uploadIndexedDb.putBlob({ uploadItemId, blob: file, createdAt: new Date().toISOString() });
    await this.patchItem(uploadItemId, { lastErrorCode: undefined });
    await this.retryItem(uploadItemId);
  },
  async cancelItem(uploadItemId: UploadItemId): Promise<void> {
    const item = this.getItem(uploadItemId);
    if (!item || item.status === "completed") return;
    if (item.deferred) {
      await uploadIndexedDb.deleteBlob(uploadItemId).catch(() => undefined);
      await uploadIndexedDb.deleteItem(uploadItemId).catch(() => undefined);
      const remainingItems = snapshot.items.filter((entry) => entry.id !== uploadItemId);
      let remainingBatches = snapshot.batches;
      if (!remainingItems.some((entry) => entry.batchId === item.batchId)) {
        await uploadIndexedDb.deleteBatch(item.batchId).catch(() => undefined);
        remainingBatches = snapshot.batches.filter((batch) => batch.id !== item.batchId);
      }
      emit({ ...snapshot, items: remainingItems, batches: remainingBatches });
      return;
    }
    await this.patchItem(uploadItemId, { status: "cancel_requested", retryAt: undefined });
  },
  async cancelBatch(uploadBatchId: UploadBatchId): Promise<void> {
    const items = snapshot.items.filter((item) => item.batchId === uploadBatchId && item.status !== "completed");
    for (const item of items) await this.patchItem(item.id, { status: "cancel_requested", retryAt: undefined });
    const batch = this.getBatch(uploadBatchId);
    if (batch) await this.patchBatch(uploadBatchId, { status: "cancelled" });
  },
  async resumeNetworkPausedItems(): Promise<void> {
    const paused = snapshot.items.filter((item) => !item.deferred && item.status === "paused" && item.lastErrorCode === NETWORK_ERROR_CODE);
    for (const item of paused) {
      await this.patchItem(item.id, {
        status: "queued",
        retryAt: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
    }
  },
  async pauseTransfersForNetwork(): Promise<void> {
    const transferStates = new Set(["queued", "preparing", "starting_session", "uploading"]);
    const affected = snapshot.items.filter((item) => !item.deferred && transferStates.has(item.status));
    for (const item of affected) {
      await this.patchItem(item.id, {
        status: "paused",
        retryAt: undefined,
        lastErrorCode: NETWORK_ERROR_CODE,
        lastErrorMessage: "Upload paused until the network is available.",
      });
    }
  },
};
