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
        emit({
          ready: true,
          online: typeof navigator === "undefined" ? true : navigator.onLine,
          processing: false,
          batches: batches.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
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
      status: online ? "open" : "waiting",
      requiredEvidence: Boolean(input.requiredEvidence),
      createdAt,
      updatedAt: createdAt,
    };
    await persistBatch(batch);

    let queuedCount = 0;
    try {
      for (const [fileIndex, file] of input.files.entries()) {
        const itemOptions = input.fileOptions?.[fileIndex];
        const fingerprint = await fingerprintUploadBlob(file, file.name);
        const duplicate = snapshot.items.find((entry) =>
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
          status: online ? "queued" : "paused",
          confirmedBytes: 0,
          progress: 0,
          retryCount: 0,
          lastErrorCode: online ? undefined : NETWORK_ERROR_CODE,
          lastErrorMessage: online ? undefined : "Upload paused until the network is available.",
          createdAt,
          updatedAt: createdAt,
        };

        await uploadIndexedDb.putBlob({ uploadItemId: itemId, blob: file, createdAt });
        try {
          await persistItem(item);
          queuedCount += 1;
        } catch (error) {
          await uploadIndexedDb.deleteBlob(itemId).catch(() => undefined);
          throw error;
        }
      }
    } catch (error) {
      if (queuedCount === 0) {
        await uploadIndexedDb.deleteBatch(batchId).catch(() => undefined);
        emit({ ...snapshot, batches: snapshot.batches.filter((entry) => entry.id !== batchId) });
      }
      throw error;
    }

    if (queuedCount === 0) {
      await uploadIndexedDb.deleteBatch(batchId);
      emit({ ...snapshot, batches: snapshot.batches.filter((entry) => entry.id !== batchId) });
      throw new Error("Every selected file is already pending for this record on this device.");
    }
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
  async retryItem(uploadItemId: UploadItemId): Promise<void> {
    const item = this.getItem(uploadItemId);
    if (!item) return;
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    await this.patchItem(uploadItemId, {
      status: online ? "queued" : "paused",
      retryAt: undefined,
      lastErrorCode: online ? undefined : NETWORK_ERROR_CODE,
      lastErrorMessage: online ? undefined : "Upload paused until the network is available.",
    });
  },
  async retryAll(): Promise<void> {
    const retryable = snapshot.items.filter((item) => item.status === "paused" || item.status === "failed_permanent");
    for (const item of retryable) await this.retryItem(item.id);
  },
  async cancelItem(uploadItemId: UploadItemId): Promise<void> {
    const item = this.getItem(uploadItemId);
    if (!item || item.status === "completed") return;
    await this.patchItem(uploadItemId, { status: "cancel_requested", retryAt: undefined });
  },
  async cancelBatch(uploadBatchId: UploadBatchId): Promise<void> {
    const items = snapshot.items.filter((item) => item.batchId === uploadBatchId && item.status !== "completed");
    for (const item of items) await this.patchItem(item.id, { status: "cancel_requested", retryAt: undefined });
    const batch = this.getBatch(uploadBatchId);
    if (batch) await this.patchBatch(uploadBatchId, { status: "cancelled" });
  },
  async resumeNetworkPausedItems(): Promise<void> {
    const paused = snapshot.items.filter((item) => item.status === "paused" && item.lastErrorCode === NETWORK_ERROR_CODE);
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
    const affected = snapshot.items.filter((item) => transferStates.has(item.status));
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