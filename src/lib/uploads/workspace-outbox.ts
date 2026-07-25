"use client";

import { applyWorkspaceOperations, diffWorkspaceOperations } from "@/lib/rdash/workspace-operations";
import type { RDashDatabase } from "@/lib/rdash/types";
import { uploadIndexedDb } from "./upload-indexed-db";
import type {
  WorkspaceCommitOutboxRecord,
  WorkspaceCommitPayload,
  WorkspaceCommitResponsePayload,
  WorkspaceOutboxSnapshot,
  WorkspaceOutboxStatus,
} from "./workspace-outbox-types";

const RETRY_DELAYS = [5_000, 15_000, 45_000, 120_000, 300_000];
const EMPTY_SNAPSHOT: WorkspaceOutboxSnapshot = { ready: false, online: true, items: [] };

let snapshot = EMPTY_SNAPSHOT;
let hydratePromise: Promise<void> | null = null;
let flushPromise: Promise<WorkspaceOutboxFlushResult> | null = null;
const listeners = new Set<() => void>();

export interface WorkspaceOutboxFlushResult {
  replayed: boolean;
  conflict: boolean;
  payload?: WorkspaceCommitResponsePayload;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `workspace-op-${crypto.randomUUID()}`;
  }
  return `workspace-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function retryAt(retryCount: number): string {
  const delay = RETRY_DELAYS[Math.min(Math.max(0, retryCount - 1), RETRY_DELAYS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

function emit(items: WorkspaceCommitOutboxRecord[], ready = true): void {
  snapshot = {
    ready,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    items: [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("uc-workspace-outbox-changed"));
  }
}

async function refresh(): Promise<void> {
  emit(await uploadIndexedDb.readWorkspaceOutbox());
}

function summarizeOperations(operations: NonNullable<WorkspaceCommitPayload["operations"]>) {
  return operations.map((operation) => ({
    collection: operation.collection,
    upsertIds: (operation.upsert || []).map((row) => String(row.id || "")).filter(Boolean),
    deleteIds: [...(operation.deleteIds || [])],
  }));
}

async function patchRecord(
  operationId: string,
  patch: Partial<WorkspaceCommitOutboxRecord>,
): Promise<WorkspaceCommitOutboxRecord | null> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: nowIso() };
  await uploadIndexedDb.putWorkspaceOutbox(next);
  await refresh();
  return next;
}

async function rebaseRemainingItems(base: RDashDatabase, revision: number): Promise<void> {
  const remaining = (await uploadIndexedDb.readWorkspaceOutbox())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!remaining.length) return;

  for (const item of remaining) {
    if (item.status === "conflict" || item.status === "failed_permanent") continue;
    const desired = applyWorkspaceOperations(base, item.operations);
    const operations = diffWorkspaceOperations(base, desired);
    if (!operations.length) {
      await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
      continue;
    }
    await uploadIndexedDb.putWorkspaceOutbox({
      ...item,
      revision,
      operations,
      expectedRevisions: undefined,
      expectedRowVersions: undefined,
      status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_for_network" : "pending",
      retryCount: 0,
      retryAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      summary: summarizeOperations(operations),
      updatedAt: nowIso(),
    });
  }
  await refresh();
}

export const workspaceOutboxStore = {
  getSnapshot(): WorkspaceOutboxSnapshot {
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
        await refresh();
      } catch (error) {
        hydratePromise = null;
        console.error("[WorkspaceOutbox] Could not restore pending changes", error);
        emit([], true);
      }
    })();
    return hydratePromise;
  },
  setOnline(online: boolean): void {
    if (snapshot.online === online) return;
    snapshot = { ...snapshot, online };
    for (const listener of listeners) listener();
  },
};

export async function captureWorkspaceCommit(body: BodyInit | null | undefined): Promise<{
  body: BodyInit | null | undefined;
  operationId?: string;
}> {
  if (typeof body !== "string" || !body.trim()) return { body };
  let parsed: WorkspaceCommitPayload;
  try {
    parsed = JSON.parse(body) as WorkspaceCommitPayload;
  } catch {
    return { body };
  }
  if (typeof parsed.revision !== "number" || !Array.isArray(parsed.operations) || !parsed.operations.length) {
    return { body };
  }

  const timestamp = nowIso();
  const operationId = parsed.operationId || makeOperationId();
  const existingItems = await uploadIndexedDb.readWorkspaceOutbox();
  const syncingItems = existingItems.filter((item) => item.status === "syncing");
  const previousSame = existingItems.find((item) => item.operationId === operationId);
  const record: WorkspaceCommitOutboxRecord = {
    operationId,
    workspaceId: "default",
    revision: parsed.revision,
    operations: parsed.operations,
    expectedRevisions: parsed.expectedRevisions,
    expectedRowVersions: parsed.expectedRowVersions,
    uploadBatchIds: [],
    status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_for_network" : "pending",
    retryCount: 0,
    summary: summarizeOperations(parsed.operations),
    createdAt: previousSame?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  if (!syncingItems.length) {
    await uploadIndexedDb.clearWorkspaceOutbox();
  } else {
    for (const item of existingItems) {
      if (item.status !== "syncing") await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
    }
  }
  await uploadIndexedDb.putWorkspaceOutbox(record);
  await refresh();
  return { body: JSON.stringify({ ...parsed, operationId }), operationId };
}

export async function markWorkspaceCommitNetworkFailure(operationId: string, error: unknown): Promise<void> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current) return;
  const retryCount = current.retryCount + 1;
  await patchRecord(operationId, {
    status: "waiting_for_network",
    retryCount,
    retryAt: retryAt(retryCount),
    lastErrorCode: "NETWORK",
    lastErrorMessage: error instanceof Error ? error.message : "Network unavailable",
  });
}

export async function markWorkspaceCommitResponse(operationId: string, response: Response): Promise<void> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current) return;
  if (response.ok) {
    const payload = await response.clone().json().catch(() => ({})) as WorkspaceCommitResponsePayload;
    await uploadIndexedDb.deleteWorkspaceOutbox(operationId);
    if (payload.data && typeof payload.revision === "number") {
      await rebaseRemainingItems(payload.data, payload.revision);
    } else {
      await refresh();
    }
    return;
  }
  const payload = await response.clone().json().catch(() => ({})) as WorkspaceCommitResponsePayload;
  const retryCount = current.retryCount + 1;
  let status: WorkspaceOutboxStatus = "failed_permanent";
  if (response.status === 409) status = "conflict";
  else if (response.status >= 500 || response.status === 429) status = "failed_retryable";
  await patchRecord(operationId, {
    status,
    retryCount,
    retryAt: status === "failed_retryable" ? retryAt(retryCount) : undefined,
    lastErrorCode: response.status === 409 ? "CONFLICT" : `HTTP_${response.status}`,
    lastErrorMessage: payload.error || `Workspace synchronization failed (${response.status}).`,
  });
}

export async function restoreWorkspaceOutboxOverlay(base: RDashDatabase): Promise<{
  db: RDashDatabase;
  pendingCount: number;
  hasConflict: boolean;
}> {
  await workspaceOutboxStore.hydrate();
  const items = (await uploadIndexedDb.readWorkspaceOutbox())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let db = structuredClone(base) as RDashDatabase;
  for (const item of items) db = applyWorkspaceOperations(db, item.operations);
  return {
    db,
    pendingCount: items.length,
    hasConflict: items.some((item) => item.status === "conflict" || item.status === "failed_permanent"),
  };
}

async function rebaseConflict(item: WorkspaceCommitOutboxRecord): Promise<void> {
  const response = await fetch("/api/workspace", { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as WorkspaceCommitResponsePayload;
  if (!response.ok || !payload.data || typeof payload.revision !== "number") {
    throw new Error(payload.error || "Could not load the latest workspace for conflict resolution.");
  }
  const desired = applyWorkspaceOperations(payload.data, item.operations);
  const operations = diffWorkspaceOperations(payload.data, desired);
  const timestamp = nowIso();
  const replacement: WorkspaceCommitOutboxRecord = {
    ...item,
    operationId: makeOperationId(),
    revision: payload.revision,
    operations,
    expectedRevisions: undefined,
    expectedRowVersions: undefined,
    status: "pending",
    retryCount: 0,
    retryAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    summary: summarizeOperations(operations),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
  if (operations.length) await uploadIndexedDb.putWorkspaceOutbox(replacement);
  await refresh();
}

export async function retryWorkspaceOutbox(operationId: string): Promise<void> {
  const item = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!item) return;
  if (item.status === "conflict") {
    await rebaseConflict(item);
  } else {
    await patchRecord(operationId, {
      status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_for_network" : "pending",
      retryAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
    });
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("uc-workspace-outbox-kick"));
}

export async function discardWorkspaceOutbox(): Promise<void> {
  await uploadIndexedDb.clearWorkspaceOutbox();
  await refresh();
}

export async function flushWorkspaceOutbox(): Promise<WorkspaceOutboxFlushResult> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    await workspaceOutboxStore.hydrate();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { replayed: false, conflict: false };
    }
    const items = (await uploadIndexedDb.readWorkspaceOutbox()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const item = items.find((entry) => {
      if (entry.status === "conflict" || entry.status === "failed_permanent") return false;
      if (entry.retryAt && Date.parse(entry.retryAt) > Date.now()) return false;
      return true;
    });
    if (!item) return { replayed: false, conflict: items.some((entry) => entry.status === "conflict") };

    await patchRecord(item.operationId, { status: "syncing", retryAt: undefined });
    let response: Response;
    try {
      response = await fetch("/api/operations/commit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-UC-Outbox-Replay": "1" },
        body: JSON.stringify({
          operationId: item.operationId,
          revision: item.revision,
          operations: item.operations,
          expectedRevisions: item.expectedRevisions,
          expectedRowVersions: item.expectedRowVersions,
        }),
      });
    } catch (error) {
      await markWorkspaceCommitNetworkFailure(item.operationId, error);
      return { replayed: false, conflict: false };
    }
    const responseForStatus = response.clone();
    const payload = await response.json().catch(() => ({})) as WorkspaceCommitResponsePayload;
    if (response.ok) {
      await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
      if (payload.data && typeof payload.revision === "number") {
        await rebaseRemainingItems(payload.data, payload.revision);
      } else {
        await refresh();
      }
      return { replayed: true, conflict: false, payload };
    }
    await markWorkspaceCommitResponse(item.operationId, responseForStatus);
    return { replayed: false, conflict: response.status === 409, payload };
  })();
  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}