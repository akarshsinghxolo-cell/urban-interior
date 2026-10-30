import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { vendorExposureRows } from "../src/lib/rdash/store/selectors";

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
