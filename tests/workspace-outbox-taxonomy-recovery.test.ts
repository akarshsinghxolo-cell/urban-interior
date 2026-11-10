import { describe, expect, test } from "vitest";
import { recoverQueuedWorkTypeDeletionRecord } from "../src/lib/uploads/workspace-outbox-taxonomy-recovery";
import type { WorkspaceCommitOutboxRecord } from "../src/lib/uploads/workspace-outbox-types";

const record: WorkspaceCommitOutboxRecord = {
  operationId: "work-type-delete", workspaceId: "default", ownerUserId: "owner", revision: 1,
  operations: [{ collection: "master.workSubcategories", upsert: [{
    id: "fc_pop", name: "POP", category_id: "false-ceiling", unit_id: "sqft",
    work_types: [{ id: "standard", name: "Standard", unit_id: "sqft" }, { id: "murga", name: "Murga", unit_id: "sqft" }],
  }] }],
  uploadBatchIds: [], status: "failed_permanent", retryCount: 1, lastErrorCode: "HTTP_400",
  lastErrorMessage: "Choose a replacement work type before deleting.", summary: [],
  createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
};

describe("legacy work-type deletion outbox recovery", () => {
  test("adds an automatic Standard replacement and retries only the matching old failure", () => {
    const result = recoverQueuedWorkTypeDeletionRecord(record, {
      online: true,
      base: { master: { workSubcategories: [{
        id: "fc_pop", name: "POP", category_id: "false-ceiling", unit_id: "sqft",
        work_types: [
          { id: "standard", name: "Standard", unit_id: "sqft" },
          { id: "gypsum", name: "Gypsum Jali", unit_id: "sqft" },
          { id: "murga", name: "Murga", unit_id: "sqft" },
        ],
      }] } } as any,
    });

    expect(result.changed).toBe(true);
    expect(result.record.status).toBe("pending");
    expect(result.record.operations[0].upsert?.[0]?.work_type_replacements).toEqual({ gypsum: "standard" });
  });

  test("leaves other permanent failures alone", () => {
    expect(recoverQueuedWorkTypeDeletionRecord({ ...record, lastErrorMessage: "A different rule failed." }, { online: true, base: { master: { workSubcategories: [] } } as any }).changed).toBe(false);
  });
});
