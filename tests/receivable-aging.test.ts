import { describe, expect, test } from "vitest";
import { receivableAgingBuckets } from "../src/components/rdash/modules/FinanceOverviewModule";

function daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

describe("receivable aging buckets", () => {
    const now = new Date("2026-08-29T10:00:00");

    test("buckets open invoices by days past due and skips cancelled/paid rows", () => {
        const aging = receivableAgingBuckets([
            { status: "issued", balance_amount: 5000, due_date: daysFromNow(10) },
            { status: "partial", balance_amount: 2000, due_date: daysFromNow(-10) },
            { status: "partial", balance_amount: 3000, due_date: daysFromNow(-45) },
            { status: "issued", balance_amount: 1500, due_date: daysFromNow(-75) },
            { status: "overdue", balance_amount: 4000, due_date: daysFromNow(-120) },
            { status: "cancelled", balance_amount: 9999, due_date: daysFromNow(-5) },
            { status: "paid", balance_amount: 0, due_date: daysFromNow(-30) },
        ], now);

        expect(aging.notDue).toEqual({ amount: 5000, count: 1 });
        expect(aging.d1_30).toEqual({ amount: 2000, count: 1 });
        expect(aging.d31_60).toEqual({ amount: 3000, count: 1 });
        expect(aging.d61_90).toEqual({ amount: 1500, count: 1 });
        expect(aging.d90plus).toEqual({ amount: 4000, count: 1 });
        expect(aging.total).toEqual({ amount: 15500, count: 5 });
    });

    test("treats missing due dates as due today (not overdue)", () => {
        const aging = receivableAgingBuckets([
            { status: "issued", balance_amount: 1200, due_date: "" },
        ], now);
        expect(aging.notDue).toEqual({ amount: 1200, count: 1 });
        expect(aging.total.amount).toBe(1200);
    });

    test("returns an empty bucket set when nothing is open", () => {
        const aging = receivableAgingBuckets([
            { status: "paid", balance_amount: 0, due_date: daysFromNow(-90) },
        ], now);
        expect(aging.total).toEqual({ amount: 0, count: 0 });
    });
});
