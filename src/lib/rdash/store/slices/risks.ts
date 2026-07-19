import type { BlockedItem, RiskItem } from "../../types";
import type { RisksState } from "../types";
import type { StoreContext } from "../context";
import { resolveCustomerIdFromLinks } from "../../customer-relations";
import { genId, nowIso, today, assertRole } from "../helpers";

export function createRisksSlice(ctx: StoreContext): RisksState {
    const { commitState, get } = ctx;

    return {
        resolveRisk: (id) => commitState((s: any) => ({
            db: { ...s.db, risks: s.db.risks.filter((r: RiskItem) => r.id !== id) },
        })),

        resolveBlocked: (id) => {
            const actor = get().currentUser();
            assertRole(actor.role, ["Owner", "Operations Manager"], "resolve blockers");
            const blocker = get().db.blocked.find((row: BlockedItem) => row.id === id);
            if (!blocker)
                throw new Error("Blocked record not found.");
            const now = nowIso();
            const linkedTask = blocker.linked_task_id
                ? get().db.tasks.find((task: any) => task.id === blocker.linked_task_id)
                : undefined;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    blocked: s.db.blocked.map((row: BlockedItem) => row.id === id ? { ...row, resolved: true } : row),
                    tasks: linkedTask
                        ? s.db.tasks.map((task: any) => task.id === linkedTask.id && task.status === "blocked" && task.blocked_item_id === id
                            ? { ...task, status: "in_progress", blocked_item_id: undefined, updated_at: now }
                            : task)
                        : s.db.tasks,
                },
            }));
            if (linkedTask?.thread_id) {
                get().addThreadReply(linkedTask.thread_id, {
                    author: actor.name,
                    role: actor.role,
                    body: `Blocker resolved: ${blocker.reason}. Task returned to in progress.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Resolved blocker ${blocker.title}`,
                entity_type: "blocked",
                entity_id: id,
                entity_label: blocker.title,
                kind: "update",
                cross_post: [
                    ...(blocker.linked_work_order_id ? [{ entity_type: "workOrder", entity_id: blocker.linked_work_order_id }] : []),
                    ...(blocker.linked_po_id ? [{ entity_type: "po", entity_id: blocker.linked_po_id }] : []),
                    ...(blocker.linked_task_id ? [{ entity_type: "task", entity_id: blocker.linked_task_id }] : []),
                    ...(blocker.customer_id ? [{ entity_type: "customer", entity_id: blocker.customer_id }] : []),
                ],
            });
        },

        createBlocked: (b) => {
            const customerId = resolveCustomerIdFromLinks(get().db, b, "Obstacle");
            const id = b.id || genId("blk");
            const threadId = get().openThreadFor("blocked", id, b.title || "New obstacle", ["Owner"]);
            const blk: BlockedItem = {
                id,
                title: b.title || "New obstacle",
                reason: b.reason || "",
                customer_id: customerId,
                linked_task_id: b.linked_task_id,
                linked_work_order_id: b.linked_work_order_id,
                linked_po_id: b.linked_po_id,
                linked_grn_id: b.linked_grn_id,
                thread_id: threadId,
                resolved: false,
                created_at: nowIso(),
            };
            commitState((s: any) => ({
                db: { ...s.db, blocked: [blk, ...s.db.blocked] },
            }));
            get().addTask({
                title: `Resolve obstacle: ${blk.title}`,
                task_scope: "office",
                task_type: "obstacle",
                customer_id: customerId,
                work_order_id: blk.linked_work_order_id,
                po_id: blk.linked_po_id,
                auto_generated: true,
                assignee_name: "Owner",
                due_date: today(),
            });
            get().logAudit({
                actor: "System",
                action: `Auto-created obstacle "${blk.title}" + owner alert (rule: auto-008)`,
                entity_type: "blocked",
                entity_id: id,
                entity_label: blk.title,
                kind: "alert",
                cross_post: [
                    ...(blk.linked_work_order_id ? [{ entity_type: "workOrder", entity_id: blk.linked_work_order_id }] : []),
                    ...(blk.linked_po_id ? [{ entity_type: "po", entity_id: blk.linked_po_id }] : []),
                    ...(blk.linked_task_id ? [{ entity_type: "task", entity_id: blk.linked_task_id }] : []),
                    ...(customerId ? [{ entity_type: "customer", entity_id: customerId }] : []),
                ],
            });
        },

        createRisk: (r) => {
            const customerId = resolveCustomerIdFromLinks(get().db, r, "Risk");
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    risks: [
                        {
                            id: genId("risk"),
                            title: r.title || "New risk",
                            type: r.type || "cash",
                            severity: r.severity || "medium",
                            customer_id: customerId,
                            amount: r.amount,
                            reason: r.reason || "",
                            created_at: nowIso(),
                        },
                        ...s.db.risks,
                    ],
                },
            }));
        },
    };
}
