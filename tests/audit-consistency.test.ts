import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { agingInvoiceRows, sharedReportExport } from "../src/lib/rdash/report-data";
import { applyReportFilter } from "../src/lib/rdash/report-scope";
import { commissionSummary, contractorExposureRows, vendorExposureRows, allJobPnLs } from "../src/lib/rdash/store/selectors";

describe("audit shared business truth", () => {
    test("ageing exports remaining partial invoice debt, excludes schedules and uses Indian due dates", () => {
        const db = buildSeedDatabase();
        db.invoices = [
            { id: "partial", invoice_no: "I1", status: "partial", balance_amount: 60, due_date: "2026-10-30" },
            { id: "draft", status: "draft", balance_amount: 500 },
            { id: "cancelled", status: "cancelled", balance_amount: 900 },
            { id: "zero", status: "issued", balance_amount: 0 },
        ] as never;
        db.payments = [{ id: "schedule", status: "pending", amount: 100 }] as never;
        const now = new Date("2026-10-30T20:00:00Z"); // 31 October in India
        const rows = agingInvoiceRows(db, now);
        expect(rows.map(i => [i.id, i.balance_amount, i.daysOverdue])).toEqual([["partial", 60, 1]]);
        expect(sharedReportExport(db, "agingReportRep", now).rows[0]).toEqual(["I1", "Customer", "60", "partial", "2026-10-30", "1"]);
    });
    test("collections export actual receipts rather than unpaid obligations", () => {
        const db = buildSeedDatabase();
        db.customerReceipts = [{ receipt_no: "R1", invoice_id: "I1", amount: 40, mode: "upi", received_at: "2026-10-30" }] as never;
        db.payments = [{ amount: 1000, status: "pending" }] as never;
        expect(sharedReportExport(db, "collectionReport").rows).toEqual([["R1", "Customer", "I1", "40", "upi", "2026-10-30", ""]]);
    });
    test("P&L export contains canonical revenue, cost and margins for every displayed job", () => {
        const db = buildSeedDatabase();
        const before = JSON.stringify(db);
        const projection = sharedReportExport(db, "jobPnlReport");
        expect(projection.rows.length).toBeGreaterThan(0);
        expect(projection.rows).toEqual(allJobPnLs(db).map(p => [p.work_order_no, p.customer_name, String(p.contracted_revenue), String(p.invoiced), String(p.collected), String(p.receivable), String(p.total_cost), String(p.gross_margin), String(p.margin_pct)]));
        expect(JSON.stringify(db)).toBe(before);
    });
    test("customer/job lead scope intersects filters and fails closed for unknown jobs", () => {
        const db = buildSeedDatabase();
        db.workOrders = [{ id: "j1", customer_id: "c1", work_required_ids: ["w1"] }, { id: "j2", customer_id: "c2", work_required_ids: ["w2"] }] as never;
        db.workRequired = [{ id: "w1", customer_id: "c1" }, { id: "w2", customer_id: "c2" }, { id: "w3", customer_id: "c1" }] as never;
        expect(applyReportFilter(db, { customerId: "c1" }).workRequired.map(w => w.id)).toEqual(["w1", "w3"]);
        expect(applyReportFilter(db, { workOrderId: "j1" }).workRequired.map(w => w.id)).toEqual(["w1"]);
        expect(applyReportFilter(db, { customerId: "c2", workOrderId: "j1" }).workRequired).toEqual([]);
        expect(applyReportFilter(db, { workOrderId: "missing" }).workRequired).toEqual([]);
        expect(applyReportFilter(db, null)).toBe(db);
    });
    test("cancelled commissions retain history but never increase referral dues", () => {
        const commissions = [{ status: "accrued", amount: 10 }, { status: "payable", amount: 20 }, { status: "paid", amount: 40 }, { status: "cancelled", amount: 500 }] as never;
        expect(commissionSummary(commissions)).toMatchObject({ outstanding: 30, paidAmount: 40, total: 70 });
        expect(commissions).toHaveLength(4);
    });
    test("partner export balances ignore stale master totals and count current active jobs", () => {
        const db = buildSeedDatabase();
        db.master.vendors = [{ id: "v", outstanding: 999 }] as never;
        db.master.contractors = [{ id: "c", outstanding: 888, active_jobs: 99 }] as never;
        db.vendorBills = [{ vendor_id: "v", status: "approved", balance_amount: 70 }] as never;
        db.contractorBills = [{ id: "b", contractor_id: "c", status: "approved", amount: 100 }] as never;
        db.contractorPayments = [{ contractor_id: "c", contractor_bill_id: "b", status: "paid", amount: 40 }] as never;
        db.workOrders = [{ contractor_id: "c", status: "in_progress" }, { contractor_id: "c", status: "completed" }, { contractor_id: "other", status: "scheduled" }] as never;
        expect(vendorExposureRows(db)[0].outstanding).toBe(70);
        expect(contractorExposureRows(db)[0]).toMatchObject({ outstanding: 60, active_jobs: 1 });
        expect(db.master.contractors[0]).toMatchObject({ outstanding: 888, active_jobs: 99 });
    });
});
