import { describe, expect, test } from "bun:test";

import { COLLECTION_ARCHITECTURE } from "../src/lib/rdash/database-architecture-registry";

const read = (path: string) => Bun.file(path).text();

describe("Task + Follow-up consolidation characterization", () => {
  test("keeps only Task and Follow-up in the WorkItem merge boundary", () => {
    expect(COLLECTION_ARCHITECTURE.tasks.decision).toBe("merge-candidate");
    expect(COLLECTION_ARCHITECTURE.followups.decision).toBe("merge-candidate");
    expect(COLLECTION_ARCHITECTURE.tasks.targetConcept).toBe("WorkItem");
    expect(COLLECTION_ARCHITECTURE.followups.targetConcept).toBe("WorkItem");

    expect(COLLECTION_ARCHITECTURE.actions.decision).toBe("keep-normalize-later");
    expect(COLLECTION_ARCHITECTURE.actions.canonicalTruth).toBe("Approval action");
    expect(COLLECTION_ARCHITECTURE.recurringTasks.decision).toBe("keep");
    expect(COLLECTION_ARCHITECTURE.recurringTasks.canonicalTruth).toBe("Recurring task definition");
  });

  test("pins distinct Task and Follow-up lifecycle enums", async () => {
    const types = await read("src/lib/rdash/types.ts");

    expect(types).toContain('export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "completed" | "cancelled";');
    expect(types).toContain('export type FollowupStatus = "pending" | "scheduled" | "completed" | "missed" | "closed";');
    expect(types).toContain('export type FollowupOutcome = "contacted" | "not_reached" | "callback_scheduled" | "promise_received" | "converted" | "lost" | "not_applicable";');
  });

  test("pins Task completion, blocking and workflow-decision protections", async () => {
    const tasks = await read("src/lib/rdash/store/slices/tasks.ts");

    expect(tasks).toContain("BUSINESS_DECISION_TASK_TYPES");
    expect(tasks).toContain("This system Task closes only when its linked approval, verification, report, or payment workflow is completed.");
    expect(tasks).toContain("A completion note is required before closing a Task.");
    expect(tasks).toContain("Task completion proofs must be uploaded to managed Google Drive before completion.");
    expect(tasks).toContain("A blocker reason is required.");
    expect(tasks).toContain("Completed Tasks must be reopened with a recorded reason.");
    expect(tasks).toContain('get().openThreadFor("task"');
  });

  test("pins Follow-up reschedule, missed-escalation and recovery-task behavior", async () => {
    const tasks = await read("src/lib/rdash/store/slices/tasks.ts");

    expect(tasks).toContain("rescheduleFollowup: (id, dueAt, note) =>");
    expect(tasks).toContain("runFollowupReconciliation: (at = nowIso()) =>");
    expect(tasks).toContain('status: "missed" as const');
    expect(tasks).toContain("escalation_level: (row.escalation_level || 0) + 1");
    expect(tasks).toContain("Recover missed follow-up");
    expect(tasks).toContain('get().openThreadFor("followup"');
  });

  test("keeps recurring schedules as generators of Tasks, not WorkItem instances", async () => {
    const tasks = await read("src/lib/rdash/store/slices/tasks.ts");
    const types = await read("src/lib/rdash/types.ts");

    expect(types).toContain("export interface RecurringTaskDefinition");
    expect(types).toContain('frequency: "daily" | "weekly" | "monthly";');
    expect(types).toContain("next_run: string;");
    expect(types).toContain("runs_count: number;");
    expect(tasks).toContain("toggleRecurringTask: (id) =>");
    expect(tasks).toContain("runRecurringTasks: (at = nowIso()) =>");
    expect(tasks).toContain("get().addTask({");
    expect(tasks).toContain("runs_count: (rule.runs_count || 0) + 1");
  });

  test("keeps Approval Actions as a separate authorization decision entity", async () => {
    const types = await read("src/lib/rdash/types.ts");

    expect(types).toContain("export interface ApprovalAction");
    expect(types).toContain('status: "pending" | "approved" | "rejected";');
    expect(types).toContain('linked_record_type?: "quotation" | "po" | "payment" | "contractor_payment";');
    expect(types).toContain("requested_by?: string;");
  });

  test("keeps current physical Task/Follow-up mappings until a later cutover gate", async () => {
    const commitRest = await read("src/lib/rdash/server/commit-rest.ts");

    expect(commitRest).toContain('tasks: "entity_tasks"');
    expect(commitRest).toContain('followups: "entity_followups"');
    expect(commitRest).not.toContain('workItems: "entity_workItems"');
  });
});
