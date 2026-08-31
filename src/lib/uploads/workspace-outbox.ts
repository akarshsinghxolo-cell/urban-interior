"use client";

import { applyWorkspaceOperations, diffWorkspaceOperations } from "@/lib/rdash/workspace-operations";
import type { RDashDatabase } from "@/lib/rdash/types";
import { uploadIndexedDb } from "./upload-indexed-db";
import { recoverQueuedCustomerConversationRecord } from "./workspace-outbox-canonical-recovery";
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
let acceptedWorkspace: RDashDatabase | null = null;
let resetBarrier = false;
let activeScope: { workspaceId: string; ownerUserId: string } | null = null;
const listeners = new Set<() => void>();

interface WorkspaceOutboxFlushResult {
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

function retryAtSeconds(seconds: number | undefined): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(1, Number(seconds)) : 10;
  return new Date(Date.now() + safeSeconds * 1_000).toISOString();
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

export function workspaceOutboxRecordMatchesScope(
  item: Pick<WorkspaceCommitOutboxRecord, "workspaceId" | "ownerUserId">,
  scope: { workspaceId: string; ownerUserId: string } | null,
): boolean {
  return Boolean(scope)
    && item.workspaceId === scope?.workspaceId
    && item.ownerUserId === scope?.ownerUserId;
}

function belongsToActiveScope(item: WorkspaceCommitOutboxRecord): boolean {
  return workspaceOutboxRecordMatchesScope(item, activeScope);
}

async function readScopedWorkspaceOutbox(): Promise<WorkspaceCommitOutboxRecord[]> {
  if (!activeScope) return [];
  return (await uploadIndexedDb.readWorkspaceOutbox()).filter(belongsToActiveScope);
}

async function refresh(): Promise<void> {
  emit(await readScopedWorkspaceOutbox());
}

async function recoverCanonicalCustomerConversationOutbox(
  base?: Pick<RDashDatabase, "customers"> | null,
): Promise<boolean> {
  const items = await readScopedWorkspaceOutbox();
  if (!items.length) return false;
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  let changed = false;
  for (const item of items) {
    const recovered = recoverQueuedCustomerConversationRecord(item, { base, online });
    if (!recovered.changed) continue;
    await uploadIndexedDb.putWorkspaceOutbox(recovered.record);
    changed = true;
  }
  if (changed) await refresh();
  return changed;
}

export function configureWorkspaceOutboxScope(scope: { workspaceId: string; ownerUserId: string }): void {
  if (activeScope?.workspaceId === scope.workspaceId && activeScope.ownerUserId === scope.ownerUserId) return;
  activeScope = { workspaceId: scope.workspaceId, ownerUserId: scope.ownerUserId };
  acceptedWorkspace = null;
  hydratePromise = null;
  void refresh().catch((error) => console.error("[WorkspaceOutbox] Could not switch account scope", error));
}

export function clearWorkspaceOutboxScope(): void {
  activeScope = null;
  acceptedWorkspace = null;
  hydratePromise = null;
  emit([], true);
}

export function clearWorkspaceAcceptedBaseline(): void {
  acceptedWorkspace = null;
}

export async function beginWorkspaceOutboxResetBarrier(): Promise<void> {
  resetBarrier = true;
  const pending = flushPromise;
  if (!pending) return;
  try {
    await pending;
  } catch {
    // Reset is authoritative; a failed replay must not prevent the Owner from resetting.
  }
}

export function cancelWorkspaceOutboxResetBarrier(): void {
  if (!resetBarrier) return;
  resetBarrier = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("uc-workspace-outbox-kick"));
  }
}

export async function resetWorkspaceOutboxAfterWorkspaceReset(
  base: RDashDatabase,
): Promise<void> {
  acceptedWorkspace = structuredClone(base) as RDashDatabase;
  hydratePromise = null;
  emit([], true);
  const items = await readScopedWorkspaceOutbox();
  try {
    for (const item of items) await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
  } catch {
    // The outbox belongs to local recovery only. If scoped cleanup itself fails
    // after a destructive workspace reset, prefer clearing the local outbox to
    // ever replaying pre-reset operations into the new revision epoch.
    await uploadIndexedDb.clearWorkspaceOutbox();
  }
  await refresh();
  const remaining = await readScopedWorkspaceOutbox();
  if (remaining.length) throw new Error("Old workspace outbox entries survived reset cleanup.");
}

function summarizeOperations(operations: NonNullable<WorkspaceCommitPayload["operations"]>) {
  return operations.map((operation) => ({
    collection: operation.collection,
    upsertIds: (operation.upsert || []).map((row) => String(row.id || "")).filter(Boolean),
    deleteIds: [...(operation.deleteIds || [])],
  }));
}

function responseWithPayload(response: Response, payload: WorkspaceCommitResponsePayload): Response {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rememberAcceptedWorkspace(payload: WorkspaceCommitResponsePayload): void {
  if (!payload.data || typeof payload.revision !== "number") return;
  acceptedWorkspace = structuredClone(payload.data) as RDashDatabase;
}

function acceptCompactCommit(
  item: WorkspaceCommitOutboxRecord,
  payload: WorkspaceCommitResponsePayload,
): WorkspaceCommitResponsePayload {
  const patches = Array.isArray(payload.patches) ? payload.patches : item.operations;
  if (payload.data && typeof payload.revision === "number") {
    rememberAcceptedWorkspace(payload);
  } else if (acceptedWorkspace && typeof payload.revision === "number") {
    acceptedWorkspace = applyWorkspaceOperations(acceptedWorkspace, patches);
    }

  const { data: _discardedWorkspace, ...compact } = payload;
  return {
    ...compact,
    status: payload.status || "applied",
    operationId: payload.operationId || item.operationId,
    patches,
  };
}

export async function rememberWorkspaceResponse(response: Response): Promise<void> {
  if (!response.ok) return;
  const payload = await response.clone().json().catch(() => ({})) as WorkspaceCommitResponsePayload;
  rememberAcceptedWorkspace(payload);
}

async function patchRecord(
  operationId: string,
  patch: Partial<WorkspaceCommitOutboxRecord>,
): Promise<WorkspaceCommitOutboxRecord | null> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current || !belongsToActiveScope(current)) return null;
  const next = { ...current, ...patch, updatedAt: nowIso() };
  await uploadIndexedDb.putWorkspaceOutbox(next);
  await refresh();
  return next;
}

async function rebaseRemainingItems(base: RDashDatabase, revision: number): Promise<void> {
  const remaining = (await readScopedWorkspaceOutbox())
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
  defer?: boolean;
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
  if (!activeScope) return { body };

  const timestamp = nowIso();
  const operationId = parsed.operationId || makeOperationId();
  const existingItems = await readScopedWorkspaceOutbox();
  const syncingItems = existingItems.filter((item) => item.status === "syncing");
  const previousSame = existingItems.find((item) => item.operationId === operationId);
  const record: WorkspaceCommitOutboxRecord = {
    operationId,
    workspaceId: activeScope.workspaceId,
    ownerUserId: activeScope.ownerUserId,
    revision: parsed.revision,
    operations: parsed.operations,
    expectedRowVersions: parsed.expectedRowVersions,
    uploadBatchIds: [],
    status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_for_network" : "pending",
    retryCount: 0,
    retryAt: syncingItems.length ? (syncingItems[0].retryAt || retryAtSeconds(10)) : undefined,
    summary: summarizeOperations(parsed.operations),
    createdAt: previousSame?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  if (!syncingItems.length) {
    for (const item of existingItems) await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
  } else {
    for (const item of existingItems) {
      if (item.status !== "syncing") await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
    }
  }
  await uploadIndexedDb.putWorkspaceOutbox(record);
  await refresh();
  return {
    body: JSON.stringify({ ...parsed, operationId }),
    operationId,
    defer: syncingItems.length > 0,
  };
}

export async function markWorkspaceCommitNetworkFailure(operationId: string, error: unknown): Promise<void> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current || !belongsToActiveScope(current)) return;
  const retryCount = current.retryCount + 1;
  await patchRecord(operationId, {
    status: "waiting_for_network",
    retryCount,
    retryAt: retryAt(retryCount),
    lastErrorCode: "NETWORK",
    lastErrorMessage: error instanceof Error ? error.message : "Network unavailable",
  });
}

export async function markWorkspaceCommitResponse(operationId: string, response: Response): Promise<Response> {
  const current = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!current || !belongsToActiveScope(current)) return response;
  const payload = await response.clone().json().catch(() => ({})) as WorkspaceCommitResponsePayload;

  if (response.status === 202 || payload.status === "processing") {
    await patchRecord(operationId, {
      status: "syncing",
      retryAt: retryAtSeconds(payload.retryAfterSeconds),
      lastErrorCode: "PROCESSING",
      lastErrorMessage: "The server is still applying this change.",
    });
    return responseWithPayload(response, payload);
  }

  if (response.ok) {
    await uploadIndexedDb.deleteWorkspaceOutbox(operationId);
    await refresh();
    let adaptedPayload = payload;
    try {
      adaptedPayload = acceptCompactCommit(current, payload);
      if (acceptedWorkspace && typeof adaptedPayload.revision === "number") {
        await rebaseRemainingItems(acceptedWorkspace, adaptedPayload.revision);
      }
    } catch (error) {
      console.error("[WorkspaceOutbox] Server accepted the change, but local response adaptation failed.", error);
    }
    return responseWithPayload(response, adaptedPayload);
  }

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
  return responseWithPayload(response, payload);
}

export async function restoreWorkspaceOutboxOverlay(base: RDashDatabase): Promise<{
  db: RDashDatabase;
  pendingCount: number;
  hasConflict: boolean;
}> {
  acceptedWorkspace = structuredClone(base) as RDashDatabase;
  await workspaceOutboxStore.hydrate();
  await recoverCanonicalCustomerConversationOutbox(base);
  const items = (await readScopedWorkspaceOutbox())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let db = structuredClone(base) as RDashDatabase;
  for (const item of items) db = applyWorkspaceOperations(db, item.operations);
  return {
    db,
    pendingCount: items.length,
    hasConflict: items.some((item) => item.status === "conflict" || item.status === "failed_permanent"),
  };
}

export async function retryWorkspaceOutbox(operationId: string): Promise<void> {
  const item = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!item || !belongsToActiveScope(item)) return;
  if (item.status === "conflict") {
    throw new Error("This change conflicts with newer server data and cannot be auto-overwritten. Reload the server version and reapply the intended change after review.");
  }
  await patchRecord(operationId, {
    status: typeof navigator !== "undefined" && !navigator.onLine ? "waiting_for_network" : "pending",
    retryAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("uc-workspace-outbox-kick"));
}

export async function discardWorkspaceOutboxItem(operationId: string): Promise<void> {
  const item = await uploadIndexedDb.getWorkspaceOutbox(operationId);
  if (!item || !belongsToActiveScope(item)) return;
  await uploadIndexedDb.deleteWorkspaceOutbox(operationId);
  await refresh();
}

export async function discardWorkspaceOutbox(): Promise<void> {
  const items = await readScopedWorkspaceOutbox();
  for (const item of items) await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId);
  await refresh();
}

export async function flushWorkspaceOutbox(): Promise<WorkspaceOutboxFlushResult> {
  if (resetBarrier) return { replayed: false, conflict: false };
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    await workspaceOutboxStore.hydrate();
    await recoverCanonicalCustomerConversationOutbox(acceptedWorkspace);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { replayed: false, conflict: false };
    }
    const items = (await readScopedWorkspaceOutbox()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
          expectedRowVersions: item.expectedRowVersions,
        }),
      });
    } catch (error) {
      await markWorkspaceCommitNetworkFailure(item.operationId, error);
      return { replayed: false, conflict: false };
    }

    const adaptedResponse = await markWorkspaceCommitResponse(item.operationId, response);
    const payload = await adaptedResponse.json().catch(() => ({})) as WorkspaceCommitResponsePayload;
    if (adaptedResponse.status === 202 || payload.status === "processing") {
      return { replayed: false, conflict: false, payload };
    }
    if (adaptedResponse.ok) {
      return { replayed: true, conflict: false, payload };
    }
    return { replayed: false, conflict: adaptedResponse.status === 409, payload };
  })();
  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}


