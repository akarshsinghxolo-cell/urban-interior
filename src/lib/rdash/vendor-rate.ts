import type {
  LineItem,
  Master,
  PurchaseOrder,
  VendorBill,
  VendorRate,
  VendorRateHistory,
  VendorRateSourceType,
  WorkRequiredArticle,
} from "./types";

/**
 * A live Vendor Rate has one meaning and one amount field:
 * Vendor + Article + optional Variant + `rate` (the quoted rate) + status/timestamps.
 *
 * Unit/conversion/GST belong to Article/Variant Master. Delivery/MOQ/brand and
 * availability belong to Vendor supply capability. Source/audit context lives
 * in VendorRateHistory. Validity dates are deliberately not part of live rates.
 */
export interface VendorRateUpdateInput {
  vendorId: string;
  scope: WorkRequiredArticle;
  articleName: string;
  /** Derived context used only in history; never persisted on the live rate. */
  unitId?: string;
  variantId?: string;
  rate: number;
  sourceType?: VendorRateSourceType;
  sourceId?: string;
  sourceNo?: string;
  changedBy?: string;
  notes?: string;
}

function makeVendorRateId(change: VendorRateUpdateInput) {
  return `vendor-rate-${change.vendorId}-${change.scope.article_id}-${change.variantId || "base"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function makeHistoryId(change: VendorRateUpdateInput, updatedAt: string, suffix = "") {
  return `vrh-${change.vendorId}-${change.scope.article_id}-${change.variantId || "base"}-${updatedAt}${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function rateKey(vendorId: string, articleId: string, variantId?: string) {
  return `${vendorId}:${articleId}:${variantId || "base"}`;
}

function normalizeMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function quotedRate(rate: VendorRate) {
  return normalizeMoney(rate.rate);
}

function resolveUnitId(master: Master, articleId: string, variantId?: string, fallback?: string) {
  const variant = variantId ? master.articleVariants.find((row) => row.id === variantId && row.article_id === articleId) : undefined;
  const article = master.articles.find((row) => row.id === articleId);
  return variant?.unit_id || article?.default_unit_id || article?.unit_id || fallback || "";
}

function closeOpenHistories(histories: VendorRateHistory[], key: string, effectiveTo: string) {
  return histories.map((history) => {
    const historyKey = rateKey(history.vendor_id, history.article_id, history.variant_id);
    if (historyKey !== key || history.status !== "active" || history.effective_to) return history;
    return { ...history, status: "superseded" as const, effective_to: effectiveTo };
  });
}

function ensureHistorySeed(master: Master, updatedAt: string): VendorRateHistory[] {
  const histories = Array.isArray(master.vendorRateHistories) ? master.vendorRateHistories : [];
  if (histories.length) return histories;
  return master.vendorRates.flatMap((rate) => {
    const unitId = resolveUnitId(master, rate.article_id, rate.variant_id);
    const scopeId = master.subcategoryArticleMap.find((scope) => scope.article_id === rate.article_id)?.id;
    if (!unitId || !scopeId) return [];
    return [{
      id: `vrh-seed-${rate.id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      vendor_rate_id: rate.id,
      vendor_id: rate.vendor_id,
      article_id: rate.article_id,
      article_name: rate.article_name,
      work_required_article_id: scopeId,
      variant_id: rate.variant_id,
      unit_id: unitId,
      new_rate: quotedRate(rate),
      source_type: "SEED" as const,
      status: "active" as const,
      effective_from: (rate.updated_at || updatedAt).slice(0, 10),
      changed_by: "System Seed",
      notes: "Initial Vendor rate history seed.",
      created_at: rate.updated_at || updatedAt,
    }];
  });
}

function findExistingRateIndex(rates: VendorRate[], vendorId: string, articleId: string, variantId?: string) {
  return rates.findIndex((rate) =>
    rate.vendor_id === vendorId &&
    rate.article_id === articleId &&
    (rate.variant_id || "") === (variantId || ""),
  );
}

function canonicalLiveRate(input: {
  existing?: VendorRate;
  change: VendorRateUpdateInput;
  amount: number;
  updatedAt: string;
}): VendorRate {
  const createdAt = input.existing?.created_at || input.existing?.updated_at || input.updatedAt;
  return {
    id: input.existing?.id || makeVendorRateId(input.change),
    vendor_id: input.change.vendorId,
    article_id: input.change.scope.article_id,
    article_name: input.change.articleName,
    variant_id: input.change.variantId,
    rate: input.amount,
    status: input.existing?.status || "active",
    created_at: createdAt,
    updated_at: input.updatedAt,
  };
}

export function applyVendorRateUpdates(
  master: Master,
  changes: VendorRateUpdateInput[],
  updatedAt = new Date().toISOString(),
): Master {
  if (!changes.length) return master;

  const vendorRates = [...master.vendorRates];
  let vendorRateHistories = [...ensureHistorySeed(master, updatedAt)];

  for (const rawChange of changes) {
    const amount = normalizeMoney(rawChange.rate);
    if (!rawChange.vendorId || !rawChange.scope?.article_id || amount <= 0) continue;

    const change: VendorRateUpdateInput = {
      ...rawChange,
      rate: amount,
      unitId: resolveUnitId(master, rawChange.scope.article_id, rawChange.variantId, rawChange.unitId || rawChange.scope.unit_id),
      sourceType: rawChange.sourceType || "MANUAL",
    };
    const existingIndex = findExistingRateIndex(vendorRates, change.vendorId, change.scope.article_id, change.variantId);
    const existing = existingIndex >= 0 ? vendorRates[existingIndex] : undefined;
    if (existing && quotedRate(existing) === amount) continue;

    const nextRate = canonicalLiveRate({ existing, change, amount, updatedAt });
    if (existingIndex >= 0) vendorRates[existingIndex] = nextRate;
    else vendorRates.push(nextRate);

    const key = rateKey(change.vendorId, change.scope.article_id, change.variantId);
    vendorRateHistories = closeOpenHistories(vendorRateHistories, key, updatedAt.slice(0, 10));
    vendorRateHistories.push({
      id: makeHistoryId(change, updatedAt),
      vendor_rate_id: nextRate.id,
      vendor_id: change.vendorId,
      article_id: change.scope.article_id,
      article_name: change.articleName,
      work_required_article_id: change.scope.id,
      variant_id: change.variantId,
      unit_id: change.unitId || "",
      old_rate: existing ? quotedRate(existing) : undefined,
      new_rate: amount,
      source_type: change.sourceType || "MANUAL",
      source_id: change.sourceId,
      source_no: change.sourceNo,
      status: "active",
      effective_from: updatedAt.slice(0, 10),
      changed_by: change.changedBy,
      notes: change.notes,
      created_at: updatedAt,
    });
  }

  return { ...master, vendorRates, vendorRateHistories };
}

function articleNameFor(master: Master, articleId: string, fallback: string) {
  return master.articles.find((article) => article.id === articleId)?.name || fallback;
}

function scopeForLine(
  master: Master,
  line: Pick<LineItem, "work_required_article_id" | "article_id" | "unit_id" | "variant_id" | "title">,
) {
  if (line.work_required_article_id) {
    const scoped = master.subcategoryArticleMap.find((scope) => scope.id === line.work_required_article_id);
    if (scoped) return scoped;
  }
  if (!line.article_id) return undefined;
  return master.subcategoryArticleMap.find((scope) => scope.article_id === line.article_id);
}

export function vendorRateUpdatesFromPurchaseOrder(
  master: Master,
  po: PurchaseOrder,
  changedBy?: string,
): VendorRateUpdateInput[] {
  return po.items.flatMap((line) => {
    const scope = scopeForLine(master, line);
    if (!scope || !line.rate || line.rate <= 0) return [];
    return [{
      vendorId: po.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, line.title),
      unitId: resolveUnitId(master, scope.article_id, line.variant_id, scope.unit_id),
      variantId: line.variant_id,
      rate: line.rate,
      sourceType: "PO" as const,
      sourceId: po.id,
      sourceNo: po.po_no,
      changedBy,
      notes: `Observed from purchase order ${po.po_no}.`,
    }];
  });
}

/** Record use of an unchanged current rate without mutating the live rate. */
export function linkVendorRateUsageFromPO(
  master: Master,
  po: PurchaseOrder,
  changedBy?: string,
  updatedAt = new Date().toISOString(),
): Master {
  if (!po?.items?.length) return master;
  const vendorRates = [...master.vendorRates];
  const vendorRateHistories = [...ensureHistorySeed(master, updatedAt)];

  for (const line of po.items) {
    const scope = scopeForLine(master, line);
    if (!scope || !line.rate || line.rate <= 0) continue;
    const amount = normalizeMoney(line.rate);
    const existing = vendorRates.find((rate) =>
      rate.vendor_id === po.vendor_id &&
      rate.article_id === scope.article_id &&
      (rate.variant_id || "") === (line.variant_id || ""),
    );
    if (!existing || quotedRate(existing) !== amount) continue;

    const change: VendorRateUpdateInput = {
      vendorId: po.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, line.title),
      unitId: resolveUnitId(master, scope.article_id, line.variant_id, scope.unit_id),
      variantId: line.variant_id,
      rate: amount,
      sourceType: "PO",
      sourceId: po.id,
      sourceNo: po.po_no,
      changedBy,
      notes: `Used by purchase order ${po.po_no} (quoted rate unchanged).`,
    };
    vendorRateHistories.push({
      id: makeHistoryId(change, updatedAt, "-usage"),
      vendor_rate_id: existing.id,
      vendor_id: po.vendor_id,
      article_id: scope.article_id,
      article_name: change.articleName,
      work_required_article_id: scope.id,
      variant_id: line.variant_id,
      unit_id: change.unitId || "",
      old_rate: amount,
      new_rate: amount,
      source_type: "PO",
      source_id: po.id,
      source_no: po.po_no,
      status: "active",
      effective_from: updatedAt.slice(0, 10),
      changed_by: changedBy,
      notes: change.notes,
      created_at: updatedAt,
    });
  }

  return { ...master, vendorRates, vendorRateHistories };
}

export function createInitialVendorRate(
  master: Master,
  input: VendorRateUpdateInput,
  updatedAt = new Date().toISOString(),
): Master {
  return applyVendorRateUpdates(master, [{
    ...input,
    sourceType: input.sourceType || "MANUAL",
    sourceNo: input.sourceNo || "Vendor Price Matrix",
    notes: input.notes || "Initial quoted rate created from Vendor Price Matrix.",
  }], updatedAt);
}

export function vendorRateUpdatesFromVendorBill(
  master: Master,
  bill: VendorBill,
  po?: PurchaseOrder,
  changedBy?: string,
): VendorRateUpdateInput[] {
  return (bill.invoice_lines || []).flatMap((invoiceLine) => {
    const poLine = invoiceLine.po_item_id ? po?.items.find((line) => line.id === invoiceLine.po_item_id) : undefined;
    const lineContext = {
      work_required_article_id: invoiceLine.work_required_article_id || poLine?.work_required_article_id,
      article_id: invoiceLine.article_id || poLine?.article_id,
      unit_id: invoiceLine.unit_id || poLine?.unit_id,
      variant_id: invoiceLine.variant_id || poLine?.variant_id,
      title: invoiceLine.title,
    };
    const scope = scopeForLine(master, lineContext);
    const amount = Number(invoiceLine.rate || 0);
    if (!scope || !amount || amount <= 0) return [];
    return [{
      vendorId: bill.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, invoiceLine.title),
      unitId: resolveUnitId(master, scope.article_id, lineContext.variant_id, scope.unit_id),
      variantId: lineContext.variant_id,
      rate: amount,
      sourceType: "VENDOR_BILL" as const,
      sourceId: bill.id,
      sourceNo: bill.vendor_invoice_no || bill.bill_no,
      changedBy,
      notes: `Observed from vendor invoice ${bill.vendor_invoice_no || bill.bill_no}.`,
    }];
  });
}
