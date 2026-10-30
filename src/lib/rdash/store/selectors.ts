import type { RDashDatabase } from "../types";
import { customerNameForJob } from "../customer";
import { computeWorkOrderPnL, computeSitePnLsFromCostLines } from "./finance-helpers";
import { latestQuotationRevisions } from "../metrics";

// G: computeJobPnL now delegates to the canonical `computeWorkOrderPnL`
// helper in finance-helpers.ts. The two other P&L formulas
// (`siteFinancials` here and `computeSitePnLs` in SiteProfitabilityModule)
// also delegate to the same helper so every module shows the same margin
// for the same site / work order.
export function computeJobPnL(db: RDashDatabase, workOrderId: string): import("../types").WorkOrderPnL | null {
    const result = computeWorkOrderPnL(db, workOrderId);
    if (!result)
        return null;
    return {
        work_order_id: result.work_order_id,
        customer_name: result.customer_name || customerNameForJob(db, result.work_order_id),
        work_order_no: result.work_order_no,
        site_id: result.site_id || "",  // STAGE-6-FIX: string | undefined → string
        contracted_revenue: result.contracted_revenue,
        invoiced: result.invoiced,
        collected: result.collected,
        receivable: result.receivable,
        material_cost: result.material_cost,
        labour_cost: result.labour_cost,
        contractor_cost: result.contractor_cost,
        overhead_cost: result.overhead_cost,
        total_cost: result.total_cost,
        gross_margin: result.gross_margin,
        margin_pct: result.margin_pct,
    };
}

export function allJobPnLs(db: RDashDatabase): import("../types").WorkOrderPnL[] {
    return db.workOrders
        .map((workOrder) => computeJobPnL(db, workOrder.id))
        .filter((row): row is import("../types").WorkOrderPnL => Boolean(row));
}

export function vendorBalance(db: RDashDatabase, vendorId: string) {
    const bills = db.vendorBills.filter((bill) => bill.vendor_id === vendorId);
    const payableBills = bills.filter((bill) => bill.status === "approved" ||
        bill.status === "partly_paid" ||
        bill.status === "paid");
    const outstanding = payableBills.reduce((sum, bill) => sum + bill.balance_amount, 0);
    return {
        outstanding,
        bills: bills.length,
        unpaid: payableBills.filter((bill) => bill.balance_amount > 0).length,
    };
}

/** One read-only projection for vendor screens and all export formats. */
export function vendorExposureRows(db: RDashDatabase) {
    return db.master.vendors.map(vendor => {
        const balance = vendorBalance(db, vendor.id);
        return { ...vendor, outstanding: balance.outstanding, billCount: balance.bills,
            unpaid: balance.unpaid, onTimePct: vendor.on_time_pct || 0,
            reliability: vendor.reliability_score || 0 };
    }).sort((a, b) => b.outstanding - a.outstanding);
}

/** Tax report detail and totals share the same document/status selection. */
export function taxReportProjection(db: RDashDatabase) {
    const rows = [
        ...db.invoices.filter(invoice => invoice.status !== "cancelled").map(invoice => ({
            kind: "Customer invoice", documentNo: invoice.invoice_no,
            party: invoice.customer_name || "Customer", outputTax: invoice.tax_amount,
            inputTax: 0, status: invoice.status,
        })),
        ...db.vendorBills.filter(bill => ["approved", "partly_paid", "paid"].includes(bill.status)).map(bill => ({
            kind: "Vendor bill", documentNo: bill.bill_no,
            party: bill.vendor_name || "Vendor", outputTax: 0,
            inputTax: bill.tax_amount || 0, status: bill.status,
        })),
    ];
    const outputTax = rows.reduce((sum, row) => sum + row.outputTax, 0);
    const inputTax = rows.reduce((sum, row) => sum + row.inputTax, 0);
    return { rows, outputTax, inputTax, netTax: outputTax - inputTax };
}

export function customerBalance(db: RDashDatabase, customerId: string) {
    const invoices = db.invoices.filter((invoice) => invoice.customer_id === customerId && invoice.status !== "cancelled");
    const receivable = invoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0);
    const received = db.customerReceipts
        .filter((receipt) => receipt.customer_id === customerId)
        .reduce((sum, receipt) => sum + receipt.amount, 0);
    return { receivable, received, total: receivable + received };
}

export function siteFinancials(db: RDashDatabase, siteId: string) {
    const siteQuotes = latestQuotationRevisions(db.quotations.filter((quotation) => quotation.site_id === siteId));
    const quoted = siteQuotes
        .filter((quotation) => quotation.status !== "cancelled")
        .reduce((sum, quotation) => sum + quotation.total_amount, 0);
    const acceptedScopes = db.acceptedScopes.filter((scope) => scope.site_id === siteId && scope.status !== "cancelled");
    const contracted = acceptedScopes.reduce((sum, scope) => sum + scope.accepted_value, 0);
    // G: roll up per-work-order P&L via the canonical computeWorkOrderPnL
    // helper so this view agrees with JobPnLModule and SiteProfitabilityModule.
    const siteWorkOrders = db.workOrders.filter((workOrder) => workOrder.site_id === siteId);
    const workOrderIds = new Set(siteWorkOrders.map((workOrder) => workOrder.id));
    const sitePnL = computeSitePnLsFromCostLines(db, siteId);
    const materialCost = sitePnL.material_cost;
    const contractorCost = sitePnL.contractor_cost;
    const labourCost = sitePnL.labour_cost;
    const overheadCost = sitePnL.overhead_cost;
    const totalCost = sitePnL.total_cost;
    const invoiced = sitePnL.invoiced;
    const collected = sitePnL.collected;
    const receivable = sitePnL.receivable;
    const vendorBills = db.vendorBills.filter((bill) => bill.site_id === siteId &&
        bill.status !== "draft" &&
        bill.status !== "disputed" &&
        bill.status !== "pending_approval");
    const contractorBills = db.contractorBills.filter((bill) => bill.site_id === siteId && bill.status !== "held");
    const vendorPayable = vendorBills.reduce((sum, bill) => sum + bill.balance_amount, 0);
    const contractorPayable = [...new Set(contractorBills.map(b => b.contractor_id))].reduce((sum, id) => sum + contractorOutstanding(db, id, siteId), 0);
    const paidToVendors = db.vendorPayments
        .filter((payment) => payment.site_id === siteId && payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);
    const paidToContractors = db.contractorPayments
        .filter((payment) => payment.site_id === siteId && payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0);
    return {
        quoted,
        contracted,
        invoiced,
        collected,
        receivable,
        materialCost,
        contractorCost,
        labourCost,
        overheadCost,
        totalCost,
        grossMargin: contracted - totalCost,
        vendorPayable,
        contractorPayable,
        paidToVendors,
        paidToContractors,
        payments: db.payments.filter((payment) => payment.site_id === siteId),
        receipts: db.customerReceipts.filter((receipt) => receipt.site_id === siteId),
        quotations: siteQuotes,
        workOrders: siteWorkOrders,
        workOrderIds,
    };
}

export function contractorSettlements(db: RDashDatabase, contractorId: string) {
    return db.contractorSettlements.filter((s) => s.contractor_id === contractorId);
}

export function contractorBids(db: RDashDatabase, contractorId: string) {
    return db.contractorBids.filter((b) => b.contractor_id === contractorId);
}

/** Settlements create a final bill; only recorded payments discharge a bill. */
export function contractorOutstanding(db: RDashDatabase, contractorId: string, siteId?: string): number {
    return Math.round(db.contractorBills.filter(b => b.contractor_id === contractorId && b.status !== "held" && (!siteId || b.site_id === siteId)).reduce((sum, bill) => {
        const paid = db.contractorPayments.filter(p => p.contractor_id === contractorId && p.contractor_bill_id === bill.id && p.status === "paid").reduce((n, p) => n + p.amount, 0);
        return sum + Math.max(0, bill.amount - paid);
    }, 0) * 100) / 100;
}

/**
 * Workspace-level outstanding = Σ contractorOutstanding across every
 * contractor. Used by ContractorPaymentsModule and FinanceOverviewModule
 * which show workspace-wide totals (not per-contractor rows).
 */
export function contractorOutstandingTotal(db: RDashDatabase): number {
    const contractorIds = new Set(db.contractorBills.map((bill) => bill.contractor_id));
    return Math.round([...contractorIds]
        .reduce((sum, contractorId) => sum + contractorOutstanding(db, contractorId), 0) * 100) / 100;
}

export function inventoryValuation(db: RDashDatabase) {
    return db.inventory.reduce((n, i) => n + i.quantity * (i.rate || 0), 0);
}

/** Current financial projection; persisted master counters are historical hints. */
export function contractorExposureRows(db: RDashDatabase) {
    return db.master.contractors.map(contractor => ({ ...contractor,
        outstanding: contractorOutstanding(db, contractor.id),
        active_jobs: db.workOrders.filter(w => w.contractor_id === contractor.id &&
            ["scheduled", "in_progress", "on_hold"].includes(w.status)).length,
    }));
}

export function commissionSummary(commissions: RDashDatabase["commissions"]) {
    const accrued = commissions.filter(c => c.status === "accrued" || c.status === "payable");
    const paid = commissions.filter(c => c.status === "paid");
    const outstanding = accrued.reduce((sum, c) => sum + c.amount, 0);
    const paidAmount = paid.reduce((sum, c) => sum + c.amount, 0);
    return { accrued, paid, outstanding, paidAmount, total: outstanding + paidAmount };
}
