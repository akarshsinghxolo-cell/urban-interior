import { expect, test } from "vitest";
import { readCompletePages } from "../src/lib/rdash/server/complete-read";

test.each([1000, 500, 127])("complete reads exhaust 1,251 records with a server cap of %i", async cap => {
    const rows = Array.from({ length: 1251 }, (_, index) => ({ id: `row-${index}`, amount: 10 }));
    const result = await readCompletePages("invoices", async (offset, end, count) => ({
        data: rows.slice(offset, Math.min(end + 1, offset + cap)), error: null, count: count ? rows.length : null,
    }));
    expect(result.rows).toEqual(rows);
    expect(result.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(12510);
});

test("missing counts cannot turn a short capped page into a complete total", async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ id: String(index) }));
    const result = await readCompletePages("rows", async offset => ({ data: rows.slice(offset, offset + 2), error: null }));
    expect(result.rows).toEqual(rows);
});

test("page failures, premature end and repeated rows fail instead of returning partial totals", async () => {
    await expect(readCompletePages("rows", async () => ({ data: null, error: { message: "unavailable" } }))).rejects.toThrow("unavailable");
    await expect(readCompletePages("rows", async () => ({ data: [], error: null, count: 2 }))).rejects.toThrow("READ_CONFLICT");
    await expect(readCompletePages("rows", async () => ({ data: [{ id: "repeated" }], error: null }))).rejects.toThrow("READ_CONFLICT");
});
