import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { reconcileFollowupRecovery, validateFollowupRecovery } from "../src/lib/rdash/followup-recovery";
import type { Followup, Task } from "../src/lib/rdash/types";

function fixture(status: Followup["status"]) {
  const db = structuredClone(buildSeedDatabase());
  db.followups = [{ id: "followup-1", customer_id: "customer-1", status, updated_at: "2026-10-24T10:00:00Z", completed_by: "Owner" } as Followup];
  db.tasks = [{ id: "task-1", source_followup_id: "followup-1", customer_id: "customer-1", task_type: "followup_recovery", status: "todo" } as Task];
  return db;
}

describe("recovery tasks share the follow-up lifecycle", () => {
  test.each(["completed", "closed"] as const)("%s source resolves recovery and preserves IDs", (status) => {
    const db = fixture(status);
    const result = reconcileFollowupRecovery(db);
    expect(result.tasks[0]).toMatchObject({ id: "task-1", source_followup_id: "followup-1", status: "completed", completed_by: "Owner", completed_at: db.followups[0].updated_at });
    expect(db.tasks[0].status).toBe("todo");
    expect(reconcileFollowupRecovery(result)).toBe(result);
  });
  test("rescheduling cancels obsolete recovery, not the follow-up", () => {
    const result = reconcileFollowupRecovery(fixture("scheduled"));
    expect(result.tasks[0].status).toBe("cancelled");
    expect(result.followups[0].status).toBe("scheduled");
  });
  test("missed and unloaded sources do not close work", () => {
    const db = fixture("missed");
    expect(reconcileFollowupRecovery(db)).toBe(db);
    db.followups = [];
    expect(reconcileFollowupRecovery(db)).toBe(db);
  });
  test("already completed recovery is preserved when another recovery cycle starts", () => {
    const db = fixture("missed");
    db.tasks[0].status = "completed";
    expect(reconcileFollowupRecovery(db)).toBe(db);
  });
  test("rejects detaching or inventing a source", () => {
    const db = fixture("missed");
    const candidate = structuredClone(db);
    delete candidate.tasks[0].source_followup_id;
    expect(() => validateFollowupRecovery(db, candidate, ["task-1"])).toThrow("detached");
    candidate.tasks[0].source_followup_id = "missing";
    expect(() => validateFollowupRecovery({ ...db, tasks: [] }, candidate, ["task-1"])).toThrow("does not exist");
  });
  test("rejects independent completion and cross-customer linking", () => {
    const db = fixture("missed");
    const candidate = structuredClone(db);
    candidate.tasks[0].status = "completed";
    expect(() => validateFollowupRecovery(db, candidate, ["task-1"])).toThrow("Record an outcome");
    candidate.tasks[0].customer_id = "other";
    expect(() => validateFollowupRecovery(db, candidate, ["task-1"])).toThrow("customer");
  });
});
