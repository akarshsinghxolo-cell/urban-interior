import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { vendorExposureRows, taxReportProjection } from "../src/lib/rdash/store/selectors";

describe("shared vendor exposure", () => {
    test("ignores stale master totals and counts only payable bills without changing source records", () => {
        const db = buildSeedDatabase();
        db.master.vendors = [
            { id: "v1", name: "First", outstanding: 999999 },
            { id: "v2", name: "Second", outstanding: 888888 },
        ] as never;
        db.vendorBills = [
            { id: "b1", vendor_id: "v1", status: "approved", balance_amount: 100000 },
            { id: "b2", vendor_id: "v1", status: "partly_paid", balance_amount: 30000 },
            { id: "b3", vendor_id: "v1", status: "paid", balance_amount: 0 },
            { id: "b4", vendor_id: "v1", status: "draft", balance_amount: 900000 },
            { id: "b5", vendor_id: "v2", status: "approved", balance_amount: 200000 },
        ] as never;
        const before = JSON.stringify(db);
        expect(vendorExposureRows(db).map(v => [v.id, v.outstanding, v.unpaid, v.billCount]))
            .toEqual([["v2", 200000, 1, 1], ["v1", 130000, 2, 4]]);
        expect(JSON.stringify(db)).toBe(before);
        // The same projection accepts a report-scoped database.
        expect(vendorExposureRows({ ...db, vendorBills: db.vendorBills.filter(b => b.id === "b2") })
            .find(v => v.id === "v1")?.outstanding).toBe(30000);
        db.vendorBills[1].balance_amount = 10000;
        expect(vendorExposureRows(db).find(v => v.id === "v1")?.outstanding).toBe(110000);
    });
});

 test("tax detail and totals use invoices and approved bills, excluding quotes and cancelled documents", () => {
    const db = buildSeedDatabase();
    db.invoices = [
        { invoice_no: "INV1", status: "issued", tax_amount: 18000 },
        { invoice_no: "INV2", status: "cancelled", tax_amount: 90000 },
    ] as never;
    db.vendorBills = [
        { bill_no: "B1", status: "approved", tax_amount: 6000 },
        { bill_no: "B2", status: "partly_paid", tax_amount: 2000 },
        { bill_no: "B3", status: "pending_approval", tax_amount: 70000 },
        { bill_no: "B4", status: "disputed", tax_amount: 80000 },
    ] as never;
    const before = JSON.stringify(db);
    const result = taxReportProjection(db);
    expect(result.rows.map(r => r.documentNo)).toEqual(["INV1", "B1", "B2"]);
    expect(result).toMatchObject({ outputTax: 18000, inputTax: 8000, netTax: 10000 });
    expect(JSON.stringify(db)).toBe(before);
 });
