import type { RDashDatabase } from "./types";
import { indiaDate } from "./date";
import { allJobPnLs } from "./store/selectors";

/** Open invoice balances, on the same Indian business day in every browser. */
export function agingInvoiceRows(db: RDashDatabase, now: Date = new Date()) {
    const today = Date.parse(indiaDate(now));
    return db.invoices.filter(i => ["issued", "overdue", "partial"].includes(i.status) && i.balance_amount > 0)
        .map(i => {
            const due = Date.parse(i.due_date?.slice(0, 10));
            return { ...i, daysOverdue: Number.isFinite(due) ? Math.floor((today - due) / 86400000) : 0 };
        });
}

/** Screen sources and all export formats share invoice, receipt and P&L identities. */
export function sharedReportExport(db: RDashDatabase, id: "agingReportRep" | "collectionReport" | "jobPnlReport", now = new Date()) {
    if (id === "agingReportRep") return {
        headers: ["Invoice No", "Customer", "Balance INR", "Status", "Due Date", "Days Overdue"],
        rows: agingInvoiceRows(db, now).map(i => [i.invoice_no, i.customer_name || db.customers.find(c => c.id === i.customer_id)?.name || "Customer", String(i.balance_amount), i.status, i.due_date || "", String(Math.max(0, i.daysOverdue))]),
    };
    if (id === "collectionReport") return {
        headers: ["Receipt No", "Customer", "Invoice ID", "Amount INR", "Mode", "Received At", "Reference"],
        rows: db.customerReceipts.map(r => [r.receipt_no, db.customers.find(c => c.id === r.customer_id)?.name || "Customer", r.invoice_id || "", String(r.amount), r.mode || "Unknown", r.received_at, r.reference || ""]),
    };
    return {
        headers: ["WorkOrder No", "Customer", "Contracted revenue INR", "Invoiced INR", "Collected INR", "Receivable INR", "Total cost INR", "Gross margin INR", "Margin %"],
        rows: allJobPnLs(db).map(p => [p.work_order_no, p.customer_name || "Customer", String(p.contracted_revenue), String(p.invoiced), String(p.collected), String(p.receivable), String(p.total_cost), String(p.gross_margin), String(p.margin_pct)]),
    };
}
