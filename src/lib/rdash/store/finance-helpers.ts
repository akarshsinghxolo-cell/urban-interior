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
import { businessDate, today, nowIso, genId, addDays } from "./helpers";
import { indiaDate } from "../date";
import { isRecognizedInvoice, isOpenInvoice, invoiceFinancialSummary } from "../financial-projections";
import { activeStaffIdForRole } from "../staff-directory";

export interface CashEntry {
    id: string;
    date: string;
    direction: "in" | "out";
    amount: number;
    label: string;
    reference?: string;
    sourceKind?: "invoice" | "vendorBill" | "workOrder" | "commission";
    sourceId: string;
}

/** A read-only projection of original records, never a second editable ledger. */
export function actualCashEntries(db: RDashDatabase): CashEntry[] {
    const entries: CashEntry[] = [];
    const add = (date: string | undefined, entry: Omit<CashEntry, "date">) => {
        if (date && Number.isFinite(new Date(date).getTime()) && Number.isFinite(entry.amount) && entry.amount > 0)
            entries.push({ ...entry, date: indiaDate(date), amount: Math.round(entry.amount * 100) / 100 });
    };
    db.customerReceipts.forEach(r => add(r.received_at, { id: r.id, direction: "in", amount: r.amount, label: r.receipt_no, reference: r.reference, sourceKind: "invoice", sourceId: r.invoice_id }));
    db.vendorPayments.filter(p => p.status === "paid").forEach(p => add(p.paid_at, { id: p.id, direction: "out", amount: p.amount, label: `${p.payment_no} · ${p.vendor_name}`, reference: p.reference, sourceKind: "vendorBill", sourceId: p.vendor_bill_id }));
    db.contractorPayments.filter(p => p.status === "paid").forEach(p => add(p.paid_at, { id: p.id, direction: "out", amount: p.amount, label: `${p.payment_no} · ${p.contractor_name || "Contractor"}`, reference: p.reference, sourceKind: "workOrder", sourceId: p.work_order_id }));
    db.commissions.filter(c => c.status === "paid").forEach(c => add(c.paid_date, { id: c.id, direction: "out", amount: c.amount, label: `${c.commission_no} · ${c.source_partner_name}`, sourceKind: "commission", sourceId: c.id }));
    (db.payrollPeriods || []).filter(p => p.status === "paid").forEach(p => {
        (db.payrollLines || []).filter(l => l.payroll_period_id === p.id && l.payment_status === "paid").forEach(l => add(p.paid_at, {
            id: l.id, direction: "out", amount: l.net_payable,
            label: `Salary ${p.month}/${p.year} · ${db.master.staff.find(s => s.id === l.staff_id)?.name || l.staff_id}`,
            sourceId: p.id,
        }));
    });
    return entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function cashFlowDays(entries: CashEntry[], start: string, count: number) {
    return Array.from({ length: count }, (_, i) => {
        const date = addDays(start, i);
        const rows = entries.filter(e => e.date === date);
        const inflow = Math.round(rows.filter(e => e.direction === "in").reduce((n, e) => n + e.amount, 0) * 100) / 100;
        const outflow = Math.round(rows.filter(e => e.direction === "out").reduce((n, e) => n + e.amount, 0) * 100) / 100;
        return { date, label: new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }), inflow, outflow, net: Math.round((inflow - outflow) * 100) / 100 };
    });
}

export function cashFlowForecast(db: RDashDatabase, date = today()) {
    const actual = actualCashEntries(db);
    const scheduled: CashEntry[] = [];
    const add = (id: string, due: string | undefined, amount: number, direction: "in" | "out", sourceId: string) => {
        const day = due ? indiaDate(due) : "";
        if (day && amount > 0 && Number.isFinite(amount)) scheduled.push({ id, date: day < date ? date : day, amount, direction, label: id, sourceId });
    };
    // Invoice balances are authoritative. Milestones distribute that balance, not additional debt.
    db.invoices.filter(i => isOpenInvoice(i)).forEach(invoice => {
        let remaining = invoice.balance_amount;
        db.payments.filter(p => p.invoice_id === invoice.id && !["received", "cancelled"].includes(p.status) && p.schedule_state !== "awaiting_event" && p.due_date)
            .sort((a, b) => a.due_date!.localeCompare(b.due_date!)).forEach(p => {
                const amount = Math.min(remaining, Math.max(0, p.amount - (p.received_amount || 0)));
                add(p.id, p.due_date, amount, "in", invoice.id);
                remaining -= amount;
            });
        add(invoice.id, invoice.due_date, remaining, "in", invoice.id);
    });
    db.payments.filter(p => !p.invoice_id && !["received", "cancelled"].includes(p.status) && p.schedule_state !== "awaiting_event")
        .forEach(p => add(p.id, p.due_date, p.amount - (p.received_amount || 0), "in", p.id));
    db.vendorBills.filter(b => ["approved", "partly_paid"].includes(b.status)).forEach(b => add(b.id, b.due_date, b.balance_amount, "out", b.id));
    db.contractorBills.forEach(b => add(b.id, b.due_date, contractorBillOutstanding(db, b), "out", b.id));
    const openingRecordedNet = actual.filter(e => e.date < date).reduce((n, e) => n + (e.direction === "in" ? e.amount : -e.amount), 0);
    let cumulative = openingRecordedNet;
    const days = cashFlowDays([...actual, ...scheduled], date, 14).map(day => {
        cumulative = Math.round((cumulative + day.net) * 100) / 100;
        return { ...day, cumulative, isToday: day.date === date };
    });
    const inflow = days.reduce((n, d) => n + d.inflow, 0);
    const outflow = days.reduce((n, d) => n + d.outflow, 0);
    return { days, totals: { inflow, outflow, net: inflow - outflow, endingBalance: cumulative } };
}

/** Only verified liabilities count; payment requests do not discharge a bill. */
export function contractorBillOutstanding(db: RDashDatabase, bill: RDashDatabase["contractorBills"][number]) {
    if (!["verified", "approved", "partly_paid", "paid"].includes(bill.status)) return 0;
    const paid = db.contractorPayments.filter(payment => payment.contractor_id === bill.contractor_id &&
        payment.contractor_bill_id === bill.id && payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
    return Math.max(0, bill.amount - paid);
}

export function vendorBillResolutionAllowsApproval(bill: import("../types").VendorBill): boolean {
    const match = bill.three_way_match;
    return Boolean(bill.matched || (match?.resolution === "accept_as_is" && match.resolution_notes?.trim()));
}

export function contractorSettlementAmounts(db: RDashDatabase, workOrder: WorkOrder, completedPct: number, materials = 0, recoveries = 0) {
    if (![completedPct, materials, recoveries].every(Number.isFinite) || completedPct < 0 || completedPct > 100 || materials < 0 || recoveries < 0)
        throw new Error("Enter a completion percentage between 0 and 100 and non-negative deductions.");
    const contractValue = workOrder.contractor_award_amount && workOrder.contractor_award_amount > 0 ? workOrder.contractor_award_amount : workOrder.value;
    const paid = db.contractorPayments.filter(p => p.work_order_id === workOrder.id && p.contractor_id === workOrder.contractor_id && p.status === "paid").reduce((n, p) => n + p.amount, 0);
    const earned = Math.round(Math.max(0, contractValue * completedPct / 100 - materials - recoveries) * 100) / 100;
    return { contractValue, paid, earned, payable: Math.round(Math.max(0, earned - paid) * 100) / 100, recovery: Math.round(Math.max(0, paid - earned) * 100) / 100 };
}

function milestoneOrder(payment: Payment): number | null {
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

function paymentSequenceGroup(payment: Payment): string | null {
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

function paymentFollowupTitle(payment: Payment): string {
    return `Payment follow-up · ${payment.customer_name || "Customer"} · ${payment.milestone_label || formatINR(payment.amount || 0)}`;
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
        assigned_staff_id: activeStaffIdForRole(state.db, ["Accounts / Admin", "Finance"]),
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
function canonicalPaymentEvent(value?: string) {
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

interface WorkOrderPnLResult {
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
    const invoices = db.invoices.filter((invoice) => invoice.work_order_id === workOrderId && isRecognizedInvoice(invoice));
    const invoiced = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0);
    const collected = db.customerReceipts
        .filter((receipt) => receipt.work_order_id === workOrderId)
        .reduce((sum, receipt) => sum + receipt.amount, 0);
    const receivable = invoiceFinancialSummary(invoices).receivable;
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

/** Job costs roll up from Work Orders; site invoices/receipts can precede an award. */
export function computeSitePnLsFromCostLines(db: RDashDatabase, siteId: string) {
    const siteWorkOrders = db.workOrders.filter((wo) => wo.site_id === siteId);
    const workOrderPnLs = siteWorkOrders
        .map((wo) => computeWorkOrderPnL(db, wo.id))
        .filter((row): row is WorkOrderPnLResult => Boolean(row));
    const totalCost = workOrderPnLs.reduce((sum, p) => sum + p.total_cost, 0);
    const acceptedValue = db.acceptedScopes
        .filter((scope) => scope.site_id === siteId && scope.status !== "cancelled")
        .reduce((sum, scope) => sum + scope.accepted_value, 0);
    const invoices = db.invoices.filter((invoice) => invoice.site_id === siteId && isRecognizedInvoice(invoice));
    const receipts = db.customerReceipts.filter((receipt) => receipt.site_id === siteId);
    return {
        accepted_value: acceptedValue,
        invoiced: invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0),
        collected: receipts.reduce((sum, receipt) => sum + receipt.amount, 0),
        receivable: invoiceFinancialSummary(invoices).receivable,
        material_cost: workOrderPnLs.reduce((sum, p) => sum + p.material_cost, 0),
        contractor_cost: workOrderPnLs.reduce((sum, p) => sum + p.contractor_cost, 0),
        labour_cost: workOrderPnLs.reduce((sum, p) => sum + p.labour_cost, 0),
        overhead_cost: workOrderPnLs.reduce((sum, p) => sum + p.overhead_cost, 0),
        total_cost: totalCost,
        gross_margin: acceptedValue - totalCost,
        work_order_pnls: workOrderPnLs,
    };
}
