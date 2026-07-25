import type {
  UploadBatchId,
  UploadBatchRecord,
  UploadBlobRecord,
  UploadItemId,
  UploadItemRecord,
} from "./upload-types";
import type { WorkspaceCommitOutboxRecord } from "./workspace-outbox-types";

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
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Could not open the upload database."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Upload storage is blocked by another Urban Castle tab. Close older tabs and retry."));
    };
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
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      db.onclose = () => {
        databasePromise = null;
      };
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

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Upload storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Upload storage transaction was aborted."));
  });
}

async function readAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestResult(transaction.objectStore(storeName).getAll()) as T[];
  await transactionDone(transaction);
  return result;
}

async function get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestResult(transaction.objectStore(storeName).get(key));
  await transactionDone(transaction);
  return (result as T | undefined) || null;
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

async function remove(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

async function clear(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

export const uploadIndexedDb = {
  readBatches: () => readAll<UploadBatchRecord>(STORES.batches),
  readItems: () => readAll<UploadItemRecord>(STORES.items),
  readWorkspaceOutbox: () => readAll<WorkspaceCommitOutboxRecord>(STORES.outbox),
  getBatch: (id: UploadBatchId) => get<UploadBatchRecord>(STORES.batches, id),
  getItem: (id: UploadItemId) => get<UploadItemRecord>(STORES.items, id),
  getWorkspaceOutbox: (operationId: string) => get<WorkspaceCommitOutboxRecord>(STORES.outbox, operationId),
  putBatch: (batch: UploadBatchRecord) => put(STORES.batches, batch),
  putItem: (item: UploadItemRecord) => put(STORES.items, item),
  putBlob: (record: UploadBlobRecord) => put(STORES.blobs, record),
  putWorkspaceOutbox: (record: WorkspaceCommitOutboxRecord) => put(STORES.outbox, record),
  getBlob: async (uploadItemId: UploadItemId): Promise<Blob | null> => {
    const record = await get<UploadBlobRecord>(STORES.blobs, uploadItemId);
    return record?.blob || null;
  },
  deleteBlob: (uploadItemId: UploadItemId) => remove(STORES.blobs, uploadItemId),
  deleteItem: (uploadItemId: UploadItemId) => remove(STORES.items, uploadItemId),
  deleteBatch: (uploadBatchId: UploadBatchId) => remove(STORES.batches, uploadBatchId),
  deleteWorkspaceOutbox: (operationId: string) => remove(STORES.outbox, operationId),
  clearWorkspaceOutbox: () => clear(STORES.outbox),
};