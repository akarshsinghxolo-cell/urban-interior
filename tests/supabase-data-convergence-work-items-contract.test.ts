import { describe, expect, test } from "bun:test";

import {
  followupFromWorkItem,
  projectLegacyFollowups,
  projectLegacyTasks,
  projectLegacyWorkItemCollections,
  taskFromWorkItem,
  workItemFromFollowup,
  workItemFromTask,
  type CanonicalWorkItem,
} from "../src/lib/rdash/work-items";
import type { Followup, Task } from "../src/lib/rdash/types";

describe("canonical WorkItem compatibility contract", () => {
  test("round-trips Task fields, arrays and unknown legacy values", () => {
    const task = {
      id: "task-contract-1",
      customer_id: "customer-1",
      work_required_id: "work-1",
      work_order_id: "wo-1",
      quotation_id: "quote-1",
      po_id: "po-1",
      visit_id: "visit-1",
      site_id: "site-1",
      title: "Verify site progress",
      description: "Check progress evidence",
      status: "review",
      priority: "urgent",
      assignee_id: "staff-1",
      assignee_name: "Inspector",
      assigned_to: "Inspector",
      assigned_role: "Field Staff",
      due_date: "2026-08-03",
      task_scope: "site",
      task_type: "progress_verification",
      comments: [{ text: "comment" }],
      checklist: [{ title: "check" }],
      proofs: [{ id: "proof" }],
      thread_id: "thread-task-1",
      auto_generated: true,
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T11:00:00.000Z",
      legacy_marker: { keep: true },
    } as Task & { legacy_marker: { keep: boolean } };

    const item = workItemFromTask(task);
    expect(item).toMatchObject({
      id: task.id,
      item_type: "task",
      lifecycle_status: "review",
      priority: "urgent",
      due_date: "2026-08-03",
      work_kind: "progress_verification",
      work_order_id: "wo-1",
      quotation_id: "quote-1",
      po_id: "po-1",
      visit_id: "visit-1",
      site_id: "site-1",
      thread_id: "thread-task-1",
    });
    expect(item.due_at).toBeUndefined();

    const roundTrip = taskFromWorkItem(item) as Task & { legacy_marker?: { keep: boolean } };
    expect(roundTrip).toMatchObject({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      task_scope: task.task_scope,
      task_type: task.task_type,
      comments: task.comments,
      checklist: task.checklist,
      proofs: task.proofs,
      legacy_marker: { keep: true },
    });
  });

  test("round-trips Follow-up timestamp and business date independently", () => {
    const followup = {
      id: "follow-contract-1",
      customer_id: "customer-1",
      work_required_id: "work-1",
      quotation_id: "quote-1",
      payment_id: "payment-1",
      visit_id: "visit-1",
      title: "Call customer",
      notes: "Confirm revised date",
      status: "scheduled",
      priority: "high",
      due_at: "2026-08-04T09:30:00.000Z",
      due_date: "2026-08-04",
      assigned_to: "Sales",
      assigned_role: "Sales / Telecaller",
      followup_type: "call",
      promise_date: "2026-08-05",
      outcome: "callback_scheduled",
      outcome_note: "Customer requested callback",
      escalation_level: 2,
      notes_history: [{ note: "old" }],
      thread_id: "thread-follow-1",
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T11:00:00.000Z",
      legacy_marker: "keep-me",
    } as Followup & { legacy_marker: string };

    const item = workItemFromFollowup(followup);
    expect(item).toMatchObject({
      item_type: "followup",
      lifecycle_status: "scheduled",
      due_at: "2026-08-04T09:30:00.000Z",
      due_date: "2026-08-04",
      work_kind: "call",
      payment_id: "payment-1",
      visit_id: "visit-1",
    });

    const roundTrip = followupFromWorkItem(item) as Followup & { legacy_marker?: string };
    expect(roundTrip).toMatchObject({
      id: followup.id,
      title: followup.title,
      notes: followup.notes,
      status: followup.status,
      priority: followup.priority,
      due_at: followup.due_at,
      due_date: followup.due_date,
      followup_type: followup.followup_type,
      promise_date: followup.promise_date,
      outcome: followup.outcome,
      escalation_level: 2,
      notes_history: followup.notes_history,
      legacy_marker: "keep-me",
    });
  });

  test("canonical shared fields override stale legacy payload values", () => {
    const item: CanonicalWorkItem = {
      ...workItemFromTask({
        id: "task-contract-2",
        title: "Old title",
        status: "todo",
        priority: "low",
        due_date: "2026-08-03",
        task_scope: "general",
        comments: [],
        checklist: [],
        proofs: [],
        created_at: "2026-08-02T10:00:00.000Z",
        updated_at: "2026-08-02T10:00:00.000Z",
      }),
      title: "New title",
      lifecycle_status: "in_progress",
      priority: "high",
      due_date: "2026-08-06",
      updated_at: "2026-08-02T12:00:00.000Z",
    };

    expect(taskFromWorkItem(item)).toMatchObject({
      title: "New title",
      status: "in_progress",
      priority: "high",
      due_date: "2026-08-06",
      updated_at: "2026-08-02T12:00:00.000Z",
    });
  });

  test("does not coerce subtype lifecycle states into a universal status", () => {
    const blocked = workItemFromTask({
      id: "task-blocked",
      title: "Blocked task",
      status: "blocked",
      priority: "medium",
      due_date: "2026-08-03",
      task_scope: "general",
      comments: [],
      checklist: [],
      proofs: [],
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });
    const missed = workItemFromFollowup({
      id: "follow-missed",
      title: "Missed follow-up",
      status: "missed",
      priority: "medium",
      due_at: "2026-08-02T09:00:00.000Z",
      due_date: "2026-08-02",
      notes_history: [],
      created_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });

    expect(blocked.lifecycle_status).toBe("blocked");
    expect(missed.lifecycle_status).toBe("missed");
  });

  test("projects the two legacy collections from one canonical list", () => {
    const task = workItemFromTask({
      id: "task-project",
      title: "Task",
      status: "todo",
      priority: "medium",
      due_date: "2026-08-03",
      task_scope: "general",
      comments: [], checklist: [], proofs: [],
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });
    const followup = workItemFromFollowup({
      id: "follow-project",
      title: "Follow-up",
      status: "pending",
      priority: "medium",
      due_at: "2026-08-03T10:00:00.000Z",
      due_date: "2026-08-03",
      notes_history: [],
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });

    expect(projectLegacyTasks([task, followup]).map((row) => row.id)).toEqual(["task-project"]);
    expect(projectLegacyFollowups([task, followup]).map((row) => row.id)).toEqual(["follow-project"]);
    expect(projectLegacyWorkItemCollections([task, followup])).toMatchObject({
      tasks: [{ id: "task-project" }],
      followups: [{ id: "follow-project" }],
    });
  });

  test("rejects wrong-type projections and malformed Follow-up timing", () => {
    const task = workItemFromTask({
      id: "task-wrong",
      title: "Task",
      status: "todo",
      priority: "medium",
      due_date: "2026-08-03",
      task_scope: "general",
      comments: [], checklist: [], proofs: [],
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });
    const followup = workItemFromFollowup({
      id: "follow-wrong",
      title: "Follow-up",
      status: "pending",
      priority: "medium",
      due_at: "2026-08-03T10:00:00.000Z",
      due_date: "2026-08-03",
      notes_history: [],
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    });

    expect(() => followupFromWorkItem(task)).toThrow("Cannot project task work item");
    expect(() => taskFromWorkItem(followup)).toThrow("Cannot project followup work item");
    expect(() => followupFromWorkItem({ ...followup, due_at: undefined })).toThrow("missing due_at");
  });
});
