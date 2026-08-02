import type { Followup, ID, Priority, Task } from "./types";

export type WorkItemType = "task" | "followup";

/**
 * Canonical Task/Follow-up compatibility shape.
 *
 * This is deliberately not wired into RDashDatabase or persistence yet. The
 * first gate is proving that both legacy row shapes can round-trip losslessly
 * while their distinct lifecycle statuses and due-date semantics remain
 * untouched.
 */
export interface CanonicalWorkItem {
  id: ID;
  item_type: WorkItemType;
  lifecycle_status: Task["status"] | Followup["status"];
  title: string;
  priority: Priority;

  customer_id?: ID;
  work_required_id?: ID;
  work_order_id?: ID;
  quotation_id?: ID;
  po_id?: ID;
  payment_id?: ID;
  visit_id?: ID;
  site_id?: ID;
  thread_id?: ID;

  assignee_id?: ID;
  assignee_name?: string;
  assigned_to?: string;
  assigned_role?: string;

  /** Business-date representation used by both Tasks and Follow-ups. */
  due_date: string;
  /** Precise Follow-up timestamp. Tasks intentionally leave this undefined. */
  due_at?: string;
  work_kind?: string;

  created_at: string;
  updated_at: string;

  /** Full legacy row retained during compatibility migration. */
  legacy_payload?: Readonly<Record<string, unknown>>;
}

function payload(value: object): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

export function workItemFromTask(task: Task): CanonicalWorkItem {
  return {
    id: task.id,
    item_type: "task",
    lifecycle_status: task.status,
    title: task.title,
    priority: task.priority,
    customer_id: task.customer_id,
    work_required_id: task.work_required_id,
    work_order_id: task.work_order_id,
    quotation_id: task.quotation_id,
    po_id: task.po_id,
    payment_id: task.payment_id,
    visit_id: task.visit_id,
    site_id: task.site_id,
    thread_id: task.thread_id,
    assignee_id: task.assignee_id,
    assignee_name: task.assignee_name,
    assigned_to: task.assigned_to,
    assigned_role: task.assigned_role,
    due_date: task.due_date,
    work_kind: task.task_type,
    created_at: task.created_at,
    updated_at: task.updated_at,
    legacy_payload: payload(task),
  };
}

export function workItemFromFollowup(followup: Followup): CanonicalWorkItem {
  return {
    id: followup.id,
    item_type: "followup",
    lifecycle_status: followup.status,
    title: followup.title,
    priority: followup.priority,
    customer_id: followup.customer_id,
    work_required_id: followup.work_required_id,
    quotation_id: followup.quotation_id,
    payment_id: followup.payment_id,
    visit_id: followup.visit_id,
    thread_id: followup.thread_id,
    assigned_to: followup.assigned_to,
    assigned_role: followup.assigned_role,
    due_date: followup.due_date,
    due_at: followup.due_at,
    work_kind: followup.followup_type,
    created_at: followup.created_at,
    updated_at: followup.updated_at,
    legacy_payload: payload(followup),
  };
}

export function taskFromWorkItem(item: CanonicalWorkItem): Task {
  if (item.item_type !== "task") {
    throw new Error(`Cannot project ${item.item_type} work item ${item.id} as Task.`);
  }

  return {
    ...(item.legacy_payload || {}),
    id: item.id,
    title: item.title,
    status: item.lifecycle_status as Task["status"],
    priority: item.priority,
    customer_id: item.customer_id,
    work_required_id: item.work_required_id,
    work_order_id: item.work_order_id,
    quotation_id: item.quotation_id,
    po_id: item.po_id,
    payment_id: item.payment_id,
    visit_id: item.visit_id,
    site_id: item.site_id,
    thread_id: item.thread_id,
    assignee_id: item.assignee_id,
    assignee_name: item.assignee_name,
    assigned_to: item.assigned_to,
    assigned_role: item.assigned_role,
    due_date: item.due_date,
    task_type: item.work_kind,
    created_at: item.created_at,
    updated_at: item.updated_at,
  } as Task;
}

export function followupFromWorkItem(item: CanonicalWorkItem): Followup {
  if (item.item_type !== "followup") {
    throw new Error(`Cannot project ${item.item_type} work item ${item.id} as Followup.`);
  }
  if (!item.due_at) {
    throw new Error(`Follow-up work item ${item.id} is missing due_at.`);
  }

  return {
    ...(item.legacy_payload || {}),
    id: item.id,
    title: item.title,
    status: item.lifecycle_status as Followup["status"],
    priority: item.priority,
    customer_id: item.customer_id,
    work_required_id: item.work_required_id,
    quotation_id: item.quotation_id,
    payment_id: item.payment_id,
    visit_id: item.visit_id,
    thread_id: item.thread_id,
    assigned_to: item.assigned_to,
    assigned_role: item.assigned_role,
    due_at: item.due_at,
    due_date: item.due_date,
    followup_type: item.work_kind as Followup["followup_type"],
    created_at: item.created_at,
    updated_at: item.updated_at,
  } as Followup;
}

export function projectLegacyTasks(items: readonly CanonicalWorkItem[]): Task[] {
  return items.filter((item) => item.item_type === "task").map(taskFromWorkItem);
}

export function projectLegacyFollowups(items: readonly CanonicalWorkItem[]): Followup[] {
  return items.filter((item) => item.item_type === "followup").map(followupFromWorkItem);
}

export function projectLegacyWorkItemCollections(items: readonly CanonicalWorkItem[]): {
  tasks: Task[];
  followups: Followup[];
} {
  return {
    tasks: projectLegacyTasks(items),
    followups: projectLegacyFollowups(items),
  };
}
