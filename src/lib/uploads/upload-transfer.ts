"use client";

import { useRDashStore } from "@/lib/rdash/store";
import { uploadQueueStore } from "./upload-store";
import type { FinalizedUploadResult, GoogleFileId, InitiateUploadResponse, UploadItemId, UploadItemRecord } from "./upload-types";

const MB = 1024 * 1024;
const RETRY_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const LEASE_KEY = "uc-upload-manager-lease";
const LEASE_MS = 20_000;
const LEASE_RENEW_MS = 5_000;
const MAX_SESSION_RESTARTS = 2;
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
let running: Promise<void> | null = null;

class UploadCancelledError extends Error {
  constructor() {
    super("Upload was cancelled.");
    this.name = "UploadCancelledError";
  }
}

const jsonPost = async <T>(action: string, body: unknown): Promise<T> => {
  const response = await fetch(`/api/uploads/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Upload ${action} failed.`);
  return payload;
};

const chunkSize = (retries: number) => retries >= 4 ? 2 * MB : retries >= 2 ? 4 * MB : 8 * MB;
const rangeEnd = (response: Response, fallback: number) => Number(response.headers.get("range")?.match(/-(\d+)$/)?.[1] || fallback);

function latestItem(uploadItemId: UploadItemId): UploadItemRecord {
  const item = uploadQueueStore.getItem(uploadItemId);
  if (!item) throw new UploadCancelledError();
  return item;
}

function assertNotCancelled(uploadItemId: UploadItemId): UploadItemRecord {
  const item = latestItem(uploadItemId);
  if (item.status === "cancel_requested" || item.status === "cancelled" || item.status === "cleanup_pending") {
    throw new UploadCancelledError();
  }
  return item;
}

async function initiate(item: UploadItemRecord): Promise<UploadItemRecord> {
  assertNotCancelled(item.id);
  const batch = uploadQueueStore.getBatch(item.batchId);
  if (!batch) throw new Error("Upload batch is missing on this device.");
  await uploadQueueStore.patchItem(item.id, { status: "starting_session", lastErrorMessage: undefined });
  const session = await jsonPost<InitiateUploadResponse>("initiate", {
    uploadBatchId: item.batchId,
    uploadItemId: item.id,
    fileAssetId: item.fileAssetId,
    attachmentId: item.attachmentId,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    batchSizeBytes: uploadQueueStore.batchSizeBytes(item.batchId),
    lastModified: item.lastModified,
    fingerprint: item.fingerprint,
    sourceFlow: item.sourceFlow,
    sourceLabel: batch.sourceLabel,
    purpose: item.purpose,
    targetEntityType: item.targetEntityType,
    targetEntityId: item.targetEntityId,
    desiredTargetEntityType: item.desiredTargetEntityType,
    kind: item.kind,
    role: item.role,
    caption: item.caption,
    visibility: item.visibility,
    customerShareable: item.customerShareable,
    attachmentField: item.attachmentField,
    attachmentFieldMode: item.attachmentFieldMode,
    requiredEvidence: item.requiredEvidence,
  });
  assertNotCancelled(item.id);
  await uploadQueueStore.patchBatch(item.batchId, { status: "uploading", storageAccountId: session.storageAccountId });
  return uploadQueueStore.patchItem(item.id, {
    status: "uploading",
    sessionUri: session.sessionUri,
    sessionExpiresAt: session.sessionExpiresAt,
    storageAccountId: session.storageAccountId,
    stagingFolderId: session.stagingFolderId,
    confirmedBytes: session.confirmedBytes || 0,
  });
}

async function querySession(item: UploadItemRecord) {
  if (!item.sessionUri) return { confirmed: 0, completed: undefined as Record<string, unknown> | undefined, expired: false };
  const response = await fetch(item.sessionUri, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${item.sizeBytes}`, "Content-Length": "0" },
  });
  if (response.status === 404) return { confirmed: 0, completed: undefined, expired: true };
  if (response.status === 200 || response.status === 201) {
    return { confirmed: item.sizeBytes, completed: await response.json().catch(() => ({})), expired: false };
  }
  if (response.status === 308) return { confirmed: rangeEnd(response, -1) + 1, completed: undefined, expired: false };
  if (response.status === 429 || response.status >= 500) throw new TypeError(`Drive session query temporarily failed (${response.status}).`);
  throw new Error(`Drive session query returned ${response.status}.`);
}

async function recordDriveCompletion(item: UploadItemRecord, googleFileId: GoogleFileId): Promise<void> {
  await jsonPost("progress", {
    uploadItemId: item.id,
    confirmedBytes: item.sizeBytes,
    progress: 100,
    status: "uploaded_unverified",
    googleFileId,
  });
}

async function uploadBytes(item: UploadItemRecord, sessionRestarts = 0): Promise<UploadItemRecord> {
  const blob = await uploadQueueStore.getBlob(item.id);
  if (!blob) throw new Error("The selected file is no longer available on this device.");
  if (blob.size <= 0) throw new Error("Empty files cannot be uploaded.");

  assertNotCancelled(item.id);
  let current = item.sessionUri ? item : await initiate(item);
  const resumed = await querySession(current);
  if (resumed.expired) {
    if (sessionRestarts >= MAX_SESSION_RESTARTS) throw new Error("The Drive upload session repeatedly expired. Retry the file later.");
    const reset = await uploadQueueStore.patchItem(current.id, { sessionUri: undefined, sessionExpiresAt: undefined, confirmedBytes: 0, progress: 0 });
    return uploadBytes(reset, sessionRestarts + 1);
  }
  if (resumed.completed) {
    const googleFileId = String(resumed.completed.id || "") as GoogleFileId;
    if (!googleFileId) throw new Error("Drive completed without a file ID.");
    await recordDriveCompletion(current, googleFileId);
    return uploadQueueStore.patchItem(current.id, {
      status: "uploaded_unverified",
      googleFileId,
      confirmedBytes: current.sizeBytes,
      progress: 100,
    });
  }
  if (resumed.confirmed !== current.confirmedBytes) {
    current = await uploadQueueStore.patchItem(current.id, {
      confirmedBytes: resumed.confirmed,
      progress: Math.round(resumed.confirmed / current.sizeBytes * 100),
    });
  }

  let offset = current.confirmedBytes;
  while (offset < current.sizeBytes) {
    current = assertNotCancelled(current.id);
    if (!navigator.onLine) throw new TypeError("Network unavailable");
    const end = Math.min(current.sizeBytes, offset + chunkSize(current.retryCount));
    const response = await fetch(current.sessionUri!, {
      method: "PUT",
      headers: {
        "Content-Type": current.mimeType,
        "Content-Length": String(end - offset),
        "Content-Range": `bytes ${offset}-${end - 1}/${current.sizeBytes}`,
      },
      body: blob.slice(offset, end, current.mimeType),
    });

    if (response.status === 308) {
      offset = rangeEnd(response, end - 1) + 1;
      if (offset < 0 || offset > current.sizeBytes) throw new Error("Drive returned an invalid confirmed byte range.");
      current = await uploadQueueStore.patchItem(current.id, {
        status: "uploading",
        confirmedBytes: offset,
        progress: Math.round(offset / current.sizeBytes * 100),
      });
      void jsonPost("progress", {
        uploadItemId: current.id,
        confirmedBytes: offset,
        progress: current.progress,
        status: "uploading",
      }).catch(() => undefined);
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      const payload = await response.json().catch(() => ({})) as { id?: string; webViewLink?: string; thumbnailLink?: string };
      if (!payload.id) throw new Error("Drive completed without a file ID.");
      const googleFileId = payload.id as GoogleFileId;
      const completed = await uploadQueueStore.patchItem(current.id, {
        status: "uploaded_unverified",
        googleFileId,
        webViewLink: payload.webViewLink,
        thumbnailLink: payload.thumbnailLink,
        confirmedBytes: current.sizeBytes,
        progress: 100,
      });
      await recordDriveCompletion(completed, googleFileId);
      return completed;
    }

    if (response.status === 404 || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
      if (sessionRestarts >= MAX_SESSION_RESTARTS) throw new Error(`Drive rejected the resumable session with status ${response.status}.`);
      const reset = await uploadQueueStore.patchItem(current.id, {
        sessionUri: undefined,
        sessionExpiresAt: undefined,
        confirmedBytes: 0,
        progress: 0,
        status: "queued",
      });
      return uploadBytes(reset, sessionRestarts + 1);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new TypeError(`Drive temporarily rejected ${current.fileName} with status ${response.status}.`);
    }
    throw new Error(`Drive rejected ${current.fileName} with status ${response.status}.`);
  }
  throw new Error("Drive upload ended without a completed file response.");
}

function applyResult(result: FinalizedUploadResult) {
  useRDashStore.setState((state) => {
    const assets = state.db.master.fileAssets || [];
    const links = state.db.entityFileAttachments || [];
    return {
      db: {
        ...state.db,
        master: {
          ...state.db.master,
          fileAssets: assets.some((entry) => entry.id === result.fileAsset.id)
            ? assets.map((entry) => entry.id === result.fileAsset.id ? result.fileAsset : entry)
            : [...assets, result.fileAsset],
        },
        entityFileAttachments: links.some((entry) => entry.id === result.attachment.id)
          ? links.map((entry) => entry.id === result.attachment.id ? result.attachment : entry)
          : [...links, result.attachment],
      },
    };
  });
}

async function finalize(item: UploadItemRecord) {
  const latest = assertNotCancelled(item.id);
  if (!latest.googleFileId) throw new Error("Drive file ID is missing.");
  await uploadQueueStore.patchItem(latest.id, { status: "verifying" });
  assertNotCancelled(latest.id);
  const result = await jsonPost<FinalizedUploadResult>("finalize", {
    uploadItemId: latest.id,
    googleFileId: latest.googleFileId,
    targetEntityType: latest.targetEntityType,
    targetEntityId: latest.targetEntityId,
    purpose: latest.purpose,
    attachmentField: latest.attachmentField,
    attachmentFieldMode: latest.attachmentFieldMode,
  });
  assertNotCancelled(latest.id);
  applyResult(result);
  await uploadQueueStore.patchItem(latest.id, {
    status: "completed",
    finalFolderId: result.storageFolderId,
    verifiedAt: result.verifiedAt,
    finalizedAt: new Date().toISOString(),
    progress: 100,
  });
  await uploadQueueStore.completeItem(latest.id);
}

async function cancel(item: UploadItemRecord) {
  await uploadQueueStore.patchItem(item.id, { status: "cleanup_pending" });
  await jsonPost("cancel", { uploadItemId: item.id, googleFileId: item.googleFileId });
  await uploadQueueStore.completeItem(item.id);
}

async function processItem(initial: UploadItemRecord) {
  try {
    let item = latestItem(initial.id);
    if (item.status === "cancel_requested") return cancel(item);
    const uploaded = item.googleFileId ? item : await uploadBytes(item);
    item = latestItem(uploaded.id);
    if (item.status === "cancel_requested") return cancel(item);
    if (item.googleFileId) await finalize(item);
  } catch (error) {
    const latest = uploadQueueStore.getItem(initial.id);
    if (!latest) return;
    if (error instanceof UploadCancelledError || latest.status === "cancel_requested") {
      await cancel(latest).catch(async (cleanupError) => {
        await uploadQueueStore.patchItem(latest.id, {
          status: "cleanup_pending",
          lastErrorCode: "CLEANUP_ERROR",
          lastErrorMessage: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    const network = error instanceof TypeError || /network|fetch|offline|temporarily/i.test(message);
    const retryCount = latest.retryCount + 1;
    await uploadQueueStore.patchItem(latest.id, {
      status: network ? "waiting_for_network" : "failed_retryable",
      retryCount,
      retryAt: new Date(Date.now() + RETRY_MS[Math.min(retryCount - 1, RETRY_MS.length - 1)]).toISOString(),
      lastErrorCode: network ? "NETWORK" : "UPLOAD_ERROR",
      lastErrorMessage: message,
    });
  }
}

async function run() {
  await uploadQueueStore.hydrate();
  uploadQueueStore.setProcessing(true);
  try {
    while (typeof navigator === "undefined" || navigator.onLine) {
      const item = uploadQueueStore.getNextProcessableItem();
      if (!item) break;
      await processItem(item);
    }
  } finally {
    uploadQueueStore.setProcessing(false);
  }
}

async function withLocalStorageLease(work: () => Promise<void>) {
  const now = Date.now();
  let lease: { owner?: string; expiresAt?: number } = {};
  try {
    lease = JSON.parse(localStorage.getItem(LEASE_KEY) || "{}");
    if (lease.owner && lease.owner !== TAB_ID && Number(lease.expiresAt || 0) > now) return;
    localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: TAB_ID, expiresAt: now + LEASE_MS }));
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    const claimed = JSON.parse(localStorage.getItem(LEASE_KEY) || "{}");
    if (claimed.owner !== TAB_ID) return;
  } catch {
    await work();
    return;
  }

  const renew = window.setInterval(() => {
    try {
      const current = JSON.parse(localStorage.getItem(LEASE_KEY) || "{}");
      if (current.owner === TAB_ID) {
        localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: TAB_ID, expiresAt: Date.now() + LEASE_MS }));
      }
    } catch {
      // The current in-tab running guard still prevents duplicate work here.
    }
  }, LEASE_RENEW_MS);

  try {
    await work();
  } finally {
    window.clearInterval(renew);
    try {
      if (JSON.parse(localStorage.getItem(LEASE_KEY) || "{}").owner === TAB_ID) localStorage.removeItem(LEASE_KEY);
    } catch {
      // ignore
    }
  }
}

async function withLease(work: () => Promise<void>) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request("uc-upload-manager", { ifAvailable: true }, async (lock) => {
      if (lock) await work();
    });
    return;
  }
  await withLocalStorageLease(work);
}

export function kickUploadManager(): Promise<void> {
  if (typeof window === "undefined" || running) return running || Promise.resolve();
  running = withLease(run)
    .catch((error) => console.error("[UploadManager]", error))
    .finally(() => { running = null; });
  return running;
}