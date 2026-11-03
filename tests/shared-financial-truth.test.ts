import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { customerFinancialSummary, invoiceAgingRows, receivableAgingBuckets, FINANCIAL_METRIC_SOURCES } from "../src/lib/rdash/financial-projections";
import { collectionsForWorkspaceReadTarget, workspaceModuleReadPlan } from "../src/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";
import { customerBalance, siteFinancials, taxReportProjection, contractorOutstanding } from "../src/lib/rdash/store/selectors";
import { cashFlowForecast, computeWorkOrderPnL } from "../src/lib/rdash/store/finance-helpers";
import { computeSitePnLs } from "../src/components/rdash/modules/SiteProfitabilityModule";
import { applyReportFilter } from "../src/lib/rdash/report-scope";
import { agingInvoiceRows, monthlyReceiptTotals } from "../src/lib/rdash/report-data";

function fixture() {
    const db = buildSeedDatabase();
    Object.assign(db, { invoices: [], payments: [], customerReceipts: [], vendorBills: [], vendorPayments: [],
        contractorBills: [], contractorPayments: [], commissions: [], payrollPeriods: [], payrollLines: [],
        workOrderCostLines: [], quotations: [], acceptedScopes: [], purchaseOrders: [], grns: [] });
    db.customers = [{ id: "c", name: "Customer" }] as never;
    db.sites = [{ id: "site", customer_id: "c", name: "Site" }] as never;
    db.workOrders = [{ id: "job", customer_id: "c", site_id: "site", value: 1000 }] as never;
    db.invoices = ["draft", "issued", "partial", "paid", "overdue", "cancelled"].map((status, index) => ({
        id: status, invoice_no: status, status, customer_id: "c", site_id: "site", work_order_id: "job",
        total_amount: 100, tax_amount: 10, balance_amount: status === "paid" ? 0 : 60,
        due_date: "2026-10-30", title: String(index),
    })) as never;
    db.customerReceipts = [{ id: "receipt", customer_id: "c", site_id: "site", work_order_id: "job", amount: 40, received_at: "2026-10-30T19:00:00Z" }] as never;
    return db;
}

describe("shared financial facts", () => {
    test("each financial consumer declares complete sources for its exact metrics", () => {
        const modules: Record<string, Array<keyof typeof FINANCIAL_METRIC_SOURCES>> = {
            financeDesk: ["customer", "partnerPayables", "site", "cash"],
            profitability: ["site", "job"], financialAnalytics: ["job", "tax"],
            collectionAnalytics: ["customer"], customerDesk: ["site", "customer"],
            workdesk: ["customer", "partnerPayables", "cash"],
        };
        for (const [moduleId, metrics] of Object.entries(modules)) {
            const target = workspaceReadTargetForModule(moduleId), plan = workspaceModuleReadPlan(target);
            const sources = collectionsForWorkspaceReadTarget(target);
            for (const metric of metrics) for (const collection of FINANCIAL_METRIC_SOURCES[metric]) {
                expect(sources, `${moduleId}.${metric}`).toContain(collection);
                expect(plan.limitsByCollection?.[collection], `${moduleId}.${collection}`).toBeUndefined();
            }
        }
    });
    test("draft/cancelled history stays available without increasing billed money, dues, tax or forecast", () => {
        const db = fixture(), before = JSON.stringify(db);
        expect(customerFinancialSummary(db.invoices, db.customerReceipts)).toEqual({ invoiced: 400, receivable: 180, tax: 40, collected: 40 });
        expect(customerBalance(db, "c")).toMatchObject({ receivable: 180, received: 40 });
        expect(taxReportProjection(db)).toMatchObject({ outputTax: 40 });
        expect(computeWorkOrderPnL(db, "job")).toMatchObject({ invoiced: 400, receivable: 180, collected: 40 });
        expect(siteFinancials(db, "site")).toMatchObject({ invoiced: 400, receivable: 180, collected: 40 });
        expect(cashFlowForecast(db, "2026-10-30").totals.inflow).toBe(220);
        expect(JSON.stringify(db)).toBe(before);
    });
    test("site screens include pre-award billing and use invoice debt instead of unbilled contract value", () => {
        const db = fixture();
        db.invoices[1].work_order_id = undefined;
        db.customerReceipts[0].work_order_id = undefined;
        db.acceptedScopes = [{ id: "scope", site_id: "site", customer_id: "c", status: "active", accepted_value: 1000 }] as never;
        const site = computeSitePnLs(db)[0];
        expect(site).toMatchObject({ accepted_value: 1000, invoiced_amount: 400, amount_received: 40, outstanding_receivable: 180 });
        expect(site.outstanding_receivable).toBe(siteFinancials(db, "site").receivable);
    });
    test("India midnight, timestamps and bucket boundaries agree in finance and reports", () => {
        const db = fixture();
        const before = new Date("2026-10-30T18:29:59Z"), after = new Date("2026-10-30T18:30:00Z");
        expect(agingInvoiceRows(db, before).every(row => row.daysOverdue === 0)).toBe(true);
        expect(agingInvoiceRows(db, after).every(row => row.daysOverdue === 1)).toBe(true);
        expect(receivableAgingBuckets(db.invoices, after).d1_30).toEqual({ amount: 180, count: 3 });
        const timestamp = [{ ...db.invoices[1], due_date: "2026-10-30T19:00:00Z" }];
        expect(invoiceAgingRows(timestamp, after)[0].daysOverdue).toBe(0);
        expect(monthlyReceiptTotals(db, 1, new Date("2026-11-01T00:00:00+05:30"))[0].value).toBe(0);
        db.customerReceipts[0].received_at = "2026-10-31T19:00:00Z";
        expect(monthlyReceiptTotals(db, 1, new Date("2026-11-01T00:00:00+05:30"))[0]).toMatchObject({ key: "2026-11", value: 40 });
    });
    test("unverified contractor bills and pending payment requests never change a verified payable", () => {
        const db = fixture();
        db.contractorBills = ["draft", "submitted", "disputed", "held", "approved"].map(status => ({ id: status, contractor_id: "contractor", status, amount: 100, balance_amount: 999, due_date: "2026-10-31" })) as never;
        db.contractorPayments = [{ contractor_id: "contractor", contractor_bill_id: "approved", amount: 40, status: "paid", paid_at: "2026-10-29" },
            { contractor_id: "contractor", contractor_bill_id: "approved", amount: 50, status: "pending" }] as never;
        expect(contractorOutstanding(db, "contractor")).toBe(60);
        expect(cashFlowForecast(db, "2026-10-30").totals.outflow).toBe(60);
    });
    test("customer scope follows supplier jobs/sites and PO/bill links; combined filters intersect", () => {
        const db = fixture();
        db.workOrders.push({ id: "other-job", customer_id: "other-c", site_id: "other-site" } as never);
        db.purchaseOrders = [{ id: "po", vendor_id: "v", work_order_id: "job" }, { id: "other-po", vendor_id: "v", work_order_id: "other-job" }] as never;
        db.vendorBills = [{ id: "bill", po_id: "po", vendor_id: "v", status: "approved", balance_amount: 70, tax_amount: 7 },
            { id: "other-bill", po_id: "other-po", vendor_id: "v", status: "approved", balance_amount: 900, tax_amount: 90 }] as never;
        db.vendorPayments = [{ id: "payment", vendor_bill_id: "bill", vendor_id: "v" }, { id: "other-payment", vendor_bill_id: "other-bill", vendor_id: "v" }] as never;
        const scoped = applyReportFilter(db, { customerId: "c", vendorId: "v" });
        expect(scoped.purchaseOrders.map(row => row.id)).toEqual(["po"]);
        expect(scoped.vendorBills.map(row => row.id)).toEqual(["bill"]);
        expect(scoped.vendorPayments.map(row => row.id)).toEqual(["payment"]);
        expect(taxReportProjection(scoped).inputTax).toBe(7);
        expect(applyReportFilter(db, { workOrderId: "missing" }).vendorBills).toEqual([]);
        expect(applyReportFilter(db, { customerId: "other-c", workOrderId: "job" }).purchaseOrders).toEqual([]);
    });
});
