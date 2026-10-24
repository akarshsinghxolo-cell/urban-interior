import type { RDashDatabase } from "./types";

export function validateFollowupRecovery(before: RDashDatabase, after: RDashDatabase, taskIds: string[]): void {
  for (const id of taskIds) {
    const task = after.tasks.find((row) => row.id === id);
    if (!task) continue;
    const previous = before.tasks.find((row) => row.id === id);
    if (previous?.source_followup_id && previous.source_followup_id !== task.source_followup_id) {
      throw new Error("INVALID:A recovery task cannot be detached from its source follow-up.");
    }
    if (!task.source_followup_id) continue;
    const source = after.followups.find((row) => row.id === task.source_followup_id);
    if (!source) throw new Error("INVALID:Recovery task source follow-up does not exist.");
    if (task.task_type !== "followup_recovery" || task.customer_id !== source.customer_id) {
      throw new Error("INVALID:Recovery task must belong to its source follow-up and customer.");
    }
    if (task.status === "completed" && previous?.status !== "completed" && !["completed", "closed"].includes(source.status)) {
      throw new Error("INVALID:Record an outcome on the source follow-up before completing its recovery task.");
    }
  }
}

/** Recovery work belongs to the follow-up lifecycle, including changes made outside its form. */
export function reconcileFollowupRecovery(database: RDashDatabase): RDashDatabase {
  const followups = new Map(database.followups.map((row) => [row.id, row]));
  let changed = false;
  const tasks = database.tasks.map((task) => {
    if (!task.source_followup_id || ["completed", "cancelled"].includes(task.status)) return task;
    const source = followups.get(task.source_followup_id);
    if (!source || source.status === "missed") return task;
    changed = true;
    const complete = ["completed", "closed"].includes(source.status);
    return {
      ...task,
      status: complete ? "completed" as const : "cancelled" as const,
      completion_note: complete ? "Resolved through the linked follow-up." : "Follow-up rescheduled; recovery no longer required.",
      completed_at: complete ? source.completed_at || source.updated_at : task.completed_at,
      completed_by: complete ? source.completed_by : task.completed_by,
      updated_at: source.updated_at,
    };
  });
  return changed ? { ...database, tasks } : database;
}
