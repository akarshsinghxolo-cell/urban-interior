import { uploadIndexedDb } from "./upload-indexed-db";
import {
  makeUploadBatchId,
  makeUploadItemId,
  type EnqueueUploadBatchInput,
  type UploadBatchId,
  type UploadBatchRecord,
  type UploadItemId,
  type UploadItemRecord,
  type UploadQueueSnapshot,
} from "./upload-types";

const EMPTY_SNAPSHOT: UploadQueueSnapshot = {
  ready: false,
  online: true,
  batches: [],
  items: [],
};

let snapshot: UploadQueueSnapshot = EMPTY_SNAPSHOT;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: UploadQueueSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
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

async function persistItem(item: UploadItemRecord): Promise<void> {
  updateItemInMemory(item);
  await uploadIndexedDb.putItem(item);
}

async function persistBatch(batch: UploadBatchRecord): Promise<void> {
  updateBatchInMemory(batch);
  await uploadIndexedDb.putBatch(batch);
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
          batches: batches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        });
      } catch (error) {
        console.error("[UploadQueue] Could not restore the durable upload queue", error);
        emit({ ...snapshot, ready: true });
      }
    })();
    return hydratePromise;
  },
  setOnline(online: boolean): void {
    if (snapshot.online === online) return;
    emit({ ...snapshot, online });
    if (online) {
      void this.markWaitingItemsQueued();
    } else {
      void this.markTransferItemsWaiting();
    }
  },
  async enqueueBatch(input: EnqueueUploadBatchInput): Promise<UploadBatchId> {
    if (!input.files.length) throw new Error("Choose at least one file to upload.");
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

    for (const file of input.files) {
      const itemId = makeUploadItemId();
      const item: UploadItemRecord = {
        id: itemId,
        batchId,
        workspaceId: batch.workspaceId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        lastModified: file.lastModified,
        status: online ? "queued" : "waiting_for_network",
        confirmedBytes: 0,
        retryCount: 0,
        createdAt,
        updatedAt: createdAt,
      };
      await uploadIndexedDb.putBlob({ uploadItemId: itemId, blob: file, createdAt });
      await persistItem(item);
    }

    return batchId;
  },
  async retryItem(uploadItemId: UploadItemId): Promise<void> {
    const item = snapshot.items.find((entry) => entry.id === uploadItemId);
    if (!item) return;
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    await persistItem({
      ...item,
      status: online ? "queued" : "waiting_for_network",
      retryAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
  async retryAll(): Promise<void> {
    const retryable = snapshot.items.filter((item) =>
      item.status === "failed_retryable" || item.status === "waiting_for_network" || item.status === "paused",
    );
    for (const item of retryable) await this.retryItem(item.id);
  },
  async cancelItem(uploadItemId: UploadItemId): Promise<void> {
    const item = snapshot.items.find((entry) => entry.id === uploadItemId);
    if (!item || item.status === "completed") return;
    await persistItem({
      ...item,
      status: "cancel_requested",
      updatedAt: new Date().toISOString(),
    });
  },
  async markWaitingItemsQueued(): Promise<void> {
    const waiting = snapshot.items.filter((item) => item.status === "waiting_for_network");
    for (const item of waiting) {
      await persistItem({ ...item, status: "queued", updatedAt: new Date().toISOString() });
    }
  },
  async markTransferItemsWaiting(): Promise<void> {
    const transferStates = new Set(["queued", "preparing", "starting_session", "uploading"]);
    const affected = snapshot.items.filter((item) => transferStates.has(item.status));
    for (const item of affected) {
      await persistItem({ ...item, status: "waiting_for_network", updatedAt: new Date().toISOString() });
    }
  },
};
