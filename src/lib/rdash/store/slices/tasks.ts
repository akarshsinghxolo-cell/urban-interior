/**
 * Tasks slice — tasks, follow-ups, and recurring task schedules.
 *
 * Phase 3m moved the 12 tasks actions out of store.ts in 3 groups:
 *   Group 1: addTask, updateTask, completeTask, blockTask, reopenTask
 *   Group 2: addFollowup, updateFollowup, completeFollowup,
 *            rescheduleFollowup, runFollowupReconciliation
 *   Group 3: toggleRecurringTask, runRecurringTasks
 *
 * 7 module-scope helpers used only by tasks actions were moved with the
 * slice: BUSINESS_DECISION_TASK_TYPES, isBusinessDecisionTask,
 * isScheduledBefore, isAssignedToActor, assertTaskActor,
 * assertFollowupActor, nextRecurringRun. The shared `assertRole` /
 * `genId` / `nowIso` / `today` / `businessDate` / `isOwnerOrOperations`
 * helpers were already in `../helpers`, and `resolveCustomerIdFromLinks`
 * was already in `../../customer-relations`.
 */
import type { Task, Followup } from "../../types";
import type { TasksState } from "../types";
import type { StoreContext } from "../context";
import type { CurrentUserContext } from "../ui-types";
import { assertRole, genId, nowIso, today, businessDate, isOwnerOrOperations } from "../helpers";
import { resolveCustomerIdFromLinks } from "../../customer-relations";
import { advanceWorkRequiredLifecycleStatus } from "../../work-required-lifecycle";

const BUSINESS_DECISION_TASK_TYPES = new Set([
    "progress_verification",
    "variation_customer_approval",
    "boq_approval",
    "po_approval",
    "contractor_payment_approval",
    "visit_report",
]);
function isBusinessDecisionTask(task: Task) {
    return Boolean(task.auto_generated &&
        task.task_type &&
        BUSINESS_DECISION_TASK_TYPES.has(task.task_type));
}
function isScheduledBefore(value: string | undefined, at: Date) {
    return Boolean(value && new Date(value).getTime() < at.getTime());
}
function isAssignedToActor(actor: CurrentUserContext, record: {
    assignee_id?: string;
    assignee_name?: string;
    assigned_to?: string;
    assigned_role?: string;
}) {
    if (record.assignee_id && actor.staffId === record.assignee_id)
        return true;
    const assigneeName = record.assignee_name || record.assigned_to;
    if (assigneeName && assigneeName === actor.name)
        return true;
    return Boolean(record.assigned_role && record.assigned_role === actor.role);
}
function assertTaskActor(actor: CurrentUserContext, task: Task, action: string) {
    if (isOwnerOrOperations(actor))
        return;
    if (!isAssignedToActor(actor, task)) {
        throw new Error(`Only the assigned staff member may ${action} this Task.`);
    }
}
function assertFollowupActor(actor: CurrentUserContext, followup: Followup, action: string) {
    if (isOwnerOrOperations(actor))
        return;
    if (!isAssignedToActor(actor, { assigned_to: followup.assigned_to, assigned_role: followup.assigned_role })) {
        throw new Error(`Only the assigned staff member may ${action} this Follow-up.`);
    }
}
function nextRecurringRun(from: string, frequency: "daily" | "weekly" | "monthly") {
    const date = new Date(`${from}T12:00:00`);
    if (frequency === "daily")
        date.setDate(date.getDate() + 1);
    if (frequency === "weekly")
        date.setDate(date.getDate() + 7);
    if (frequency === "monthly")
        date.setMonth(date.getMonth() + 1);
    return businessDate(date);
}

export function createTasksSlice(ctx: StoreContext): TasksState {
    const { commitState, get } = ctx;

    return {
        addTask: (t) => {
            const customerId = resolveCustomerIdFromLinks(get().db, t, "Task");
            const id = genId("task");
            const threadId = get().openThreadFor("task", id, t.title || "New task", [
                t.assignee_name || "Owner",
            ]);
            commitState((s: any) => {
                const task: Task = {
                    id,
                    title: t.title || "New task",
                    description: t.description || "",
                    status: t.status || "todo",
                    priority: t.priority || "medium",
                    customer_id: customerId,
                    work_required_id: t.work_required_id,
                    work_order_id: t.work_order_id,
                    quotation_id: t.quotation_id,
                    po_id: t.po_id,
                    visit_id: t.visit_id,
                    site_id: t.site_id,
                    assignee_id: t.assignee_id,
                    assignee_name: t.assignee_name,
                    assigned_to: t.assigned_to,
                    assigned_role: t.assigned_role,
                    due_date: t.due_date || today(),
                    task_scope: t.task_scope || "general",
                    task_type: t.task_type || "general",
                    comments: [],
                    checklist: [],
                    proofs: [],
                    thread_id: threadId,
                    auto_generated: t.auto_generated,
                    created_at: nowIso(),
                    updated_at: nowIso(),
                };
                return { db: { ...s.db, tasks: [task, ...s.db.tasks] } };
            });
            get().logAudit({
                actor: t.assignee_name || "Owner",
                action: `Created task "${t.title || "New task"}"`,
                entity_type: "task",
                entity_id: id,
                kind: "create",
                cross_post: [
                    ...(t.work_order_id ? [{ entity_type: "workOrder", entity_id: t.work_order_id }] : []),
                    ...(t.site_id ? [{ entity_type: "site", entity_id: t.site_id }] : []),
                    ...(customerId ? [{ entity_type: "customer", entity_id: customerId }] : []),
                    ...(t.quotation_id ? [{ entity_type: "quotation", entity_id: t.quotation_id }] : []),
                    ...(t.po_id ? [{ entity_type: "po", entity_id: t.po_id }] : []),
                    ...(t.visit_id ? [{ entity_type: "visit", entity_id: t.visit_id }] : []),
                ],
            });
            return id;
        },
        updateTask: (id, patch) => {
            const actor = get().currentUser();
            const before: Task | undefined = get().db.tasks.find((task: any) => task.id === id);
            if (!before)
                throw new Error("Task not found.");
            const resolvedCustomerId = resolveCustomerIdFromLinks(get().db, { ...before, ...patch }, "Task");
            if (patch.status === "completed") {
                get().completeTask(id, {
                    note: patch.completion_note,
                    proofUrls: (patch as any).completion_proof_urls,
                });
                return;
            }
            if (before.status === "completed" && patch.status) {
                throw new Error("Completed Tasks must be reopened with a recorded reason.");
            }
            if (patch.status === "cancelled" && isBusinessDecisionTask(before)) {
                throw new Error("This system Task must be resolved through its linked workflow and cannot be cancelled manually.");
            }
            assertTaskActor(actor, before, "update");
            if ((patch.assignee_id || patch.assignee_name || patch.assigned_to) &&
                !isOwnerOrOperations(actor)) {
                throw new Error("Only Owner or Operations can reassign Tasks.");
            }
            if (patch.status === "cancelled" && !isOwnerOrOperations(actor)) {
                throw new Error("Only Owner or Operations can cancel Tasks.");
            }
            if (patch.status && patch.status !== before.status) {
                const transitions: Record<Task["status"], Task["status"][]> = {
                    todo: ["in_progress", "review", "cancelled"],  // STAGE-5-FIX (5.11): removed "blocked" (immediately throws below)
                    in_progress: ["review", "cancelled"],
                    blocked: ["todo", "in_progress", "cancelled"],
                    review: ["in_progress", "cancelled"],  // STAGE-5-FIX (5.11): removed "blocked" (use blockTask action)
                    completed: [],
                    cancelled: [],
                };
                if (!transitions[before.status].includes(patch.status)) {
                    throw new Error(`Task cannot move from ${before.status} to ${patch.status}.`);
                }
                // STAGE-5-FIX (5.11): "blocked" is no longer in the transitions array,
                // so the transition check above rejects it. The dedicated "Block Task"
                // action should be used instead (it records a reason + recovery owner).
            }
            const threadId = before.thread_id ||
                get().openThreadFor("task", id, before.title || patch.title || "Task", [
                    before.assignee_name || before.assigned_to || "Owner",
                ]);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    tasks: s.db.tasks.map((t: any) => t.id === id
                        ? {
                            ...t,
                            ...patch,
                            customer_id: resolvedCustomerId,
                            thread_id: t.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : t),
                },
            }));
            const changes: string[] = [];
            if (patch.status && patch.status !== before.status)
                changes.push(`status changed from ${before.status} to ${patch.status}`);
            if (patch.due_date && patch.due_date !== before.due_date)
                changes.push(`due date changed from ${before.due_date} to ${patch.due_date}`);
            const nextAssignee = patch.assignee_name || patch.assigned_to;
            const oldAssignee = before.assignee_name || before.assigned_to;
            if (nextAssignee && nextAssignee !== oldAssignee)
                changes.push(`assigned to ${nextAssignee}`);
            if (patch.priority && patch.priority !== before.priority)
                changes.push(`priority changed from ${before.priority} to ${patch.priority}`);
            if (changes.length) {
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `Task updated: ${changes.join("; ")}.`,
                    kind: patch.status === "cancelled" ? "decision" : "comment",
                });
                // Audit log for task edits — records who changed what, when
                const auditChanges: any[] = [];
                if (patch.title !== undefined && patch.title !== before.title)
                    auditChanges.push({ id: `ch-${Date.now()}-t`, field: "title", before: before.title, after: patch.title });
                if (patch.description !== undefined && patch.description !== before.description)
                    auditChanges.push({ id: `ch-${Date.now()}-d`, field: "description", before: before.description, after: patch.description });
                if (patch.priority !== undefined && patch.priority !== before.priority)
                    auditChanges.push({ id: `ch-${Date.now()}-p`, field: "priority", before: before.priority, after: patch.priority });
                if (patch.due_date !== undefined && patch.due_date !== before.due_date)
                    auditChanges.push({ id: `ch-${Date.now()}-dd`, field: "due_date", before: before.due_date, after: patch.due_date });
                if (nextAssignee && nextAssignee !== oldAssignee)
                    auditChanges.push({ id: `ch-${Date.now()}-a`, field: "assignee", before: oldAssignee, after: nextAssignee });
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Task edited: ${before.title || "task"}`,
                    entity_type: "task",
                    entity_id: id,
                    entity_label: before.title,
                    kind: "update",
                    source_module: "tasks",
                    reason: `Edited by ${actor.name} (${actor.role})`,
                    changes: auditChanges.length > 0 ? auditChanges : undefined,
                });
            }
        },
        completeTask: (id, input = {}) => {
            const state = get();
            const actor = state.currentUser();
            const task = state.db.tasks.find((row: any) => row.id === id);
            if (!task)
                throw new Error("Task not found.");
            if (isBusinessDecisionTask(task))
                throw new Error("This system Task closes only when its linked approval, verification, report, or payment workflow is completed.");
            if (task.status === "completed")
                return;
            if (task.status === "cancelled")
                throw new Error("Cancelled Tasks cannot be completed.");
            if (!input.note?.trim())
                throw new Error("A completion note is required before closing a Task.");
            assertTaskActor(actor, task, "complete");
            const proofUrls = (input.proofUrls || []).filter(Boolean);
            if (proofUrls.some((url: any) => !/^https:\/\/drive\.google\.com\//.test(url)))
                throw new Error("Task completion proofs must be uploaded to managed Google Drive before completion.");
            const threadId = task.thread_id ||
                get().openThreadFor("task", id, task.title, [
                    task.assignee_name || actor.name,
                ]);
            const now = nowIso();
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    tasks: snapshot.db.tasks.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "completed" as const,
                            completed_at: now,
                            completed_by: actor.name,
                            completion_note: input.note?.trim() || undefined,
                            completion_proof_attachment_ids: [],
                            thread_id: row.thread_id || threadId,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            const completionProofAttachmentIds = proofUrls.map((url: any, index: any) => get().createFileAssetAndAttach({ file_name: `${task.title.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "task"}-completion-proof-${index + 1}`, web_view_link: url, kind: "site_proof", sync_status: "uploaded", tags: ["task", "completion-proof"] }, { entity_type: "task", entity_id: id, role: "proof", visibility: "internal", created_by: actor.name }));
            if (completionProofAttachmentIds.length) {
                commitState((snapshot: any) => ({ db: { ...snapshot.db, tasks: snapshot.db.tasks.map((row: any) => row.id === id ? { ...row, completion_proof_attachment_ids: completionProofAttachmentIds } : row) } }));
            }
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Task completed${input.note?.trim() ? `: ${input.note.trim()}` : "."}`,
                kind: "decision",
                proof_attachment_id: completionProofAttachmentIds[0],
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Completed task ${task.title}`,
                entity_type: "task",
                entity_id: id,
                entity_label: task.title,
                kind: "update",
                cross_post: [
                    ...(task.work_order_id ? [{ entity_type: "workOrder", entity_id: task.work_order_id }] : []),
                    ...(task.site_id ? [{ entity_type: "site", entity_id: task.site_id }] : []),
                    ...(task.customer_id ? [{ entity_type: "customer", entity_id: task.customer_id }] : []),
                    ...(task.quotation_id ? [{ entity_type: "quotation", entity_id: task.quotation_id }] : []),
                    ...(task.po_id ? [{ entity_type: "po", entity_id: task.po_id }] : []),
                    ...(task.visit_id ? [{ entity_type: "visit", entity_id: task.visit_id }] : []),
                ],
            });
        },
        blockTask: (id, reason) => {
            const state = get();
            const actor = state.currentUser();
            const task = state.db.tasks.find((row: any) => row.id === id);
            if (!task)
                throw new Error("Task not found.");
            assertTaskActor(actor, task, "block");
            if (!reason.trim())
                throw new Error("A blocker reason is required.");
            if (task.status === "completed" || task.status === "cancelled")
                throw new Error("Closed Tasks cannot be blocked.");
            if (task.status === "blocked" || (task.blocked_item_id && state.db.blocked.some((row: any) => row.id === task.blocked_item_id && !row.resolved)))
                throw new Error("This Task already has an unresolved blocker. Resolve or update that blocker instead of creating a duplicate.");
            const blockedId = genId("blk");
            const threadId = get().openThreadFor("blocked", blockedId, `Blocked task · ${task.title}`, [actor.name, task.assignee_name || "Owner"]);
            const now = nowIso();
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    tasks: snapshot.db.tasks.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "blocked" as const,
                            blocked_item_id: blockedId,
                            updated_at: now,
                        }
                        : row),
                    blocked: [
                        {
                            id: blockedId,
                            title: task.title,
                            reason: reason.trim(),
                            customer_id: task.customer_id,
                            linked_task_id: id,
                            linked_work_order_id: task.work_order_id,
                            linked_po_id: task.po_id,
                            thread_id: threadId,
                            resolved: false,
                            created_at: now,
                        },
                        ...snapshot.db.blocked,
                    ],
                },
            }));
            get().addThreadReply(task.thread_id ||
                get().openThreadFor("task", id, task.title, [
                    task.assignee_name || actor.name,
                ]), {
                author: actor.name,
                role: actor.role,
                body: `Task blocked: ${reason.trim()}. A linked obstacle is now in the recovery queue.`,
                kind: "decision",
                related_thread_id: threadId,
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Blocked task ${task.title}: ${reason.trim()}`,
                entity_type: "task",
                entity_id: id,
                entity_label: task.title,
                kind: "alert",
                cross_post: [
                    ...(task.work_order_id ? [{ entity_type: "workOrder", entity_id: task.work_order_id }] : []),
                    ...(task.site_id ? [{ entity_type: "site", entity_id: task.site_id }] : []),
                    ...(task.customer_id ? [{ entity_type: "customer", entity_id: task.customer_id }] : []),
                    ...(task.po_id ? [{ entity_type: "po", entity_id: task.po_id }] : []),
                    ...(task.visit_id ? [{ entity_type: "visit", entity_id: task.visit_id }] : []),
                ],
            });
            return blockedId;
        },
        reopenTask: (id, reason) => {
            const state = get();
            const actor = state.currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager"], "reopen completed Tasks");
            const task = state.db.tasks.find((row: any) => row.id === id);
            if (!task)
                throw new Error("Task not found.");
            if (task.status !== "completed")
                throw new Error("Only completed Tasks need reopening.");
            if (!reason.trim())
                throw new Error("A reopen reason is required.");
            const now = nowIso();
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    tasks: snapshot.db.tasks.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "in_progress" as const,
                            reopened_at: now,
                            reopened_by: actor.name,
                            reopen_reason: reason.trim(),
                            updated_at: now,
                        }
                        : row),
                },
            }));
            get().addThreadReply(task.thread_id ||
                get().openThreadFor("task", id, task.title, [
                    task.assignee_name || actor.name,
                ]), {
                author: actor.name,
                role: actor.role,
                body: `Task reopened: ${reason.trim()}`,
                kind: "decision",
            });
        },
        addFollowup: (f) => {
            const customerId = resolveCustomerIdFromLinks(get().db, f, "Follow-up");
            const id = genId("follow");
            const threadId = get().openThreadFor("followup", id, f.title || "New follow-up", [f.assigned_to || "Owner"]);
            commitState((s: any) => {
                const now = nowIso();
                const fu: Followup = {
                    id,
                    title: f.title || "New follow-up",
                    notes: f.notes || "",
                    status: f.status || "pending",
                    priority: f.priority || "medium",
                    due_at: f.due_at || now,
                    due_date: f.due_date || today(),
                    assigned_to: f.assigned_to,
                    assigned_role: f.assigned_role,
                    customer_id: customerId,
                    work_required_id: f.work_required_id,
                    quotation_id: f.quotation_id,
                    payment_id: f.payment_id,
                    visit_id: f.visit_id,
                    followup_type: f.followup_type || "general",
                    promise_date: f.promise_date,
                    notes_history: [],
                    thread_id: threadId,
                    created_at: now,
                    updated_at: now,
                };
                return { db: { ...s.db, followups: [fu, ...s.db.followups] } };
            });
            get().logAudit({
                actor: f.assigned_to || "Owner",
                action: `Created follow-up "${f.title || "New follow-up"}"`,
                entity_type: "followup",
                entity_id: id,
                kind: "create",
                cross_post: [
                    ...(f.quotation_id ? [{ entity_type: "quotation", entity_id: f.quotation_id }] : []),
                    ...(f.visit_id ? [{ entity_type: "visit", entity_id: f.visit_id }] : []),
                    ...(f.payment_id ? [{ entity_type: "payment", entity_id: f.payment_id }] : []),
                    ...(customerId ? [{ entity_type: "customer", entity_id: customerId }] : []),
                ],
            });
            return id;
        },
        updateFollowup: (id, patch) => {
            const actor = get().currentUser();
            const before = get().db.followups.find((followup: any) => followup.id === id);
            if (!before)
                throw new Error("Follow-up not found.");
            const resolvedCustomerId = resolveCustomerIdFromLinks(get().db, { ...before, ...patch }, "Follow-up");
            assertFollowupActor(actor, before, "update");
            if (["completed", "closed", "missed"].includes(patch.status || "")) {
                throw new Error("Complete or close a Follow-up through Record outcome. Missed status is assigned only by the reconciliation workflow.");
            }
            if (patch.assigned_to && !isOwnerOrOperations(actor)) {
                throw new Error("Only Owner or Operations can reassign Follow-ups.");
            }
            if (patch.due_date && !patch.due_at) {
                const time = before.due_at && !Number.isNaN(new Date(before.due_at).getTime())
                    ? before.due_at.slice(11, 16)
                    : "09:00";
                patch = {
                    ...patch,
                    due_at: new Date(`${patch.due_date}T${time}:00`).toISOString(),
                };
            }
            const threadId = before.thread_id ||
                get().openThreadFor("followup", id, before.title || patch.title || "Follow-up", [before.assigned_to || "Owner"]);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    followups: s.db.followups.map((f: any) => f.id === id
                        ? {
                            ...f,
                            ...patch,
                            customer_id: resolvedCustomerId,
                            thread_id: f.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : f),
                },
            }));
            const changes: string[] = [];
            if (patch.status && patch.status !== before.status)
                changes.push(`status changed from ${before.status} to ${patch.status}`);
            if (patch.due_date && patch.due_date !== before.due_date)
                changes.push(`due date changed from ${before.due_date} to ${patch.due_date}`);
            if (patch.promise_date && patch.promise_date !== before.promise_date)
                changes.push(`promise date set to ${patch.promise_date}`);
            if (patch.assigned_to && patch.assigned_to !== before.assigned_to)
                changes.push(`assigned to ${patch.assigned_to}`);
            if (patch.priority && patch.priority !== before.priority)
                changes.push(`priority changed from ${before.priority} to ${patch.priority}`);
            if (changes.length)
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `Follow-up updated: ${changes.join("; ")}.`,
                    kind: patch.status === "completed" || patch.status === "closed"
                        ? "decision"
                        : "comment",
                });
        },
        completeFollowup: (id, input) => {
            const state = get();
            const actor = state.currentUser();
            const followup = state.db.followups.find((row: any) => row.id === id);
            if (!followup)
                throw new Error("Follow-up not found.");
            assertFollowupActor(actor, followup, "complete");
            if (["completed", "closed"].includes(followup.status))
                throw new Error("This Follow-up has already been closed.");
            if (!input.outcome)
                throw new Error("Select a follow-up outcome.");
            if (!input.note.trim() &&
                !["not_reached", "not_applicable"].includes(input.outcome))
                throw new Error("Record a completion note with the customer response or decision before closing this Follow-up.");
            const now = nowIso();
            const qualifiesLead = input.outcome === "contacted" || input.outcome === "converted";
            const qualificationTargetIds = qualifiesLead
                ? state.db.workRequired
                    .filter((work: any) => {
                        if (work.status !== "new")
                            return false;
                        if (followup.work_required_id)
                            return work.id === followup.work_required_id;
                        return Boolean(followup.customer_id && work.customer_id === followup.customer_id);
                    })
                    .map((work: any) => work.id)
                : [];
            const threadId = followup.thread_id ||
                get().openThreadFor("followup", id, followup.title, [
                    followup.assigned_to || actor.name,
                ]);
            const nextDueAt = input.nextDueAt?.trim();
            let nextFollowupId: string | undefined;
            if (nextDueAt) {
                const next = new Date(nextDueAt);
                if (Number.isNaN(next.getTime()))
                    throw new Error("Next follow-up date and time are invalid.");
                nextFollowupId = get().addFollowup({
                    title: `Follow up · ${followup.title}`,
                    notes: `Auto-created after outcome: ${input.outcome}. ${input.note.trim()}`.trim(),
                    status: "scheduled",
                    priority: followup.priority,
                    due_at: next.toISOString(),
                    due_date: businessDate(next),
                    assigned_to: followup.assigned_to,
                    assigned_role: followup.assigned_role,
                    customer_id: followup.customer_id,
                    work_required_id: followup.work_required_id,
                    quotation_id: followup.quotation_id,
                    payment_id: followup.payment_id,
                    visit_id: followup.visit_id,
                    followup_type: followup.followup_type,
                });
            }
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    followups: snapshot.db.followups.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: input.outcome === "callback_scheduled" && nextFollowupId
                                ? ("completed" as const)
                                : ("completed" as const),
                            outcome: input.outcome,
                            outcome_note: input.note.trim() || undefined,
                            promise_date: input.promiseDate || row.promise_date,
                            completed_at: now,
                            completed_by: actor.name,
                            next_followup_id: nextFollowupId,
                            thread_id: row.thread_id || threadId,
                            updated_at: now,
                        }
                        : row),
                    workRequired: qualificationTargetIds.length
                        ? snapshot.db.workRequired.map((work: any) => qualificationTargetIds.includes(work.id)
                            ? {
                                ...work,
                                status: advanceWorkRequiredLifecycleStatus(work.status, "contacted"),
                                updated_at: now,
                            }
                            : work)
                        : snapshot.db.workRequired,
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Follow-up outcome: ${input.outcome.replace(/_/g, " ")}${input.note.trim() ? ` — ${input.note.trim()}` : ""}${nextFollowupId ? ". Next follow-up scheduled." : "."}${qualificationTargetIds.length ? ` ${qualificationTargetIds.length} Work Required record${qualificationTargetIds.length === 1 ? "" : "s"} qualified.` : ""}`,
                kind: "decision",
            });
            qualificationTargetIds.forEach((workRequiredId: string) => {
                const work = state.db.workRequired.find((row: any) => row.id === workRequiredId);
                if (!work)
                    return;
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Qualified work required "${work.title}" from follow-up outcome ${input.outcome}`,
                    entity_type: "workRequired",
                    entity_id: work.id,
                    entity_label: work.title,
                    kind: "update",
                    reason: `Customer follow-up ${followup.title} recorded ${input.outcome}`,
                    cross_post: [
                        { entity_type: "customer", entity_id: work.customer_id },
                        { entity_type: "site", entity_id: work.site_id },
                        { entity_type: "followup", entity_id: followup.id, entity_label: followup.title },
                    ],
                });
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Completed follow-up ${followup.title} with outcome ${input.outcome}`,
                entity_type: "followup",
                entity_id: id,
                entity_label: followup.title,
                kind: "update",
                cross_post: [
                    ...(followup.quotation_id ? [{ entity_type: "quotation", entity_id: followup.quotation_id }] : []),
                    ...(followup.visit_id ? [{ entity_type: "visit", entity_id: followup.visit_id }] : []),
                    ...(followup.payment_id ? [{ entity_type: "payment", entity_id: followup.payment_id }] : []),
                    ...(followup.customer_id ? [{ entity_type: "customer", entity_id: followup.customer_id }] : []),
                    ...qualificationTargetIds.map((workRequiredId: string) => ({ entity_type: "workRequired", entity_id: workRequiredId })),
                ],
            });
        },
        rescheduleFollowup: (id, dueAt, note) => {
            const followup = get().db.followups.find((row: any) => row.id === id);
            if (!followup)
                throw new Error("Follow-up not found.");
            assertFollowupActor(get().currentUser(), followup, "reschedule");
            if (["completed", "closed"].includes(followup.status))
                throw new Error("Closed Follow-ups cannot be rescheduled. Create a new Follow-up instead.");
            const date = new Date(dueAt);
            if (Number.isNaN(date.getTime()))
                throw new Error("A valid follow-up date and time are required.");
            get().updateFollowup(id, {
                due_at: date.toISOString(),
                due_date: businessDate(date),
                status: "scheduled",
                outcome_note: note?.trim() || followup.outcome_note,
            });
            const threadId = followup.thread_id ||
                get().openThreadFor("followup", id, followup.title, [
                    followup.assigned_to || "Owner",
                ]);
            get().addThreadReply(threadId, {
                author: get().currentUser().name,
                role: get().currentUser().role,
                body: `Follow-up rescheduled to ${date.toLocaleString("en-IN")}${note?.trim() ? `: ${note.trim()}` : ""}.`,
                kind: "decision",
            });
        },
        runFollowupReconciliation: (at = nowIso()) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "run follow-up reconciliation");
            const now = new Date(at);
            if (Number.isNaN(now.getTime()))
                throw new Error("Invalid reconciliation time.");
            const state = get();
            const overdue = state.db.followups.filter((row: any) => ["pending", "scheduled"].includes(row.status) &&
                isScheduledBefore(row.due_at, now));
            if (!overdue.length)
                return 0;
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    followups: snapshot.db.followups.map((row: any) => overdue.some((item: any) => item.id === row.id)
                        ? {
                            ...row,
                            status: "missed" as const,
                            missed_at: at,
                            escalation_level: (row.escalation_level || 0) + 1,
                            updated_at: at,
                        }
                        : row),
                },
            }));
            overdue.forEach((followup: any) => {
                const threadId = followup.thread_id ||
                    get().openThreadFor("followup", followup.id, followup.title, [
                        followup.assigned_to || "Owner",
                    ]);
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "System",
                    body: `Follow-up missed at ${new Date(at).toLocaleString("en-IN")}. Escalation level ${(followup.escalation_level || 0) + 1}; rebook or record outcome.`,
                    kind: "decision",
                });
                get().addTask({
                    title: `Recover missed follow-up · ${followup.title}`,
                    customer_id: followup.customer_id,
                    work_required_id: followup.work_required_id,
                    quotation_id: followup.quotation_id,
                    task_scope: "client",
                    task_type: "followup_recovery",
                    assignee_name: followup.assigned_to || "Owner",
                    due_date: businessDate(now),
                    auto_generated: true,
                });
            });
            return overdue.length;
        },
        toggleRecurringTask: (id) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "change recurring task schedules");
            commitState((s: any) => ({ db: { ...s.db, recurringTasks: s.db.recurringTasks.map((row: any) => row.id === id ? { ...row, enabled: !row.enabled, updated_at: nowIso() } : row) } }));
        },
        runRecurringTasks: (at = nowIso()) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "run recurring task schedules");
            const runDate = businessDate(new Date(at));
            const due = get().db.recurringTasks.filter((row: any) => row.enabled && row.next_run <= runDate);
            due.forEach((rule: any) => {
                const exists = get().db.tasks.some((task: any) => task.task_type === `recurring:${rule.id}` && task.due_date === runDate);
                if (!exists)
                    get().addTask({ title: rule.title, task_scope: rule.scope, task_type: `recurring:${rule.id}`, assignee_id: rule.assignee_id, assignee_name: rule.assignee_name, assigned_to: rule.assignee_name, priority: rule.priority, due_date: runDate, auto_generated: true, description: `Created from ${rule.frequency} recurring schedule.` });
            });
            if (due.length)
                commitState((s: any) => ({ db: { ...s.db, recurringTasks: s.db.recurringTasks.map((rule: any) => due.some((candidate: any) => candidate.id === rule.id) ? { ...rule, last_run: runDate, next_run: nextRecurringRun(rule.next_run, rule.frequency), runs_count: (rule.runs_count || 0) + 1,  /* STAGE-5-FIX: guard NaN */ updated_at: nowIso() } : rule) } }));
            return due.length;
        },
    };
}
