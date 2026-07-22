import type { RDashDatabase } from "../types";
import { customerNameForJob } from "../customer";
import { computeWorkOrderPnL, computeSitePnLsFromCostLines } from "./finance-helpers";

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
        site_id: result.site_id,
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

export function customerBalance(db: RDashDatabase, customerId: string) {
    const invoices = db.invoices.filter((invoice) => invoice.customer_id === customerId && invoice.status !== "cancelled");
    const receivable = invoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0);
    const received = db.customerReceipts
        .filter((receipt) => receipt.customer_id === customerId)
        .reduce((sum, receipt) => sum + receipt.amount, 0);
    return { receivable, received, total: receivable + received };
}

export function siteFinancials(db: RDashDatabase, siteId: string) {
    const siteQuotes = db.quotations.filter((quotation) => quotation.site_id === siteId);
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
    const invoices = db.invoices.filter((invoice) => invoice.site_id === siteId && invoice.status !== "cancelled");
    const invoiced = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0);
    const collected = sitePnL.collected;
    const receivable = sitePnL.receivable;
    const vendorBills = db.vendorBills.filter((bill) => bill.site_id === siteId &&
        bill.status !== "draft" &&
        bill.status !== "disputed" &&
        bill.status !== "pending_approval");
    const contractorBills = db.contractorBills.filter((bill) => bill.site_id === siteId && bill.status !== "held");
    const vendorPayable = vendorBills.reduce((sum, bill) => sum + bill.balance_amount, 0);
    const contractorPayable = contractorBills.reduce((sum, bill) => sum + bill.balance_amount, 0);
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

export function jobBids(db: RDashDatabase, workOrderId: string) {
    return db.contractorBids
        .filter((b) => b.work_order_id === workOrderId)
        .sort((a, b) => (a.quote_amount || 0) - (b.quote_amount || 0));
}

export function contractorSettlements(db: RDashDatabase, contractorId: string) {
    return db.contractorSettlements.filter((s) => s.contractor_id === contractorId);
}

export function contractorBids(db: RDashDatabase, contractorId: string) {
    return db.contractorBids.filter((b) => b.contractor_id === contractorId);
}

/**
 * FIX-CONTRACTOR-BATCH1 / F.4: Single source of truth for a contractor's
 * outstanding (payable) balance.
 *
 * Formula: max(0, total_billed − total_paid − total_settled)
 *   - total_billed  = Σ bill.amount for non-held contractor bills
 *   - total_paid    = Σ payment.amount for paid contractor payments
 *                     (bill.paid_amount is updated only when recordContractorPayment
 *                     runs, so summing paid payments gives the same number but is
 *                     robust against any bill.paid_amount drift.)
 *   - total_settled = Σ settlement.payable_amount for this contractor
 *                     (abandonment / mutual-termination settlements are a
 *                     separate payment path that bypasses RA bills — they
 *                     must be subtracted too or a settled-and-abandoned
 *                     contractor would still show an "outstanding" balance
 *                     equal to the unpaid portion of their old RA bills.)
 *
 * This replaces four divergent inline computations:
 *   - ContractorDetailModule (read dead `c.outstanding` master field → always 0)
 *   - ContractorPerformanceModule (billed − ALL payments, counted pending/approved as paid)
 *   - ContractorPaymentsModule (CV-7 formula: bill balances − committed payments)
 *   - FinanceOverviewModule (sum of bill balances, no committed subtraction)
 *
 * BREAKAGE CHECK: Signature `(db, contractorId) → number` works for all 4
 * call sites — per-contractor modules pass a single id; workspace-level
 * modules sum across `db.master.contractors`.
 */
export function contractorOutstanding(db: RDashDatabase, contractorId: string): number {
    const totalBilled = db.contractorBills
        .filter((b) => b.contractor_id === contractorId && b.status !== "held")
        .reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalPaid = db.contractorPayments
        .filter((p) => p.contractor_id === contractorId && p.status === "paid")
        .reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalSettled = db.contractorSettlements
        .filter((s) => s.contractor_id === contractorId)
        .reduce((sum, s) => sum + (s.payable_amount || 0), 0);
    return Math.max(0, Math.round((totalBilled - totalPaid - totalSettled) * 100) / 100);
}

/**
 * Workspace-level outstanding = Σ contractorOutstanding across every
 * contractor. Used by ContractorPaymentsModule and FinanceOverviewModule
 * which show workspace-wide totals (not per-contractor rows).
 */
export function contractorOutstandingTotal(db: RDashDatabase): number {
    const totalBilled = db.contractorBills
        .filter((b) => b.status !== "held")
        .reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalPaid = db.contractorPayments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalSettled = db.contractorSettlements
        .reduce((sum, s) => sum + (s.payable_amount || 0), 0);
    return Math.max(0, Math.round((totalBilled - totalPaid - totalSettled) * 100) / 100);
}

export function inventoryValuation(db: RDashDatabase) {
    return db.inventory.reduce((n, i) => n + i.quantity * (i.rate || 0), 0);
}
