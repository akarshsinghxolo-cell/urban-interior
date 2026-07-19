/**
 * Quotations slice — quotation master records, items, milestones, acceptance,
 * revision-with-holds, contractor-bidding reopening, and WorkOrder job updates.
 *
 * Phase 3j moved the 12 quotations actions out of store.ts in 4 groups:
 *   Group 1: 8 actions (updateQuotation, addQuotation, addQuotationItem,
 *            updateQuotationItem, removeQuotationItem, addQuotationMilestone,
 *            updateQuotationMilestone, removeQuotationMilestone)
 *   Group 2: reviseQuotationWithHolds
 *   Group 3: reopenJobForBidding
 *   Group 4: acceptQuotationForBidding + updateJob
 *
 * The shared helpers `coverageAcceptedValue` and `quotationAcceptanceWarnings`
 * (used by both this slice and by the inline store.ts UI action
 * `quotationAcceptanceWarnings`) were moved to `../quotations-helpers` so both
 * call sites share a single implementation. The remaining quotation-only
 * helpers (`assertQuotationEditable`, `assertQuotationStatusTransition`,
 * `workRequiredLifecycleForQuotation`, `workRequiredLifecycleForJob`,
 * `quotationWorkRequiredIds`, `primaryWorkRequiredId`,
 * `upsertQuotationFollowup`) live here as module-scope helpers.
 */
import type {
    Quotation, QuotationItem, WorkOrder, Followup,
} from "../../types";
import type { QuotationsState } from "../types";
import type { StoreContext } from "../context";
import { assertRole, genId, nowIso, today, userForRole, addDays } from "../helpers";
import { assertQuotationRelations, assertWorkOrderRelations } from "../../business-rules";
import { findOpenLinkedFollowup } from "../finance-helpers";
import { coverageAcceptedValue, quotationAcceptanceWarnings, resolveQuotationDefaults } from "../quotations-helpers";

function assertQuotationEditable(quotation: Quotation, action: string) {
    if (quotation.status !== "draft")
        throw new Error(`${quotation.quotation_no} is locked because it is ${quotation.status}. Create a revision before you ${action}.`);
}
function assertQuotationStatusTransition(before: Quotation, nextStatus: Quotation["status"]) {
    if (nextStatus === before.status)
        return;
    if (nextStatus === "accepted")
        throw new Error("Use the acceptance dialog to choose scope and acknowledge any commercial warnings.");
    const allowed: Record<Quotation["status"], Quotation["status"][]> = {
        draft: ["sent", "rejected", "expired"],
        sent: ["rejected", "expired"],
        accepted: [],
        rejected: [],
        expired: [],
        cancelled: [],
    };
    if (!allowed[before.status].includes(nextStatus))
        throw new Error(`${before.quotation_no} cannot move from ${before.status} to ${nextStatus}. Create a revision for commercial changes.`);
}
function workRequiredLifecycleForQuotation(status: Quotation["status"]): import("../../types").WorkRequiredStatus {
    if (status === "draft")
        return "quotation_in_progress";
    if (status === "sent")
        return "quotation_sent";
    if (status === "accepted")
        return "accepted";
    if (status === "rejected" || status === "expired" || status === "cancelled")
        return "on_hold";
    return "on_hold";
}
function workRequiredLifecycleForJob(status: WorkOrder["status"]): import("../../types").WorkRequiredStatus {
    if (status === "completed")
        return "completed";
    if (status === "on_hold" || status === "abandoned" || status === "cancelled")
        return "on_hold";
    return "contractor_bidding";
}
function quotationWorkRequiredIds(quotation: Quotation): string[] {
    return quotation.coverage.map((coverage: any) => coverage.work_required_id);
}
function primaryWorkRequiredId(quotation: Quotation): string | undefined {
    return quotationWorkRequiredIds(quotation)[0];
}
function upsertQuotationFollowup(state: any, quotation: Quotation) {
    const dueDate = addDays(today(), 3);
    const existing = findOpenLinkedFollowup(state.db, {
        quotation_id: quotation.id,
        customer_id: quotation.customer_id,
        work_required_id: primaryWorkRequiredId(quotation),
        followup_type: "quotation",
    });
    const patch: Partial<Followup> = {
        customer_id: quotation.customer_id,
        work_required_id: primaryWorkRequiredId(quotation),
        quotation_id: quotation.id,
        title: `Follow up quotation · ${quotation.quotation_no}`,
        notes: `Auto-created after quotation was sent. Customer: ${quotation.customer_name || "Customer"}.`,
        status: "pending",
        priority: "high",
        due_date: dueDate,
        due_at: new Date(`${dueDate}T09:00:00`).toISOString(),
        assigned_to: "Owner",
        assigned_role: "Sales",
        followup_type: "quotation",
    };
    if (existing) {
        state.updateFollowup(existing.id, patch);
        return existing.id;
    }
    return state.addFollowup({ ...patch, notes_history: [] });
}

export function createQuotationsSlice(ctx: StoreContext): QuotationsState {
    const { commitState, get } = ctx;

    return {
        updateQuotation: (id, patch) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "update quotations");
            const actor = get().currentUser();
            const before = get().db.quotations.find((quotation: any) => quotation.id === id);
            if (!before)
                throw new Error("Quotation not found.");
            const commercialKeys = Object.keys(patch).filter((key: any) => key !== "status" && key !== "updated_at");
            if (commercialKeys.length)
                assertQuotationEditable(before, "change commercial details");
            if (patch.status)
                assertQuotationStatusTransition(before, patch.status);
            // C: enforce discount-approval policy on every update. If the new
            //    discount % crosses the active policy threshold, mark the quote
            //    as pending approval (even if it was approved before — the policy
            //    re-evaluates on every change). Clearing the discount back under
            //    threshold also clears the hold automatically.
            let discountPatch: Partial<Quotation> = {};
            if (patch.discount_pct !== undefined) {
                const nextDiscount = patch.discount_pct;
                const policy = get().requiresApproval("quotation_discount", nextDiscount);
                if (policy) {
                    discountPatch = {
                        pending_approval: true,
                        approval_reason: `Discount of ${nextDiscount}% exceeds the ${policy.name} threshold (${policy.operator} ${policy.threshold}%).`,
                    };
                }
                else {
                    discountPatch = {
                        pending_approval: false,
                        approval_reason: undefined,
                    };
                }
            }
            const effectivePatch: Partial<Quotation> = { ...patch, ...discountPatch };
            const candidate = {
                ...before,
                ...effectivePatch,
                coverage: patch.coverage || before.coverage,
                scope_lines: patch.scope_lines || before.scope_lines,
                items: patch.items || before.items,
            };
            assertQuotationRelations(get().db, candidate, "Quotation");
            const threadId = before.thread_id ||
                get().openThreadFor("quotation", id, `${before.quotation_no} · ${before.title}`, [actor.name, before.customer_name || "Customer"]);
            const nextWorkRequiredStatus = patch.status
                ? workRequiredLifecycleForQuotation(patch.status)
                : undefined;
            const changedAt = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    quotations: s.db.quotations.map((quote: any) => quote.id === id
                        ? {
                            ...quote,
                            ...effectivePatch,
                            coverage: patch.coverage || quote.coverage,
                            scope_lines: patch.scope_lines || quote.scope_lines,
                            items: patch.items || quote.items,
                            thread_id: quote.thread_id || threadId,
                            updated_at: changedAt,
                        }
                        : quote),
                    workRequired: nextWorkRequiredStatus
                        ? s.db.workRequired.map((work: any) => before.coverage.some((coverage: any) => coverage.work_required_id === work.id)
                            ? {
                                ...work,
                                status: nextWorkRequiredStatus,
                                updated_at: changedAt,
                            }
                            : work)
                        : s.db.workRequired,
                },
            }));
            const changes: string[] = [];
            if (patch.status && patch.status !== before.status)
                changes.push(`status changed from ${before.status} to ${patch.status}`);
            if (patch.valid_until && patch.valid_until !== before.valid_until)
                changes.push(`valid until changed from ${before.valid_until} to ${patch.valid_until}`);
            if (patch.discount_pct !== undefined && patch.discount_pct !== (before.discount_pct ?? 0))
                changes.push(`discount % changed from ${before.discount_pct ?? 0} to ${patch.discount_pct}`);
            if (commercialKeys.length)
                changes.push("commercial draft updated");
            if (changes.length) {
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `Quotation updated: ${changes.join("; ")}.`,
                    kind: patch.status === "sent" || patch.status === "rejected"
                        ? "decision"
                        : "comment",
                });
            }
            const quotation = get().db.quotations.find((row: any) => row.id === id);
            if (before.status !== "sent" && quotation?.status === "sent") {
                const followupId = upsertQuotationFollowup(get(), quotation);
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Quotation sent. Follow-up ${followupId} scheduled for ${addDays(today(), 3)}.`,
                    kind: "system",
                });
                // E: fire automation for quotation_sent.
                get().fireAutomation("quotation_sent", {
                    quotationId: quotation.id,
                    quotationNo: quotation.quotation_no,
                    customerId: quotation.customer_id,
                    amount: quotation.total_amount,
                });
            }
        },
        addQuotation: (q) => {
            const state = get();
            const designer = userForRole(state.db, "Designer");
            const id = genId("quot");
            const now = nowIso();
            const quoteNo = `Q-2026-${String(state.db.quotations.length + 1).padStart(3, "0")}`;
            const customer = q.customer_id
                ? state.db.customers.find((p: any) => p.id === q.customer_id)
                : undefined;
            const customerName = customer?.name || "Customer";
            const siteId = q.site_id || "";
            const explicitCoverage = q.coverage || [];
            if (!q.customer_id || !siteId || explicitCoverage.length === 0) {
                throw new Error("Quotation requires a Customer, Site, and at least one covered Work Required.");
            }
            assertQuotationRelations(state.db, {
                customer_id: q.customer_id,
                site_id: siteId,
                coverage: explicitCoverage,
                scope_lines: q.scope_lines || [],
                items: q.items,
            }, "Quotation");
            const site = state.db.sites.find((row: any) => row.id === siteId && row.customer_id === q.customer_id)!;
            const coverage = explicitCoverage.filter((entry: any) => {
                const work = state.db.workRequired.find((row: any) => row.id === entry.work_required_id);
                return Boolean(work && work.customer_id === q.customer_id && work.site_id === siteId);
            });
            if (coverage.length !== explicitCoverage.length)
                throw new Error("Quotation coverage must use Work Required from the selected Customer and Site.");
            const coveredWork = coverage
                .map((entry: any) => state.db.workRequired.find((row: any) => row.id === entry.work_required_id))
                .filter((row): row is NonNullable<typeof row> => Boolean(row));
            const starterItems: QuotationItem[] = q.scope_lines?.length
                ? q.scope_lines
                : coveredWork.flatMap((work: any) => (work.structured_items || []).map((item: any) => ({
                    ...item,
                    id: genId("qi"),
                    work_required_id: work.id,
                    site_id: siteId,
                    area_id: item.area_id || work.area_ids[0],
                    source_kind: "quotation" as const,
                    source_item_id: item.id,
                })));
            const subtotal = q.subtotal != null
                ? q.subtotal
                : starterItems.reduce((sum: any, item: any) => sum + item.amount, 0);
            const taxAmount = q.tax_amount != null
                ? q.tax_amount
                : Math.round(starterItems.reduce((sum: any, item: any) => sum + (item.amount * (item.tax_rate || 0)) / 100, 0));
            const totalAmount = q.total_amount != null ? q.total_amount : subtotal + taxAmount;
            const threadId = state.openThreadFor("quotation", id, `${quoteNo} · ${q.title || "New quotation"}`, [designer.name, customerName]);
            const initialWorkRequiredStatus = workRequiredLifecycleForQuotation(q.status || "draft");
            // A: Pull defaults from the active commercial masters. Caller-provided
            //    values still win — we only fill in the gaps the user didn't set.
            const defaults = resolveQuotationDefaults(state.db);
            const validUntil = q.valid_until || defaults.valid_until;
            const paymentTerms = q.payment_terms && q.payment_terms.length
                ? q.payment_terms
                : defaults.payment_terms;
            // C: discount-approval gate. If a discount % was supplied and the
            //    active policy says it needs owner approval, mark the quotation
            //    as held (pending_approval) and surface the reason.
            const discountPct = q.discount_pct ?? 0;
            let pendingApproval = false;
            let approvalReason: string | undefined;
            if (discountPct > 0) {
                const policy = state.requiresApproval("quotation_discount", discountPct);
                if (policy) {
                    pendingApproval = true;
                    approvalReason = `Discount of ${discountPct}% exceeds the ${policy.name} threshold (${policy.operator} ${policy.threshold}%).`;
                }
            }
            const quotation: Quotation = {
                id,
                quotation_no: quoteNo,
                customer_id: q.customer_id || "",
                site_id: siteId,
                title: q.title || "New quotation",
                status: q.status || "draft",
                revision_no: 0,
                valid_until: validUntil,
                validity_days: defaults.validity_days,
                subtotal,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                payment_terms: paymentTerms,
                commercial_terms: q.commercial_terms,
                terms_and_conditions: defaults.terms_and_conditions,
                tax_config: defaults.tax_config,
                discount_pct: discountPct,
                pending_approval: pendingApproval,
                approval_reason: approvalReason,
                coverage,
                scope_lines: starterItems,
                items: starterItems,
                thread_id: threadId,
                work_order_ids: [],
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    quotations: [quotation, ...s.db.quotations],
                    workRequired: s.db.workRequired.map((work: any) => coverage.some((entry: any) => entry.work_required_id === work.id)
                        ? { ...work, status: initialWorkRequiredStatus, updated_at: now }
                        : work),
                },
            }));
            if (starterItems.length) {
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Quotation coverage created for ${coverage.length} work requirement(s) with ${starterItems.length} scoped line(s).`,
                    kind: "system",
                });
            }
            if (defaults.payment_terms.length) {
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Payment milestones seeded from default template (${defaults.payment_terms.length} milestones totalling ${defaults.payment_terms.reduce((n, t) => n + t.percentage, 0)}%).`,
                    kind: "system",
                });
            }
            if (defaults.terms_and_conditions) {
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Commercial terms applied from ${state.db.commercialTerms.filter((t: any) => t.enabled).length} active clause(s).`,
                    kind: "system",
                });
            }
            if (pendingApproval) {
                get().addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `⚠ ${approvalReason} Owner approval required before sending.`,
                    kind: "alert",
                });
            }
            get().logAudit({
                actor: designer.name,
                actor_role: designer.role,
                action: `Created quotation ${quoteNo} for ${customerName}${pendingApproval ? " (held for discount approval)" : ""}`,
                entity_type: "quotation",
                entity_id: id,
                entity_label: quoteNo,
                kind: "create",
            });
            // E: fire automation for quotation_created.
            get().fireAutomation("quotation_created", {
                quotationId: id,
                quotationNo: quoteNo,
                customerId: q.customer_id,
                siteId,
                amount: totalAmount,
                discountPct,
            });
            return id;
        },
        addQuotationItem: (quotationId, item) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "add a quotation line");
            const quantity = item.quantity ?? 1;
            const rate = item.rate ?? 0;
            const newItem: QuotationItem = {
                id: `qi-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                title: item.title || "New line item",
                description: item.description,
                article_id: item.article_id,
                category_id: item.category_id,
                work_required_id: item.work_required_id,
                site_id: item.site_id || quotation.site_id,
                area_id: item.area_id,
                site_name: item.site_name,
                area_name: item.area_name,
                drawing_id: item.drawing_id,
                quantity,
                unit_id: item.unit_id,
                unit_name: item.unit_name,
                rate,
                amount: Math.round(quantity * rate),
                tax_rate: item.tax_rate,
                status: "active",
                source_kind: "quotation",
                source_item_id: item.source_item_id,
            };
            const scopeLines = [...quotation.scope_lines, newItem];
            assertQuotationRelations(get().db, { ...quotation, scope_lines: scopeLines, items: scopeLines }, "Quotation");
            const subtotal = scopeLines.reduce((total: any, line: any) => total + line.amount, 0);
            const taxAmount = Math.round(scopeLines.reduce((total: any, line: any) => total + (line.amount * (line.tax_rate || 0)) / 100, 0));
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            scope_lines: scopeLines,
                            items: scopeLines,
                            subtotal,
                            tax_amount: taxAmount,
                            total_amount: subtotal + taxAmount,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        updateQuotationItem: (quotationId, itemId, patch) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "edit a quotation line");
            const existingItem = quotation.scope_lines.find((item: any) => item.id === itemId);
            const scopeLines = quotation.scope_lines.map((item: any) => {
                if (item.id !== itemId)
                    return item;
                const next = { ...item, ...patch };
                if (patch.quantity !== undefined || patch.rate !== undefined)
                    next.amount = Math.round(next.quantity * next.rate);
                return next;
            });
            if (!scopeLines.some((item: any) => item.id === itemId))
                throw new Error("Quotation line not found.");
            assertQuotationRelations(get().db, { ...quotation, scope_lines: scopeLines, items: scopeLines }, "Quotation");
            const subtotal = scopeLines.reduce((total: any, line: any) => total + line.amount, 0);
            const taxAmount = Math.round(scopeLines.reduce((total: any, line: any) => total + (line.amount * (line.tax_rate || 0)) / 100, 0));
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            scope_lines: scopeLines,
                            items: scopeLines,
                            subtotal,
                            tax_amount: taxAmount,
                            total_amount: subtotal + taxAmount,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            // Audit log for financial edits — records who changed what, when
            if (existingItem && (patch.quantity !== undefined || patch.rate !== undefined || patch.title !== undefined)) {
                const actor = get().currentUser();
                const changes: any[] = [];
                if (patch.title !== undefined && patch.title !== existingItem.title)
                    changes.push({ id: `ch-${Date.now()}-t`, field: "title", before: existingItem.title, after: patch.title });
                if (patch.quantity !== undefined && patch.quantity !== existingItem.quantity)
                    changes.push({ id: `ch-${Date.now()}-q`, field: "quantity", before: existingItem.quantity, after: patch.quantity });
                if (patch.rate !== undefined && patch.rate !== existingItem.rate)
                    changes.push({ id: `ch-${Date.now()}-r`, field: "rate", before: existingItem.rate, after: patch.rate });
                if (changes.length > 0) {
                    get().logAudit({
                        actor: actor.name,
                        actor_role: actor.role,
                        action: `Quotation line item edited: ${existingItem.title || "line item"}`,
                        entity_type: "quotation",
                        entity_id: quotationId,
                        entity_label: quotation.quotation_no,
                        kind: "update",
                        source_module: "quotationDesk",
                        reason: `Financial edit by ${actor.name} (${actor.role})`,
                        changes,
                    });
                }
            }
        },
        removeQuotationItem: (quotationId, itemId) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "remove a quotation line");
            const scopeLines = quotation.scope_lines.filter((item: any) => item.id !== itemId);
            if (scopeLines.length === quotation.scope_lines.length)
                throw new Error("Quotation line not found.");
            const subtotal = scopeLines.reduce((sum: any, item: any) => sum + item.amount, 0);
            const taxAmount = Math.round(scopeLines.reduce((sum: any, item: any) => sum + (item.amount * (item.tax_rate || 0)) / 100, 0));
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            scope_lines: scopeLines,
                            items: scopeLines,
                            subtotal,
                            tax_amount: taxAmount,
                            total_amount: subtotal + taxAmount,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        addQuotationMilestone: (quotationId, milestone) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "add a payment milestone");
            const newMilestone: import("../../types").PaymentTerm = {
                id: `pt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                label: milestone.label || "New milestone",
                percentage: milestone.percentage ?? 0,
                due_event: milestone.due_event || "on_acceptance",
            };
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            payment_terms: [...row.payment_terms, newMilestone],
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        updateQuotationMilestone: (quotationId, milestoneId, patch) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "edit a payment milestone");
            const existingMilestone = quotation.payment_terms.find((term: any) => term.id === milestoneId);
            if (!existingMilestone)
                throw new Error("Payment milestone not found.");
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            payment_terms: row.payment_terms.map((term: any) => term.id === milestoneId ? { ...term, ...patch } : term),
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            // Audit log for milestone percentage edits
            if (patch.percentage !== undefined && patch.percentage !== existingMilestone.percentage) {
                const actor = get().currentUser();
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Payment milestone edited: ${existingMilestone.label || "milestone"}`,
                    entity_type: "quotation",
                    entity_id: quotationId,
                    entity_label: quotation.quotation_no,
                    kind: "update",
                    source_module: "quotationDesk",
                    reason: `Financial edit by ${actor.name} (${actor.role})`,
                    changes: [{ id: `ch-${Date.now()}-p`, field: "percentage", before: existingMilestone.percentage, after: patch.percentage }],
                });
            }
        },
        removeQuotationMilestone: (quotationId, milestoneId) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            assertQuotationEditable(quotation, "remove a payment milestone");
            if (!quotation.payment_terms.some((term: any) => term.id === milestoneId))
                throw new Error("Payment milestone not found.");
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            payment_terms: row.payment_terms.filter((term: any) => term.id !== milestoneId),
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
        },
        reviseQuotationWithHolds: (originalQuotationId, heldItemIds, holdReason) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "revise quotations");
            const state = get();
            const actor = state.currentUser();
            const original = state.db.quotations.find((quotation: any) => quotation.id === originalQuotationId);
            if (!original)
                throw new Error("Quotation not found.");
            if (original.status === "draft")
                throw new Error("Draft quotations are already editable; revise only after a commercial version is sent or accepted.");
            if (original.status === "cancelled")
                throw new Error("This quotation is already cancelled and retained only as history.");
            if (original.work_order_ids.length)
                throw new Error("A quotation linked to a Work Order cannot be cancelled. Create a controlled variation/change order instead.");
            const linkedScopes = state.db.acceptedScopes.filter((scope: any) => scope.quotation_id === original.id && scope.status !== "cancelled");
            if (linkedScopes.some((scope: any) => scope.work_order_id))
                throw new Error("A quotation scope already belongs to a Work Order. Create a controlled variation/change order instead.");
            const newId = genId("quote");
            const newNo = `${original.quotation_no}-R${original.revision_no + 1}`;
            const held = new Set(heldItemIds);
            const newItems: QuotationItem[] = original.scope_lines.map((item: any) => ({
                ...item,
                id: genId("qline"),
                source_item_id: item.id,
                held: held.has(item.id),
                hold_reason: held.has(item.id) ? holdReason : undefined,
            }));
            const activeItems = newItems.filter((item: any) => !item.held);
            const subtotal = activeItems.reduce((sum: any, item: any) => sum + item.amount, 0);
            const taxAmount = Math.round(activeItems.reduce((sum: any, item: any) => sum + (item.amount * (item.tax_rate || 0)) / 100, 0));
            const now = nowIso();
            const threadId = state.openThreadFor("quotation", newId, `Revision · ${newNo}`, [actor.name, original.customer_name || "Customer"]);
            const newQuote: Quotation = {
                ...original,
                id: newId,
                quotation_no: newNo,
                revision_no: original.revision_no + 1,
                parent_quotation_id: original.id,
                status: "draft",
                accepted_at: undefined,
                accepted_by: undefined,
                cancelled_at: undefined,
                cancelled_by: undefined,
                cancellation_reason: undefined,
                superseded_by_quotation_id: undefined,
                valid_until: addDays(today(), 14),
                coverage: original.coverage.map((coverage: any) => ({
                    ...coverage,
                    id: genId("coverage"),
                    status: "proposed" as const,
                })),
                scope_lines: newItems,
                items: newItems,
                subtotal,
                tax_amount: taxAmount,
                total_amount: subtotal + taxAmount,
                thread_id: threadId,
                work_order_ids: [],
                created_at: now,
                updated_at: now,
            };
            const priorScopeIds = new Set(linkedScopes.map((scope: any) => scope.id));
            const reason = holdReason?.trim() || `Superseded by editable revision ${newNo}.`;
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: [
                        newQuote,
                        ...state.db.quotations.map((quotation: any) => quotation.id === original.id
                            ? {
                                ...quotation,
                                status: "cancelled" as const,
                                cancelled_at: now,
                                cancelled_by: actor.name,
                                cancellation_reason: reason,
                                superseded_by_quotation_id: newId,
                                coverage: quotation.coverage.map((coverage: any) => ({
                                    ...coverage,
                                    status: "superseded" as const,
                                })),
                                updated_at: now,
                            }
                            : quotation),
                    ],
                    acceptedScopes: state.db.acceptedScopes.map((scope: any) => priorScopeIds.has(scope.id)
                        ? { ...scope, status: "cancelled" as const }
                        : scope),
                    contractorBids: state.db.contractorBids.map((bid: any) => priorScopeIds.has(bid.accepted_scope_id || "") &&
                        bid.status !== "selected"
                        ? { ...bid, status: "withdrawn" as const, updated_at: now }
                        : bid),
                    workRequired: state.db.workRequired.map((work: any) => original.coverage.some((coverage: any) => coverage.work_required_id === work.id)
                        ? {
                            ...work,
                            status: "quotation_in_progress" as const,
                            updated_at: now,
                        }
                        : work),
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `${newNo} created as the editable successor to ${original.quotation_no}. The earlier commercial version is retained as Cancelled. ${held.size ? `${held.size} line(s) held.` : "No lines held; update the new draft as required."}`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Cancelled ${original.quotation_no} and created revision ${newNo}`,
                entity_type: "quotation",
                entity_id: newId,
                entity_label: newNo,
                kind: "decision",
            });
            return newId;
        },
        renegotiateQuotation: (originalQuotationId, reason, options) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "renegotiate quotations");
            const state = get();
            const actor = state.currentUser();
            const original = state.db.quotations.find((quotation: any) => quotation.id === originalQuotationId);
            if (!original)
                throw new Error("Quotation not found.");
            if (original.status === "draft")
                throw new Error("Draft quotations are already editable; use the draft itself instead of renegotiating.");
            if (original.status === "cancelled")
                throw new Error("This quotation is already cancelled and retained only as history.");
            const trimmedReason = (reason || "").trim();
            if (!trimmedReason)
                throw new Error("A renegotiation reason is required so the exception is auditable.");
            const hasWorkOrder = original.work_order_ids.length > 0;
            const linkedScopes = state.db.acceptedScopes.filter((scope: any) => scope.quotation_id === original.id && scope.status !== "cancelled");
            const scopeInWorkOrder = linkedScopes.some((scope: any) => scope.work_order_id);
            // The old hard block is gone: we now ALLOW renegotiation even when a
            // Work Order exists. The new revision is tagged as a "variation" in
            // that case, "renegotiation" otherwise. Both leave the original in
            // place as history (not cancelled) so the audit trail is complete.
            const revisionKind: Quotation["revision_kind"] = (hasWorkOrder || scopeInWorkOrder) ? "variation" : "renegotiation";
            const heldItemIds = options?.heldItemIds || [];
            const held = new Set(heldItemIds);
            const newId = genId("quote");
            const newNo = `${original.quotation_no}-R${original.revision_no + 1}`;
            const newItems: QuotationItem[] = original.scope_lines.map((item: any) => ({
                ...item,
                id: genId("qline"),
                source_item_id: item.id,
                held: held.has(item.id),
                hold_reason: held.has(item.id) ? trimmedReason : undefined,
            }));
            const activeItems = newItems.filter((item: any) => !item.held);
            const subtotal = activeItems.reduce((sum: any, item: any) => sum + item.amount, 0);
            const taxAmount = Math.round(activeItems.reduce((sum: any, item: any) => sum + (item.amount * (item.tax_rate || 0)) / 100, 0));
            const now = nowIso();
            const threadId = state.openThreadFor("quotation", newId, `${revisionKind === "variation" ? "Variation" : "Renegotiation"} · ${newNo}`, [actor.name, original.customer_name || "Customer"]);
            const newQuote: Quotation = {
                ...original,
                id: newId,
                quotation_no: newNo,
                revision_no: original.revision_no + 1,
                parent_quotation_id: original.id,
                status: "draft",
                accepted_at: undefined,
                accepted_by: undefined,
                cancelled_at: undefined,
                cancelled_by: undefined,
                cancellation_reason: undefined,
                superseded_by_quotation_id: undefined,
                valid_until: addDays(today(), 14),
                coverage: original.coverage.map((coverage: any) => ({
                    ...coverage,
                    id: genId("coverage"),
                    status: "proposed" as const,
                })),
                scope_lines: newItems,
                items: newItems,
                subtotal,
                tax_amount: taxAmount,
                total_amount: subtotal + taxAmount,
                thread_id: threadId,
                work_order_ids: [],
                revision_kind: revisionKind,
                revision_reason: trimmedReason,
                revision_approved_by: actor.name,
                created_at: now,
                updated_at: now,
            };
            // NOTE: the original quotation is NOT cancelled — it stays as history.
            // Only its `superseded_by_quotation_id` is set so the chain is traceable.
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: [
                        newQuote,
                        ...state.db.quotations.map((quotation: any) => quotation.id === original.id
                            ? {
                                ...quotation,
                                superseded_by_quotation_id: newId,
                                updated_at: now,
                            }
                            : quotation),
                    ],
                },
            }));
            const auditAction = revisionKind === "variation"
                ? `Variation ${newNo} created from ${original.quotation_no} (Work Order already active) — reason: "${trimmedReason}"`
                : `Renegotiation ${newNo} created from ${original.quotation_no} — reason: "${trimmedReason}"`;
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: auditAction,
                entity_type: "quotation",
                entity_id: newId,
                entity_label: newNo,
                kind: "decision",
            });
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `${newNo} created as a ${revisionKind} of ${original.quotation_no}. Reason: "${trimmedReason}". ${options?.note ? options.note + " " : ""}The original is retained as history.${held.size ? ` ${held.size} line(s) held.` : ""}`,
                kind: "decision",
            });
            return newId;
        },
        reopenJobForBidding: (workOrderId) => {
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    workOrders: s.db.workOrders.map((j: any) => j.id === workOrderId
                        ? {
                            ...j,
                            contractor_id: undefined,
                            contractor_name: undefined,
                            status: "scheduled",
                            updated_at: now,
                        }
                        : j),
                    contractorBids: s.db.contractorBids.map((b: any) => b.work_order_id === workOrderId &&
                        (b.status === "selected" || b.status === "submitted")
                        ? { ...b, status: "withdrawn", updated_at: now }
                        : b),
                },
            }));
            const workOrder = get().db.workOrders.find((j: any) => j.id === workOrderId);
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Reopened bidding for ${workOrder?.work_order_no || workOrderId}`,
                entity_type: "workOrder",
                entity_id: workOrderId,
                entity_label: workOrder?.work_order_no,
                kind: "decision",
            });
        },
        acceptQuotationForBidding: (quotationId, options = {}) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "accept quotations");
            const state = get();
            const actor = state.currentUser();
            const quotation = state.db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            if (quotation.status === "cancelled")
                throw new Error("Cancelled quotation versions are historical and cannot be accepted. Open the current revision instead.");
            if (quotation.work_order_ids.length)
                throw new Error("Quotation is already linked to a Work Order and cannot be accepted again.");
            const requestedIds = options.coverageIds?.length
                ? Array.from(new Set(options.coverageIds))
                : quotation.coverage
                    .filter((coverage: any) => coverage.status !== "accepted")
                    .map((coverage: any) => coverage.id);
            if (!requestedIds.length)
                throw new Error("Choose at least one quotation scope to accept.");
            const selectedCoverage = quotation.coverage.filter((coverage: any) => requestedIds.includes(coverage.id));
            if (selectedCoverage.length !== requestedIds.length)
                throw new Error("One or more selected quotation scopes no longer exist.");
            const existingScopeWorkIds = new Set(state.db.acceptedScopes
                .filter((scope: any) => scope.quotation_id === quotation.id &&
                scope.status !== "cancelled")
                .map((scope: any) => scope.work_required_id));
            const coverageToAccept = selectedCoverage.filter((coverage: any) => !existingScopeWorkIds.has(coverage.work_required_id));
            if (!coverageToAccept.length)
                throw new Error("The selected quotation scope is already accepted.");
            const warnings = quotationAcceptanceWarnings(state.db, quotation, requestedIds);
            if (warnings.length && !options.acceptWithWarnings)
                throw new Error(`Acceptance warning: ${warnings.join(" ")}`);
            assertQuotationRelations(state.db, quotation, "Quotation acceptance");
            const acceptedAt = nowIso();
            const acceptedScopes = coverageToAccept.map((coverage: any) => ({
                id: genId("acceptedScope"),
                quotation_id: quotation.id,
                customer_id: quotation.customer_id,
                site_id: quotation.site_id,
                work_required_id: coverage.work_required_id,
                area_ids: coverage.area_ids,
                measurement_revision_ids: coverage.measurement_revision_ids,
                label: coverage.coverage_label,
                accepted_value: coverageAcceptedValue(quotation, coverage),
                status: "contractor_bidding" as const,
                accepted_at: acceptedAt,
            }));
            commitState((state: any) => ({
                db: {
                    ...state.db,
                    quotations: state.db.quotations.map((row: any) => row.id === quotation.id
                        ? {
                            ...row,
                            status: "accepted" as const,
                            accepted_at: row.accepted_at || acceptedAt,
                            accepted_by: row.accepted_by || actor.name,
                            coverage: row.coverage.map((coverage: any) => requestedIds.includes(coverage.id)
                                ? { ...coverage, status: "accepted" as const }
                                : coverage),
                            updated_at: acceptedAt,
                        }
                        : row),
                    acceptedScopes: [...acceptedScopes, ...state.db.acceptedScopes],
                    workRequired: state.db.workRequired.map((work: any) => coverageToAccept.some((coverage: any) => coverage.work_required_id === work.id)
                        ? {
                            ...work,
                            status: "contractor_bidding" as const,
                            updated_at: acceptedAt,
                        }
                        : work),
                },
            }));
            const warningText = warnings.length
                ? ` Warning override recorded: ${warnings.join(" ")}`
                : "";
            const note = options.note?.trim() ? ` Note: ${options.note.trim()}` : "";
            const threadId = quotation.thread_id ||
                get().openThreadFor("quotation", quotation.id, `${quotation.quotation_no} · ${quotation.title}`, [actor.name, quotation.customer_name || "Customer"]);
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Accepted ${coverageToAccept.length} scope(s) for contractor bidding. No acceptance proof was required.${warningText}${note}`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Accepted ${coverageToAccept.length} scope(s) from ${quotation.quotation_no} for contractor bidding${warnings.length ? " with warning override" : ""}`,
                entity_type: "quotation",
                entity_id: quotation.id,
                entity_label: quotation.quotation_no,
                kind: "decision",
                source_module: "quotations",
                // Cross-post: quotation acceptance is relevant to the Customer and Site threads.
                cross_post: [
                    { entity_type: "customer", entity_id: quotation.customer_id },
                    ...(quotation.site_id ? [{ entity_type: "site", entity_id: quotation.site_id }] : []),
                ],
            });
            // E: fire automation for quotation_accepted.
            get().fireAutomation("quotation_accepted", {
                quotationId: quotation.id,
                quotationNo: quotation.quotation_no,
                customerId: quotation.customer_id,
                siteId: quotation.site_id,
                amount: quotation.total_amount,
                coverageIds: requestedIds,
            });
            return acceptedScopes[0]?.id || "";
        },
        approveQuotationDiscount: (quotationId) => {
            assertRole(get().currentUser().role, ["Owner"], "approve quotation discounts");
            const actor = get().currentUser();
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                throw new Error("Quotation not found.");
            if (!quotation.pending_approval)
                throw new Error("This quotation is not held for discount approval.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    quotations: s.db.quotations.map((row: any) => row.id === quotationId
                        ? {
                            ...row,
                            pending_approval: false,
                            approval_reason: undefined,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            const threadId = quotation.thread_id ||
                get().openThreadFor("quotation", quotation.id, `${quotation.quotation_no} · ${quotation.title}`, [actor.name, quotation.customer_name || "Customer"]);
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Discount of ${quotation.discount_pct ?? 0}% approved by owner. Quotation is no longer held.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Approved ${quotation.discount_pct ?? 0}% discount on ${quotation.quotation_no}`,
                entity_type: "quotation",
                entity_id: quotation.id,
                entity_label: quotation.quotation_no,
                kind: "approve",
                source_module: "quotations",
                reason: `Owner approved the discount hold: ${quotation.approval_reason || "policy threshold exceeded"}`,
                cross_post: [
                    { entity_type: "customer", entity_id: quotation.customer_id },
                ],
            });
            // E: fire automation for approval_decided.
            get().fireAutomation("approval_decided", {
                kind: "quotation_discount",
                entityId: quotation.id,
                entityLabel: quotation.quotation_no,
                decision: "approved",
                actor: actor.name,
            });
        },
        updateJob: (id, patch) => {
            const now = nowIso();
            const before = get().db.workOrders.find((workOrder: any) => workOrder.id === id);
            if (!before)
                throw new Error("Work Order not found.");
            if (patch.progress !== undefined && patch.progress !== before.progress) {
                throw new Error("Work Order progress can only be changed by verifying a daily execution log.");
            }
            if (patch.status === "completed" && before.progress < 100) {
                throw new Error(`Work Order ${before.work_order_no} cannot be completed until verified progress reaches 100%.`);
            }
            assertWorkOrderRelations(get().db, { ...before, ...patch }, "Work Order");
            const nextWorkRequiredStatus = patch.status
                ? workRequiredLifecycleForJob(patch.status)
                : undefined;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    workOrders: s.db.workOrders.map((workOrder: any) => workOrder.id === id
                        ? { ...workOrder, ...patch, updated_at: now }
                        : workOrder),
                    workRequired: nextWorkRequiredStatus && before
                        ? s.db.workRequired.map((work: any) => before.work_required_ids.includes(work.id)
                            ? {
                                ...work,
                                status: nextWorkRequiredStatus,
                                updated_at: now,
                            }
                            : work)
                        : s.db.workRequired,
                },
            }));
            const workOrder = get().db.workOrders.find((row: any) => row.id === id);
            const actor = get().currentUser();
            if (workOrder &&
                (patch.status ||
                    patch.contractor_id ||
                    patch.with_material !== undefined ||
                    patch.progress !== undefined ||
                    patch.title !== undefined ||
                    patch.start_date !== undefined ||
                    patch.expected_end !== undefined)) {
                const bits: string[] = [];
                const changes: any[] = [];
                if (patch.title !== undefined && patch.title !== before.title) {
                    bits.push(`title → ${patch.title}`);
                    changes.push({ id: `ch-${Date.now()}-t`, field: "title", before: before.title, after: patch.title });
                }
                if (patch.status)
                    bits.push(`status → ${patch.status}`);
                if (patch.contractor_id) {
                    bits.push(`contractor → ${patch.contractor_name || patch.contractor_id}`);
                    changes.push({ id: `ch-${Date.now()}-c`, field: "contractor", before: before.contractor_name, after: patch.contractor_name });
                }
                if (patch.with_material !== undefined)
                    bits.push(`mode → ${patch.with_material ? "with-material" : "labour-only"}`);
                if (patch.progress !== undefined)
                    bits.push(`progress → ${patch.progress}%`);
                if (patch.start_date !== undefined && patch.start_date !== before.start_date) {
                    bits.push(`start → ${patch.start_date}`);
                    changes.push({ id: `ch-${Date.now()}-s`, field: "start_date", before: before.start_date, after: patch.start_date });
                }
                if (patch.expected_end !== undefined && patch.expected_end !== before.expected_end) {
                    bits.push(`end → ${patch.expected_end}`);
                    changes.push({ id: `ch-${Date.now()}-e`, field: "expected_end", before: before.expected_end, after: patch.expected_end });
                }
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Updated work order ${workOrder.work_order_no}: ${bits.join(", ")}`,
                    entity_type: "workOrder",
                    entity_id: id,
                    entity_label: workOrder.work_order_no,
                    kind: "update",
                    reason: `Edited by ${actor.name} (${actor.role})`,
                    changes: changes.length > 0 ? changes : undefined,
                });
            }
        },
    };
}
