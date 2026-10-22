import type { Customer, RDashDatabase } from "./types";
import { formatINR } from "./format";
import { isCustomerLinked } from "./customer-relations";
import { customerConversationThreadRecordId } from "./thread-record-id";
import { indianPhoneSearchDigits } from "./phone-validation";

/**
 * Customer Desk list search, shared by both list views.
 *
 * Matches, case-insensitively:
 *  - customer name
 *  - customer email (was not searchable before)
 *  - phone / whatsapp / alternate phone with human formats: "+91 ", "0",
 *    spaces and punctuation are normalized on BOTH sides (was a raw
 *    `phone.includes(q)` before, so "+91…" and "98765 43210" never matched)
 *  - site name / address / locality / city / building name
 *
 * A query with fewer than 3 digits skips the phone branch so short text
 * queries cannot digit-match accidentally.
 */
export function customerMatchesQuery(db: RDashDatabase, customer: Customer, rawQuery: string): boolean {
    const q = rawQuery.trim().toLowerCase();
    if (!q)
        return true;
    if (customer.name.toLowerCase().includes(q))
        return true;
    if (String(customer.email || "").toLowerCase().includes(q))
        return true;
    const qDigits = indianPhoneSearchDigits(q);
    if (qDigits.length >= 3) {
        const phones = [customer.phone, customer.whatsapp, customer.alternate_phone];
        if (phones.some((phone) => indianPhoneSearchDigits(phone).includes(qDigits)))
            return true;
    }
    return db.sites.some((site) => site.customer_id === customer.id &&
        [site.name, site.address, site.locality, site.city, site.building_name].filter(Boolean).join(" ").toLowerCase().includes(q));
}

export type CustomerPendingAction = {
    key: "site" | "visit" | "measurement" | "quotation" | "budget";
    label: string;
    hint: string;
};

/**
 * Sales-lifecycle gaps for a customer, derived from the same data the
 * drawer's progress hint talks about. This is the fix for the "Pending
 * actions · 0 — fully actioned" contradiction: the section previously
 * counted open TASKS only, so a lead with no visit, no measurement, no
 * quotation and no budget claimed to be "fully actioned" one line below
 * the "plan a visit" hint.
 *
 * Only customers with active (non lost/completed) work produce gaps.
 */
export function customerLifecycleGaps(db: RDashDatabase, customerId: string): CustomerPendingAction[] {
    const activeWork = db.workRequired.filter((work) => work.customer_id === customerId && work.status !== "lost" && work.status !== "completed");
    if (!activeWork.length)
        return [];
    const gaps: CustomerPendingAction[] = [];
    if (!db.sites.some((site) => site.customer_id === customerId))
        gaps.push({ key: "site", label: "Add site", hint: "Visits and measurements need a site" });
    if (!db.visits.some((visit) => visit.customer_id === customerId && visit.status !== "cancelled"))
        gaps.push({ key: "visit", label: "Plan first visit", hint: "No site visit has been scheduled yet" });
    const siteIds = new Set(db.sites.filter((site) => site.customer_id === customerId).map((site) => site.id));
    const unmeasured = db.areas.filter((area) => siteIds.has(area.site_id) && area.stage === "unmeasured").length;
    if (unmeasured > 0)
        gaps.push({ key: "measurement", label: unmeasured === 1 ? "Capture measurement" : `Capture measurements (${unmeasured} areas)`, hint: "Unmeasured areas block quotations" });
    if (!db.quotations.some((quote) => quote.customer_id === customerId && quote.status !== "cancelled"))
        gaps.push({ key: "quotation", label: "Draft quotation", hint: "No quotation prepared for the captured scope" });
    const missingBudget = activeWork.filter((work) => !(work.budget && work.budget > 0)).length;
    if (missingBudget > 0)
        gaps.push({ key: "budget", label: missingBudget === 1 ? "Set budget (1 work item)" : `Set budget (${missingBudget} work items)`, hint: "Budgets power the pipeline value" });
    return gaps;
}

export type CustomerHistoryEntry = {
    id: string;
    ts: string;
    kind: string;
    title: string;
    detail?: string;
};

/** One customer history source for the profile count, feed and team notes. */
export function customerHistoryEntries(db: RDashDatabase, customerId: string): CustomerHistoryEntry[] {
    const customer = db.customers.find((row) => row.id === customerId);
    if (!customer)
        return [];
    const workOrders = db.workOrders.filter((row) => row.customer_id === customerId);
    const sites = db.sites.filter((row) => row.customer_id === customerId);
    const quotations = db.quotations.filter((row) => row.customer_id === customerId);
    const payments = db.payments.filter((row) => row.customer_id === customerId);
    const invoices = db.invoices.filter((row) => row.customer_id === customerId);
    const receipts = db.customerReceipts.filter((row) => row.customer_id === customerId);
    const visits = db.visits.filter((row) => row.customer_id === customerId);
    const tasks = db.tasks.filter((row) => isCustomerLinked(db, row, customerId));
    const workOrderIds = new Set(workOrders.map((row) => row.id));
    const siteIds = new Set(sites.map((row) => row.id));
    const drawings = db.drawings.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id));
    const executionLogs = db.executionLogs.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id));
    const purchaseOrders = db.purchaseOrders.filter((row) => (row.site_id && siteIds.has(row.site_id)) || (row.work_order_id && workOrderIds.has(row.work_order_id)));
    const grns = db.grns.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id));
    const vendorBills = db.vendorBills.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id));
    const relatedIds = new Set([
        customerId,
        ...workOrders.map((row) => row.id),
        ...sites.map((row) => row.id),
        ...quotations.map((row) => row.id),
        ...payments.map((row) => row.id),
        ...invoices.map((row) => row.id),
        ...receipts.map((row) => row.id),
        ...visits.map((row) => row.id),
        ...tasks.map((row) => row.id),
        ...drawings.map((row) => row.id),
        ...executionLogs.map((row) => row.id),
        ...purchaseOrders.map((row) => row.id),
        ...grns.map((row) => row.id),
        ...vendorBills.map((row) => row.id),
    ]);
    const customerThreadRecordId = customerConversationThreadRecordId(customerId);
    const notes = db.threads
        .filter((thread) => thread.record_id === customerThreadRecordId || relatedIds.has(thread.record_id))
        .flatMap((thread) => thread.messages
            .filter((message) => !message.related_audit_id && message.kind !== "system" && !(message.kind === "alert" && message.related_thread_id))
            .map((message) => ({
                id: `note-${message.id}`,
                ts: message.created_at,
                kind: "note",
                title: `${message.author_name} · ${message.kind}`,
                detail: message.body,
            })));

    return [
        ...tasks.map((row) => ({ id: `task-${row.id}`, ts: row.updated_at || row.created_at, kind: "task", title: row.title, detail: row.status })),
        ...quotations.map((row) => ({ id: `quotation-${row.id}`, ts: row.updated_at || row.created_at, kind: "quotation", title: row.quotation_no, detail: row.status })),
        ...payments.map((row) => ({ id: `payment-${row.id}`, ts: row.updated_at || row.created_at, kind: "money expected", title: row.milestone_label || "Payment milestone", detail: `${formatINR(row.amount)} expected · ${row.status}` })),
        ...invoices.map((row) => ({ id: `invoice-${row.id}`, ts: row.updated_at || row.created_at, kind: "invoice", title: row.invoice_no, detail: `${formatINR(row.total_amount)} invoiced · ${formatINR(row.paid_amount)} received · ${formatINR(row.balance_amount)} outstanding` })),
        ...receipts.map((row) => ({ id: `receipt-${row.id}`, ts: row.received_at || row.created_at, kind: "money received", title: row.receipt_no, detail: `${formatINR(row.amount)} received · ${row.mode}${row.reference ? ` · ${row.reference}` : ""}` })),
        ...visits.map((row) => ({ id: `visit-${row.id}`, ts: row.updated_at || row.created_at, kind: "visit", title: row.location_name, detail: row.status })),
        ...drawings.map((row) => ({ id: `drawing-${row.id}`, ts: row.updated_at || row.created_at, kind: "drawing", title: row.title || "Drawing", detail: row.status })),
        ...executionLogs.map((row) => ({ id: `execution-${row.id}`, ts: row.created_at, kind: "execution", title: row.log_no || "Execution update", detail: row.work_order_no })),
        ...purchaseOrders.map((row) => ({ id: `po-${row.id}`, ts: row.updated_at || row.created_at, kind: "purchase order", title: row.po_no, detail: row.status })),
        ...grns.map((row) => ({ id: `grn-${row.id}`, ts: row.updated_at || row.created_at, kind: "goods receipt", title: row.grn_no, detail: row.status })),
        ...vendorBills.map((row) => ({ id: `vendorBill-${row.id}`, ts: row.updated_at || row.created_at, kind: "vendor bill", title: row.bill_no, detail: row.status })),
        ...db.commSends.filter((row) => row.customer_id === customerId).map((row) => ({ id: `communication-${row.id}`, ts: row.sent_at, kind: "communication", title: row.subject || row.channel, detail: row.status })),
        ...db.auditLog.filter((row) => row.customer_id === customerId || isCustomerLinked(db, row, customerId)).map((row) => ({ id: `audit-${row.id}`, ts: row.timestamp, kind: "audit", title: row.action, detail: row.entity_label })),
        ...notes,
    ].filter((entry) => Boolean(entry.ts)).sort((a, b) => b.ts.localeCompare(a.ts));
}
