import type { LineItem } from "./types";

const money = (value: number) => Math.round(value * 100) / 100;

export function quotationExtraAmount(line: Pick<LineItem, "extra_amounts">): number {
  return money(Object.values(line.extra_amounts || {}).reduce((sum, value) => (
    sum + (Number.isFinite(value) && value > 0 ? value : 0)
  ), 0));
}

export function quotationLineAmount(line: Pick<LineItem, "quantity" | "rate" | "extra_amounts">): number {
  return money((line.quantity || 0) * (line.rate || 0) + quotationExtraAmount(line));
}

export function quotationRateForAmount(
  line: Pick<LineItem, "quantity" | "extra_amounts">,
  amount: number,
): number | undefined {
  const quantity = Number(line.quantity) || 0;
  const extras = quotationExtraAmount(line);
  if (!Number.isFinite(amount) || quantity <= 0 || amount < extras) return undefined;
  return money((amount - extras) / quantity);
}

export function quotationTotals(lines: readonly LineItem[]) {
  const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const tax_amount = money(lines.reduce((sum, line) => sum + (line.amount * (line.tax_rate || 0)) / 100, 0));
  return { subtotal, tax_amount, total_amount: money(subtotal + tax_amount) };
}

export function withoutQuotationExtraColumn(lines: readonly LineItem[], columnId: string): LineItem[] {
  return lines.map((line) => {
    if (!line.extra_amounts || !(columnId in line.extra_amounts)) return line;
    const extra_amounts = { ...line.extra_amounts };
    delete extra_amounts[columnId];
    const next = { ...line, extra_amounts };
    return { ...next, amount: quotationLineAmount(next) };
  });
}

