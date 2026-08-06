import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthenticatedUser } from "./auth";
import type { FileAttachmentEntityType } from "../types";
import type { WorkspaceOperation } from "../workspace-operations";
import { commitWorkspaceOperations, getWorkspaceSubset } from "./workspace";

type StagedUpsert = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

type AttachmentUpdate = {
  collection: string;
  entityId: string;
  field: string;
  mode?: "set" | "append";
  attachmentId: string;
};

type PendingUploadWorkspaceCommit = {
  upserts: StagedUpsert[];
  attachmentUpdate?: AttachmentUpdate;
};

const uploadCommitContext = new AsyncLocalStorage<PendingUploadWorkspaceCommit>();

const TABLE_TO_COLLECTION: Record<string, string> = {
  entity_master_storageFolderInstances: "master.storageFolderInstances",
  entity_master_fileAssets: "master.fileAssets",
  entity_entityFileAttachments: "entityFileAttachments",
};

const ENTITY_COLLECTIONS: Partial<Record<FileAttachmentEntityType, string>> = {
  customer: "customers",
  site: "sites",
  room: "areas",
  workRequired: "workRequired",
  quotation: "quotations",
  workOrder: "workOrders",
  purchase_order: "purchaseOrders",
  grn: "grns",
  vendor_bill: "vendorBills",
  dispatch: "dispatches",
  inventory: "inventory",
  drawing: "drawings",
  execution_log: "executionLogs",
  visit: "visits",
  task: "tasks",
  followup: "followups",
  payment: "payments",
  invoice: "invoices",
  vendor: "master.vendors",
  vendor_rate: "master.vendorRates",
  contractor: "master.contractors",
  contractor_bid: "contractorBids",
  contractor_settlement: "contractorSettlements",
  blocked: "blocked",
  communication: "commSends",
};

function pendingCommit(): PendingUploadWorkspaceCommit {
  const pending = uploadCommitContext.getStore();
  if (!pending) throw new Error("Upload workspace commit context is missing.");
  return pending;
}

export function withUploadCommitContext<T>(work: () => Promise<T>): Promise<T> {
  return uploadCommitContext.run({ upserts: [] }, work);
}

function collectionRows(data: unknown, collection: string): Array<Record<string, unknown>> {
  const workspace = data as Record<string, unknown> & { master?: Record<string, unknown> };
  const value = collection.startsWith("master.")
    ? workspace.master?.[collection.slice("master.".length)]
    : workspace[collection];
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function mergeUpsert(operations: Map<string, WorkspaceOperation>, collection: string, row: Record<string, unknown>) {
  const operation = operations.get(collection) || { collection, upsert: [] };
  const rows = operation.upsert || [];
  const id = String(row.id || "");
  operation.upsert = [...rows.filter((entry) => String(entry.id || "") !== id), row];
  operations.set(collection, operation);
}

export async function upsertEntityRow(
  table: string,
  id: string,
  data: unknown,
  user: AuthenticatedUser,
): Promise<void> {
  void user;
  const collection = TABLE_TO_COLLECTION[table];
  if (!collection) throw new Error(`Upload finalization is not configured for ${table}.`);
  if (!data || typeof data !== "object") throw new Error(`Upload finalization received invalid data for ${table}.`);

  const pending = pendingCommit();
  pending.upserts = [
    ...pending.upserts.filter((entry) => !(entry.collection === collection && entry.id === id)),
    { collection, id, data: data as Record<string, unknown> },
  ];
}

export async function updateAttachmentField(
  user: AuthenticatedUser,
  entityType: FileAttachmentEntityType,
  entityId: string,
  field: string | undefined,
  mode: "set" | "append" | undefined,
  attachmentId: string,
): Promise<void> {
  void user;
  if (!field) return;
  const collection = ENTITY_COLLECTIONS[entityType];
  if (!collection) throw new Error(`Attachment field updates are not configured for ${entityType}.`);

  pendingCommit().attachmentUpdate = {
    collection,
    entityId,
    field,
    mode,
    attachmentId,
  };
}

export async function bumpWorkspaceRevision(): Promise<void> {
  const pending = pendingCommit();
  if (!pending.upserts.length && !pending.attachmentUpdate) return;

  const rowsByCollection: Record<string, string[]> = {};
  for (const entry of pending.upserts) {
    rowsByCollection[entry.collection] = Array.from(new Set([...(rowsByCollection[entry.collection] || []), entry.id]));
  }
  if (pending.attachmentUpdate) {
    const { collection, entityId } = pending.attachmentUpdate;
    rowsByCollection[collection] = Array.from(new Set([...(rowsByCollection[collection] || []), entityId]));
  }

  const snapshot = await getWorkspaceSubset({ rowsByCollection });
  const operations = new Map<string, WorkspaceOperation>();
  for (const entry of pending.upserts) mergeUpsert(operations, entry.collection, entry.data);

  if (pending.attachmentUpdate) {
    const { collection, entityId, field, mode, attachmentId } = pending.attachmentUpdate;
    const current = collectionRows(snapshot.data, collection).find((row) => String(row.id || "") === entityId);
    if (!current) throw new Error(`TARGET_NOT_READY:The related record is not synchronized yet.`);

    const next = { ...current };
    if (mode === "append") {
      const values = Array.isArray(current[field]) ? current[field] as unknown[] : [];
      next[field] = Array.from(new Set([...values.map(String), attachmentId]));
    } else {
      next[field] = attachmentId;
    }
    mergeUpsert(operations, collection, next);
  }

  // This is the only workspace write. It atomically performs row CAS checks,
  // persists the file registry/attachment/target update, writes the matching
  // change-journal batch, and advances the global workspace revision. A retry
  // of a previously partial upload deliberately upserts the same rows again so
  // the missing journal entry is repaired without re-uploading file bytes.
  await commitWorkspaceOperations(snapshot.revision, Array.from(operations.values()), snapshot.rowVersions || {});

  pending.upserts = [];
  pending.attachmentUpdate = undefined;
}
