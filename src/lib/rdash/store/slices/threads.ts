import type { Thread, ThreadMessage, ThreadKind, Followup } from "../../types";
import type { ThreadsState } from "../types";
import type { StoreContext } from "../context";
import { threadParentExists, BusinessRuleError } from "../../business-rules";
import { resolveCustomerIdFromLinks } from "../../customer-relations";
import { customerName } from "../../customer";
import { genId, nowIso } from "../helpers";
import { parseMentions, mentionThreadKindForEntityType } from "../../mentions";

export function createThreadsSlice(ctx: StoreContext): ThreadsState {
    const { commitState, get } = ctx;

    return {
        openThreadFor: (kind: ThreadKind, recordId: string, title: string, participants = ["Owner"]) => {
            const db = get().db;
            const parentExists = threadParentExists(db, kind, recordId);
            const nestedCreation = ctx.isNestedTransaction();
            if (!parentExists && !nestedCreation) {
                throw new BusinessRuleError(`Thread parent ${kind} record "${recordId}" does not exist. Threads can only be created from a valid parent action.`);
            }
            const existing = db.threads.find((t: Thread) => t.record_id === recordId && t.kind === kind);
            if (existing)
                return existing.id;
            const id = genId("thr");
            const now = nowIso();
            const thread: Thread = {
                id,
                kind,
                title,
                record_id: recordId,
                record_type: kind,
                messages: [
                    {
                        id: genId("msg"),
                        thread_id: id,
                        author_name: "System",
                        body: `Thread opened for ${title}`,
                        kind: "system",
                        created_at: now,
                    },
                ],
                participants,
                open: true,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: { ...s.db, threads: [...s.db.threads, thread] },
            }));
            return id;
        },

        addThreadReply: (threadId, msg) => {
            if (!threadId)
                return "";
            const thread = get().db.threads.find((row: Thread) => row.id === threadId);
            if (!thread)
                throw new Error("Thread not found.");
            if (msg.parent_message_id && !thread.messages.some((message: ThreadMessage) => message.id === msg.parent_message_id)) {
                throw new Error("A nested reply must reference a message in the same thread.");
            }
            if (msg.proof_attachment_id) {
                const attachment = get().db.entityFileAttachments.find((row: any) => row.id === msg.proof_attachment_id);
                if (!attachment || !get().db.master.fileAssets.some((asset: any) => asset.id === attachment.file_asset_id && asset.sync_status === "uploaded")) {
                    throw new Error("Thread proof must reference an uploaded managed file attachment.");
                }
            }
            const createdAt = nowIso();
            // Mentions: prefer caller-provided; otherwise auto-parse from the body.
            const mentions = msg.mentions ?? parseMentions(msg.body);
            const m: ThreadMessage = {
                id: genId("msg"),
                thread_id: threadId,
                parent_message_id: msg.parent_message_id,
                related_thread_id: msg.related_thread_id,
                author_name: msg.author,
                author_role: msg.role,
                body: msg.body,
                kind: msg.kind || "comment",
                proof_attachment_id: msg.proof_attachment_id,
                attachments: msg.attachments,
                mentions: mentions.length ? mentions : undefined,
                created_at: createdAt,
            };
            // Cross-post an alert to each mentioned entity's own thread so the
            // conversation graph has bidirectional backlinks. We skip this for
            // messages that are themselves cross-post alerts (kind === "alert")
            // to avoid infinite loops (an alert that mentions an entity would
            // otherwise trigger another alert, etc.).
            const crossPostTargets: Array<{ threadId: string }> = [];
            if (msg.kind !== "alert") {
                for (const mention of mentions) {
                    const threadKind = mentionThreadKindForEntityType(mention.entity_type);
                    if (!threadKind)
                        continue;
                    try {
                        const targetThreadId = get().openThreadFor(threadKind, mention.entity_id, mention.label, [msg.author]);
                        if (targetThreadId && targetThreadId !== threadId) {
                            crossPostTargets.push({ threadId: targetThreadId });
                        }
                    }
                    catch {
                        // Mentioned entity's parent record may not exist (e.g. a
                        // typo'd id) — skip the cross-post but keep the mention
                        // rendered in the original message.
                    }
                }
            }
            const truncatedBody = msg.body.length > 100 ? msg.body.slice(0, 100) + "…" : msg.body;
            const crossPostBody = `mentioned in ${thread.title}: "${truncatedBody}"`;
            const targetThreadIds = new Set(crossPostTargets.map((row) => row.threadId));
            commitState((s: any) => {
                const nextDb = { ...s.db, threads: s.db.threads.map((t: Thread) => {
                    if (t.id === threadId) {
                        return { ...t, messages: [...t.messages, m], updated_at: createdAt };
                    }
                    if (targetThreadIds.has(t.id)) {
                        const alertMsg: ThreadMessage = {
                            id: genId("msg"),
                            thread_id: t.id,
                            author_name: msg.author,
                            author_role: msg.role,
                            body: crossPostBody,
                            kind: "alert",
                            related_thread_id: threadId,
                            created_at: createdAt,
                        };
                        return { ...t, messages: [...t.messages, alertMsg], updated_at: createdAt };
                    }
                    return t;
                }) };
                // Sync proof attachments to the visit's proof_attachment_ids so the Visit Proofs gallery count is accurate.
                if (msg.kind === "proof" && msg.proof_attachment_id && thread.record_type === "visit" && thread.record_id) {
                    nextDb.visits = s.db.visits.map((v: any) => {
                        if (v.id !== thread.record_id) return v;
                        const existing = v.proof_attachment_ids || [];
                        if (existing.includes(msg.proof_attachment_id)) return v;
                        return { ...v, proof_attachment_ids: [...existing, msg.proof_attachment_id] };
                    });
                }
                return { db: nextDb };
            });
            // C4: If this is a user-authored comment on a follow-up thread,
            // also create a commSend linking them — so the Communication Centre
            // shows the same activity and the operations loop stays in sync.
            // Skip system/alert/decision/proof messages and cross-post alerts.
            if (thread.kind === "followup" && thread.record_id &&
                (msg.kind === "comment" || (!msg.kind && msg.author !== "System"))) {
                try {
                    const followup = get().db.followups.find((row: Followup) => row.id === thread.record_id);
                    if (followup && followup.customer_id) {
                        const commId = genId("cs");
                        const commSend: import("../../types").CommSend = {
                            id: commId,
                            channel: "whatsapp",
                            customer_id: followup.customer_id,
                            staff_name: msg.author,
                            subject: `Thread reply: ${thread.title}`,
                            body: msg.body,
                            attachment_ids: [],
                            status: "sent",
                            sent_at: createdAt,
                            followup_id: followup.id,
                            thread_id: threadId,
                        };
                        commitState((s: any) => ({ db: { ...s.db, commSends: [commSend, ...s.db.commSends] } }));
                    }
                }
                catch {
                    // Comm-sync from thread reply is best-effort — never block the reply.
                }
            }
            return m.id;
        },

        sendComm: (c) => {
            const customerId = resolveCustomerIdFromLinks(get().db, c, "Communication");
            if (!customerId)
                throw new Error("Communication requires a Customer.");
            const id = genId("cs");
            const now = nowIso();
            const sourceAttachments = (c.source_attachment_ids || []).map((attachmentId) => {
                const source = get().db.entityFileAttachments.find((row: any) => row.id === attachmentId);
                const asset = source && get().db.master.fileAssets.find((row: any) => row.id === source.file_asset_id);
                if (!source || !asset || asset.sync_status !== "uploaded") {
                    throw new Error("Communication attachments must be uploaded to managed Google Drive before sending.");
                }
                return source;
            });
            const send: import("../../types").CommSend = {
                id,
                channel: c.channel,
                customer_id: customerId,
                staff_name: c.staff_name,
                subject: c.subject,
                body: c.body,
                attachment_ids: [],
                status: c.status || "sent",
                sent_at: now,
                followup_id: c.followup_id,
                task_id: c.task_id,
                work_order_id: c.work_order_id,
                quotation_id: c.quotation_id,
                schedules_next_followup: c.schedules_next_followup,
            };
            commitState((s: any) => ({ db: { ...s.db, commSends: [send, ...s.db.commSends] } }));
            const communicationAttachmentIds = sourceAttachments.map((source: any) => get().attachFileAsset({
                file_asset_id: source.file_asset_id,
                entity_type: "communication",
                entity_id: id,
                role: source.role,
                caption: source.caption || `Communication attachment · ${c.subject}`,
                visibility: "customer",
                customer_shareable: true,
                created_by: c.staff_name,
            })).filter(Boolean);
            if (communicationAttachmentIds.length) {
                commitState((s: any) => ({
                    db: {
                        ...s.db,
                        commSends: s.db.commSends.map((row: any) => row.id === id ? { ...row, attachment_ids: communicationAttachmentIds } : row),
                    },
                }));
            }
            get().logAudit({
                actor: c.staff_name,
                actor_role: "Staff",
                action: `Sent ${c.channel} "${c.subject}" to ${customerName(get().db, customerId)}`,
                entity_type: "comm",
                entity_id: id,
                entity_label: c.subject,
                kind: "send",
                source_module: "communication",
                // Cross-post: communication is relevant to the Customer's thread.
                cross_post: [
                    { entity_type: "customer", entity_id: customerId, entity_label: customerName(get().db, customerId) },
                    ...(c.followup_id ? [{ entity_type: "followup", entity_id: c.followup_id }] : []),
                    ...(c.task_id ? [{ entity_type: "task", entity_id: c.task_id }] : []),
                    ...(c.work_order_id ? [{ entity_type: "workOrder", entity_id: c.work_order_id }] : []),
                    ...(c.quotation_id ? [{ entity_type: "quotation", entity_id: c.quotation_id }] : []),
                ],
            });
            // If schedules_next_followup is set, create a new follow-up linked
            // to this customer + comm so the operations loop closes. This
            // turns a one-off WhatsApp/email into a tracked next-action.
            if (c.schedules_next_followup && c.schedules_next_followup.due_date) {
                const purpose = c.schedules_next_followup.purpose || `Follow up after "${c.subject}"`;
                const dueDate = c.schedules_next_followup.due_date;
                try {
                    get().addFollowup({
                        title: purpose,
                        notes: `Auto-scheduled from ${c.channel} communication "${c.subject}" sent on ${now}.`,
                        status: "scheduled",
                        priority: "medium",
                        due_date: dueDate,
                        due_at: new Date(`${dueDate}T10:00:00`).toISOString(),
                        assigned_to: c.staff_name,
                        assigned_role: "Staff",
                        customer_id: customerId,
                        work_order_id: c.work_order_id,
                        quotation_id: c.quotation_id,
                        followup_type: "general",
                    });
                }
                catch {
                    // Follow-up creation should never block the send action.
                }
            }
        },
    };
}
