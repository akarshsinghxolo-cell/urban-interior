import type { CustomerInvoice, CustomerReceipt } from "./types";
import { indiaDate } from "./date";

type InvoiceState = Pick<CustomerInvoice, "status">;
type InvoiceBalance = Pick<CustomerInvoice, "status" | "balance_amount" | "due_date">;

/** Input contracts for exact metrics; this list does not grant permission to read them. */
export const FINANCIAL_METRIC_SOURCES = {
    customer: ["invoices", "customerReceipts"],
    partnerPayables: ["vendorBills", "contractorBills", "contractorPayments"],
    site: ["sites", "quotations", "acceptedScopes", "workOrders", "workOrderCostLines", "invoices", "customerReceipts", "vendorBills", "vendorPayments", "contractorBills", "contractorPayments"],
    job: ["workOrders", "workOrderCostLines", "invoices", "customerReceipts"],
    tax: ["invoices", "vendorBills"],
    cash: ["customerReceipts", "vendorPayments", "contractorPayments", "payrollPeriods", "payrollLines", "commissions"],
} as const;

/** Drafts are previews; only issued documents contribute to billed money or tax. */
export function isRecognizedInvoice(invoice: InvoiceState): boolean {
    return ["issued", "partial", "overdue", "paid"].includes(invoice.status);
}

export function isOpenInvoice(invoice: Pick<CustomerInvoice, "status" | "balance_amount">): boolean {
    return ["issued", "partial", "overdue"].includes(invoice.status) && invoice.balance_amount > 0;
}

/** Date-only dues stay date-only; timestamps resolve to the Indian business day. */
export function invoiceDaysOverdue(dueDate: string | undefined, now: Date | string = new Date()): number {
    const due = dueDate ? indiaDate(dueDate) : "";
    return due ? Math.floor((Date.parse(indiaDate(now)) - Date.parse(due)) / 86_400_000) : 0;
}

export function invoiceAgingRows<T extends InvoiceBalance>(invoices: T[], now: Date | string = new Date()) {
    return invoices.filter(isOpenInvoice).map(invoice => ({
        ...invoice, daysOverdue: invoiceDaysOverdue(invoice.due_date, now),
    }));
}

export function invoiceFinancialSummary(invoices: CustomerInvoice[]) {
    const recognized = invoices.filter(isRecognizedInvoice);
    return {
        invoiced: recognized.reduce((sum, invoice) => sum + invoice.total_amount, 0),
        receivable: invoices.filter(isOpenInvoice).reduce((sum, invoice) => sum + invoice.balance_amount, 0),
        tax: recognized.reduce((sum, invoice) => sum + invoice.tax_amount, 0),
    };
}

/** Recorded receipts are the sole source of collected cash, including advances. */
export function customerFinancialSummary(invoices: CustomerInvoice[], receipts: CustomerReceipt[]) {
    return { ...invoiceFinancialSummary(invoices), collected: receipts.reduce((sum, receipt) => sum + receipt.amount, 0) };
}

export function receivableAgingBuckets(invoices: InvoiceBalance[], now: Date | string = new Date()) {
    const aging = {
        notDue: { amount: 0, count: 0 }, d1_30: { amount: 0, count: 0 },
        d31_60: { amount: 0, count: 0 }, d61_90: { amount: 0, count: 0 },
        d90plus: { amount: 0, count: 0 }, total: { amount: 0, count: 0 },
    };
    for (const invoice of invoiceAgingRows(invoices, now)) {
        const days = invoice.daysOverdue;
        const bucket = days <= 0 ? aging.notDue : days <= 30 ? aging.d1_30
            : days <= 60 ? aging.d31_60 : days <= 90 ? aging.d61_90 : aging.d90plus;
        bucket.amount += invoice.balance_amount;
        bucket.count++;
        aging.total.amount += invoice.balance_amount;
        aging.total.count++;
    }
    return aging;
}
