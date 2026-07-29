import { afterEach, describe, expect, test } from "bun:test";
import { canUseTargetedCommit } from "../src/lib/rdash/server/targeted-commit";
import type { WorkspaceOperation } from "../src/lib/rdash/workspace-operations";

const originalKillSwitch = process.env.UC_PHASE2B_TARGETED_COMMITS;

afterEach(() => {
  if (originalKillSwitch === undefined) {
    delete process.env.UC_PHASE2B_TARGETED_COMMITS;
  } else {
    process.env.UC_PHASE2B_TARGETED_COMMITS = originalKillSwitch;
  }
});

function operation(
  collection: string,
  upsert: Array<Record<string, unknown>>,
  deleteIds: string[] = [],
): WorkspaceOperation {
  return { collection, upsert, deleteIds };
}

describe("Phase 2B targeted commit eligibility", () => {
  test("accepts a bounded task update", () => {
    expect(canUseTargetedCommit([
      operation("tasks", [{ id: "task-1", customer_id: "cust-1", status: "Done" }]),
    ])).toBe(true);
  });

  test("accepts task side effects with canonical Customer, Site and Quotation threads", () => {
    expect(canUseTargetedCommit([
      operation("tasks", [{ id: "task-1", customer_id: "cust-1" }]),
      operation("threads", [
        { id: "thread-task-1", kind: "task", record_type: "task", record_id: "task-1" },
        { id: "thread-customer-1", kind: "generic", record_type: "generic", record_id: "customer-conversation:cust-1" },
        { id: "thread-site-1", kind: "site", record_type: "site", record_id: "site-1" },
        { id: "thread-quotation-1", kind: "quotation", record_type: "quotation", record_id: "quote-1" },
      ]),
      operation("auditLog", [{ id: "audit-1" }]),
    ])).toBe(true);
  });

  test("accepts legacy cust-prefixed generic Customer thread identity", () => {
    expect(canUseTargetedCommit([
      operation("followups", [{ id: "followup-1", customer_id: "cust-legacy" }]),
      operation("threads", [
        { id: "thread-customer-legacy", kind: "generic", record_type: "generic", record_id: "cust-legacy" },
      ]),
    ])).toBe(true);
  });

  test("rejects an unsupported generic thread identity", () => {
    expect(canUseTargetedCommit([
      operation("tasks", [{ id: "task-1", customer_id: "cust-1" }]),
      operation("threads", [
        { id: "thread-generic-1", kind: "generic", record_type: "generic", record_id: "work-order:wo-1" },
      ]),
    ])).toBe(false);
  });

  test("rejects operational deletes", () => {
    expect(canUseTargetedCommit([
      operation("tasks", [], ["task-1"]),
    ])).toBe(false);
  });

  test("accepts vendor-rate deletes with their derived article updates", () => {
    expect(canUseTargetedCommit([
      operation("master.vendorRates", [], ["vendor-rate-1"]),
      operation("master.articles", [{ id: "article-1", name: "Article", base_rate: 125 }]),
      operation("master.subcategoryArticleMap", [{ id: "scope-1", article_id: "article-1", reference_rate: 125 }]),
    ])).toBe(true);
  });

  test("rejects mixed unsupported collections", () => {
    expect(canUseTargetedCommit([
      operation("tasks", [{ id: "task-1" }]),
      operation("attendance", [{ id: "attendance-1" }]),
    ])).toBe(false);
  });

  test("rejects file and upload side effects", () => {
    expect(canUseTargetedCommit([
      operation("visits", [{ id: "visit-1", customer_id: "cust-1", site_id: "site-1" }]),
      operation("entityFileAttachments", [{ id: "attachment-1" }]),
    ])).toBe(false);
  });

  test("rejects batches above the 50-row safety limit", () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({ id: `task-${index + 1}` }));
    expect(canUseTargetedCommit([operation("tasks", rows)])).toBe(false);
  });

  test("rejects rows without stable IDs", () => {
    expect(canUseTargetedCommit([
      operation("followups", [{ customer_id: "cust-1" }]),
    ])).toBe(false);
  });

  test("kill switch disables every targeted commit", () => {
    process.env.UC_PHASE2B_TARGETED_COMMITS = "0";
    expect(canUseTargetedCommit([
      operation("tasks", [{ id: "task-1" }]),
    ])).toBe(false);
  });
});
