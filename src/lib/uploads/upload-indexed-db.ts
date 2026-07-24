import type {
  UploadBatchId,
  UploadBatchRecord,
  UploadBlobRecord,
  UploadItemId,
  UploadItemRecord,
  WorkspaceOutboxRecord,
} from "./upload-types";

const DB_NAME = "urban-castle-uploads";
const DB_VERSION = 1;

const STORES = {
  batches: "upload_batches",
  items: "upload_items",
  blobs: "upload_blobs",
  outbox: "workspace_outbox",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Could not open the upload database."));
    request.onblocked = () => reject(new Error("Upload storage is blocked by another Urban Castle tab."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.batches)) {
        const store = db.createObjectStore(STORES.batches, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.items)) {
        const store = db.createObjectStore(STORES.items, { keyPath: "id" });
        store.createIndex("batchId", "batchId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.blobs)) {
        db.createObjectStore(STORES.blobs, { keyPath: "uploadItemId" });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const store = db.createObjectStore(STORES.outbox, { keyPath: "operationId" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Upload storage request failed."));
  });
}

async function readAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  return await requestResult(transaction.objectStore(storeName).getAll()) as T[];
}

async function get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestResult(transaction.objectStore(storeName).get(key));
  return (result as T | undefined) || null;
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).put(value));
}

async function remove(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).delete(key));
}

export const uploadIndexedDb = {
  readBatches: () => readAll<UploadBatchRecord>(STORES.batches),
  readItems: () => readAll<UploadItemRecord>(STORES.items),
  readOutbox: () => readAll<WorkspaceOutboxRecord>(STORES.outbox),
  getBatch: (id: UploadBatchId) => get<UploadBatchRecord>(STORES.batches, id),
  getItem: (id: UploadItemId) => get<UploadItemRecord>(STORES.items, id),
  putBatch: (batch: UploadBatchRecord) => put(STORES.batches, batch),
  putItem: (item: UploadItemRecord) => put(STORES.items, item),
  putBlob: (record: UploadBlobRecord) => put(STORES.blobs, record),
  putOutbox: (record: WorkspaceOutboxRecord) => put(STORES.outbox, record),
  getBlob: async (uploadItemId: UploadItemId): Promise<Blob | null> => {
    const record = await get<UploadBlobRecord>(STORES.blobs, uploadItemId);
    return record?.blob || null;
  },
  deleteBlob: (uploadItemId: UploadItemId) => remove(STORES.blobs, uploadItemId),
  deleteItem: (uploadItemId: UploadItemId) => remove(STORES.items, uploadItemId),
  deleteBatch: (uploadBatchId: UploadBatchId) => remove(STORES.batches, uploadBatchId),
};
