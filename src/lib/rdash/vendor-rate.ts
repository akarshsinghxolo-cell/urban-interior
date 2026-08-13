import type {
  LineItem,
  Master,
  PurchaseOrder,
  VendorBill,
  VendorRate,
  VendorRateHistory,
  VendorRateSourceType,
} from "./types";
import { resolveArticleRateConfig } from "./article-rate-config";

export interface VendorRateUpdateInput {
  vendorId: string;
  articleId: string;
  variantId?: string;
  quotedRate: number;
  articleName?: string;
  workRequiredArticleId?: string;
  sourceType?: VendorRateSourceType;
  sourceId?: string;
  sourceNo?: string;
  changedBy?: string;
  notes?: string;
}

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const key = (vendorId: string, articleId: string, variantId?: string) => `${vendorId}:${articleId}:${variantId || "base"}`;
const rateId = (change: VendorRateUpdateInput) => `vendor-rate-${change.vendorId}-${change.articleId}-${change.variantId || "base"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
const historyId = (change: VendorRateUpdateInput, at: string, suffix = "") => `vrh-${change.vendorId}-${change.articleId}-${change.variantId || "base"}-${at}${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_");

function articleName(master: Master, articleId: string, fallback?: string) {
  return master.articles.find((row) => row.id === articleId)?.name || fallback;
}
function scopeId(master: Master, articleId: string, preferred?: string) {
  return preferred || master.subcategoryArticleMap.find((row) => row.article_id === articleId)?.id;
}
function currentIndex(rates: VendorRate[], vendorId: string, articleId: string, variantId?: string) {
  return rates.findIndex((row) => row.vendor_id === vendorId && row.article_id === articleId && (row.variant_id || "") === (variantId || ""));
}
function currentUnit(master: Master, articleId: string, variantId?: string) {
  return resolveArticleRateConfig({ articleId, variantId, articles: master.articles, variants: master.articleVariants }).rateUnit;
}
function closeHistory(rows: VendorRateHistory[], rateKey: string, at: string) {
  return rows.map((row) => key(row.vendor_id, row.article_id, row.variant_id) === rateKey && row.status === "active" && !row.effective_to
    ? { ...row, status: "superseded" as const, effective_to: at.slice(0, 10) }
    : row);
}

export function canonicalVendorRateRecord(row: Record<string, unknown>): VendorRate | undefined {
  const id = String(row.id || "").trim();
  const vendorId = String(row.vendor_id || "").trim();
  const articleId = String(row.article_id || "").trim();
  const quotedRate = money(row.quoted_rate);
  if (!id || !vendorId || !articleId || quotedRate <= 0) return undefined;
  const createdAt = String(row.created_at || row.updated_at || new Date().toISOString());
  return {
    id,
    vendor_id: vendorId,
    article_id: articleId,
    variant_id: String(row.variant_id || "").trim() || undefined,
    quoted_rate: quotedRate,
    status: row.status === "inactive" ? "inactive" : "active",
    created_at: createdAt,
    updated_at: String(row.updated_at || createdAt),
  };
}

export function canonicalizeVendorRateMaster(master: Master): Master {
  const vendorRates = master.vendorRates.flatMap((row) => {
    const canonical = canonicalVendorRateRecord(row as unknown as Record<string, unknown>);
    return canonical ? [canonical] : [];
  });
  return vendorRates.length === master.vendorRates.length && vendorRates.every((row, index) => JSON.stringify(row) === JSON.stringify(master.vendorRates[index]))
    ? master
    : { ...master, vendorRates };
}

export function applyVendorRateUpdates(master: Master, changes: VendorRateUpdateInput[], updatedAt = new Date().toISOString()): Master {
  if (!changes.length) return master;
  const vendorRates = [...master.vendorRates];
  let vendorRateHistories = [...master.vendorRateHistories];
  for (const raw of changes) {
    const amount = money(raw.quotedRate);
    if (!raw.vendorId || !raw.articleId || amount <= 0) continue;
    const change = { ...raw, quotedRate: amount, sourceType: raw.sourceType || "MANUAL" as const };
    const index = currentIndex(vendorRates, change.vendorId, change.articleId, change.variantId);
    const existing = index >= 0 ? vendorRates[index] : undefined;
    if (existing && money(existing.quoted_rate) === amount) continue;
    const next: VendorRate = {
      id: existing?.id || rateId(change),
      vendor_id: change.vendorId,
      article_id: change.articleId,
      variant_id: change.variantId,
      quoted_rate: amount,
      status: existing?.status || "active",
      created_at: existing?.created_at || updatedAt,
      updated_at: updatedAt,
    };
    if (index >= 0) vendorRates[index] = next;
    else vendorRates.push(next);

    const currentKey = key(change.vendorId, change.articleId, change.variantId);
    vendorRateHistories = closeHistory(vendorRateHistories, currentKey, updatedAt);
    vendorRateHistories.push({
      id: historyId(change, updatedAt),
      vendor_rate_id: next.id,
      vendor_id: change.vendorId,
      article_id: change.articleId,
      article_name: articleName(master, change.articleId, change.articleName),
      work_required_article_id: scopeId(master, change.articleId, change.workRequiredArticleId),
      variant_id: change.variantId,
      unit_id: currentUnit(master, change.articleId, change.variantId),
      old_rate: existing?.quoted_rate,
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

function articleIdForLine(master: Master, line: Pick<LineItem, "article_id" | "work_required_article_id">) {
  if (line.article_id) return line.article_id;
  return line.work_required_article_id
    ? master.subcategoryArticleMap.find((row) => row.id === line.work_required_article_id)?.article_id
    : undefined;
}

export function vendorRateUpdatesFromPurchaseOrder(master: Master, po: PurchaseOrder, changedBy?: string): VendorRateUpdateInput[] {
  return po.items.flatMap((line) => {
    const articleId = articleIdForLine(master, line);
    if (!articleId || !line.rate || line.rate <= 0) return [];
    return [{
      vendorId: po.vendor_id,
      articleId,
      variantId: line.variant_id,
      quotedRate: line.rate,
      articleName: articleName(master, articleId, line.title),
      workRequiredArticleId: line.work_required_article_id,
      sourceType: "PO" as const,
      sourceId: po.id,
      sourceNo: po.po_no,
      changedBy,
      notes: `Observed from purchase order ${po.po_no}.`,
    }];
  });
}

export function linkVendorRateUsageFromPO(master: Master, po: PurchaseOrder, changedBy?: string, updatedAt = new Date().toISOString()): Master {
  const histories = [...master.vendorRateHistories];
  for (const line of po.items || []) {
    const articleId = articleIdForLine(master, line);
    const amount = money(line.rate);
    if (!articleId || amount <= 0) continue;
    const current = master.vendorRates.find((row) => row.vendor_id === po.vendor_id && row.article_id === articleId && (row.variant_id || "") === (line.variant_id || ""));
    if (!current || money(current.quoted_rate) !== amount) continue;
    const change: VendorRateUpdateInput = { vendorId: po.vendor_id, articleId, variantId: line.variant_id, quotedRate: amount };
    histories.push({
      id: historyId(change, updatedAt, "-usage"), vendor_rate_id: current.id,
      vendor_id: po.vendor_id, article_id: articleId, article_name: articleName(master, articleId, line.title),
      work_required_article_id: line.work_required_article_id, variant_id: line.variant_id,
      unit_id: currentUnit(master, articleId, line.variant_id), old_rate: amount, new_rate: amount,
      source_type: "PO", source_id: po.id, source_no: po.po_no, status: "active",
      effective_from: updatedAt.slice(0, 10), changed_by: changedBy,
      notes: `Used by purchase order ${po.po_no} (quoted rate unchanged).`, created_at: updatedAt,
    });
  }
  return { ...master, vendorRateHistories: histories };
}

export function createInitialVendorRate(master: Master, input: VendorRateUpdateInput, updatedAt = new Date().toISOString()) {
  return applyVendorRateUpdates(master, [{ ...input, sourceType: input.sourceType || "MANUAL", sourceNo: input.sourceNo || "Vendor Price Matrix", notes: input.notes || "Initial quoted rate created from Vendor Price Matrix." }], updatedAt);
}

export function vendorRateUpdatesFromVendorBill(master: Master, bill: VendorBill, po?: PurchaseOrder, changedBy?: string): VendorRateUpdateInput[] {
  return (bill.invoice_lines || []).flatMap((line) => {
    const poLine = line.po_item_id ? po?.items.find((row) => row.id === line.po_item_id) : undefined;
    const articleId = line.article_id || poLine?.article_id || (line.work_required_article_id || poLine?.work_required_article_id
      ? master.subcategoryArticleMap.find((row) => row.id === (line.work_required_article_id || poLine?.work_required_article_id))?.article_id
      : undefined);
    const amount = money(line.rate);
    if (!articleId || amount <= 0) return [];
    return [{
      vendorId: bill.vendor_id, articleId, variantId: line.variant_id || poLine?.variant_id,
      quotedRate: amount, articleName: articleName(master, articleId, line.title),
      workRequiredArticleId: line.work_required_article_id || poLine?.work_required_article_id,
      sourceType: "VENDOR_BILL" as const, sourceId: bill.id,
      sourceNo: bill.vendor_invoice_no || bill.bill_no, changedBy,
      notes: `Observed from vendor invoice ${bill.vendor_invoice_no || bill.bill_no}.`,
    }];
  });
}
