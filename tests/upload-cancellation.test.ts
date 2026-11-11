import { beforeEach, expect, test, vi } from "vitest";
import type { UploadBatchRecord, UploadItemRecord } from "../src/lib/uploads/upload-types";

const disk = vi.hoisted(() => ({
  items: new Map<string, UploadItemRecord>(),
  batches: new Map<string, UploadBatchRecord>(),
  blobs: new Map<string, Blob>(),
}));
vi.mock("../src/lib/uploads/upload-indexed-db", () => ({
  uploadIndexedDb: {
    readItems: async () => [...disk.items.values()],
    readBatches: async () => [...disk.batches.values()],
    findMissingBlobIds: async (ids: string[]) => new Set(ids.filter((id) => !disk.blobs.has(id))),
    putItems: async (items: UploadItemRecord[]) => items.forEach((item) => disk.items.set(item.id, item)),
    putItem: async (item: UploadItemRecord) => { disk.items.set(item.id, item); },
    putBatch: async (batch: UploadBatchRecord) => { disk.batches.set(batch.id, batch); },
    getItem: async (id: string) => disk.items.get(id),
    getBatch: async (id: string) => disk.batches.get(id),
    deleteItem: async (id: string) => { disk.items.delete(id); },
    deleteBlob: async (id: string) => { disk.blobs.delete(id); },
    deleteBatch: async (id: string) => { disk.batches.delete(id); },
  },
}));

function seed(id: string, patch: Partial<UploadItemRecord> = {}) {
  const item = {
    id, batchId: "batch", status: "failed_permanent", retryCount: 1343,
    lastErrorCode: "FILE_MISSING", lastErrorMessage: "Original file required",
    createdAt: "2026-11-01", ...patch,
  } as UploadItemRecord;
  disk.items.set(id, item);
  disk.batches.set("batch", { id: "batch", status: "open", createdAt: "2026-11-01" } as UploadBatchRecord);
  return item;
}

async function restore() {
  vi.resetModules();
  const { uploadQueueStore } = await import("../src/lib/uploads/upload-store");
  await uploadQueueStore.hydrate();
  return uploadQueueStore;
}

beforeEach(() => {
  disk.items.clear(); disk.batches.clear(); disk.blobs.clear();
});

test("cancel removes a missing-file batch immediately and it stays gone after reload", async () => {
  const first = seed("first"); seed("second");
  const store = await restore();
  await store.cancelBatch(first.batchId);
  expect(store.getSnapshot().items).toEqual([]);
  expect(store.getSnapshot().batches).toEqual([]);
  const reloaded = await restore();
  expect(reloaded.getSnapshot().items).toEqual([]);
  expect(reloaded.getNextProcessableItem()).toBeUndefined();
});

test("cancelling a mixed batch keeps completed files and schedules only actual remote cleanup", async () => {
  const local = seed("local");
  const remote = seed("remote", { sessionUri: "https://example.test/session" });
  seed("saved", { status: "completed" });
  const store = await restore();
  await store.cancelBatch(local.batchId);
  expect(store.getItem(local.id)).toBeUndefined();
  expect(store.getItem(remote.id)).toMatchObject({ status: "cancel_requested", retryCount: 0 });
  expect(store.getItem(remote.id)?.lastErrorCode).toBeUndefined();
  expect(store.getNextProcessableItem()?.id).toBe(remote.id);
  expect(disk.items.get("saved")?.status).toBe("completed");
  await store.retryAll();
  expect(store.getItem(remote.id)?.status).toBe("cancel_requested");
});

test("a late transfer response cannot restart a cancelled upload", async () => {
  const item = seed("active", { status: "starting_session" });
  // A valid file prevents hydration from marking the active transfer as missing.
  disk.blobs.set(item.id, new Blob(["file"]));
  const store = await restore();
  await store.cancelItem(item.id);
  await store.patchItem(item.id, { status: "uploaded_unverified", googleFileId: "drive-id" as UploadItemRecord["googleFileId"] });
  expect(store.getItem(item.id)).toMatchObject({ status: "cancel_requested", googleFileId: "drive-id" });
  expect((await restore()).getItem(item.id)?.status).toBe("cancel_requested");
});

test("a cancelled draft is removed without waiting for the upload worker", async () => {
  const item = seed("draft", { deferred: true });
  // Hydration removes abandoned drafts; simulate a fresh draft after hydration instead.
  const store = await restore();
  disk.items.set(item.id, item);
  disk.batches.set(item.batchId, { id: item.batchId, status: "waiting" } as UploadBatchRecord);
  await store.patchItem(item.id, item);
  await store.cancelItem(item.id);
  expect(disk.items.has(item.id)).toBe(false);
});

test("missing files stop at hydration and Retry all cannot revive them", async () => {
  const item = seed("old", { status: "paused", retryAt: "2020-01-01" });
  const store = await restore();
  await store.retryAll();
  expect(store.getItem(item.id)).toMatchObject({ status: "failed_permanent", lastErrorCode: "FILE_MISSING" });
  expect(store.getNextProcessableItem()).toBeUndefined();
});

test("a cancellation can finish even if an old job has lost its batch record", async () => {
  const item = seed("orphan", { sessionUri: "https://example.test/session" });
  disk.batches.clear();
  const store = await restore();
  await store.cancelItem(item.id);
  expect(store.getNextProcessableItem()?.id).toBe(item.id);
});
