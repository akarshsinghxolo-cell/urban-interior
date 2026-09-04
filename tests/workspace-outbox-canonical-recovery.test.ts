import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import {
  CUSTOMER_CONVERSATION_CANONICAL_ERROR,
  recoverQueuedCustomerConversationRecord,
} from "../src/lib/uploads/workspace-outbox-canonical-recovery";
import type { WorkspaceCommitOutboxRecord } from "../src/lib/uploads/workspace-outbox-types";
import { testFile } from "./test-file";

function failedRecord(overrides: Partial<WorkspaceCommitOutboxRecord> = {}): WorkspaceCommitOutboxRecord {
  return {
    operationId: "workspace-op-customer",
    workspaceId: "default",
    ownerUserId: "user-1",
    revision: 10,
    operations: [
      {
        collection: "customers",
        upsert: [{ id: "cust-new", name: "New Customer" }],
      },
      {
        collection: "threads",
        upsert: [{
          id: "thread-new",
          kind: "generic",
          record_type: "generic",
          record_id: "cust-new",
          messages: [],
        }],
      },
      {
        collection: "auditLog",
        upsert: [{ id: "audit-new", entity_type: "customer", entity_id: "cust-new", thread_id: "thread-new" }],
      },
    ],
    expectedRowVersions: {
      "customers:cust-new": 0,
      "threads:thread-new": 0,
      "auditLog:audit-new": 0,
    },
    uploadBatchIds: [],
    status: "failed_permanent",
    retryCount: 1,
    lastErrorCode: "HTTP_400",
    lastErrorMessage: `${CUSTOMER_CONVERSATION_CANONICAL_ERROR}.`,
    summary: [],
    createdAt: "2026-08-17T04:55:00.000Z",
    updatedAt: "2026-08-17T04:55:01.000Z",
    ...overrides,
  };
}

describe("Customer conversation outbox recovery", () => {
  test("upgrades the pre-fix Add Customer operation and makes the exact failure retryable", () => {
    const result = recoverQueuedCustomerConversationRecord(failedRecord(), { online: true });
    const threadOperation = result.record.operations.find((operation) => operation.collection === "threads");
    const thread = threadOperation?.upsert?.[0];

    expect(result.changed).toBe(true);
    expect(result.retriedPermanentFailure).toBe(true);
    expect(thread?.record_id).toBe("customer-conversation:cust-new");
    expect(result.record.status).toBe("pending");
    expect(result.record.retryCount).toBe(0);
    expect(result.record.lastErrorCode).toBeUndefined();
    expect(result.record.lastErrorMessage).toBeUndefined();
    expect(result.record.expectedRowVersions?.["threads:thread-new"]).toBe(0);
    expect(result.record.operations.find((operation) => operation.collection === "auditLog")?.upsert?.[0]?.thread_id).toBe("thread-new");
  });

  test("uses the authoritative loaded Customer set for audit-only queued thread recovery", () => {
    const record = failedRecord({
      operations: [
        {
          collection: "threads",
          upsert: [{ id: "thread-existing", kind: "generic", record_id: "cust-existing", messages: [] }],
        },
      ],
    });
    const result = recoverQueuedCustomerConversationRecord(record, {
      online: true,
      base: { customers: [{ id: "cust-existing" } as any] },
    });

    expect(result.record.operations[0].upsert?.[0]?.record_id).toBe("customer-conversation:cust-existing");
    expect(result.record.status).toBe("pending");
  });

  test("never guesses that an unrelated generic thread is a Customer conversation", () => {
    const record = failedRecord({
      operations: [
        {
          collection: "threads",
          upsert: [{ id: "thread-site", kind: "generic", record_id: "vendor-123", messages: [] }],
        },
      ],
    });
    const result = recoverQueuedCustomerConversationRecord(record, { online: true });

    expect(result.changed).toBe(false);
    expect(result.record).toBe(record);
    expect(result.record.status).toBe("failed_permanent");
  });

  test("does not reopen a permanent failure caused by something else", () => {
    const record = failedRecord({
      lastErrorCode: "HTTP_400",
      lastErrorMessage: "A different business rule failed.",
    });
    const result = recoverQueuedCustomerConversationRecord(record, { online: true });

    expect(result.changed).toBe(true);
    expect(result.record.operations[1].upsert?.[0]?.record_id).toBe("customer-conversation:cust-new");
    expect(result.record.status).toBe("failed_permanent");
    expect(result.record.lastErrorMessage).toBe("A different business rule failed.");
  });

  test("is idempotent once the queued thread is canonical", () => {
    const record = failedRecord({
      operations: [
        {
          collection: "customers",
          upsert: [{ id: "cust-new", name: "New Customer" }],
        },
        {
          collection: "threads",
          upsert: [{ id: "thread-new", kind: "generic", record_id: "customer-conversation:cust-new", messages: [] }],
        },
      ],
    });
    const result = recoverQueuedCustomerConversationRecord(record, { online: true });

    expect(result.changed).toBe(false);
    expect(result.record).toBe(record);
  });

  test("runs the one-way recovery before both overlay restore and outbox replay", async () => {
    const source = await testFile("src/lib/uploads/workspace-outbox.ts").text();
    expectTokens(source, ['import { recoverQueuedCustomerConversationRecord } from "./workspace-outbox-canonical-recovery";']);
    expectTokens(source, ["await recoverCanonicalCustomerConversationOutbox(base);"]);
    expectTokens(source, ["await recoverCanonicalCustomerConversationOutbox(acceptedWorkspace);"]);
    expect(source.indexOf("await recoverCanonicalCustomerConversationOutbox(base);")).toBeLessThan(
      source.indexOf("const items = (await readScopedWorkspaceOutbox())", source.indexOf("export async function restoreWorkspaceOutboxOverlay")),
    );
    expect(source.indexOf("await recoverCanonicalCustomerConversationOutbox(acceptedWorkspace);")).toBeLessThan(
      source.indexOf("const items = (await readScopedWorkspaceOutbox()).sort", source.indexOf("export async function flushWorkspaceOutbox")),
    );
  });
});
