import { describe, expect, test } from "vitest";
import {
  quotationExtraAmount,
  quotationLineAmount,
  quotationTotals,
  withoutQuotationExtraColumn,
} from "../src/lib/rdash/quotation-extra-columns";
import type { LineItem } from "../src/lib/rdash/types";

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
});

