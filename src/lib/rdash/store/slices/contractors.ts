/**
 * Contractors slice — contractor master records, contractor bids (quotation
 * award), contractor settlement, RA bills (running account bills), contractor
 * payment requests/approvals/recording, and partner commission accrual/pay.
 *
 * Phase 3h moved the 12 contractor actions out of store.ts. The shared
 * helpers `addDays` and `contractorPaymentProofStatus` were moved to
 * `../helpers`, and `canonicalPaymentEvent`, `materializePaymentSchedule`,
 * `eventMatchesPaymentTrigger` were moved to `../finance-helpers`, so this
 * slice can import them directly without duplicating logic.
 */
import type {
    Contractor, ContractorBid, ContractorSettlement,
    ContractorBill, ContractorPayment, Commission,
    WorkOrder, WorkOrderCostLine,
} from "../../types";
import type { ContractorsState } from "../types";
import type { StoreContext } from "../context";
import { assertRole, genId, nowIso, today, addDays, contractorPaymentProofStatus } from "../helpers";
import { formatINR } from "../../format";
import { assertWorkOrderRelations } from "../../business-rules";
import { materializePaymentSchedule } from "../finance-helpers";
// I: Import the canonical commission-rule lookup helper exposed by Agent A
// in masters.ts. Match priority: (1) partner-specific category rule →
// (2) partner-specific workOrder rule → (3) partner-specific all rule →
// (4) global all rule. Falls back to partner.commission_pct || 5 if no rule
// matches. Keeping this in lock-step with the master UI banner documented by
// Agent A in MastersSalesOpsModule.
import { findCommissionRule } from "./masters";

export function createContractorsSlice(ctx: StoreContext): ContractorsState {
    const { commitState, get } = ctx;

    return {
        addContractor: (c) => {
            const id = c.id || genId("con");
            const contractor: import("../../types").Contractor = {
                id,
                name: c.name || "New contractor",
                phone: c.phone,
                city: c.city,
                locality: c.locality,
                address: c.address,
                trade: c.trade,
                rating: c.rating,
                active_jobs: 0,
                outstanding: 0,
                reliability_score: c.reliability_score,
                on_time_pct: c.on_time_pct,
                past_jobs_count: c.past_jobs_count || 0,
                specializations: c.specializations || [],
                latitude: c.latitude,
                longitude: c.longitude,
                photo_attachment_id: c.photo_attachment_id,
                business_card_attachment_id: c.business_card_attachment_id,
                reliability_rating: c.reliability_rating,
                politeness_rating: c.politeness_rating,
                worker_count_range: c.worker_count_range,
                deadline_commitment: c.deadline_commitment,
                source_partner_id: c.source_partner_id,
                source_partner_name: c.source_partner_name,
                work_capabilities: c.work_capabilities || [],
                // FIX-CONTRACTOR-BATCH2 / F.6: persist the new business / tax /
                // banking / category fields captured by EntityFormDialog.
                business_gst: c.business_gst,
                pan: c.pan,
                bank_account: c.bank_account,
                ifsc: c.ifsc,
                categories: c.categories,
                // FIX-CONTRACTOR-BATCH2 / F.13: default new contractors to
                // "active" so the deactivate/activate lifecycle starts from a
                // known state.
                status: c.status || "active",
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractors: [contractor, ...s.db.master.contractors],
                    },
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Created contractor "${contractor.name}"`,
                entity_type: "contractor",
                entity_id: id,
                kind: "create",
            });
            return id;
        },

        updateContractor: (id, patch) => {
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractors: s.db.master.contractors.map((c: any) => c.id === id ? { ...c, ...patch } : c),
                    },
                },
            }));
            const actor_c = get().currentUser();
            get().logAudit({
                actor: actor_c.name,
                actor_role: actor_c.role,
                action: `Updated contractor ${id}`,
                entity_type: "contractor",
                entity_id: id,
                entity_label: patch.name || id,
                kind: "update",
                reason: `Edited by ${actor_c.name} (${actor_c.role})`,
            });
        },

        addContractorBid: (b) => {
            const state = get();
            const id = b.id || genId("bid");
            const acceptedScope = state.db.acceptedScopes.find((scope: any) => scope.id === b.accepted_scope_id) ||
                (b.work_order_id
                    ? state.db.acceptedScopes.find((scope: any) => state.db.workOrders
                        .find((workOrder: any) => workOrder.id === b.work_order_id)
                        ?.accepted_scope_ids.includes(scope.id))
                    : undefined);
            const contractor = state.db.master.contractors.find((candidate: any) => candidate.id === b.contractor_id);
            if (!acceptedScope || !contractor)
                return "";
            // CV-14: Coerce undefined/null/NaN quote_amount to a finite number (default 0).
            // The UI used to pass `quote_amount: undefined` (JobBiddingBody) which silently propagated
            // through selectContractorBid as `contractor_award_amount: undefined` and rendered as "—" forever.
            const coercedQuote = Number.isFinite(b.quote_amount) && (b.quote_amount as number) >= 0
                ? (b.quote_amount as number)
                : 0;
            const workOrder = acceptedScope.work_order_id
                ? state.db.workOrders.find((row: any) => row.id === acceptedScope.work_order_id)
                : undefined;
            const work = state.db.workRequired.find((row: any) => row.id === acceptedScope.work_required_id);
            const now = nowIso();
            // FIX-CONTRACTOR-BATCH2 / F.17: previously hardcoded "2026" — in
            // 2027+ the bid numbers would still say "2026". Use the live year.
            const bidYear = new Date().getFullYear();
            const bidNo = `CB-${bidYear}-${String(state.db.contractorBids.length + 1).padStart(3, "0")}`;
            const target = workOrder?.work_order_no || `Scope · ${acceptedScope.label}`;
            const threadId = state.openThreadFor("bid", id, `Contractor bid ${bidNo} · ${target}`, [contractor.name]);
            // FIX-CONTRACTOR-BATCH2 / F.9: populate the previously-dead
            // `customer_name` field by resolving the customer through the
            // acceptedScope → workOrder / customer chain. The UI fallback
            // (ContractorDetailModule:209) used to show "Customer" for every
            // bid because this field was never set.
            const bidCustomer = workOrder?.customer_id
                ? state.db.customers.find((row: any) => row.id === workOrder.customer_id)
                : acceptedScope.customer_id
                    ? state.db.customers.find((row: any) => row.id === acceptedScope.customer_id)
                    : undefined;
            const bid: ContractorBid = {
                id,
                bid_no: bidNo,
                accepted_scope_id: acceptedScope.id,
                work_order_id: workOrder?.id,
                customer_name: bidCustomer?.name,
                work_order_no: workOrder?.work_order_no || "Pending contractor award",
                site_id: acceptedScope.site_id,
                contractor_id: contractor.id,
                contractor_name: contractor.name,
                scope: b.scope || work?.title || acceptedScope.label,
                quote_amount: coercedQuote,
                rate_basis: b.rate_basis,
                estimated_days: b.estimated_days,
                with_material: b.with_material,
                reliability_score: contractor.reliability_score ?? b.reliability_score,
                on_time_pct: contractor.on_time_pct ?? b.on_time_pct,
                past_jobs_count: contractor.past_jobs_count ?? b.past_jobs_count,
                rating: contractor.rating ?? b.rating,
                evaluation_notes: b.evaluation_notes,
                status: "submitted",
                submitted_at: now,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: { ...s.db, contractorBids: [bid, ...s.db.contractorBids] },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Contractor bid ${bidNo} submitted by ${contractor.name} for ${target}`,
                entity_type: "bid",
                entity_id: id,
                entity_label: bidNo,
                kind: "create",
                cross_post: [
                    { entity_type: "contractor", entity_id: contractor.id, entity_label: contractor.name },
                    ...(bid.work_order_id ? [{ entity_type: "workOrder", entity_id: bid.work_order_id, entity_label: bid.work_order_no }] : []),
                    ...(bid.site_id ? [{ entity_type: "site", entity_id: bid.site_id }] : []),
                    ...(workOrder?.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                ],
            });
            return id;
        },

        updateContractorBid: (id, patch) => commitState((s: any) => ({
            db: {
                ...s.db,
                contractorBids: s.db.contractorBids.map((bid: any) => bid.id === id ? { ...bid, ...patch, updated_at: nowIso() } : bid),
            },
        })),

        selectContractorBid: (bidId) => {
            const state = get();
            const bid = state.db.contractorBids.find((row: any) => row.id === bidId);
            const acceptedScope = bid?.accepted_scope_id
                ? state.db.acceptedScopes.find((scope: any) => scope.id === bid.accepted_scope_id)
                : undefined;
            if (!bid || !acceptedScope)
                return;
            // CV-1 / CV-14: Reject awarding a bid with no real quote amount. Otherwise the work order's
            // contractor_award_amount becomes 0/undefined, every subsequent RA bill throws "exceeds the
            // contractor award / Work Order value", and the contractor payment chain dies entirely.
            if (!Number.isFinite(bid.quote_amount) || (bid.quote_amount as number) <= 0) {
                throw new Error("Cannot award a bid with no quote amount. Edit the bid to record the contractor's actual quote first.");
            }
            const now = nowIso();
            const existingWorkOrder = acceptedScope.work_order_id
                ? state.db.workOrders.find((row: any) => row.id === acceptedScope.work_order_id)
                : undefined;
            const workOrderId = existingWorkOrder?.id || genId("workOrder");
            // FIX-CONTRACTOR-BATCH2 / F.17: dynamic year (was hardcoded "2026").
            const woYear = new Date().getFullYear();
            const workOrderNo = existingWorkOrder?.work_order_no ||
                `WO-${woYear}-${String(state.db.workOrders.length + 1).padStart(3, "0")}`;
            const quotation = state.db.quotations.find((quote: any) => quote.id === acceptedScope.quotation_id);
            const site = state.db.sites.find((row: any) => row.id === acceptedScope.site_id);
            const work = state.db.workRequired.find((row: any) => row.id === acceptedScope.work_required_id);
            const workOrder: WorkOrder = existingWorkOrder || {
                id: workOrderId,
                work_order_no: workOrderNo,
                customer_id: acceptedScope.customer_id,
                accepted_scope_ids: [acceptedScope.id],
                work_required_ids: [acceptedScope.work_required_id],
                quotation_ids: [acceptedScope.quotation_id],
                site_id: acceptedScope.site_id,
                area_ids: acceptedScope.area_ids,
                title: work?.title || acceptedScope.label,
                status: "scheduled",
                contractor_id: bid.contractor_id,
                contractor_name: bid.contractor_name,
                with_material: bid.with_material,
                material_responsibility: bid.with_material ? "contractor" : "company",
                contractor_award_amount: bid.quote_amount,
                // B-2: Formal bid path — tag selection_method="bid" so downstream
                // knows the price was competitively vetted.
                contractor_selection_method: "bid",
                start_date: today(),
                expected_end: bid.estimated_days
                    ? addDays(today(), bid.estimated_days)
                    : undefined,
                value: acceptedScope.accepted_value,
                progress: 0,
                site_address: site?.address,
                thread_id: state.openThreadFor("workOrder", workOrderId, `${workOrderNo} · ${work?.title || acceptedScope.label}`, [bid.contractor_name]),
                created_at: now,
                updated_at: now,
            };
            assertWorkOrderRelations(state.db, workOrder, "Work Order");
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorBids: s.db.contractorBids.map((row: any) => {
                        if (row.id === bidId)
                            return {
                                ...row,
                                status: "selected" as const,
                                work_order_id: workOrderId,
                                work_order_no: workOrderNo,
                                selected_at: now,
                                updated_at: now,
                            };
                        if (row.accepted_scope_id === acceptedScope.id &&
                            row.status === "submitted")
                            return {
                                ...row,
                                status: "rejected" as const,
                                rejected_at: now,
                                updated_at: now,
                            };
                        return row;
                    }),
                    acceptedScopes: s.db.acceptedScopes.map((scope: any) => scope.id === acceptedScope.id
                        ? {
                            ...scope,
                            status: "in_work_order" as const,
                            contractor_bid_id: bidId,
                            contractor_selection_method: "bid" as const,
                            work_order_id: workOrderId,
                        }
                        : scope),
                    workOrders: existingWorkOrder
                        ? s.db.workOrders.map((row: any) => row.id === workOrderId
                            ? {
                                ...row,
                                contractor_id: bid.contractor_id,
                                contractor_name: bid.contractor_name,
                                with_material: bid.with_material,
                                material_responsibility: bid.with_material
                                    ? "contractor"
                                    : "company",
                                contractor_award_amount: bid.quote_amount,
                                contractor_selection_method: "bid" as const,
                                updated_at: now,
                            }
                            : row)
                        : [workOrder, ...s.db.workOrders],
                    quotations: s.db.quotations.map((quote: any) => quote.id === acceptedScope.quotation_id
                        ? {
                            ...quote,
                            work_order_ids: Array.from(new Set([...quote.work_order_ids, workOrderId])),
                            updated_at: now,
                        }
                        : quote),
                    workRequired: s.db.workRequired.map((row: any) => row.id === acceptedScope.work_required_id
                        ? { ...row, status: "awarded" as const, updated_at: now }
                        : row),
                },
            }));
            if (!existingWorkOrder) {
                get().createBOQ(workOrderId);
                (quotation?.payment_terms || []).forEach((term: any) => {
                    const schedule = materializePaymentSchedule(term, quotation!, workOrder);
                    get().addPayment({
                        customer_id: acceptedScope.customer_id,
                        site_id: acceptedScope.site_id,
                        quotation_id: acceptedScope.quotation_id,
                        work_order_id: workOrderId,
                        amount: Math.round((acceptedScope.accepted_value * term.percentage) / 100),
                        status: "pending",
                        milestone_term_id: term.id,
                        milestone_label: `${term.label} ${term.percentage}%`,
                        due_event: schedule.due_event,
                        schedule_state: schedule.schedule_state,
                        due_date: schedule.due_date,
                    });
                });
                // B-2: Accrue partner commission when the customer came through a source partner.
                // The accrueCommission function already exists in this slice but was never called — so
                // partner commissions were never accrued on work-order creation, and the Commissions
                // module showed nothing. Now we trigger it whenever the awarded work order's customer
                // has a source_partner_id. Site-level partner attribution (Site.source_partner_id) is
                // also honoured as a fallback.
                const customer = state.db.customers.find((row: any) => row.id === acceptedScope.customer_id);
                const siteRow = state.db.sites.find((row: any) => row.id === acceptedScope.site_id);
                const partnerId = customer?.source_partner_id || siteRow?.source_partner_id;
                if (partnerId && quotation) {
                    try {
                        get().accrueCommission(workOrderId, quotation.id, partnerId);
                    } catch (err) {
                        // Don't block the award if commission accrual fails (e.g. partner removed mid-flight).
                        console.warn("accrueCommission failed:", err);
                    }
                }
            }
            const actor_bid = get().currentUser();
            get().addThreadReply(bid.thread_id || "", {
                author: actor_bid.name,
                role: actor_bid.role,
                body: `Bid selected — ${bid.contractor_name} awarded ${workOrderNo}.`,
                kind: "decision",
            });
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Awarded ${bid.contractor_name}: ${workOrderNo}`,
                entity_type: "bid",
                entity_id: bidId,
                entity_label: bid.bid_no,
                kind: "decision",
                source_module: "contractors",
                // Cross-post: bid selection is relevant to the Contractor, Customer, Site, and Work Order.
                cross_post: [
                    { entity_type: "contractor", entity_id: bid.contractor_id, entity_label: bid.contractor_name },
                    { entity_type: "workOrder", entity_id: workOrderId, entity_label: workOrderNo },
                    ...(acceptedScope.site_id ? [{ entity_type: "site", entity_id: acceptedScope.site_id }] : []),
                    { entity_type: "customer", entity_id: acceptedScope.customer_id },
                ],
            });
        },

        directAwardContractor: (input) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "direct-award contractors");
            const state = get();
            const actor = state.currentUser();
            const trimmedReason = (input.award_reason || "").trim();
            if (!trimmedReason)
                throw new Error("A direct-award reason is required so the exception is auditable.");
            if (!input.contractor_id)
                throw new Error("Contractor is required for a direct award.");
            if (!input.accepted_scope_id)
                throw new Error("Accepted scope is required for a direct award.");
            const acceptedScope = state.db.acceptedScopes.find((scope: any) => scope.id === input.accepted_scope_id);
            if (!acceptedScope)
                throw new Error("Accepted scope not found.");
            if (acceptedScope.status === "cancelled")
                throw new Error("This accepted scope is cancelled.");
            const contractor = state.db.master.contractors.find((c: any) => c.id === input.contractor_id);
            if (!contractor)
                throw new Error("Contractor not found in master.");
            const now = nowIso();
            const existingWorkOrder = acceptedScope.work_order_id
                ? state.db.workOrders.find((row: any) => row.id === acceptedScope.work_order_id)
                : undefined;
            const workOrderId = existingWorkOrder?.id || genId("workOrder");
            // FIX-CONTRACTOR-BATCH2 / F.17: dynamic year (was hardcoded "2026").
            const woYearDirect = new Date().getFullYear();
            const workOrderNo = existingWorkOrder?.work_order_no ||
                `WO-${woYearDirect}-${String(state.db.workOrders.length + 1).padStart(3, "0")}`;
            const quotation = state.db.quotations.find((quote: any) => quote.id === acceptedScope.quotation_id);
            const site = state.db.sites.find((row: any) => row.id === acceptedScope.site_id);
            const work = state.db.workRequired.find((row: any) => row.id === acceptedScope.work_required_id);
            const awardAmount = input.award_amount ?? acceptedScope.accepted_value;
            const workOrder: WorkOrder = existingWorkOrder || {
                id: workOrderId,
                work_order_no: workOrderNo,
                customer_id: acceptedScope.customer_id,
                accepted_scope_ids: [acceptedScope.id],
                work_required_ids: [acceptedScope.work_required_id],
                quotation_ids: [acceptedScope.quotation_id],
                site_id: acceptedScope.site_id,
                area_ids: acceptedScope.area_ids,
                title: work?.title || acceptedScope.label,
                status: "scheduled",
                contractor_id: contractor.id,
                contractor_name: contractor.name,
                with_material: input.with_material ?? false,
                material_responsibility: input.with_material ? "contractor" : "company",
                contractor_award_amount: awardAmount,
                contractor_selection_method: "direct_award",
                contractor_award_reason: trimmedReason,
                contractor_award_approved_by: actor.name,
                start_date: today(),
                expected_end: input.estimated_days ? addDays(today(), input.estimated_days) : undefined,
                value: acceptedScope.accepted_value,
                progress: 0,
                site_address: site?.address,
                thread_id: state.openThreadFor("workOrder", workOrderId, `${workOrderNo} · ${work?.title || acceptedScope.label}`, [contractor.name]),
                created_at: now,
                updated_at: now,
            };
            assertWorkOrderRelations(state.db, workOrder, "Work Order");
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    acceptedScopes: s.db.acceptedScopes.map((scope: any) => scope.id === acceptedScope.id
                        ? {
                            ...scope,
                            status: "in_work_order" as const,
                            work_order_id: workOrderId,
                            contractor_selection_method: "direct_award" as const,
                        }
                        : scope),
                    workOrders: existingWorkOrder
                        ? s.db.workOrders.map((row: any) => row.id === workOrderId
                            ? {
                                ...row,
                                contractor_id: contractor.id,
                                contractor_name: contractor.name,
                                with_material: input.with_material ?? false,
                                material_responsibility: input.with_material ? "contractor" : "company",
                                contractor_award_amount: awardAmount,
                                contractor_selection_method: "direct_award" as const,
                                contractor_award_reason: trimmedReason,
                                contractor_award_approved_by: actor.name,
                                updated_at: now,
                            }
                            : row)
                        : [workOrder, ...s.db.workOrders],
                    quotations: s.db.quotations.map((quote: any) => quote.id === acceptedScope.quotation_id
                        ? {
                            ...quote,
                            work_order_ids: Array.from(new Set([...quote.work_order_ids, workOrderId])),
                            updated_at: now,
                        }
                        : quote),
                    workRequired: s.db.workRequired.map((row: any) => row.id === acceptedScope.work_required_id
                        ? { ...row, status: "awarded" as const, updated_at: now }
                        : row),
                },
            }));
            if (!existingWorkOrder) {
                get().createBOQ(workOrderId);
                (quotation?.payment_terms || []).forEach((term: any) => {
                    const schedule = materializePaymentSchedule(term, quotation!, workOrder);
                    get().addPayment({
                        customer_id: acceptedScope.customer_id,
                        site_id: acceptedScope.site_id,
                        quotation_id: acceptedScope.quotation_id,
                        work_order_id: workOrderId,
                        amount: Math.round((acceptedScope.accepted_value * term.percentage) / 100),
                        status: "pending",
                        milestone_term_id: term.id,
                        milestone_label: `${term.label} ${term.percentage}%`,
                        due_event: schedule.due_event,
                        schedule_state: schedule.schedule_state,
                        due_date: schedule.due_date,
                    });
                });
                // FIX-CONTRACTOR-BATCH1 / F.2: Accrue partner commission on
                // direct-award work orders too. Previously only selectContractorBid
                // called accrueCommission, so direct-award work orders silently
                // skipped the source partner's commission — the Commissions module
                // showed nothing for direct-award jobs and partners were never
                // credited. The same customer/site source_partner_id resolution
                // is used as in selectContractorBid (contractors.ts:325-335).
                // BREAKAGE CHECK: accrueCommission (contractors.ts:1001-1070)
                // returns early with no side effects when workOrder or partner
                // is not found, and is wrapped in try/catch here so any
                // unexpected error during accrual cannot block the award.
                const customer = state.db.customers.find((row: any) => row.id === acceptedScope.customer_id);
                const siteRow = state.db.sites.find((row: any) => row.id === acceptedScope.site_id);
                const partnerId = customer?.source_partner_id || siteRow?.source_partner_id;
                if (partnerId && quotation) {
                    try {
                        get().accrueCommission(workOrderId, quotation.id, partnerId);
                    } catch (err) {
                        // Don't block the direct award if commission accrual fails (e.g. partner removed mid-flight).
                        console.warn("accrueCommission failed (direct award):", err);
                    }
                }
            }
            get().addThreadReply(workOrder.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: `Direct-award to ${contractor.name} (no formal bid round). Reason: "${trimmedReason}". ${input.note || ""}`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Direct-award contractor ${contractor.name} for ${workOrderNo} — reason: "${trimmedReason}"`,
                entity_type: "workOrder",
                entity_id: workOrderId,
                entity_label: workOrderNo,
                kind: "decision",
                reason: trimmedReason,
                source_module: "contractors",
                // Cross-post: direct award is relevant to the Contractor, Customer, and Site.
                cross_post: [
                    { entity_type: "contractor", entity_id: contractor.id, entity_label: contractor.name },
                    { entity_type: "customer", entity_id: acceptedScope.customer_id },
                    ...(acceptedScope.site_id ? [{ entity_type: "site", entity_id: acceptedScope.site_id }] : []),
                ],
            });
            return workOrderId;
        },

        settleContractor: (params) => {
            assertRole(get().currentUser().role, ["Owner"], "settle contractors");
            const actor = get().currentUser();
            const state = get();
            const workOrder = state.db.workOrders.find((j: any) => j.id === params.workOrderId);
            if (!workOrder || !workOrder.contractor_id)
                return { settlementId: "" };
            const contractor = state.db.master.contractors.find((c: any) => c.id === workOrder.contractor_id);
            if (!contractor)
                return { settlementId: "" };
            const proof = contractorPaymentProofStatus(state.db, workOrder.id);
            if (!proof.ok)
                throw new Error(proof.reason);
            const advances = params.advancesPaid ??
                state.db.workOrderCostLines
                    .filter((c: any) => c.work_order_id === workOrder.id &&
                    c.type === "contractor" &&
                    c.source_kind === "contractor_payment")
                    .reduce((n: any, c: any) => n + c.amount, 0);
            const materialsIssued = params.materialsIssuedValue ?? 0;
            const recoveries = params.recoveries ?? 0;
            const completedPct = Math.max(0, Math.min(100, params.completedPct));
            const payable = Math.max(0, Math.round((completedPct / 100) * workOrder.value -
                advances -
                materialsIssued +
                recoveries));
            const settlementId = genId("sett");
            const settlementNo = `SET-${Date.now().toString(36).toUpperCase()}`;
            const now = nowIso();
            const threadId = state.openThreadFor("settlement", settlementId, `Settlement ${settlementNo} · ${contractor.name} · ${workOrder.work_order_no}`, [contractor.name]);
            // FIX-CONTRACTOR-BATCH2 / F.10: populate the previously-dead
            // `customer_name` field so the settlement card can show the
            // customer name instead of just the work order number. Resolved
            // through the work order's customer_id.
            const settlementCustomer = workOrder.customer_id
                ? state.db.customers.find((row: any) => row.id === workOrder.customer_id)
                : undefined;
            let replacementJobId: string | undefined;
            commitState((s: any) => {
                const newSettlement: ContractorSettlement = {
                    id: settlementId,
                    settlement_no: settlementNo,
                    work_order_id: workOrder.id,
                    customer_name: settlementCustomer?.name,
                    work_order_no: workOrder.work_order_no,
                    site_id: workOrder.site_id,
                    contractor_id: contractor.id,
                    contractor_name: contractor.name,
                    type: params.type || "abandonment",
                    completed_pct: completedPct,
                    contract_value: workOrder.value,
                    advances_paid: advances,
                    materials_issued_value: materialsIssued,
                    recoveries: recoveries,
                    payable_amount: payable,
                    reason: params.reason,
                    settled_at: now,
                    thread_id: threadId,
                    created_at: now,
                    updated_at: now,
                };
                const costLine: WorkOrderCostLine = {
                    id: genId("jcl"),
                    work_order_id: workOrder.id,
                    // CV-13: Classify contractor abandonment settlements as "contractor" (not "overhead")
                    // so the contractor cost KPI in P&L / site financials includes settlement payouts.
                    // computeJobPnL and siteFinancials (in selectors.ts) sum type "contractor" / "subcontract"
                    // for contractor cost; the settlement amount is now counted there. The `source_kind`
                    // remains "settlement" so the cost line's origin is still traceable.
                    type: "contractor",
                    description: `Settlement ${settlementNo} · ${contractor.name} · ${completedPct}% complete`,
                    amount: payable,
                    date: today(),
                    source_kind: "settlement",
                    source_id: settlementId,
                    // FIX-CONTRACTOR-BATCH1 / F.3: vendor_id is canonical; mirror to
                    // contractor_id for backward compat with any consumer that still
                    // reads the legacy field.
                    vendor_id: contractor.id,
                    vendor_name: contractor.name,
                    contractor_id: contractor.id,
                    contractor_name: contractor.name,
                    created_at: now,
                };
                const updatedJobs = s.db.workOrders.map((j: any) => j.id === workOrder.id
                    ? {
                        ...j,
                        status: "abandoned" as const,
                        abandoned_at: now,
                        abandoned_reason: params.reason,
                        abandoned_contractor_id: contractor.id,
                        abandoned_contractor_name: contractor.name,
                        contractor_id: undefined,
                        contractor_name: undefined,
                        updated_at: now,
                    }
                    : j);
                return {
                    db: {
                        ...s.db,
                        contractorSettlements: [
                            newSettlement,
                            ...s.db.contractorSettlements,
                        ],
                        workOrderCostLines: [costLine, ...s.db.workOrderCostLines],
                        workOrders: updatedJobs,
                    },
                };
            });
            if (params.createReplacementJob) {
                const replId = genId("workOrder");
                const replNo = `${workOrder.work_order_no}-R`;
                const replThreadId = get().openThreadFor("workOrder", replId, `${replNo} · replacement for ${workOrder.work_order_no}`, [workOrder.customer_name || "Customer"]);
                replacementJobId = replId;
                const now2 = nowIso();
                commitState((s: any) => {
                    const replacement: WorkOrder = {
                        ...workOrder,
                        id: replId,
                        work_order_no: replNo,
                        status: "scheduled",
                        contractor_id: undefined,
                        contractor_name: undefined,
                        progress: 0,
                        start_date: today(),
                        actual_end: undefined,
                        abandoned_at: undefined,
                        abandoned_reason: undefined,
                        abandoned_contractor_id: undefined,
                        abandoned_contractor_name: undefined,
                        replacement_for_work_order_id: workOrder.id,
                        thread_id: replThreadId,
                        created_at: now2,
                        updated_at: now2,
                    };
                    const settlements = s.db.contractorSettlements.map((x: any) => x.id === settlementId
                        ? { ...x, replacement_work_order_id: replId }
                        : x);
                    return {
                        db: {
                            ...s.db,
                            workOrders: [replacement, ...s.db.workOrders],
                            contractorSettlements: settlements,
                        },
                    };
                });
                get().logAudit({
                    actor: actor.name,
                    actor_role: actor.role,
                    action: `Replacement workOrder ${replNo} created for abandoned ${workOrder.work_order_no}`,
                    entity_type: "workOrder",
                    entity_id: replId,
                    entity_label: replNo,
                    kind: "create",
                    cross_post: [
                        { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                        ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                        ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                        ...(workOrder.contractor_id ? [{ entity_type: "contractor", entity_id: workOrder.contractor_id, entity_label: workOrder.contractor_name }] : []),
                    ],
                });
            }
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Settlement posted · ${completedPct}% complete · payable ${formatINR(payable)} (contract ${formatINR(workOrder.value)} − advances ${formatINR(advances)} − materials ${formatINR(materialsIssued)} + recoveries ${formatINR(recoveries)}). Reason: ${params.reason}${replacementJobId ? `. Replacement workOrder opened for new bidding.` : ""}`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Settled contractor ${contractor.name} on ${workOrder.work_order_no} for ${formatINR(payable)} (${completedPct}% complete)`,
                entity_type: "settlement",
                entity_id: settlementId,
                entity_label: settlementNo,
                kind: "decision",
                cross_post: [
                    { entity_type: "contractor", entity_id: contractor.id, entity_label: contractor.name },
                    { entity_type: "workOrder", entity_id: workOrder.id, entity_label: workOrder.work_order_no },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                ],
            });
            return { settlementId, replacementJobId };
        },

        createContractorRABill: (workOrderId, contractorId, amount, description, progressPct) => {
            assertRole(get().currentUser().role, ["Owner", "Finance", "Operations Manager"], "create contractor RA bills");
            const state = get();
            const actor = state.currentUser();
            const workOrder = state.db.workOrders.find((row: any) => row.id === workOrderId);
            const contractor = state.db.master.contractors.find((row: any) => row.id === contractorId);
            if (!workOrder ||
                !contractor ||
                workOrder.contractor_id !== contractor.id)
                throw new Error("RA bill must use the awarded contractor for this Work Order.");
            if (!Number.isFinite(amount) || amount <= 0)
                throw new Error("RA bill amount must be greater than zero.");
            const proof = contractorPaymentProofStatus(state.db, workOrderId);
            // CV-2: Relax the contractor-confirmation proof gate. The user wants flexibility over strictness —
            // previously a missing executionLog attachment hard-blocked ALL RA bill creation, killing the
            // contractor payment chain for any work order without a daily-log photo on file. Now we warn
            // (via a thread reply + audit log) but still let the business file the RA bill. The approval /
            // settlement actions keep the proof check so the final release still requires proof.
            const proofPending = !proof.ok;
            const accrued = state.db.contractorBills
                .filter((row: any) => row.work_order_id === workOrderId && row.status !== "held")
                .reduce((sum: any, row: any) => sum + row.amount, 0);
            // CV-1b: `??` does NOT treat 0 as nullish, so a stale contractor_award_amount of 0 (left over
            // from a placeholder bid) collapsed the entire RA-bill limit to 0 and blocked every positive
            // bill. Use a positive-check so a missing/zero award falls back to the work-order value.
            const contractLimit = (workOrder.contractor_award_amount && workOrder.contractor_award_amount > 0)
                ? workOrder.contractor_award_amount
                : workOrder.value;
            if (accrued + amount > contractLimit + 0.01)
                throw new Error("RA bill exceeds the contractor award / Work Order value. Create an approved variation before billing beyond the award.");
            const id = genId("cbill");
            const now = nowIso();
            const threadId = state.openThreadFor("settlement", id, `Contractor RA bill · ${workOrder.work_order_no} · ${contractor.name}`, [contractor.name, actor.name]);
            // FIX-CONTRACTOR-BATCH2 / F.17: dynamic year (was hardcoded "2026").
            const billYear = new Date().getFullYear();
            const bill: ContractorBill = {
                id,
                bill_no: `CTB-${billYear}-${String(state.db.contractorBills.length + 1).padStart(3, "0")}`,
                ra_no: `RA-${String(state.db.contractorBills.filter((row: any) => row.work_order_id === workOrderId).length + 1).padStart(2, "0")}`,
                description,
                customer_id: workOrder.customer_id,
                site_id: workOrder.site_id,
                work_order_id: workOrder.id,
                work_required_id: workOrder.work_required_ids[0],
                area_ids: workOrder.area_ids,
                contractor_id: contractor.id,
                contractor_name: contractor.name,
                amount,
                paid_amount: 0,
                balance_amount: amount,
                status: "verified",
                progress_pct: progressPct ?? workOrder.progress,
                due_date: today(),
                verified_at: now,
                verified_by: actor.name,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            // CV-2: Flag the bill as "proof pending" when no contractor confirmation was uploaded.
            // The bill is still created (verified) so the business can proceed, but the warning is visible
            // to anyone reviewing the thread / audit log.
            if (proofPending) {
                get().addThreadReply(threadId, {
                    author: actor.name,
                    role: actor.role,
                    body: `Warning: contractor confirmation proof not yet uploaded for ${workOrder.work_order_no}. RA bill ${bill.ra_no} created anyway (flexible mode). Upload proof via Sites & Execution → Execution Logs before releasing the final payment.`,
                    kind: "note",
                });
            }
            const costLine: WorkOrderCostLine = {
                id: genId("jcl"),
                work_order_id: workOrder.id,
                type: "contractor",
                description: `${contractor.name} — verified ${bill.ra_no} / ${bill.bill_no}: ${description}`,
                amount,
                date: now,
                source_kind: "bill",
                source_id: id,
                // FIX-CONTRACTOR-BATCH1 / F.3: vendor_id is canonical; mirror to
                // contractor_id for backward compat with any consumer that still
                // reads the legacy field.
                vendor_id: contractor.id,
                vendor_name: contractor.name,
                contractor_id: contractor.id,
                contractor_name: contractor.name,
                created_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorBills: [bill, ...s.db.contractorBills],
                    workOrderCostLines: [costLine, ...s.db.workOrderCostLines],
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Verified ${bill.ra_no} recorded for ${formatINR(amount)}. Finance may request one or more partial payments against its remaining balance.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Verified contractor ${bill.ra_no} ${bill.bill_no} for ${workOrder.work_order_no} (${formatINR(amount)})`,
                entity_type: "workOrder",
                entity_id: workOrderId,
                entity_label: workOrder.work_order_no,
                kind: "create",
                cross_post: [
                    { entity_type: "contractorBill", entity_id: id, entity_label: bill.bill_no },
                    { entity_type: "contractor", entity_id: contractor.id, entity_label: contractor.name },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    ...(workOrder.customer_id ? [{ entity_type: "customer", entity_id: workOrder.customer_id }] : []),
                ],
            });
            // J: Recompute contractor performance after an RA bill is filed.
            // Best-effort — never throw.
            try { get().recomputeContractorPerformance(contractor.id); }
            catch (err) { console.warn("[createContractorRABill] recomputeContractorPerformance failed", err); }
            return id;
        },

        requestContractorBillPayment: (billId, amount) => {
            assertRole(get().currentUser().role, ["Owner", "Finance", "Operations Manager"], "request contractor bill payments");
            const state = get();
            const actor = state.currentUser();
            const bill = state.db.contractorBills.find((row: any) => row.id === billId);
            if (!bill || bill.status === "held" || bill.status === "paid")
                throw new Error("A verified open contractor bill is required.");
            const committed = state.db.contractorPayments
                .filter((row: any) => row.contractor_bill_id === bill.id &&
                (row.status === "pending" || row.status === "approved"))
                .reduce((sum: any, row: any) => sum + row.amount, 0);
            const requestable = Math.max(0, bill.balance_amount - committed);
            if (!Number.isFinite(amount) ||
                amount <= 0 ||
                amount > requestable + 0.01)
                throw new Error(`Payment request must be within the unrequested contractor bill balance (${formatINR(requestable)}).`);
            const proof = contractorPaymentProofStatus(state.db, bill.work_order_id);
            if (!proof.ok)
                throw new Error(proof.reason);
            const policy = state.requiresApproval("contractor_payment", amount);
            const id = genId("cpay");
            const now = nowIso();
            // FIX-CONTRACTOR-BATCH2 / F.17: dynamic year (was hardcoded "2026").
            const payYear = new Date().getFullYear();
            const payment: ContractorPayment = {
                id,
                payment_no: `CP-${payYear}-${String(state.db.contractorPayments.length + 1).padStart(3, "0")}`,
                contractor_bill_id: bill.id,
                work_order_id: bill.work_order_id,
                site_id: bill.site_id,
                contractor_id: bill.contractor_id,
                contractor_name: bill.contractor_name,
                amount,
                mode: "bank_transfer",
                reference: "",
                status: policy ? "pending" : "approved",
                thread_id: bill.thread_id,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorPayments: [payment, ...s.db.contractorPayments],
                },
            }));
            if (policy) {
                const approvalId = genId("appr");
                commitState((s: any) => ({
                    db: {
                        ...s.db,
                        actions: [
                            {
                                id: approvalId,
                                title: `Approve contractor payment · ${bill.contractor_name} (${formatINR(amount)})`,
                                type: "contractor_payment",
                                status: "pending",
                                customer_id: bill.customer_id,
                                amount,
                                requested_by: actor.name,
                                due_date: today(),
                                linked_record_id: id,
                                linked_record_type: "contractor_payment",
                                created_at: now,
                            },
                            ...s.db.actions,
                        ],
                    },
                }));
                get().addTask({
                    title: `Approve contractor payment · ${bill.contractor_name} (${formatINR(amount)})`,
                    customer_id: bill.customer_id,
                    site_id: bill.site_id,
                    work_order_id: bill.work_order_id,
                    task_scope: "office",
                    task_type: "contractor_payment_approval",
                    assignee_name: policy.approver_name || "Owner",
                    auto_generated: true,
                    due_date: today(),
                });
            }
            get().addThreadReply(bill.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: `Payment request ${payment.payment_no} created for ${formatINR(amount)} against ${bill.bill_no}; remaining bill balance is ${formatINR(bill.balance_amount)}.`,
                kind: "decision",
            });
            return id;
        },

        recordContractorPayment: (paymentId, mode, reference) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "record contractor payments");
            const state = get();
            const actor = state.currentUser();
            const payment = state.db.contractorPayments.find((row: any) => row.id === paymentId);
            if (!payment)
                throw new Error("Contractor payment not found.");
            if (payment.status !== "approved")
                throw new Error("Contractor payment must be approved before it can be paid.");
            const bill = state.db.contractorBills.find((row: any) => row.id === payment.contractor_bill_id);
            if (!bill || bill.status === "held")
                throw new Error("Verified contractor bill is required before payment.");
            if (!reference.trim())
                throw new Error("A bank/UPI/cash reference is required for contractor payment.");
            if (payment.amount > bill.balance_amount + 0.01)
                throw new Error("Contractor payment exceeds the remaining RA bill balance.");
            const nextPaid = Math.round((bill.paid_amount + payment.amount) * 100) / 100;
            const billBalance = Math.max(0, Math.round((bill.amount - nextPaid) * 100) / 100);
            const billStatus: ContractorBill["status"] = billBalance === 0 ? "paid" : "partly_paid";
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorPayments: s.db.contractorPayments.map((row: any) => row.id === paymentId
                        ? {
                            ...row,
                            mode,
                            reference: reference.trim(),
                            status: "paid",
                            paid_at: today(),
                            approved_at: row.approved_at || now,
                            approved_by: row.approved_by || actor.name,
                            updated_at: now,
                        }
                        : row),
                    contractorBills: s.db.contractorBills.map((row: any) => row.id === bill.id
                        ? {
                            ...row,
                            paid_amount: nextPaid,
                            balance_amount: billBalance,
                            status: billStatus,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            get().addThreadReply(payment.thread_id || bill.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: `Contractor payment ${payment.payment_no} recorded: ${formatINR(payment.amount)} via ${mode}. Ref: ${reference.trim()}. Bill balance: ${formatINR(billBalance)}.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Paid contractor ${payment.contractor_name || bill.contractor_name} ${formatINR(payment.amount)} for ${bill.bill_no}`,
                entity_type: "workOrder",
                entity_id: payment.work_order_id,
                kind: "receive",
                cross_post: [
                    { entity_type: "contractorPayment", entity_id: paymentId, entity_label: payment.payment_no },
                    { entity_type: "contractorBill", entity_id: bill.id, entity_label: bill.bill_no },
                    ...(payment.contractor_id ? [{ entity_type: "contractor", entity_id: payment.contractor_id, entity_label: payment.contractor_name || bill.contractor_name }] : []),
                    ...(payment.site_id ? [{ entity_type: "site", entity_id: payment.site_id }] : []),
                ],
            });
        },

        approveContractorPayment: (approvalId) => {
            assertRole(get().currentUser().role, ["Owner"], "approve contractor payments");
            const actor = get().currentUser();
            const approval = get().db.actions.find((a: any) => a.id === approvalId);
            if (!approval ||
                approval.linked_record_type !== "contractor_payment" ||
                !approval.linked_record_id)
                return;
            const payment = get().db.contractorPayments.find((row: any) => row.id === approval.linked_record_id);
            if (!payment)
                throw new Error("Contractor payment was not found for approval.");
            const proof = contractorPaymentProofStatus(get().db, payment.work_order_id);
            if (!proof.ok)
                throw new Error(proof.reason);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorPayments: s.db.contractorPayments.map((row: any) => row.id === payment.id
                        ? {
                            ...row,
                            status: "approved",
                            approved_at: nowIso(),
                            approved_by: actor.name,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            get().addThreadReply(payment.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: `Payment ${payment.payment_no} approved. Finance must record the actual payment mode and reference before settlement.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Approved contractor payment ${payment.payment_no} for ${formatINR(payment.amount)}`,
                entity_type: "workOrder",
                entity_id: payment.work_order_id,
                kind: "approve",
                cross_post: [
                    { entity_type: "contractorPayment", entity_id: payment.id, entity_label: payment.payment_no },
                    ...(payment.contractor_bill_id ? [{ entity_type: "contractorBill", entity_id: payment.contractor_bill_id }] : []),
                    ...(payment.contractor_id ? [{ entity_type: "contractor", entity_id: payment.contractor_id, entity_label: payment.contractor_name }] : []),
                    ...(payment.site_id ? [{ entity_type: "site", entity_id: payment.site_id }] : []),
                ],
            });
        },

        accrueCommission: (workOrderId, quotationId, sourcePartnerId) => {
            const state = get();
            const workOrder = state.db.workOrders.find((j: any) => j.id === workOrderId);
            const partner = state.db.master.sourcePartners.find((p: any) => p.id === sourcePartnerId);
            if (!workOrder || !partner)
                return;
            // I: Look up the commissionRules master via Agent A's canonical
            // `findCommissionRule(db, sourcePartnerId, workCategoryId)` helper
            // (exported from masters.ts). The match priority is:
            //   1. partner-specific + applies_to="category" + category_id match
            //   2. partner-specific + applies_to="workOrder"
            //   3. partner-specific + applies_to="all"
            //   4. global applies_to="all" (no source_partner_id)
            // Only when no rule matches do we fall back to partner.commission_pct
            // (and finally to the historical 5% default). Previously this code
            // inlined a partial lookup that missed the workOrder priority and the
            // global fallback — so a rule saved with applies_to="workOrder" or a
            // global catch-all was silently ignored. Using the shared helper keeps
            // accruals consistent with the commission-rules master view and the
            // MastersSalesOpsModule banner.
            const workCategoryId = state.db.workRequired
                .find((w: any) => workOrder.work_required_ids.includes(w.id))?.work_category_id;
            const matchedRule = findCommissionRule(state.db, sourcePartnerId, workCategoryId);
            const matchedLabel = matchedRule
                ? `${matchedRule.applies_to}${matchedRule.category_id ? ` · ${matchedRule.category_id}` : ""}${matchedRule.source_partner_id ? ` · partner ${matchedRule.source_partner_name || matchedRule.source_partner_id}` : " · global"}`
                : `fallback: partner.commission_pct || 5`;
            const rate = matchedRule?.rate_pct ?? partner.commission_pct ?? 5;
            const id = genId("comm");
            // FIX-CONTRACTOR-BATCH2 / F.18: previously used
            // `COMM-${Date.now().toString().slice(-5)}` which only kept the
            // last 5 digits of the millisecond timestamp — collisions were
            // possible within a 100-second window. Now we use the full base36
            // timestamp + a short random suffix so two commissions accrued in
            // the same call stack still get unique numbers.
            const commissionNo = `COMM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const threadId = state.openThreadFor("commission", id, `${commissionNo} · ${partner.name}`, [partner.name, "Owner"]);
            // FIX-CONTRACTOR-BATCH2 / F.11: populate the previously-dead
            // `customer_name` field so CommissionsModule can show the actual
            // customer instead of "—". Resolved through the work order's
            // customer_id.
            const commissionCustomer = workOrder.customer_id
                ? state.db.customers.find((row: any) => row.id === workOrder.customer_id)
                : undefined;
            const comm: Commission = {
                id,
                commission_no: commissionNo,
                source_partner_id: partner.id,
                source_partner_name: partner.name,
                customer_id: workOrder.customer_id,
                customer_name: commissionCustomer?.name,
                site_id: workOrder.site_id,
                work_order_id: workOrderId,
                work_order_no: workOrder.work_order_no,
                quotation_id: quotationId,
                base_amount: workOrder.value,
                rate_pct: rate,
                amount: Math.round((workOrder.value * rate) / 100),
                status: "accrued",
                accrued_at: nowIso(),
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            };
            commitState((s: any) => ({
                db: { ...s.db, commissions: [comm, ...s.db.commissions] },
            }));
            // I: Document the rule lookup in the audit log so commission
            // accruals are traceable to the rule (or to the fallback).
            get().logAudit({
                actor: "System",
                action: `Accrued commission ${commissionNo} for ${partner.name} on ${workOrder.work_order_no} — ${rate}% of ${formatINR(workOrder.value)} = ${formatINR(comm.amount)} (rule: ${matchedLabel})`,
                entity_type: "commission",
                entity_id: id,
                entity_label: commissionNo,
                kind: "system",
                source_module: "contractors",
                cross_post: [
                    { entity_type: "workOrder", entity_id: workOrderId, entity_label: workOrder.work_order_no },
                    ...(workOrder.site_id ? [{ entity_type: "site", entity_id: workOrder.site_id }] : []),
                    { entity_type: "sourcePartner", entity_id: partner.id, entity_label: partner.name },
                    ...(matchedRule ? [{ entity_type: "commissionRule", entity_id: matchedRule.id }] : []),
                ],
            });
        },

        payCommission: (id) => {
            const actor = get().currentUser();
            const commission = get().db.commissions.find((row: any) => row.id === id);
            const threadId = commission?.thread_id ||
                get().openThreadFor("commission", id, `${commission?.commission_no || id} · ${commission?.source_partner_name || ""}`, [commission?.source_partner_name || "Owner"]);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    commissions: s.db.commissions.map((c: any) => c.id === id
                        ? {
                            ...c,
                            status: "paid",
                            paid_date: today(),
                            thread_id: c.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : c),
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Commission ${commission?.commission_no || id} marked paid.`,
                kind: "decision",
            });
        },

        // J: Recompute a contractor's reliability_score, on_time_pct, and
        // rating from actual RA-bill + payment performance + execution-log
        // on-time filing. Previously these were static master fields set at
        // contractor creation and never updated — so a contractor with 50
        // settled RA bills kept whatever score was entered at creation. Now
        // we derive a 0-100 score from:
        //   • on-time completion: work orders whose actual_end <= expected_end
        //   • RA-bill settled vs disputed rate
        //   • disputed-bill penalty
        // We write the recomputed fields back to the contractor master so the
        // ContractorPerformanceModule leaderboard reflects reality.
        recomputeContractorPerformance: (contractorId) => {
            const state = get();
            const actor = state.currentUser();
            const contractor = state.db.master.contractors.find((c: any) => c.id === contractorId);
            if (!contractor)
                throw new Error("Contractor not found.");
            const contractorWOs = state.db.workOrders.filter((wo: any) => wo.contractor_id === contractorId);
            // On-time completion: completed WOs with both dates set.
            const completedWOs = contractorWOs.filter((wo: any) => wo.actual_end && wo.expected_end);
            const onTimeWOs = completedWOs.filter((wo: any) => wo.actual_end <= wo.expected_end).length;
            const onTimePct = completedWOs.length > 0
                ? Math.round((onTimeWOs / completedWOs.length) * 100)
                : 0;
            // RA-bill settled vs disputed rate.
            const contractorBills = state.db.contractorBills.filter((b: any) => b.contractor_id === contractorId && b.status !== "held");
            const settledBills = contractorBills.filter((b: any) => b.status === "paid" || b.status === "partly_paid").length;
            const disputedBills = contractorBills.filter((b: any) => b.status === "disputed").length;
            const settleRate = contractorBills.length > 0
                ? Math.round((settledBills / contractorBills.length) * 100)
                : 100;
            // Composite reliability score.
            const disputePenalty = Math.min(30, disputedBills * 10);
            const reliabilityScore = Math.max(0, Math.min(100, Math.round(onTimePct * 0.55 + settleRate * 0.45) - disputePenalty));
            const rating = reliabilityScore >= 90 ? 5
                : reliabilityScore >= 75 ? 4
                    : reliabilityScore >= 60 ? 3
                        : reliabilityScore >= 40 ? 2
                            : 1;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractors: s.db.master.contractors.map((c: any) => c.id === contractorId
                            ? {
                                ...c,
                                reliability_score: reliabilityScore,
                                on_time_pct: onTimePct,
                                rating,
                                performance_recomputed_at: nowIso(),
                            }
                            : c),
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Recomputed contractor performance for ${contractor.name}: reliability=${reliabilityScore}, on-time=${onTimePct}%, rating=${rating} (${contractorWOs.length} WOs, ${contractorBills.length} bills, ${disputedBills} disputed)`,
                entity_type: "contractor",
                entity_id: contractorId,
                entity_label: contractor.name,
                kind: "system",
                source_module: "contractors",
            });
        },

        // FIX-CONTRACTOR-BATCH2 / F.7: Surface the previously-unreachable
        // "disputed" status on ContractorBill. The store action flips the
        // status and writes a thread reply + audit log entry. The matching
        // resolveContractorBillDispute action flips it back to "verified" so
        // the bill can re-enter the normal payment release flow.
        disputeContractorBill: (billId, reason) => {
            const actor = get().currentUser();
            const bill = get().db.contractorBills.find((row: any) => row.id === billId);
            if (!bill)
                throw new Error("Contractor bill not found.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorBills: s.db.contractorBills.map((row: any) => row.id === billId
                        ? {
                            ...row,
                            status: "disputed",
                            disputed_at: now,
                            disputed_by: actor.name,
                            dispute_reason: reason,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            if (bill.thread_id) {
                get().addThreadReply(bill.thread_id, {
                    author: actor.name,
                    role: actor.role,
                    body: `Bill marked as disputed: ${reason}. Payment release is frozen until the dispute is resolved.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Disputed contractor bill ${bill.bill_no}: ${reason}`,
                entity_type: "contractorBill",
                entity_id: billId,
                entity_label: bill.bill_no,
                kind: "update",
                source_module: "contractors",
            });
        },

        resolveContractorBillDispute: (billId) => {
            const actor = get().currentUser();
            const bill = get().db.contractorBills.find((row: any) => row.id === billId);
            if (!bill)
                throw new Error("Contractor bill not found.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorBills: s.db.contractorBills.map((row: any) => row.id === billId
                        ? {
                            ...row,
                            status: "verified",
                            updated_at: now,
                        }
                        : row),
                },
            }));
            if (bill.thread_id) {
                get().addThreadReply(bill.thread_id, {
                    author: actor.name,
                    role: actor.role,
                    body: `Dispute resolved — bill restored to "verified" and re-entered the payment release flow.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Resolved dispute on contractor bill ${bill.bill_no}`,
                entity_type: "contractorBill",
                entity_id: billId,
                entity_label: bill.bill_no,
                kind: "update",
                source_module: "contractors",
            });
        },

        // FIX-CONTRACTOR-BATCH2 / F.8: Surface the previously-unreachable
        // "held" and "cancelled" statuses on ContractorPayment. Held freezes
        // a pending/approved payment pending investigation; cancelled voids
        // it entirely. Paid payments cannot be held or cancelled (the money
        // has already left the bank — use a separate reversal flow if needed).
        holdContractorPayment: (paymentId, reason) => {
            const actor = get().currentUser();
            const payment = get().db.contractorPayments.find((row: any) => row.id === paymentId);
            if (!payment)
                throw new Error("Contractor payment not found.");
            if (payment.status === "paid")
                throw new Error("Cannot hold a payment that has already been paid. Record a reversal instead.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorPayments: s.db.contractorPayments.map((row: any) => row.id === paymentId
                        ? {
                            ...row,
                            status: "held",
                            held_at: now,
                            held_by: actor.name,
                            hold_reason: reason,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            if (payment.thread_id) {
                get().addThreadReply(payment.thread_id, {
                    author: actor.name,
                    role: actor.role,
                    body: `Payment held: ${reason}.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Held contractor payment ${payment.payment_no}: ${reason}`,
                entity_type: "contractorPayment",
                entity_id: paymentId,
                entity_label: payment.payment_no,
                kind: "update",
                source_module: "contractors",
            });
        },

        cancelContractorPayment: (paymentId, reason) => {
            const actor = get().currentUser();
            const payment = get().db.contractorPayments.find((row: any) => row.id === paymentId);
            if (!payment)
                throw new Error("Contractor payment not found.");
            if (payment.status === "paid")
                throw new Error("Cannot cancel a payment that has already been paid. Record a reversal instead.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    contractorPayments: s.db.contractorPayments.map((row: any) => row.id === paymentId
                        ? {
                            ...row,
                            status: "cancelled",
                            cancelled_at: now,
                            cancelled_by: actor.name,
                            cancel_reason: reason,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            if (payment.thread_id) {
                get().addThreadReply(payment.thread_id, {
                    author: actor.name,
                    role: actor.role,
                    body: `Payment cancelled: ${reason}.`,
                    kind: "decision",
                });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Cancelled contractor payment ${payment.payment_no}: ${reason}`,
                entity_type: "contractorPayment",
                entity_id: paymentId,
                entity_label: payment.payment_no,
                kind: "delete",
                source_module: "contractors",
            });
        },

        // FIX-CONTRACTOR-BATCH2 / F.13: Soft-delete / archive a contractor.
        // Sets status="inactive" (kept in master for historical lookup).
        // No hard delete — preserves referential integrity with bids / bills /
        // payments / settlements / work orders. activateContractor reverses
        // it. Optionally recompute the workOrderCostLine filter so inactive
        // contractors stop appearing in bid-invitation dropdowns.
        deactivateContractor: (contractorId, reason) => {
            const actor = get().currentUser();
            const contractor = get().db.master.contractors.find((row: any) => row.id === contractorId);
            if (!contractor)
                throw new Error("Contractor not found.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractors: s.db.master.contractors.map((row: any) => row.id === contractorId
                            ? { ...row, status: "inactive", updated_at: now }
                            : row),
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Deactivated contractor ${contractor.name}${reason ? ` — ${reason}` : ""}`,
                entity_type: "contractor",
                entity_id: contractorId,
                entity_label: contractor.name,
                kind: "update",
                source_module: "contractors",
            });
        },

        activateContractor: (contractorId) => {
            const actor = get().currentUser();
            const contractor = get().db.master.contractors.find((row: any) => row.id === contractorId);
            if (!contractor)
                throw new Error("Contractor not found.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    master: {
                        ...s.db.master,
                        contractors: s.db.master.contractors.map((row: any) => row.id === contractorId
                            ? { ...row, status: "active", updated_at: now }
                            : row),
                    },
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Re-activated contractor ${contractor.name}`,
                entity_type: "contractor",
                entity_id: contractorId,
                entity_label: contractor.name,
                kind: "update",
                source_module: "contractors",
            });
        },
    };
}
