import { describe, expect, test } from "vitest";
import {
  quotationExtraAmount,
  quotationLineAmount,
  quotationTotals,
  withoutQuotationExtraColumn,
} from "../src/lib/rdash/quotation-extra-columns";
import type { LineItem } from "../src/lib/rdash/types";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { repairOperationalWorkspace } from "../src/lib/rdash/operational-repair";

const line = (patch: Partial<LineItem> = {}): LineItem => ({
  id: "line-1",
  title: "Gypsum False Ceiling",
  quantity: 10,
  rate: 100,
  amount: 1_000,
  ...patch,
});

describe("quotation additional work columns", () => {
  test("adds room-wise custom work amounts to the commercial line total", () => {
    const item = line({ extra_amounts: { demolition: 250, civil: 400 } });

    expect(quotationExtraAmount(item)).toBe(650);
    expect(quotationLineAmount(item)).toBe(1_650);
    expect(quotationTotals([{ ...item, amount: 1_650, tax_rate: 18 }])).toEqual({
      subtotal: 1_650,
      tax_amount: 297,
      total_amount: 1_947,
    });
  });

  test("removing a column removes its values and recalculates each line", () => {
    const [updated] = withoutQuotationExtraColumn([
      line({ amount: 1_650, extra_amounts: { demolition: 250, civil: 400 } }),
    ], "demolition");

    expect(updated.extra_amounts).toEqual({ civil: 400 });
    expect(updated.amount).toBe(1_400);
  });

  test("ignores invalid or negative custom amounts", () => {
    expect(quotationExtraAmount(line({ extra_amounts: { valid: 50, negative: -5, invalid: Number.NaN } }))).toBe(50);
  });

  test("operational repair preserves additional work in line, quotation and tax totals", () => {
    const db = buildSeedDatabase();
    const quote = db.quotations[0];
    quote.extra_columns = [{ id: "demolition", label: "Demolition Work" }];
    quote.scope_lines[0] = { ...quote.scope_lines[0], extra_amounts: { demolition: 250 }, tax_rate: 18 };
    quote.scope_lines[0].amount = quotationLineAmount(quote.scope_lines[0]);
    const expectedLine = quote.scope_lines[0].amount;
    const expectedTotals = quotationTotals(quote.scope_lines);
    const repaired = repairOperationalWorkspace(db).quotations.find((row) => row.id === quote.id);
    expect(repaired?.scope_lines[0].extra_amounts).toEqual({ demolition: 250 });
    expect(repaired?.scope_lines[0].amount).toBe(expectedLine);
    expect(repaired).toMatchObject(expectedTotals);
  });
});

