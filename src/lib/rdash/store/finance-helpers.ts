/**
 * Finance-related helper functions extracted from store.ts (Phase 3f).
 *
 * These are used by the finance slice (payments, invoices, receipts) and by
 * other slices that interact with payment milestones. They are pure functions
 * (or take the store `state`/`get` as a parameter) so they can live outside
 * the Zustand create() closure.
 */
import type {
  RDashDatabase, Payment, CustomerInvoice, Followup,
  Quotation, WorkOrder, PaymentTerm,
} from "../types";
import { assertFinanceContext } from "../business-rules";
import { formatINR } from "../format";
import { businessDate, today, nowIso, genId } from "./helpers";

export function milestoneOrder(payment: Payment): number | null {
    const label = (payment.milestone_label || "").toLowerCase();
    if (!label)
        return null;
    if (label.includes("advance"))
        return 1;
    if (label.includes("progress"))
        return 2;
    if (label.includes("final") ||
        label.includes("balance") ||
        label.includes("completion"))
        return 3;
    const pct = Number(label.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]);
    if (!Number.isFinite(pct))
        return null;
    if (pct <= 30)
        return 1;
    if (pct <= 70)
        return 2;
    return 3;
}

export function paymentSequenceGroup(payment: Payment): string | null {
    return (payment.work_order_id ||
        payment.quotation_id ||
        payment.work_required_id ||
        payment.customer_id ||
        null);
}

export function assertPaymentMilestoneSequence(payment: Payment, payments: Payment[]): void {
    const order = milestoneOrder(payment);
    const group = paymentSequenceGroup(payment);
    if (!order || order <= 1 || !group)
        return;
    const earlierOpen = payments.find((candidate) => {
        if (candidate.id === payment.id || candidate.status === "cancelled")
            return false;
        if (paymentSequenceGroup(candidate) !== group)
            return false;
        const candidateOrder = milestoneOrder(candidate);
        return Boolean(candidateOrder &&
            candidateOrder < order &&
            candidate.status !== "received");
    });
    if (earlierOpen) {
        throw new Error(`Payment sequence blocked: receive "${earlierOpen.milestone_label || "earlier milestone"}" before "${payment.milestone_label || "this milestone"}".`);
    }
}

export function dateOnlyFrom(date: string | undefined, fallbackDaysFromToday = 0): string {
    const base = date ? new Date(date) : new Date();
    if (!Number.isNaN(base.getTime()))
        return businessDate(base);
    return businessDate(new Date(Date.now() + fallbackDaysFromToday * 86400000));
}

export function isPaymentChaseNeeded(payment: Payment): boolean {
    if (payment.status === "received" || payment.status === "cancelled")
        return false;
    if (payment.schedule_state === "awaiting_event" || !payment.due_date)
        return false;
    return (payment.status === "overdue" || dateOnlyFrom(payment.due_date) <= today());
}

export function assertServiceFinanceContext(db: RDashDatabase, input: {
    finance_context?: import("../types").FinancialContext;
    customer_id?: string;
    site_id?: string;
    area_ids?: string[];
    work_required_id?: string;
    quotation_id?: string;
    work_order_id?: string;
}, label: string): import("../types").FinancialContext {
    const context = input.finance_context || "service";
    if (context === "retail")
        return context;
    assertFinanceContext(db, { ...input, finance_context: context } as any, label);
    return context;
}

export function paymentFollowupTitle(payment: Payment): string {
    return `Payment follow-up · ${payment.customer_name || "Customer"} · ${payment.milestone_label || formatINR(payment.amount || 0)}`;
}

export function invoiceStatusFromPayment(payment: Payment): CustomerInvoice["status"] {
    if (payment.status === "received")
        return "paid";
    if (payment.status === "partial")
        return "partial";
    if (payment.status === "overdue")
        return "overdue";
    if (payment.status === "cancelled")
        return "cancelled";
    return "issued";
}

export function paymentStatusFromInvoice(status: CustomerInvoice["status"]): Payment["status"] | null {
    if (status === "paid")
        return "received";
    if (status === "partial")
        return "partial";
    if (status === "overdue")
        return "overdue";
    if (status === "cancelled")
        return "cancelled";
    if (status === "issued")
        return "pending";
    return null;
}

export function buildInvoiceDraftFromPayment(payment: Payment, nextNo: string, threadId?: string): CustomerInvoice {
    const paidAmount = 0;
    const now = nowIso();
    return {
        id: genId("inv"),
        invoice_no: nextNo,
        finance_context: payment.finance_context,
        customer_id: payment.customer_id,
        work_required_id: payment.work_required_id,
        quotation_id: payment.quotation_id,
        work_order_id: payment.work_order_id,
        area_ids: payment.area_ids,
        payment_id: payment.id,
        site_id: payment.site_id,
        title: payment.milestone_label || "Payment invoice",
        status: payment.status === "cancelled" ? "cancelled" : "issued",
        subtotal: payment.amount,
        tax_amount: 0,
        total_amount: payment.amount,
        paid_amount: paidAmount,
        balance_amount: Math.max(0, payment.amount - paidAmount),
        issued_at: payment.status === "cancelled" ? undefined : today(),
        due_date: payment.due_date || today(),
        paid_at: undefined,
        thread_id: threadId,
        created_at: now,
        updated_at: now,
    };
}

export function syncInvoiceWithPayment(invoice: CustomerInvoice, payment: Payment): CustomerInvoice {
    // STAGE-3-FIX: Never reduce paid_amount and never overwrite total_amount.
    // The old code clipped paid_amount to payment.amount and reset total_amount
    // to payment.amount, which destroyed multi-receipt invoice state.
    // total_amount = max(existing total, payment amount) — covers the case where
    // the invoice was issued for a single payment, then more payments were added.
    const totalAmount = Math.max(invoice.total_amount || 0, payment.amount);
    // paid_amount is only re-derived from receipts in recordCustomerReceipt;
    // here we preserve the existing paid_amount (never reduce it).
    const paidAmount = invoice.paid_amount || 0;
    const balance = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
    const status: CustomerInvoice["status"] = payment.status === "cancelled"
        ? "cancelled"
        : balance === 0 && paidAmount > 0
            ? "paid"
            : paidAmount > 0
                ? "partial"
                : "issued";
    return {
        ...invoice,
        finance_context: payment.finance_context || invoice.finance_context,
        customer_id: payment.customer_id || invoice.customer_id,
        work_required_id: payment.work_required_id || invoice.work_required_id,
        quotation_id: payment.quotation_id || invoice.quotation_id,
        work_order_id: payment.work_order_id || invoice.work_order_id,
        area_ids: payment.area_ids || invoice.area_ids,
        site_id: payment.site_id || invoice.site_id,
        title: payment.milestone_label || invoice.title,
        status,
        subtotal: payment.amount,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance_amount: balance,
        due_date: payment.due_date || invoice.due_date,
        paid_at: status === "paid" ? invoice.paid_at || today() : undefined,
        updated_at: nowIso(),
    };
}

export function isOpenFollowup(status?: Followup["status"]): boolean {
    return status !== "completed" && status !== "closed";
}

export function findOpenLinkedFollowup(db: RDashDatabase, link: Pick<Followup, "payment_id" | "quotation_id" | "visit_id" | "followup_type"> & Partial<Pick<Followup, "customer_id" | "work_required_id">>): Followup | undefined {
    return db.followups.find((followup) => {
        if (!isOpenFollowup(followup.status))
            return false;
        if (link.followup_type && followup.followup_type !== link.followup_type)
            return false;
        const sameCustomer = Boolean(link.customer_id && followup.customer_id === link.customer_id);
        const sameWorkRequired = Boolean(link.work_required_id &&
            followup.work_required_id === link.work_required_id);
        const fallbackSameRecord = sameWorkRequired || (!link.work_required_id && sameCustomer);
        if (link.payment_id)
            return (followup.payment_id === link.payment_id ||
                (!followup.payment_id && fallbackSameRecord));
        if (link.quotation_id)
            return (followup.quotation_id === link.quotation_id ||
                (!followup.quotation_id && fallbackSameRecord));
        if (link.visit_id)
            return (followup.visit_id === link.visit_id ||
                (!followup.visit_id && fallbackSameRecord));
        return false;
    });
}

/**
 * Upserts a payment follow-up using the store's addFollowup/updateFollowup actions.
 * Takes a `state` object (the RDashState) so it can call cross-slice actions.
 */
export function upsertPaymentFollowup(state: any, payment: Payment, dueDate = payment.promise_date || dateOnlyFrom(payment.due_date), reason = "Payment is due"): string {
    const existing = findOpenLinkedFollowup(state.db, {
        payment_id: payment.id,
        customer_id: payment.customer_id,
        work_required_id: payment.work_required_id,
        followup_type: "payment",
    });
    const patch: Partial<Followup> = {
        customer_id: payment.customer_id,
        work_required_id: payment.work_required_id,
        payment_id: payment.id,
        title: paymentFollowupTitle(payment),
        notes: `${reason}. Customer: ${payment.customer_name || "Customer"}. Amount: ${formatINR(payment.amount || 0)}.`,
        status: "pending",
        priority: payment.status === "overdue" ? "urgent" : "high",
        due_date: dueDate,
        due_at: new Date(`${dueDate}T09:00:00`).toISOString(),
        assigned_to: "Accounts",
        assigned_role: "Finance",
        followup_type: "payment",
        promise_date: payment.promise_date,
    };
    if (existing) {
        state.updateFollowup(existing.id, patch);
        return existing.id;
    }
    return state.addFollowup({ ...patch, notes_history: [] });
}

// ─────────────────────────────────────────────────────────────────────────
// Payment-event helpers — moved from store.ts during Phase 3h so the
// contractors slice (selectContractorBid uses materializePaymentSchedule)
// and the remaining inline store.ts actions (eventMatchesPaymentTrigger
// at three call sites) can share a single implementation.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise a free-text payment due-event description into one of the known
 * canonical event strings used by the milestone scheduler.
 */
export function canonicalPaymentEvent(value?: string) {
    const normalized = (value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ");
    if (normalized.includes("accept"))
        return "on_acceptance";
    if (normalized.includes("before") && normalized.includes("start"))
        return "before_start";
    if (normalized === "on start" || normalized.includes("start work"))
        return "on_start";
    if (normalized.includes("material") && normalized.includes("issue"))
        return "after_material_issue";
    if (normalized.includes("material") &&
        (normalized.includes("delivery") || normalized.includes("deliver")))
        return "material_delivery";
    if (normalized.includes("progress"))
        return "progress_claim";
    if (normalized.includes("handover") || normalized.includes("completion"))
        return "handover";
    return "custom_date";
}

/**
 * Resolve the concrete due date and schedule state for a payment term, given
 * the parent quotation and work order. Used by selectContractorBid when
 * awarding a contractor and creating the associated payment milestones.
 */
export function materializePaymentSchedule(term: PaymentTerm, quotation: Quotation, workOrder: WorkOrder) {
    const event = canonicalPaymentEvent(term.due_event);
    const acceptedDate = dateOnlyFrom(quotation.accepted_at || workOrder.created_at || today());
    if (event === "on_acceptance")
        return {
            due_date: acceptedDate,
            schedule_state: "scheduled" as const,
            due_event: event,
        };
    if (event === "before_start" || event === "on_start")
        return {
            due_date: dateOnlyFrom(workOrder.start_date),
            schedule_state: "scheduled" as const,
            due_event: event,
        };
    return {
        due_date: "",
        schedule_state: "awaiting_event" as const,
        due_event: event,
    };
}

/**
 * Test whether a payment's `due_event` field matches a particular trigger.
 * Used by the inline store.ts execution/GRN actions to advance milestone
 * payments when materials are issued or delivered.
 */
export function eventMatchesPaymentTrigger(event: string | undefined, trigger: "material_delivery" | "after_material_issue") {
    return canonicalPaymentEvent(event) === trigger;
}

// ─────────────────────────────────────────────────────────────────────────
// G: Canonical work-order P&L. Previously there were THREE competing formulas:
//   1. `computeJobPnL` (selectors.ts) — reads workOrderCostLines.
//   2. `siteFinancials` (selectors.ts) — also reads workOrderCostLines (rolled
//      up per site, but with different field names).
//   3. `computeSitePnLs` (SiteProfitabilityModule) — reads vendorBills +
//      contractorBills directly, ignoring workOrderCostLines entirely.
// The same site would show DIFFERENT margins across modules because formula
// 3 counted all vendor+contractor bills (regardless of approval status) while
// formulas 1 & 2 counted only POSTED cost lines (approved bills + verified RA
// bills + approved variations).
// This function is the single source of truth. selectors.ts computeJobPnL and
// the SiteProfitabilityModule computeSitePnLs both delegate to it now.
// ─────────────────────────────────────────────────────────────────────────

export interface WorkOrderPnLResult {
    work_order_id: string;
    work_order_no: string;
    site_id?: string;
    customer_name?: string;
    contracted_revenue: number;
    invoiced: number;
    collected: number;
    receivable: number;
    material_cost: number;
    labour_cost: number;
    contractor_cost: number;
    overhead_cost: number;
    total_cost: number;
    gross_margin: number;
    margin_pct: number;
}

export function computeWorkOrderPnL(db: RDashDatabase, workOrderId: string): WorkOrderPnLResult | null {
    const workOrder = db.workOrders.find((row) => row.id === workOrderId);
    if (!workOrder)
        return null;
    const costLines = db.workOrderCostLines.filter((line) => line.work_order_id === workOrderId);
    const material = costLines
        .filter((line) => line.type === "material")
        .reduce((sum, line) => sum + line.amount, 0);
    const labour = costLines
        .filter((line) => line.type === "labour")
        .reduce((sum, line) => sum + line.amount, 0);
    const contractor = costLines
        .filter((line) => line.type === "contractor" || line.type === "subcontract")
        .reduce((sum, line) => sum + line.amount, 0);
    const overhead = costLines
        .filter((line) => line.type === "overhead" ||
        line.type === "tax" ||
        line.type === "settlement")
        .reduce((sum, line) => sum + line.amount, 0);
    const totalCost = material + labour + contractor + overhead;
    const invoices = db.invoices.filter((invoice) => invoice.work_order_id === workOrderId && invoice.status !== "cancelled");
    const invoiced = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0);
    const collected = db.customerReceipts
        .filter((receipt) => receipt.work_order_id === workOrderId)
        .reduce((sum, receipt) => sum + receipt.amount, 0);
    const receivable = invoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0);
    const grossMargin = workOrder.value - totalCost;
    return {
        work_order_id: workOrder.id,
        work_order_no: workOrder.work_order_no,
        site_id: workOrder.site_id,
        customer_name: (workOrder as { customer_name?: string }).customer_name,
        contracted_revenue: workOrder.value,
        invoiced,
        collected,
        receivable,
        material_cost: material,
        labour_cost: labour,
        contractor_cost: contractor,
        overhead_cost: overhead,
        total_cost: totalCost,
        gross_margin: grossMargin,
        margin_pct: workOrder.value
            ? Math.round((grossMargin / workOrder.value) * 100)
            : 0,
    };
}

/** G: Roll up `computeWorkOrderPnL` for every work order on a site. */
export function computeSitePnLsFromCostLines(db: RDashDatabase, siteId: string) {
    const siteWorkOrders = db.workOrders.filter((wo) => wo.site_id === siteId);
    const workOrderPnLs = siteWorkOrders
        .map((wo) => computeWorkOrderPnL(db, wo.id))
        .filter((row): row is WorkOrderPnLResult => Boolean(row));
    const totalCost = workOrderPnLs.reduce((sum, p) => sum + p.total_cost, 0);
    const acceptedValue = db.acceptedScopes
        .filter((scope) => scope.site_id === siteId && scope.status !== "cancelled")
        .reduce((sum, scope) => sum + scope.accepted_value, 0);
    return {
        accepted_value: acceptedValue,
        invoiced: workOrderPnLs.reduce((sum, p) => sum + p.invoiced, 0),
        collected: workOrderPnLs.reduce((sum, p) => sum + p.collected, 0),
        receivable: workOrderPnLs.reduce((sum, p) => sum + p.receivable, 0),
        material_cost: workOrderPnLs.reduce((sum, p) => sum + p.material_cost, 0),
        contractor_cost: workOrderPnLs.reduce((sum, p) => sum + p.contractor_cost, 0),
        labour_cost: workOrderPnLs.reduce((sum, p) => sum + p.labour_cost, 0),
        overhead_cost: workOrderPnLs.reduce((sum, p) => sum + p.overhead_cost, 0),
        total_cost: totalCost,
        gross_margin: acceptedValue - totalCost,
        work_order_pnls: workOrderPnLs,
    };
}
