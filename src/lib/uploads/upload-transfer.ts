"use client";

import { refreshClientSession } from "@/lib/rdash/client-auth";
import { useRDashStore } from "@/lib/rdash/store";
import { uploadQueueStore } from "./upload-store";
import type { FinalizedUploadResult, GoogleFileId, InitiateUploadResponse, UploadItemId, UploadItemRecord } from "./upload-types";

const CHUNK_SIZE = 8 * 1024 * 1024;
const RETRY_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const LEASE_KEY = "uc-upload-manager-lease";
const LEASE_MS = 20_000;
const LEASE_RENEW_MS = 5_000;
const MAX_SESSION_RESTARTS = 2;
const SESSION_EXPIRY_SAFETY_MS = 30_000;
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
let running: Promise<void> | null = null;

class UploadCancelledError extends Error {
  constructor() {
    super("Upload was cancelled.");
    this.name = "UploadCancelledError";
  }
}

class UploadApiError extends Error {
  code?: string;
  status?: number;
  retryAfterMs?: number;
  constructor(message: string, code?: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "UploadApiError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

class TemporaryDriveError extends TypeError {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "TemporaryDriveError";
    this.retryAfterMs = retryAfterMs;
  }
}

function responseRetryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15 * 60_000, Math.max(1_000, Math.round(seconds * 1000)));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(15 * 60_000, Math.max(1_000, date - Date.now()));
}

function retryDelayMs(retryCount: number): number {
  const base = RETRY_MS[Math.min(Math.max(0, retryCount - 1), RETRY_MS.length - 1)];
  // 25% jitter prevents every reopened tab/device from retrying Google at once
  // after a shared network outage or Drive rate-limit response.
  return Math.max(1_000, Math.round(base * (0.75 + Math.random() * 0.5)));
}

const jsonPost = async <T>(action: string, body: unknown): Promise<T> => {
  const request = () => fetch(`/api/uploads/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let response = await request();
  // A long-running/resumed upload may outlive the current 8-hour app bearer.
  // Rotate the server-only Supabase refresh session, then retry this small
  // control-plane request once. File bytes never take this path.
  if (response.status === 401 && await refreshClientSession()) {
    response = await request();
  }

  const payload = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new UploadApiError(
      payload.error || `Upload ${action} failed.`,
      payload.code,
      response.status,
      responseRetryAfterMs(response),
    );
  }
  return payload;
};

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

function sessionKnownExpired(item: UploadItemRecord): boolean {
  if (!item.sessionExpiresAt) return false;
  const expiresAt = Date.parse(item.sessionExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + SESSION_EXPIRY_SAFETY_MS;
}

async function resetDriveSession(item: UploadItemRecord): Promise<UploadItemRecord> {
  return uploadQueueStore.patchItem(item.id, {
    sessionUri: undefined,
    sessionExpiresAt: undefined,
    confirmedBytes: 0,
    progress: 0,
    status: "queued",
  });
}

async function initiate(item: UploadItemRecord): Promise<UploadItemRecord> {
  assertNotCancelled(item.id);
  const batch = uploadQueueStore.getBatch(item.batchId);
  if (!batch) throw new Error("Upload batch is missing on this device.");
  await uploadQueueStore.patchItem(item.id, {
    status: "starting_session",
    retryAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });
  const session = await jsonPost<InitiateUploadResponse>("initiate", {
    uploadBatchId: item.batchId,
    uploadItemId: item.id,
    fileAssetId: item.fileAssetId,
    attachmentId: item.attachmentId,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    batchSizeBytes: uploadQueueStore.batchSizeBytes(item.batchId),
    preferredStorageAccountId: batch.storageAccountId,
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
  await uploadQueueStore.patchBatch(item.batchId, {
    status: session.completedGoogleFileId ? "finalizing" : "uploading",
    storageAccountId: session.storageAccountId,
  });
  if (session.completedGoogleFileId) {
    return uploadQueueStore.patchItem(item.id, {
      status: "uploaded_unverified",
      sessionUri: undefined,
      sessionExpiresAt: undefined,
      storageAccountId: session.storageAccountId,
      stagingFolderId: session.stagingFolderId,
      googleFileId: session.completedGoogleFileId,
      webViewLink: session.webViewLink,
      thumbnailLink: session.thumbnailLink,
      confirmedBytes: item.sizeBytes,
      progress: 100,
    });
  }
  if (!session.sessionUri || !session.sessionExpiresAt) {
    throw new Error("Google Drive did not return a resumable session URI.");
  }
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
  if (!item.sessionUri) throw new Error("The resumable Drive session is missing.");
  const response = await fetch(item.sessionUri, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${item.sizeBytes}`, "Content-Length": "0" },
  });
  if (response.status === 200 || response.status === 201) {
    return { confirmed: item.sizeBytes, completed: await response.json().catch(() => ({})), expired: false };
  }
  if (response.status === 308) return { confirmed: rangeEnd(response, -1) + 1, completed: undefined as Record<string, unknown> | undefined, expired: false };
  // Google documents that a resumable upload should start a new session after
  // a 4xx response. Treat all client errors except rate limiting as a dead
  // capability instead of repeatedly pausing on an unusable session URI.
  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    return { confirmed: 0, completed: undefined as Record<string, unknown> | undefined, expired: true };
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TemporaryDriveError(`Drive session query temporarily failed (${response.status}).`, responseRetryAfterMs(response));
  }
  throw new Error(`Drive session query returned ${response.status}.`);
}

async function uploadBytes(item: UploadItemRecord, sessionRestarts = 0): Promise<UploadItemRecord> {
  const blob = await uploadQueueStore.getBlob(item.id);
  if (!blob) throw new Error("The selected file is no longer available on this device.");
  if (blob.size <= 0) throw new Error("Empty files cannot be uploaded.");

  assertNotCancelled(item.id);
  let current = item.sessionUri || item.googleFileId ? item : await initiate(item);
  if (current.googleFileId) return current;

  if (sessionKnownExpired(current)) {
    if (sessionRestarts >= MAX_SESSION_RESTARTS) throw new Error("The Drive upload session repeatedly expired. Retry the file later.");
    return uploadBytes(await resetDriveSession(current), sessionRestarts + 1);
  }

  const resumed = await querySession(current);
  if (resumed.expired) {
    if (sessionRestarts >= MAX_SESSION_RESTARTS) throw new Error("The Drive upload session repeatedly expired. Retry the file later.");
    return uploadBytes(await resetDriveSession(current), sessionRestarts + 1);
  }
  if (resumed.completed) {
    const googleFileId = String(resumed.completed.id || "") as GoogleFileId;
    if (!googleFileId) throw new Error("Drive completed without a file ID.");
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
    const end = Math.min(current.sizeBytes, offset + CHUNK_SIZE);
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
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      const payload = await response.json().catch(() => ({})) as { id?: string; webViewLink?: string; thumbnailLink?: string };
      if (!payload.id) throw new Error("Drive completed without a file ID.");
      const googleFileId = payload.id as GoogleFileId;
      return uploadQueueStore.patchItem(current.id, {
        status: "uploaded_unverified",
        googleFileId,
        webViewLink: payload.webViewLink,
        thumbnailLink: payload.thumbnailLink,
        confirmedBytes: current.sizeBytes,
        progress: 100,
      });
    }

    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      if (sessionRestarts >= MAX_SESSION_RESTARTS) throw new Error(`Drive rejected the resumable session with status ${response.status}.`);
      return uploadBytes(await resetDriveSession(current), sessionRestarts + 1);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new TemporaryDriveError(
        `Drive temporarily rejected ${current.fileName} with status ${response.status}.`,
        responseRetryAfterMs(response),
      );
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
    const targetNotReady = error instanceof UploadApiError && error.code === "TARGET_NOT_READY";
    const network = error instanceof TypeError || /network|fetch|offline|temporarily/i.test(message);
    const retryCount = latest.retryCount + 1;

    if (targetNotReady) {
      await uploadQueueStore.patchItem(latest.id, {
        status: "failed_permanent",
        retryCount,
        retryAt: undefined,
        lastErrorCode: "TARGET_NOT_READY",
        lastErrorMessage: message,
      });
      return;
    }

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const hintedDelay = error instanceof TemporaryDriveError || error instanceof UploadApiError
      ? error.retryAfterMs
      : undefined;
    const delay = hintedDelay ?? retryDelayMs(retryCount);
    await uploadQueueStore.patchItem(latest.id, {
      status: "paused",
      retryCount,
      retryAt: offline ? undefined : new Date(Date.now() + delay).toISOString(),
      lastErrorCode: network ? "NETWORK" : "TEMPORARY_ERROR",
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
  const lockManager = typeof navigator !== "undefined"
    ? (navigator as Navigator & { locks?: LockManager }).locks
    : undefined;
  if (lockManager?.request) {
    await lockManager.request("uc-upload-manager", { ifAvailable: true }, async (lock) => {
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
