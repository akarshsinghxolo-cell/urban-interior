// STAGE-5-FIX (missed in Stage 3.2): Generate execution numbers using current year + max suffix.
function nextExecutionNo(prefix: string, collection: { drawing_no?: string; log_no?: string; variation_no?: string }[]): string {
    const year = new Date().getFullYear();
    const field = prefix === "DRW" ? "drawing_no" : prefix === "LOG" ? "log_no" : "variation_no";
    let maxSeq = 0;
    for (const row of collection) {
        const no = (row as Record<string, string | undefined>)[field];
        if (!no) continue;
        const m = no.match(new RegExp(`^${prefix}-\\d{4}-(\\d+)$`));
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return `${prefix}-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}
/**
 * Execution slice — drawings (upload/version/approve/link-to-BOQ), daily
 * execution logs (file/update/remove, progress verification, material receipt
 * confirmation), customer variation requests (create/decide), bill of quantities
 * (create/update/add/remove/approve), and Job cost lines.
 *
 * Phase 3k moved the 19 execution actions out of store.ts in 2 groups:
 *   Group 1 (13 actions): addDrawing, updateDrawing, removeDrawing,
 *     approveDrawing, uploadDrawingVersion, linkBOQItemToDrawing,
 *     addExecutionLog, updateExecutionLog, removeExecutionLog,
 *     verifyExecutionProgress, createVariationRequest, decideVariationRequest,
 *     confirmMaterialReceipt
 *   Group 2 (6 actions): createBOQ, updateBOQItem, addBOQItem, removeBOQItem,
 *     approveBOQ, addJobCostLine
 *
 * All helpers used by these actions were already in shared modules
 * (`../helpers`, `../../format`, `../../business-rules`, `../finance-helpers`),
 * so no module-scope helpers needed to be moved with this slice.
 */
import type {
    Drawing, DailyExecutionLog, VariationRequest, WorkOrderCostLine,
    WorkOrderBOQ, LineItem,
} from "../../types";
import type { ExecutionState } from "../types";
import type { StoreContext } from "../context";
import {
    assertRole, genId, nowIso, today, userForRole,
    googleFileIdFromUrl, isStoredMediaUrl,
} from "../helpers";
import { formatINR } from "../../format";
import { assertWorkOrderRelations, assertAreaBelongsToSite } from "../../business-rules";
import { eventMatchesPaymentTrigger } from "../finance-helpers";

export function createExecutionSlice(ctx: StoreContext): ExecutionState {
    const { commitState, get } = ctx;

    return {
        addDrawing: (d) => {
            const designer = userForRole(get().db, "Designer");
            const id = d.id || genId("drw");
            const now = nowIso();
            const site = d.site_id
                ? get().db.sites.find((s: any) => s.id === d.site_id)
                : undefined;
            const room = d.area_id
                ? get().db.areas.find((r: any) => r.id === d.area_id)
                : undefined;
            const workOrder = d.work_order_id
                ? get().db.workOrders.find((j: any) => j.id === d.work_order_id)
                : undefined;
            const drawingNo = nextExecutionNo("DRW", get().db.drawings);  // STAGE-5-FIX: dynamic year + max-suffix
            const threadId = get().openThreadFor("drawing", id, `${drawingNo} · ${d.title || "New drawing"}`, [d.uploaded_by || designer.name]);
            const drawing: Drawing = {
                id,
                drawing_no: drawingNo,
                title: d.title || "New drawing",
                kind: d.kind || "2D",
                site_id: d.site_id,
                site_name: site?.name,
                area_id: d.area_id,
                area_name: room?.name,
                work_order_id: d.work_order_id,
                work_order_no: workOrder?.work_order_no,
                primary_file_attachment_id: d.primary_file_attachment_id,
                version: 1,
                status: "draft",
                uploaded_by: d.uploaded_by || designer.name,
                uploaded_at: now,
                notes: d.notes,
                derived_boq_item_ids: [],
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: { ...s.db, drawings: [drawing, ...s.db.drawings] },
            }));
            get().logAudit({
                actor: d.uploaded_by || designer.name,
                actor_role: designer.role,
                action: `Uploaded drawing ${drawingNo} (${drawing.kind}) — ${drawing.title}`,
                entity_type: "drawing",
                entity_id: id,
                entity_label: drawingNo,
                kind: "create",
                cross_post: [
                    ...(drawing.work_order_id ? [{ entity_type: "workOrder", entity_id: drawing.work_order_id, entity_label: drawing.work_order_no }] : []),
                    ...(drawing.site_id ? [{ entity_type: "site", entity_id: drawing.site_id, entity_label: drawing.site_name }] : []),
                    ...(workOrder?.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                ],
            });
            return id;
        },
        updateDrawing: (id, patch) => commitState((s: any) => ({
            db: {
                ...s.db,
                drawings: s.db.drawings.map((d: any) => d.id === id ? { ...d, ...patch, updated_at: nowIso() } : d),
            },
        })),
        removeDrawing: (id) => {
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    drawings: s.db.drawings.filter((d: any) => d.id !== id),
                    boqs: s.db.boqs.map((b: any) => ({
                        ...b,
                        items: b.items.map((it: any) => it.drawing_id === id
                            ? { ...it, drawing_id: undefined, drawing_no: undefined }
                            : it),
                    })),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Deleted drawing ${id}`,
                entity_type: "drawing",
                entity_id: id,
                kind: "delete",
            });
        },
        approveDrawing: (id, approver) => {
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    drawings: s.db.drawings.map((d: any) => d.id === id
                        ? {
                            ...d,
                            status: "approved",
                            approved_by: approver || "Owner",
                            approved_at: now,
                            updated_at: now,
                        }
                        : d),
                },
            }));
            const drw = get().db.drawings.find((d: any) => d.id === id);
            get().logAudit({
                actor: approver || "Owner",
                actor_role: "Owner",
                action: `Approved drawing ${drw?.drawing_no || id}`,
                entity_type: "drawing",
                entity_id: id,
                entity_label: drw?.drawing_no,
                kind: "approve",
                cross_post: [
                    ...(drw?.work_order_id ? [{ entity_type: "workOrder", entity_id: drw.work_order_id, entity_label: drw.work_order_no }] : []),
                    ...(drw?.site_id ? [{ entity_type: "site", entity_id: drw.site_id, entity_label: drw.site_name }] : []),
                ],
            });
        },
        uploadDrawingVersion: (parentDrawingId, file) => {
            const designer = userForRole(get().db, "Designer");
            const parent = get().db.drawings.find((d: any) => d.id === parentDrawingId);
            if (!parent)
                return "";
            const newId = genId("drw");
            const now = nowIso();
            const drawingNo = `${parent.drawing_no}-v${parent.version + 1}`;
            const threadId = get().openThreadFor("drawing", newId, `${drawingNo} · ${parent.title} (revision)`, [parent.uploaded_by || designer.name]);
            const newVersion: Drawing = {
                ...parent,
                id: newId,
                drawing_no: drawingNo,
                version: parent.version + 1,
                parent_drawing_id: parent.id,
                status: "draft",
                primary_file_attachment_id: file.primary_file_attachment_id,
                notes: file.notes,
                uploaded_at: now,
                approved_at: undefined,
                approved_by: undefined,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    drawings: [
                        newVersion,
                        ...s.db.drawings.map((d: any) => d.id === parent.id
                            ? { ...d, status: "superseded" as const, updated_at: now }
                            : d),
                    ],
                },
            }));
            get().logAudit({
                actor: parent.uploaded_by || designer.name,
                actor_role: designer.role,
                action: `Uploaded ${drawingNo} as v${parent.version + 1} of ${parent.drawing_no}`,
                entity_type: "drawing",
                entity_id: newId,
                entity_label: drawingNo,
                kind: "create",
                cross_post: [
                    { entity_type: "drawing", entity_id: parent.id, entity_label: parent.drawing_no },
                    ...(parent.work_order_id ? [{ entity_type: "workOrder", entity_id: parent.work_order_id, entity_label: parent.work_order_no }] : []),
                    ...(parent.site_id ? [{ entity_type: "site", entity_id: parent.site_id, entity_label: parent.site_name }] : []),
                ],
            });
            return newId;
        },
        linkBOQItemToDrawing: (boqId, itemId, drawingId) => {
            const drw = get().db.drawings.find((d: any) => d.id === drawingId);
            if (!drw)
                return;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    boqs: s.db.boqs.map((b: any) => b.id === boqId
                        ? {
                            ...b,
                            items: b.items.map((it: any) => it.id === itemId
                                ? {
                                    ...it,
                                    drawing_id: drawingId,
                                    drawing_no: drw.drawing_no,
                                }
                                : it),
                        }
                        : b),
                    drawings: s.db.drawings.map((d: any) => d.id === drawingId
                        ? {
                            ...d,
                            derived_boq_item_ids: Array.from(new Set([...(d.derived_boq_item_ids || []), itemId])),
                        }
                        : d),
                },
            }));
        },
        addExecutionLog: (log) => {
            const fieldUser = userForRole(get().db, "Field Staff");
            const actor = get().currentUser();
            if (actor.role === "Field Staff" && !actor.staffId) {
                throw new Error("Field Staff execution logs require a server-assigned staff identity.");
            }
            const id = log.id || genId("log");
            const now = nowIso();
            const workOrder = log.work_order_id
                ? get().db.workOrders.find((job: any) => job.id === log.work_order_id)
                : undefined;
            if (!workOrder)
                throw new Error("Daily execution log requires a valid Work Order.");
            const site = get().db.sites.find((row: any) => row.id === (log.site_id || workOrder.site_id));
            const requestedProgress = log.progress_pct ?? workOrder.progress;
            if (!Number.isFinite(requestedProgress) ||
                requestedProgress < 0 ||
                requestedProgress > 100) {
                throw new Error("Progress must be between 0% and 100%.");
            }
            if (requestedProgress < workOrder.progress) {
                throw new Error(`Reported progress (${requestedProgress}%) cannot be lower than already verified Work Order progress (${workOrder.progress}%).`);
            }
            if (log.extra_work_amount &&
                log.extra_work_amount > 0 &&
                !log.extra_work_notes?.trim()) {
                throw new Error("Describe the extra work before requesting customer approval.");
            }
            const uploadedPhotos = (log.uploaded_photos || []).filter((photo: any) => photo.url && isStoredMediaUrl(photo.url));
            if ((log.uploaded_photos || []).length !== uploadedPhotos.length) {
                throw new Error("Execution photos must be uploaded to managed Google Drive before filing the log.");
            }
            const logNo = nextExecutionNo("LOG", get().db.executionLogs);  // STAGE-5-FIX: dynamic year + max-suffix
            const threadId = get().openThreadFor("execution_log", id, `${logNo} · ${workOrder.work_order_no} · ${log.date || today()}`, [log.filed_by || fieldUser.name, "Operations Manager"]);
            const needsProgressReview = requestedProgress !== workOrder.progress;
            const entry: DailyExecutionLog = {
                id,
                log_no: logNo,
                work_order_id: workOrder.id,
                work_order_no: workOrder.work_order_no,
                site_id: site?.id || workOrder.site_id,
                site_name: site?.name,
                date: log.date || today(),
                progress_pct: requestedProgress,
                progress_delta: log.progress_delta,
                progress_verification_status: needsProgressReview
                    ? "pending_review"
                    : "not_required",
                progress_review_note: needsProgressReview
                    ? "Awaiting Owner/Operations verification."
                    : undefined,
                photo_reminder_acknowledged: Boolean(log.photo_reminder_acknowledged || uploadedPhotos.length),
                materials_used: log.materials_used || [],
                extra_work_notes: log.extra_work_notes?.trim() || undefined,
                extra_work_amount: log.extra_work_amount,
                completion_notes: log.completion_notes,
                site_condition: log.site_condition,
                photo_attachment_ids: [],
                filed_by: actor.name === "Unauthenticated" ? (log.filed_by || fieldUser.name) : actor.name,
                filed_by_staff_id: actor.staffId || log.filed_by_staff_id || fieldUser.staffId,
                contractor_material_confirmed: log.contractor_material_confirmed ?? false,
                contractor_confirmation_attachment_id: undefined,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    executionLogs: [entry, ...snapshot.db.executionLogs],
                },
            }));
            const photoAttachmentIds = uploadedPhotos.map((photo: any) => get().createFileAssetAndAttach({
                file_name: photo.file_name,
                web_view_link: photo.url,
                google_file_id: photo.file_asset_id || googleFileIdFromUrl(photo.url),
                mime_type: photo.mime_type,
                kind: "media",
                storage_provider: "google_drive",
                storage_mode: "managed",
                sync_status: "uploaded",
                tags: ["execution", "photo"],
            }, { entity_type: "execution_log", entity_id: id, role: "photo", caption: photo.caption, visibility: "internal", customer_shareable: false, created_by: entry.filed_by }));
            if (photoAttachmentIds.length) {
                get().updateExecutionLog(id, { photo_attachment_ids: photoAttachmentIds });
            }
            if (needsProgressReview) {
                get().addTask({
                    title: `Verify progress · ${workOrder.work_order_no} · ${requestedProgress}%`,
                    customer_id: workOrder.customer_id,
                    work_order_id: workOrder.id,
                    site_id: workOrder.site_id,
                    task_scope: "site",
                    task_type: "progress_verification",
                    assignee_name: "Operations Manager",
                    due_date: today(),
                    auto_generated: true,
                });
                get().addThreadReply(threadId, {
                    author: entry.filed_by || fieldUser.name,
                    role: actor.role,
                    body: `Progress reported as ${requestedProgress}%. It is pending verification and has not changed the Work Order progress yet.${uploadedPhotos.length ? ` ${uploadedPhotos.length} proof photo(s) attached.` : " No photo is required, but add a progress photo when available."}`,
                    kind: "comment",
                    proof_attachment_id: photoAttachmentIds[0],
                });
            }
            else if (!uploadedPhotos.length) {
                get().addThreadReply(threadId, {
                    author: entry.filed_by || fieldUser.name,
                    role: actor.role,
                    body: "Daily log filed without a progress photo. A photo is optional, but upload one when available for easier verification.",
                    kind: "comment",
                });
            }
            if (entry.extra_work_amount && entry.extra_work_amount > 0) {
                const variationId = get().createVariationRequest({
                    work_order_id: workOrder.id,
                    execution_log_id: id,
                    title: `Extra work · ${workOrder.work_order_no} · ${logNo}`,
                    description: entry.extra_work_notes || "Extra site work requested",
                    requested_amount: entry.extra_work_amount,
                });
                commitState((snapshot: any) => ({
                    db: {
                        ...snapshot.db,
                        executionLogs: snapshot.db.executionLogs.map((row: any) => row.id === id
                            ? {
                                ...row,
                                extra_work_variation_id: variationId,
                                updated_at: nowIso(),
                            }
                            : row),
                    },
                }));
                get().addThreadReply(threadId, {
                    author: entry.filed_by || fieldUser.name,
                    role: actor.role,
                    body: `Extra work of ${formatINR(entry.extra_work_amount)} was recorded as a customer-approval variation request. No job cost has been posted.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: entry.filed_by || fieldUser.name,
                actor_role: actor.role,
                action: `Filed daily log ${logNo} for ${workOrder.work_order_no} (${requestedProgress}% reported, ${uploadedPhotos.length} photo(s))`,
                entity_type: "execution_log",
                entity_id: id,
                entity_label: logNo,
                kind: "create",
                cross_post: [
                    { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                    ...(workOrder.contractor_id ? [{ entity_type: "contractor", entity_id: workOrder.contractor_id, entity_label: workOrder.contractor_name }] : []),
                ],
            });
            return id;
        },
        updateExecutionLog: (id, patch) => commitState((s: any) => ({
            db: {
                ...s.db,
                executionLogs: s.db.executionLogs.map((l: any) => l.id === id ? { ...l, ...patch, updated_at: nowIso() } : l),
            },
        })),
        removeExecutionLog: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                executionLogs: s.db.executionLogs.filter((l: any) => l.id !== id),
            },
        })),
        verifyExecutionProgress: (logId, decision, note) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "verify execution progress");
            const state = get();
            const actor = state.currentUser();
            const log = state.db.executionLogs.find((row: any) => row.id === logId);
            if (!log)
                throw new Error("Execution log not found.");
            if (log.progress_verification_status !== "pending_review")
                throw new Error("This progress update is not waiting for verification.");
            const workOrder = state.db.workOrders.find((row: any) => row.id === log.work_order_id);
            if (!workOrder)
                throw new Error("Work Order not found for this execution log.");
            const now = nowIso();
            if (decision === "verified") {
                if (log.progress_pct < workOrder.progress)
                    throw new Error("Verified progress cannot reduce the current Work Order progress.");
                commitState((snapshot: any) => ({
                    db: {
                        ...snapshot.db,
                        executionLogs: snapshot.db.executionLogs.map((row: any) => row.id === logId
                            ? {
                                ...row,
                                progress_verification_status: "verified",
                                progress_verified_by: actor.name,
                                progress_verified_at: now,
                                progress_review_note: note?.trim() || "Verified by Operations.",
                                updated_at: now,
                            }
                            : row),
                        workOrders: snapshot.db.workOrders.map((row: any) => row.id === workOrder.id
                            ? { ...row, progress: log.progress_pct, updated_at: now }
                            : row),
                    },
                }));
            }
            else {
                commitState((snapshot: any) => ({
                    db: {
                        ...snapshot.db,
                        executionLogs: snapshot.db.executionLogs.map((row: any) => row.id === logId
                            ? {
                                ...row,
                                progress_verification_status: "returned",
                                progress_review_note: note?.trim() || "Returned for correction.",
                                updated_at: now,
                            }
                            : row),
                    },
                }));
            }
            const task = get().db.tasks.find((row: any) => row.work_order_id === workOrder.id &&
                row.task_type === "progress_verification" &&
                row.status !== "completed" &&
                row.title.includes(`${log.progress_pct}%`));
            if (task)
                commitState((snapshot: any) => ({ db: { ...snapshot.db, tasks: snapshot.db.tasks.map((row: any) => row.id === task.id ? { ...row, status: "completed" as const, completed_at: now, completed_by: actor.name, completion_note: `Progress verification ${decision}.`, updated_at: now } : row) } }));
            get().addThreadReply(log.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: decision === "verified"
                    ? `Progress verified at ${log.progress_pct}%${note?.trim() ? ` — ${note.trim()}` : ""}. Work Order progress has been updated.`
                    : `Progress update returned for correction${note?.trim() ? ` — ${note.trim()}` : ""}. Work Order progress remains ${workOrder.progress}%.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${decision === "verified" ? "Verified" : "Returned"} execution progress ${log.progress_pct}% for ${workOrder.work_order_no}`,
                entity_type: "execution_log",
                entity_id: logId,
                entity_label: log.log_no,
                kind: decision === "verified" ? "approve" : "update",
                cross_post: [
                    { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                    ...(workOrder.contractor_id ? [{ entity_type: "contractor", entity_id: workOrder.contractor_id, entity_label: workOrder.contractor_name }] : []),
                ],
            });
        },
        createVariationRequest: (input) => {
            const state = get();
            const actor = state.currentUser();
            const workOrder = state.db.workOrders.find((row: any) => row.id === input.work_order_id);
            if (!workOrder)
                throw new Error("Variation request requires a valid Work Order.");
            if (!input.description.trim())
                throw new Error("Describe the extra work before requesting customer approval.");
            if (!Number.isFinite(input.requested_amount) ||
                input.requested_amount <= 0)
                throw new Error("Variation amount must be greater than zero.");
            const id = genId("variation");
            const now = nowIso();
            const variationNo = nextExecutionNo("VO", state.db.variationRequests || []);  // STAGE-5-FIX: dynamic year + max-suffix
            const threadId = state.openThreadFor("generic", id, `${variationNo} · ${workOrder.work_order_no}`, [actor.name, workOrder.customer_name || "Customer", "Owner"]);
            const request: VariationRequest = {
                id,
                variation_no: variationNo,
                work_order_id: workOrder.id,
                work_order_no: workOrder.work_order_no,
                customer_id: workOrder.customer_id,
                site_id: workOrder.site_id,
                execution_log_id: input.execution_log_id,
                title: input.title?.trim() || `Extra work · ${workOrder.title}`,
                description: input.description.trim(),
                requested_amount: Math.round(input.requested_amount * 100) / 100,
                status: "pending_customer_approval",
                requested_by: actor.name,
                requested_at: now,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    variationRequests: [
                        request,
                        ...(snapshot.db.variationRequests || []),
                    ],
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Variation requested for customer approval: ${request.description} · ${formatINR(request.requested_amount)}. It does not affect Job cost until approved.`,
                kind: "decision",
            });
            get().addTask({
                title: `Customer approval · ${variationNo} · ${formatINR(request.requested_amount)}`,
                customer_id: workOrder.customer_id,
                work_order_id: workOrder.id,
                site_id: workOrder.site_id,
                task_scope: "client",
                task_type: "variation_customer_approval",
                assignee_name: "Owner",
                due_date: today(),
                auto_generated: true,
            });
            return id;
        },
        decideVariationRequest: (id, decision, note) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "record customer variation approval");
            const state = get();
            const actor = state.currentUser();
            const request = (state.db.variationRequests || []).find((row: any) => row.id === id);
            if (!request)
                throw new Error("Variation request not found.");
            if (request.status !== "pending_customer_approval")
                throw new Error("Only a pending customer variation can be decided.");
            const now = nowIso();
            const alreadyPosted = state.db.workOrderCostLines.some((line: any) => line.source_kind === "variation" && line.source_id === id);
            const costLine: WorkOrderCostLine | null = decision === "approved" && !alreadyPosted
                ? {
                    id: genId("jcl"),
                    work_order_id: request.work_order_id,
                    type: "overhead",
                    description: `Approved variation ${request.variation_no} · ${request.description}`,
                    amount: request.requested_amount,
                    date: today(),
                    source_kind: "variation",
                    source_id: id,
                    created_at: now,
                }
                : null;
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    variationRequests: (snapshot.db.variationRequests || []).map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: decision,
                            decided_by: actor.name,
                            decided_at: now,
                            decision_note: note?.trim() || undefined,
                            updated_at: now,
                        }
                        : row),
                    workOrderCostLines: costLine
                        ? [costLine, ...snapshot.db.workOrderCostLines]
                        : snapshot.db.workOrderCostLines,
                },
            }));
            const task = get().db.tasks.find((row: any) => row.work_order_id === request.work_order_id &&
                row.task_type === "variation_customer_approval" &&
                row.status !== "completed" &&
                row.title.includes(request.variation_no));
            if (task)
                commitState((snapshot: any) => ({ db: { ...snapshot.db, tasks: snapshot.db.tasks.map((row: any) => row.id === task.id ? { ...row, status: "completed" as const, completed_at: now, completed_by: actor.name, completion_note: `Variation request ${decision}.`, updated_at: now } : row) } }));
            get().addThreadReply(request.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: decision === "approved"
                    ? `Customer approval recorded. ${formatINR(request.requested_amount)} has now been posted once as approved variation cost.${note?.trim() ? ` Note: ${note.trim()}` : ""}`
                    : `Customer declined the variation. No Job cost was posted.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `${decision === "approved" ? "Approved" : "Rejected"} variation ${request.variation_no}`,
                entity_type: "variation",
                entity_id: id,
                entity_label: request.variation_no,
                kind: "decision",
                cross_post: [
                    { entity_type: "workOrder", entity_id: request.work_order_id, entity_label: request.work_order_no },
                    ...(request.site_id ? [{ entity_type: "site", entity_id: request.site_id }] : []),
                    ...(request.customer_id ? [{ entity_type: "customer", entity_id: request.customer_id }] : []),
                ],
            });
        },
        confirmMaterialReceipt: (logId, photoUrl, photoAttachmentId) => {
            if (photoUrl && !isStoredMediaUrl(photoUrl))
                throw new Error("Material confirmation proof must be uploaded to managed Google Drive before filing.");
            const log = get().db.executionLogs.find((row: any) => row.id === logId);
            if (!log)
                throw new Error("Execution log not found.");
            // FIX-CONTRACTOR-BATCH1 / F.1: Accept an optional `photoAttachmentId`
            // (a pre-uploaded EntityFileAttachment id) so the UI can pass an
            // already-uploaded proof photo directly. When `photoUrl` is supplied
            // we upload + attach it (legacy behaviour). When neither is supplied
            // we log a warning (console + thread reply) so the user knows the
            // payment proof gate will still require a photo — but we no longer
            // silently leave `contractor_confirmation_attachment_id` unset when
            // the caller has a pre-uploaded attachment id available.
            let confirmationAttachmentId: string | undefined;
            let proofSource: "uploaded_url" | "pre_uploaded_id" | "none" = "none";
            if (photoAttachmentId) {
                confirmationAttachmentId = photoAttachmentId;
                proofSource = "pre_uploaded_id";
            } else if (photoUrl) {
                confirmationAttachmentId = get().createFileAssetAndAttach({ file_name: `${log.log_no}-material-confirmation.jpg`, web_view_link: photoUrl, google_file_id: googleFileIdFromUrl(photoUrl), kind: "site_proof", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", tags: ["execution", "material-confirmation"] }, { entity_type: "execution_log", entity_id: logId, role: "proof", caption: "Contractor material receipt confirmation", visibility: "internal", customer_shareable: false, created_by: "Contractor" });
                proofSource = "uploaded_url";
            } else {
                // FIX-CONTRACTOR-BATCH1 / F.1: Warn (don't throw) so the
                // business can still mark material receipt confirmed. The
                // downstream `contractorPaymentProofStatus` helper will keep
                // blocking payment release until a photo is uploaded — but the
                // user is no longer dead-locked with no path forward.
                console.warn(`[confirmMaterialReceipt] No proof photo supplied for log ${log.log_no}. contractor_confirmation_attachment_id will not be set — payment release will remain blocked until a photo is uploaded.`);
            }
            const now = nowIso();
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    executionLogs: snapshot.db.executionLogs.map((row: any) => row.id === logId
                        ? { ...row, contractor_material_confirmed: true, contractor_confirmation_attachment_id: confirmationAttachmentId || row.contractor_confirmation_attachment_id, updated_at: now }
                        : row),
                },
            }));
            if (log.thread_id) {
                get().addThreadReply(log.thread_id, {
                    author: log.filed_by || "Contractor",
                    role: "Contractor",
                    body: proofSource === "none"
                        ? `Material receipt confirmed on ${log.date} — WARNING: no proof photo attached. Payment release will remain blocked until a contractor confirmation photo is uploaded.`
                        : `Material receipt confirmed on ${log.date} — proof photo attached.`,
                    kind: "comment",
                    proof_attachment_id: confirmationAttachmentId,
                });
            }
            get()
                .db.payments.filter((payment: any) => payment.work_order_id === log.work_order_id &&
                payment.schedule_state === "awaiting_event" &&
                eventMatchesPaymentTrigger(payment.due_event, "after_material_issue"))
                .forEach((payment: any) => get().triggerPaymentMilestone(payment.id, {
                reason: `Material receipt confirmed in ${log.log_no}`,
            }));
            get().logAudit({
                actor: "Contractor",
                actor_role: "Contractor",
                action: `Confirmed material receipt on log ${log.log_no}`,
                entity_type: "execution_log",
                entity_id: logId,
                entity_label: log.log_no,
                kind: "update",
                cross_post: [
                    ...(log.work_order_id ? [{ entity_type: "workOrder", entity_id: log.work_order_id, entity_label: log.work_order_no }] : []),
                    ...(log.site_id ? [{ entity_type: "site", entity_id: log.site_id, entity_label: log.site_name }] : []),
                ],
            });
        },
        createBOQ: (workOrderId) => {
            const state = get();
            const designer = userForRole(state.db, "Designer");
            const workOrder = state.db.workOrders.find((row: any) => row.id === workOrderId);
            if (!workOrder)
                return "";
            assertWorkOrderRelations(state.db, workOrder, "BOQ");
            const existing = state.db.boqs.find((boq: any) => boq.work_order_id === workOrderId);
            if (existing)
                return existing.id;
            const boqId = genId("boq");
            const threadId = state.openThreadFor("generic", boqId, `BOQ · ${workOrder.title}`, [designer.name, "Owner"]);
            const quotation = workOrder.quotation_ids[0]
                ? state.db.quotations.find((row: any) => row.id === workOrder.quotation_ids[0])
                : undefined;
            // A-1/A-4: Carry over the quotation scope_line's rate, article_id,
            // work_category_id and quantity into the BOQ. Previously this hard-
            // coded `rate = 0` and `amount = 0`, throwing away the negotiated
            // quotation rates and leaving the BOQ "unpriced" forever. The
            // "Sync from quotation" button in BOQModule re-runs this same
            // mapping on demand.
            const items: LineItem[] = (quotation?.scope_lines || [])
                .filter((line: any) => line.article_id &&
                !line.held &&
                (!line.work_required_id ||
                    workOrder.work_required_ids.includes(line.work_required_id)))
                .map((line: any, index: any) => {
                const rate = Number(line.rate) || 0;
                const quantity = Number(line.quantity) || 0;
                const amount = Math.round(rate * quantity * 100) / 100;
                return {
                    ...line,
                    id: `${boqId}-i${index + 1}`,
                    site_id: line.site_id || workOrder.site_id,
                    area_id: line.area_id || workOrder.area_ids[0],
                    rate,
                    rate_basis: "budget" as const,
                    amount,
                    status: rate > 0 ? "active" : "unpriced",
                    source_kind: "boq" as const,
                    source_item_id: line.id,
                    supply_responsibility: workOrder.material_responsibility ||
                        (workOrder.with_material ? "contractor" : "company"),
                    ordered_qty: 0,
                    received_qty: 0,
                    issued_qty: 0,
                    consumed_qty: 0,
                };
            });
            const boq: WorkOrderBOQ = {
                id: boqId,
                work_order_id: workOrderId,
                accepted_scope_ids: workOrder.accepted_scope_ids,
                work_order_no: workOrder.work_order_no,
                site_id: workOrder.site_id,
                title: `${workOrder.title} material BOQ`,
                status: "draft",
                items,
                total_amount: items.reduce((sum: any, item: any) => sum + item.amount, 0),
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            };
            commitState((s: any) => ({ db: { ...s.db, boqs: [boq, ...s.db.boqs] } }));
            get().addTask({
                title: `Approve BOQ for ${workOrder.work_order_no}`,
                customer_id: workOrder.customer_id,
                site_id: workOrder.site_id,
                work_order_id: workOrderId,
                task_scope: "site",
                task_type: "boq_approval",
                assignee_name: "Owner",
                auto_generated: true,
                due_date: today(),
            });
            return boqId;
        },
        updateBOQItem: (boqId, itemId, patch) => {
            const boq = get().db.boqs.find((row: any) => row.id === boqId);
            if (!boq)
                throw new Error("BOQ not found.");
            const workOrder = get().db.workOrders.find((row: any) => row.id === boq.work_order_id);
            if (!workOrder)
                throw new Error("BOQ Work Order not found.");
            assertWorkOrderRelations(get().db, workOrder, "BOQ");
            const items = boq.items.map((item: any) => item.id === itemId
                ? {
                    ...item,
                    ...patch,
                    amount: Math.round((patch.quantity ?? item.quantity) * (patch.rate ?? item.rate)),
                }
                : item);
            const changed = items.find((item: any) => item.id === itemId);
            if (!changed)
                throw new Error("BOQ item not found.");
            if (changed.area_id)
                assertAreaBelongsToSite(get().db, changed.area_id, workOrder.site_id, "BOQ");
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    boqs: state.db.boqs.map((row: any) => row.id === boqId
                        ? {
                            ...row,
                            items,
                            total_amount: items.reduce((total: any, item: any) => total + item.amount, 0),
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        addBOQItem: (boqId, item) => {
            const boq = get().db.boqs.find((row: any) => row.id === boqId);
            if (!boq)
                throw new Error("BOQ not found.");
            const workOrder = get().db.workOrders.find((row: any) => row.id === boq.work_order_id);
            if (!workOrder)
                throw new Error("BOQ Work Order not found.");
            assertWorkOrderRelations(get().db, workOrder, "BOQ");
            const newItem: LineItem = {
                id: genId("bi"),
                title: item.title || "New item",
                article_id: item.article_id,
                category_id: item.category_id,
                site_id: item.site_id || workOrder.site_id,
                area_id: item.area_id,
                drawing_id: item.drawing_id,
                quantity: item.quantity || 1,
                unit_id: item.unit_id,
                unit_name: item.unit_name,
                rate: item.rate || 0,
                rate_basis: item.rate_basis || "budget",
                amount: Math.round((item.quantity || 1) * (item.rate || 0)),
                tax_rate: item.tax_rate || 18,
                status: "active",
                source_kind: "boq",
                source_item_id: item.source_item_id,
                ordered_qty: 0,
                received_qty: 0,
                issued_qty: 0,
                consumed_qty: 0,
                supply_responsibility: workOrder.material_responsibility || "company",
            };
            if (newItem.site_id !== workOrder.site_id)
                throw new Error("BOQ item belongs to a different Site.");
            if (newItem.area_id)
                assertAreaBelongsToSite(get().db, newItem.area_id, workOrder.site_id, "BOQ");
            const items = [...boq.items, newItem];
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    boqs: state.db.boqs.map((row: any) => row.id === boqId
                        ? {
                            ...row,
                            items,
                            total_amount: items.reduce((total: any, line: any) => total + line.amount, 0),
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        removeBOQItem: (boqId, itemId) => commitState((s: any) => ({
            db: {
                ...s.db,
                boqs: s.db.boqs.map((b: any) => {
                    if (b.id !== boqId)
                        return b;
                    const items = b.items.filter((i: any) => i.id !== itemId);
                    return {
                        ...b,
                        items,
                        total_amount: items.reduce((n: any, i: any) => n + i.amount, 0),
                        updated_at: nowIso(),
                    };
                }),
            },
        })),
        approveBOQ: (boqId) => {
            const boq = get().db.boqs.find((b: any) => b.id === boqId);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    boqs: s.db.boqs.map((b: any) => b.id === boqId
                        ? {
                            ...b,
                            status: "approved",
                            approved_at: nowIso(),
                            approved_by: "Owner",
                            updated_at: nowIso(),
                        }
                        : b),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Approved BOQ ${boq?.title || boqId} for ${boq?.work_order_no || ""}`,
                entity_type: "boq",
                entity_id: boqId,
                entity_label: boq?.title,
                kind: "approve",
                cross_post: [
                    ...(boq?.work_order_id ? [{ entity_type: "workOrder", entity_id: boq.work_order_id, entity_label: boq.work_order_no }] : []),
                    ...(boq?.site_id ? [{ entity_type: "site", entity_id: boq.site_id }] : []),
                ],
            });
        },
        addJobCostLine: (c) => commitState((s: any) => ({
            db: {
                ...s.db,
                workOrderCostLines: [
                    {
                        id: genId("jcl"),
                        work_order_id: c.work_order_id || "",
                        type: c.type || "material",
                        description: c.description || "",
                        amount: c.amount || 0,
                        date: c.date || nowIso(),
                        source_kind: c.source_kind,
                        source_id: c.source_id,
                        vendor_id: c.vendor_id,
                        vendor_name: c.vendor_name,
                        created_at: nowIso(),
                    },
                    ...s.db.workOrderCostLines,
                ],
            },
        })),
        // A-2: BOQ rate negotiation — update a single BOQ line's rate (e.g. after
        // a vendor negotiation or a re-quote). Logs an audit entry with the
        // negotiation reason so the rate-change history is traceable.
        updateBOQItemRate: (boqId, itemId, newRate, reason) => {
            const state = get();
            const actor = state.currentUser();
            const boq = state.db.boqs.find((row: any) => row.id === boqId);
            if (!boq)
                throw new Error("BOQ not found.");
            const item = boq.items.find((row: any) => row.id === itemId);
            if (!item)
                throw new Error("BOQ item not found.");
            if (!Number.isFinite(newRate) || newRate < 0)
                throw new Error("Rate must be a non-negative number.");
            const beforeRate = Number(item.rate) || 0;
            const rate = Math.round(newRate * 100) / 100;
            const amount = Math.round((Number(item.quantity) || 0) * rate * 100) / 100;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    boqs: s.db.boqs.map((row: any) => row.id !== boqId
                        ? row
                        : {
                            ...row,
                            items: row.items.map((line: any) => line.id !== itemId
                                ? line
                                : {
                                    ...line,
                                    rate,
                                    amount,
                                    rate_basis: "budget",
                                    status: rate > 0 ? "active" : "unpriced",
                                    rate_last_changed_at: nowIso(),
                                    rate_last_changed_by: actor.name,
                                    rate_change_reason: reason?.trim() || line.rate_change_reason,
                                }),
                            total_amount: row.items.reduce((total: number, line: any) => total + (line.id === itemId ? amount : (line.amount || 0)), 0),
                            updated_at: nowIso(),
                        }),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated BOQ rate for "${item.title}" from ${beforeRate} to ${rate}${reason ? ` — reason: ${reason.trim()}` : ""}`,
                entity_type: "boq",
                entity_id: boqId,
                entity_label: boq.title,
                kind: "update",
                reason: reason?.trim(),
                changes: [{ field: "rate", before: beforeRate, after: rate }],
                cross_post: [
                    ...(boq.work_order_id ? [{ entity_type: "workOrder", entity_id: boq.work_order_id, entity_label: boq.work_order_no }] : []),
                    ...(boq.site_id ? [{ entity_type: "site", entity_id: boq.site_id }] : []),
                ],
            });
        },
        // A-4: Sync BOQ rates/quantities from the source quotation scope_lines.
        // Re-pulls the quotation linked to the BOQ's work order and overwrites
        // each BOQ line's rate/amount with the scope_line's negotiated rate.
        // Useful after a quotation renegotiation or measurement revision.
        syncBOQFromQuotation: (boqId) => {
            const state = get();
            const actor = state.currentUser();
            const boq = state.db.boqs.find((row: any) => row.id === boqId);
            if (!boq)
                throw new Error("BOQ not found.");
            const workOrder = state.db.workOrders.find((row: any) => row.id === boq.work_order_id);
            if (!workOrder)
                throw new Error("Work Order not found for this BOQ.");
            const quotation = workOrder.quotation_ids[0]
                ? state.db.quotations.find((row: any) => row.id === workOrder.quotation_ids[0])
                : undefined;
            if (!quotation || !quotation.scope_lines?.length)
                throw new Error("Source quotation or its scope_lines were not found.");
            const scopeLines = quotation.scope_lines;
            let syncedCount = 0;
            const items = boq.items.map((line: any) => {
                const scope = scopeLines.find((s: any) => s.id === line.source_item_id) ||
                    scopeLines.find((s: any) => s.article_id && s.article_id === line.article_id);
                if (!scope)
                    return line;
                const rate = Number(scope.rate) || 0;
                const quantity = Number(scope.quantity) || Number(line.quantity) || 0;
                const amount = Math.round(rate * quantity * 100) / 100;
                syncedCount++;
                return {
                    ...line,
                    rate,
                    quantity,
                    amount,
                    rate_basis: "budget" as const,
                    status: rate > 0 ? "active" : "unpriced",
                    rate_last_changed_at: nowIso(),
                    rate_last_changed_by: actor.name,
                    rate_change_reason: `Synced from quotation ${quotation.quotation_no}`,
                };
            });
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    boqs: s.db.boqs.map((row: any) => row.id !== boqId
                        ? row
                        : {
                            ...row,
                            items,
                            total_amount: items.reduce((total: number, line: any) => total + (line.amount || 0), 0),
                            updated_at: nowIso(),
                        }),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Synced ${syncedCount} BOQ line rate(s) from quotation ${quotation.quotation_no}`,
                entity_type: "boq",
                entity_id: boqId,
                entity_label: boq.title,
                kind: "update",
                cross_post: [
                    { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                    ...(boq.site_id ? [{ entity_type: "site", entity_id: boq.site_id }] : []),
                ],
            });
        },
    };
}
