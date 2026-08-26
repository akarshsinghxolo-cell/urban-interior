import type { Quotation, QuotationItem } from "../../types";
import type { QuotationsState } from "../types";
import type { StoreContext } from "../context";
import { assertQuotationRelations } from "../../business-rules";
import { genId, nowIso, userForRole } from "../helpers";
import { resolveQuotationDefaults } from "../quotations-helpers";
import { createQuotationsSlice as createCoreQuotationsSlice } from "./quotations-core";

function nextCustomerLevelQuotationNo(quotations: Quotation[]): string {
    const year = new Date().getFullYear();
    let maxSeq = 0;
    for (const quotation of quotations) {
        const match = quotation.quotation_no?.match(new RegExp(`^Q-${year}-(\\d+)$`));
        if (match) maxSeq = Math.max(maxSeq, Number.parseInt(match[1], 10));
    }
    return `Q-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * Compatibility facade around the mature quotation slice. Existing Site-scoped
 * quotation behavior stays in quotations-core; this facade adds only the new
 * customer-level draft path for customers that do not have a Site yet.
 */
export function createQuotationsSlice(ctx: StoreContext): QuotationsState {
    const core = createCoreQuotationsSlice(ctx);
    const { commitState, get } = ctx;

    return {
        ...core,
        addQuotation: (q) => {
            const hasSiteOrCoverage = Boolean(q.site_id) || Boolean(q.coverage?.length);
            if (hasSiteOrCoverage) {
                return core.addQuotation(q);
            }

            const state = get();
            const customerId = q.customer_id || "";
            const customer = state.db.customers.find((row: any) => row.id === customerId);
            if (!customerId || !customer) {
                throw new Error("Quotation requires a valid Customer.");
            }
            if (q.status && q.status !== "draft") {
                throw new Error("New quotations must start as Draft. Use the quotation workflow to send or accept them.");
            }

            const starterItems: QuotationItem[] = q.scope_lines?.length
                ? q.scope_lines
                : (q.items || []);
            assertQuotationRelations(state.db, {
                customer_id: customerId,
                site_id: "",
                coverage: [],
                scope_lines: starterItems,
                items: starterItems,
            }, "Quotation");

            const id = genId("quot");
            const now = nowIso();
            const quoteNo = nextCustomerLevelQuotationNo(state.db.quotations);
            const designer = userForRole(state.db, "Designer");
            const customerName = customer.name || "Customer";
            const defaults = resolveQuotationDefaults(state.db);
            const validUntil = q.valid_until || defaults.valid_until;
            const paymentTerms = q.payment_terms && q.payment_terms.length
                ? q.payment_terms
                : defaults.payment_terms;
            const subtotal = q.subtotal != null
                ? q.subtotal
                : starterItems.reduce((sum: number, item: QuotationItem) => sum + item.amount, 0);
            const taxAmount = q.tax_amount != null
                ? q.tax_amount
                : Math.round(starterItems.reduce((sum: number, item: QuotationItem) => sum + (item.amount * (item.tax_rate || 0)) / 100, 0) * 100) / 100;
            const totalAmount = q.total_amount != null ? q.total_amount : subtotal + taxAmount;

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

            const threadId = state.openThreadFor(
                "quotation",
                id,
                `${quoteNo} · ${q.title || "New quotation"}`,
                [designer.name, customerName],
            );
            const quotation: Quotation = {
                id,
                quotation_no: quoteNo,
                customer_id: customerId,
                customer_name: customerName,
                site_id: "",
                title: q.title || `${customerName} · Quotation`,
                status: "draft",
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
                coverage: [],
                scope_lines: starterItems,
                items: starterItems,
                thread_id: threadId,
                work_order_ids: [],
                created_at: now,
                updated_at: now,
            };

            commitState((current: any) => ({
                db: {
                    ...current.db,
                    quotations: [quotation, ...current.db.quotations],
                },
            }));

            state.addThreadReply(threadId, {
                author: "System",
                role: "Automation",
                body: "Customer-level quotation draft created without a Site. Site and Work Required can be linked later when the project location/scope is known.",
                kind: "system",
            });
            if (defaults.payment_terms.length) {
                state.addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Payment milestones seeded from default template (${defaults.payment_terms.length} milestones totalling ${defaults.payment_terms.reduce((n: number, term: any) => n + term.percentage, 0)}%).`,
                    kind: "system",
                });
            }
            if (defaults.terms_and_conditions) {
                state.addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `Commercial terms applied from ${state.db.commercialTerms.filter((term: any) => term.enabled).length} active clause(s).`,
                    kind: "system",
                });
            }
            if (pendingApproval) {
                state.addThreadReply(threadId, {
                    author: "System",
                    role: "Automation",
                    body: `⚠ ${approvalReason} Owner approval required before sending.`,
                    kind: "alert",
                });
            }

            state.logAudit({
                actor: designer.name,
                actor_role: designer.role,
                action: `Created customer-level quotation ${quoteNo} for ${customerName}${pendingApproval ? " (held for discount approval)" : ""}`,
                entity_type: "quotation",
                entity_id: id,
                entity_label: quoteNo,
                kind: "create",
            });
            state.fireAutomation("quotation_created", {
                quotationId: id,
                quotationNo: quoteNo,
                customerId,
                siteId: "",
                amount: totalAmount,
                discountPct,
            });
            return id;
        },
    };
}
