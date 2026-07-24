"use client";

import { useRDashStore } from "@/lib/rdash/store";
import { uploadQueueStore } from "./upload-store";
import type { FinalizedUploadResult, GoogleFileId, InitiateUploadResponse, UploadItemRecord } from "./upload-types";

const MB = 1024 * 1024;
const RETRY_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const LEASE_KEY = "uc-upload-manager-lease";
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
let running: Promise<void> | null = null;

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

async function initiate(item: UploadItemRecord): Promise<UploadItemRecord> {
  const batch = uploadQueueStore.getBatch(item.batchId);
  if (!batch) throw new Error("Upload batch is missing on this device.");
  await uploadQueueStore.patchItem(item.id, { status: "starting_session", lastErrorMessage: undefined });
  const session = await jsonPost<InitiateUploadResponse>("initiate", {
    uploadBatchId: item.batchId, uploadItemId: item.id, fileAssetId: item.fileAssetId,
    attachmentId: item.attachmentId, fileName: item.fileName, mimeType: item.mimeType,
    sizeBytes: item.sizeBytes, batchSizeBytes: uploadQueueStore.batchSizeBytes(item.batchId),
    lastModified: item.lastModified, fingerprint: item.fingerprint, sourceFlow: item.sourceFlow,
    sourceLabel: batch.sourceLabel, purpose: item.purpose, targetEntityType: item.targetEntityType,
    targetEntityId: item.targetEntityId, desiredTargetEntityType: item.desiredTargetEntityType,
    kind: item.kind, role: item.role, caption: item.caption, visibility: item.visibility,
    customerShareable: item.customerShareable, attachmentField: item.attachmentField,
    attachmentFieldMode: item.attachmentFieldMode, requiredEvidence: item.requiredEvidence,
  });
  await uploadQueueStore.patchBatch(item.batchId, { status: "uploading", storageAccountId: session.storageAccountId });
  return uploadQueueStore.patchItem(item.id, {
    status: "uploading", sessionUri: session.sessionUri, sessionExpiresAt: session.sessionExpiresAt,
    storageAccountId: session.storageAccountId, stagingFolderId: session.stagingFolderId,
    confirmedBytes: session.confirmedBytes || 0,
  });
}

async function querySession(item: UploadItemRecord) {
  if (!item.sessionUri) return { confirmed: 0, completed: undefined as Record<string, unknown> | undefined, expired: false };
  const response = await fetch(item.sessionUri, { method: "PUT", headers: { "Content-Range": `bytes */${item.sizeBytes}` } });
  if (response.status === 404) return { confirmed: 0, completed: undefined, expired: true };
  if (response.status === 200 || response.status === 201) return { confirmed: item.sizeBytes, completed: await response.json().catch(() => ({})), expired: false };
  if (response.status === 308) return { confirmed: rangeEnd(response, -1) + 1, completed: undefined, expired: false };
  throw new Error(`Drive session query returned ${response.status}.`);
}

async function uploadBytes(item: UploadItemRecord): Promise<UploadItemRecord> {
  const blob = await uploadQueueStore.getBlob(item.id);
  if (!blob) throw new Error("The selected file is no longer available on this device.");
  let current = item.sessionUri ? item : await initiate(item);
  const resumed = await querySession(current);
  if (resumed.expired) current = await initiate(await uploadQueueStore.patchItem(current.id, { sessionUri: undefined, confirmedBytes: 0 }));
  else if (resumed.completed) return uploadQueueStore.patchItem(current.id, { status: "uploaded_unverified", googleFileId: String(resumed.completed.id) as GoogleFileId, confirmedBytes: current.sizeBytes, progress: 100 });
  else if (resumed.confirmed !== current.confirmedBytes) current = await uploadQueueStore.patchItem(current.id, { confirmedBytes: resumed.confirmed, progress: Math.round(resumed.confirmed / current.sizeBytes * 100) });

  let offset = current.confirmedBytes;
  while (offset < current.sizeBytes) {
    if (!navigator.onLine) throw new TypeError("Network unavailable");
    const end = Math.min(current.sizeBytes, offset + chunkSize(current.retryCount));
    const response = await fetch(current.sessionUri!, {
      method: "PUT",
      headers: { "Content-Type": current.mimeType, "Content-Range": `bytes ${offset}-${end - 1}/${current.sizeBytes}` },
      body: blob.slice(offset, end, current.mimeType),
    });
    if (response.status === 308) {
      offset = rangeEnd(response, end - 1) + 1;
      current = await uploadQueueStore.patchItem(current.id, { status: "uploading", confirmedBytes: offset, progress: Math.round(offset / current.sizeBytes * 100) });
      void jsonPost("progress", { uploadItemId: current.id, confirmedBytes: offset, progress: current.progress, status: "uploading" }).catch(() => undefined);
      continue;
    }
    if (response.status === 200 || response.status === 201) {
      const payload = await response.json().catch(() => ({})) as { id?: string; webViewLink?: string; thumbnailLink?: string };
      if (!payload.id) throw new Error("Drive completed without a file ID.");
      return uploadQueueStore.patchItem(current.id, { status: "uploaded_unverified", googleFileId: payload.id as GoogleFileId, webViewLink: payload.webViewLink, thumbnailLink: payload.thumbnailLink, confirmedBytes: current.sizeBytes, progress: 100 });
    }
    if (response.status === 404) return uploadBytes(await uploadQueueStore.patchItem(current.id, { sessionUri: undefined, confirmedBytes: 0, status: "queued" }));
    throw new Error(`Drive rejected ${current.fileName} with status ${response.status}.`);
  }
  return current;
}

function applyResult(result: FinalizedUploadResult) {
  useRDashStore.setState((state) => {
    const assets = state.db.master.fileAssets || [];
    const links = state.db.entityFileAttachments || [];
    return { db: { ...state.db, master: { ...state.db.master, fileAssets: assets.some(x => x.id === result.fileAsset.id) ? assets.map(x => x.id === result.fileAsset.id ? result.fileAsset : x) : [...assets, result.fileAsset] }, entityFileAttachments: links.some(x => x.id === result.attachment.id) ? links.map(x => x.id === result.attachment.id ? result.attachment : x) : [...links, result.attachment] } };
  });
}

async function finalize(item: UploadItemRecord) {
  if (!item.googleFileId) throw new Error("Drive file ID is missing.");
  await uploadQueueStore.patchItem(item.id, { status: "verifying" });
  const result = await jsonPost<FinalizedUploadResult>("finalize", { uploadItemId: item.id, googleFileId: item.googleFileId, targetEntityType: item.targetEntityType, targetEntityId: item.targetEntityId, purpose: item.purpose, attachmentField: item.attachmentField, attachmentFieldMode: item.attachmentFieldMode });
  applyResult(result);
  await uploadQueueStore.patchItem(item.id, { status: "completed", finalFolderId: result.storageFolderId, verifiedAt: result.verifiedAt, finalizedAt: new Date().toISOString(), progress: 100 });
  await uploadQueueStore.completeItem(item.id);
}

async function cancel(item: UploadItemRecord) {
  await uploadQueueStore.patchItem(item.id, { status: "cleanup_pending" });
  await jsonPost("cancel", { uploadItemId: item.id });
  await uploadQueueStore.completeItem(item.id);
}

async function processItem(item: UploadItemRecord) {
  try {
    if (item.status === "cancel_requested") return cancel(item);
    const uploaded = item.googleFileId ? item : await uploadBytes(item);
    if (uploaded.googleFileId) await finalize(uploaded);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const network = error instanceof TypeError || /network|fetch|offline/i.test(message);
    const retryCount = item.retryCount + 1;
    await uploadQueueStore.patchItem(item.id, { status: network ? "waiting_for_network" : "failed_retryable", retryCount, retryAt: new Date(Date.now() + RETRY_MS[Math.min(retryCount - 1, RETRY_MS.length - 1)]).toISOString(), lastErrorCode: network ? "NETWORK" : "UPLOAD_ERROR", lastErrorMessage: message });
  }
}

async function run() {
  await uploadQueueStore.hydrate();
  uploadQueueStore.setProcessing(true);
  try {
    while (navigator.onLine) {
      const item = uploadQueueStore.getNextProcessableItem();
      if (!item) break;
      await processItem(item);
    }
  } finally { uploadQueueStore.setProcessing(false); }
}

async function withLease(work: () => Promise<void>) {
  const now = Date.now();
  let lease: { owner?: string; expiresAt?: number } = {};
  try { lease = JSON.parse(localStorage.getItem(LEASE_KEY) || "{}"); } catch { lease = {}; }
  if (lease.owner && lease.owner !== TAB_ID && Number(lease.expiresAt || 0) > now) return;
  localStorage.setItem(LEASE_KEY, JSON.stringify({ owner: TAB_ID, expiresAt: now + 20_000 }));
  try { await work(); } finally {
    try { if (JSON.parse(localStorage.getItem(LEASE_KEY) || "{}").owner === TAB_ID) localStorage.removeItem(LEASE_KEY); } catch { /* ignore */ }
  }
}

export function kickUploadManager(): Promise<void> {
  if (typeof window === "undefined" || running) return running || Promise.resolve();
  running = withLease(run).catch(error => console.error("[UploadManager]", error)).finally(() => { running = null; });
  return running;
}
