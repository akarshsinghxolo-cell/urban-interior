import type { LineItem, Master, VendorBill, VendorRate, VendorRateHistory, VendorRateSourceType, WorkRequiredArticle, PurchaseOrder } from "./types";

export interface VendorRateUpdateInput {
  vendorId: string;
  scope: WorkRequiredArticle;
  articleName: string;
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
  return `vendor-rate-${change.vendorId}-${change.scope.id}-${change.variantId || "base"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function makeHistoryId(change: VendorRateUpdateInput, updatedAt: string) {
  return `vrh-${change.vendorId}-${change.scope.id}-${change.variantId || "base"}-${updatedAt}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function rateKey(vendorId: string, scopeId: string, variantId?: string) {
  return `${vendorId}:${scopeId}:${variantId || "base"}`;
}
function closeOpenHistories(histories: VendorRateHistory[], key: string, effectiveTo: string) {
  return histories.map((history) => {
    const historyKey = rateKey(history.vendor_id, history.work_required_article_id, history.variant_id);
    if (historyKey !== key || history.status !== "active" || history.effective_to) return history;
    return { ...history, status: "superseded" as const, effective_to: effectiveTo };
  });
}
function normalizeMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}
function ensureHistorySeed(master: Master, updatedAt: string): VendorRateHistory[] {
  const histories = Array.isArray(master.vendorRateHistories) ? master.vendorRateHistories : [];
  if (histories.length) return histories;
  return (master.vendorRates.map((rate) => ({
    id: `vrh-seed-${rate.id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
    vendor_rate_id: rate.id,
    vendor_id: rate.vendor_id,
    article_id: rate.article_id,
    article_name: rate.article_name,
    work_required_article_id: rate.work_required_article_id || "",
    variant_id: rate.variant_id,
    unit_id: rate.unit_id || "",
    new_rate: normalizeMoney(rate.rate),
    source_type: rate.current_source_type || "SEED",
    source_id: rate.current_source_id,
    source_no: rate.current_source_no,
    status: "active" as const,
    effective_from: rate.valid_from || updatedAt.slice(0, 10),
    changed_by: "System Seed",
    notes: rate.notes || "Initial seeded vendor rate.",
    created_at: rate.updated_at || updatedAt,
  })) as VendorRateHistory[]).filter((history) => history.work_required_article_id && history.unit_id);
}

export function applyVendorRateUpdates(master: Master, changes: VendorRateUpdateInput[], updatedAt = new Date().toISOString()): Master {
  if (!changes.length) return master;

  const currentHistories = ensureHistorySeed(master, updatedAt);
  const vendorRates = [...master.vendorRates];
  let vendorRateHistories = [...currentHistories];

  for (const rawChange of changes) {
    const rate = normalizeMoney(rawChange.rate);
    if (!rawChange.vendorId || !rawChange.scope?.id || !rawChange.scope.article_id || !rate || rate <= 0) continue;
    const change: VendorRateUpdateInput = {
      ...rawChange,
      rate,
      unitId: rawChange.unitId || rawChange.scope.unit_id,
      sourceType: rawChange.sourceType || "MANUAL",
    };
    const existingIndex = vendorRates.findIndex((vendorRate) => vendorRate.vendor_id === change.vendorId && vendorRate.work_required_article_id === change.scope.id && (!change.variantId || vendorRate.variant_id === change.variantId));
    const existing = existingIndex >= 0 ? vendorRates[existingIndex] : undefined;
    const resolvedVariantId = change.variantId || existing?.variant_id;
    const key = rateKey(change.vendorId, change.scope.id, resolvedVariantId);

    if (existing && normalizeMoney(existing.rate) === rate && (existing.unit_id || change.scope.unit_id) === change.unitId) {
      continue;
    }

    const rateId = existing?.id || makeVendorRateId(change);
    const nextRate: VendorRate = {
      ...(existing || ({} as VendorRate)),
      id: rateId,
      vendor_id: change.vendorId,
      article_id: change.scope.article_id,
      article_name: change.articleName,
      work_required_article_id: change.scope.id,
      variant_id: resolvedVariantId,
      unit_id: change.unitId,
      rate,
      gst_inclusive: existing?.gst_inclusive ?? true,
      delivery_days: existing?.delivery_days,
      moq: existing?.moq,
      preferred: existing?.preferred,
      brand: existing?.brand,
      grade: existing?.grade,
      notes: change.notes || existing?.notes,
      valid_from: updatedAt.slice(0, 10),
      updated_at: updatedAt,
      current_source_type: change.sourceType,
      current_source_id: change.sourceId,
      current_source_no: change.sourceNo,
    };

    if (existingIndex >= 0) vendorRates[existingIndex] = nextRate;
    else vendorRates.push(nextRate);

    vendorRateHistories = closeOpenHistories(vendorRateHistories, key, updatedAt.slice(0, 10));
    vendorRateHistories.push({
      id: makeHistoryId(change, updatedAt),
      vendor_rate_id: rateId,
      vendor_id: change.vendorId,
      article_id: change.scope.article_id,
      article_name: change.articleName,
      work_required_article_id: change.scope.id,
      variant_id: resolvedVariantId,
      unit_id: change.unitId!,
      old_rate: existing?.rate,
      new_rate: rate,
      source_type: change.sourceType!,
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
function scopeForLine(master: Master, line: Pick<LineItem, "work_required_article_id" | "article_id" | "unit_id" | "variant_id" | "title">) {
  if (line.work_required_article_id) {
    const scoped = master.subcategoryArticleMap.find((scope) => scope.id === line.work_required_article_id);
    if (scoped) return scoped;
  }
  if (!line.article_id) return undefined;
  return master.subcategoryArticleMap.find((scope) => scope.article_id === line.article_id && (!line.unit_id || scope.unit_id === line.unit_id));
}

export function vendorRateUpdatesFromPurchaseOrder(master: Master, po: PurchaseOrder, changedBy?: string): VendorRateUpdateInput[] {
  return po.items.flatMap((line) => {
    const scope = scopeForLine(master, line);
    if (!scope || !line.rate || line.rate <= 0) return [];
    return [{
      vendorId: po.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, line.title),
      unitId: scope.unit_id,
      variantId: line.variant_id,
      rate: line.rate,
      sourceType: "PO" as const,
      sourceId: po.id,
      // CV-4: use the human-readable po_no (e.g. "PO-2026-001"), NOT the internal genId("po")
      // id (e.g. "po-abc123xyz"). ProcurementModule.tsx historically hand-rolled this update
      // with sourceNo = the createPO return value (the internal id), producing unreadable
      // rate-history rows. Centralising via this helper fixes that. ProcurementModule needs to
      // be migrated to call this helper (main-agent owned file).
      sourceNo: po.po_no,
      changedBy,
      notes: `Updated from purchase order ${po.po_no}.`,
    }];
  });
}

/**
 * CV-3: When a PO is created USING an existing vendor rate (rate unchanged), record a "usage"
 * entry in the rate's history and update the rate's current_source_* fields to point at this PO.
 * applyVendorRateUpdates skips the "rate unchanged" case (no history row, no source update),
 * so without this helper the audit trail cannot answer "which POs used this rate?" — it only
 * shows the LAST PO/bill that UPDATED the rate.
 *
 * This helper is read-only at the master level: it returns a new Master with updated
 * `vendorRates` (current_source_*) and appended `vendorRateHistories` rows where
 * old_rate === new_rate (signalling a usage entry, not a rate change). It DOES NOT change
 * the actual rate value.
 *
 * Call this from createPO after the PO is persisted, for every PO line whose rate matches
 * an existing vendor rate (rate unchanged). The ProcurementModule / procurement slice can
 * wire this up — both are main-agent owned, so the call site is documented in the worklog.
 */
export function linkVendorRateUsageFromPO(master: Master, po: PurchaseOrder, changedBy?: string, updatedAt = new Date().toISOString()): Master {
  if (!po?.items?.length) return master;
  const currentHistories = ensureHistorySeed(master, updatedAt);
  const vendorRates = [...master.vendorRates];
  let vendorRateHistories = [...currentHistories];
  for (const line of po.items) {
    const scope = scopeForLine(master, line);
    if (!scope || !line.rate || line.rate <= 0) continue;
    const rate = normalizeMoney(line.rate);
    const existingIndex = vendorRates.findIndex((vr) => vr.vendor_id === po.vendor_id && vr.work_required_article_id === scope.id && (!line.variant_id || vr.variant_id === line.variant_id));
    const existing = existingIndex >= 0 ? vendorRates[existingIndex] : undefined;
    if (!existing) continue;
    // Only log usage when the rate is unchanged — if the rate changed, applyVendorRateUpdates
    // already recorded a proper rate-change history entry (and updated source fields).
    if (normalizeMoney(existing.rate) !== rate) continue;
    // Update current_source_* to point at this PO (CV-3: shows the most recent PO that used
    // the rate, not just the last PO that updated it).
    vendorRates[existingIndex] = {
      ...existing,
      current_source_type: "PO",
      current_source_id: po.id,
      current_source_no: po.po_no,
      updated_at: updatedAt,
    };
    const change: VendorRateUpdateInput = {
      vendorId: po.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, line.title),
      unitId: scope.unit_id,
      variantId: line.variant_id,
      rate,
      sourceType: "PO",
      sourceId: po.id,
      sourceNo: po.po_no,
      changedBy,
      notes: `Used by purchase order ${po.po_no} (rate unchanged).`,
    };
    vendorRateHistories.push({
      id: makeHistoryId(change, updatedAt) + "-usage",
      vendor_rate_id: existing.id,
      vendor_id: po.vendor_id,
      article_id: scope.article_id,
      article_name: change.articleName,
      work_required_article_id: scope.id,
      variant_id: line.variant_id,
      unit_id: scope.unit_id,
      old_rate: existing.rate,
      new_rate: rate, // same as old_rate — signals a usage entry, not a rate change
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

/**
 * CV-10: Helper for creating an INITIAL vendor price via the Vendor Price Matrix UI. The
 * previous flow did a direct push to `vendorRates` with no rate-history entry, so the audit
 * trail for who created a price was missing (only "System Seed" rows appeared, back-dated).
 * Route initial price creation through applyVendorRateUpdates so a proper history row with
 * the actual creator + timestamp is recorded. VendorPriceMasterModule.tsx is main-agent
 * owned — its `addPrice` should call this helper instead of the direct push.
 */
export function createInitialVendorRate(master: Master, input: VendorRateUpdateInput, updatedAt = new Date().toISOString()): Master {
  return applyVendorRateUpdates(master, [{
    ...input,
    sourceType: input.sourceType || "MANUAL",
    sourceNo: input.sourceNo || "Vendor Price Matrix",
    notes: input.notes || "Initial vendor price created from Vendor Price Matrix.",
  }], updatedAt);
}


export function vendorRateUpdatesFromVendorBill(master: Master, bill: VendorBill, po?: PurchaseOrder, changedBy?: string): VendorRateUpdateInput[] {
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
    const rate = Number(invoiceLine.rate || 0);
    if (!scope || !rate || rate <= 0) return [];
    return [{
      vendorId: bill.vendor_id,
      scope,
      articleName: articleNameFor(master, scope.article_id, invoiceLine.title),
      unitId: scope.unit_id,
      variantId: lineContext.variant_id,
      rate,
      sourceType: "VENDOR_BILL" as const,
      sourceId: bill.id,
      sourceNo: bill.vendor_invoice_no || bill.bill_no,
      changedBy,
      notes: `Updated from vendor invoice ${bill.vendor_invoice_no || bill.bill_no}.`,
    }];
  });
}
