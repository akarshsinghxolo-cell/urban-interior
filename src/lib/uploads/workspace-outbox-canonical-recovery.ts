import { customerConversationThreadRecordId } from "@/lib/rdash/thread-record-id";
import type { RDashDatabase } from "@/lib/rdash/types";
import type { WorkspaceOperation } from "@/lib/rdash/workspace-operations";
import type { WorkspaceCommitOutboxRecord } from "./workspace-outbox-types";

export const CUSTOMER_CONVERSATION_CANONICAL_ERROR =
  "Customer conversation threads must use customer-conversation:<customer_id>";

function customerIdsRepresentedByOutbox(
  item: Pick<WorkspaceCommitOutboxRecord, "operations">,
  base?: Pick<RDashDatabase, "customers"> | null,
): Set<string> {
  const ids = new Set((base?.customers || []).map((customer) => customer.id));
  for (const operation of item.operations) {
    if (operation.collection !== "customers") continue;
    for (const row of operation.upsert || []) {
      const id = String(row.id || "").trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

function canonicalizeQueuedCustomerThreadOperations(
  operations: WorkspaceOperation[],
  customerIds: Set<string>,
): { operations: WorkspaceOperation[]; changed: boolean } {
  let changed = false;
  const next = operations.map((operation) => {
    if (operation.collection !== "threads" || !operation.upsert?.length) return operation;
    let operationChanged = false;
    const upsert = operation.upsert.map((row) => {
      if (String(row.kind || "") !== "generic") return row;
      const recordId = String(row.record_id || "").trim();
      if (!recordId || !customerIds.has(recordId)) return row;
      operationChanged = true;
      changed = true;
      return {
        ...row,
        record_id: customerConversationThreadRecordId(recordId),
      };
    });
    return operationChanged ? { ...operation, upsert } : operation;
  });
  return { operations: next, changed };
}

/**
 * One-way recovery for unsent browser operations created before Customer
 * conversations became canonical. This never makes the server accept the old
 * persisted form: it rewrites a locally queued thread operation to the current
 * canonical record ID before replay.
 */
export function recoverQueuedCustomerConversationRecord(
  item: WorkspaceCommitOutboxRecord,
  options?: {
    base?: Pick<RDashDatabase, "customers"> | null;
    online?: boolean;
  },
): { record: WorkspaceCommitOutboxRecord; changed: boolean; retriedPermanentFailure: boolean } {
  const customerIds = customerIdsRepresentedByOutbox(item, options?.base);
  const recovered = canonicalizeQueuedCustomerThreadOperations(item.operations, customerIds);
  if (!recovered.changed) {
    return { record: item, changed: false, retriedPermanentFailure: false };
  }

  const exactCanonicalFailure = item.status === "failed_permanent"
    && String(item.lastErrorMessage || "").includes(CUSTOMER_CONVERSATION_CANONICAL_ERROR);
  const now = new Date().toISOString();
  const record: WorkspaceCommitOutboxRecord = {
    ...item,
    operations: recovered.operations,
    summary: recovered.operations.map((operation) => ({
      collection: operation.collection,
      upsertIds: (operation.upsert || []).map((row) => String(row.id || "")).filter(Boolean),
      deleteIds: [...(operation.deleteIds || [])],
    })),
    ...(exactCanonicalFailure
      ? {
          status: options?.online === false ? "waiting_for_network" as const : "pending" as const,
          retryCount: 0,
          retryAt: undefined,
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        }
      : {}),
    updatedAt: now,
  };

  return {
    record,
    changed: true,
    retriedPermanentFailure: exactCanonicalFailure,
  };
}
