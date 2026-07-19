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

export function inventoryValuation(db: RDashDatabase) {
    return db.inventory.reduce((n, i) => n + i.quantity * (i.rate || 0), 0);
}
