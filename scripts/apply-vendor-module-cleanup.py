from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REF = "origin/agent/vendor-profile-intelligence-v2"


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True)


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def copy_from_vendor_branch(path: str) -> None:
    write(path, run("git", "show", f"{SOURCE_REF}:{path}"))


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected one marker, found {text.count(old)}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    text = target.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex marker: {pattern[:120]!r}")
    target.write_text(updated)


subprocess.check_call(["git", "fetch", "origin", "agent/vendor-profile-intelligence-v2"], cwd=ROOT)

# Port only the already-audited Vendor UI/profile pieces. Contractor/shared code is
# deliberately taken from current main, never from the stale Vendor branch.
for path in [
    "src/components/rdash/PartnerFormDialog.tsx",
    "src/components/rdash/VendorFormDialog.tsx",
    "src/components/rdash/modules/RateFinderModule.tsx",
    "src/components/rdash/modules/VendorPerformanceModule.tsx",
    "src/components/rdash/modules/VendorPriceMasterModule.tsx",
    "src/components/rdash/modules/VendorWorkspaceModule.tsx",
    "src/lib/rdash/vendor-profile.ts",
    "tests/vendor-profile.test.ts",
    "tests/vendor-rate-average.test.ts",
]:
    copy_from_vendor_branch(path)

# Shared fresh master-location GPS helper used by the canonical Vendor form.
copy_from_vendor_branch("src/lib/rdash/device-gps.ts")

# ---------------------------------------------------------------------------
# Canonical shared types: one Vendor profile, one strict VendorRate shape.
# ---------------------------------------------------------------------------
types_path = ROOT / "src/lib/rdash/types.ts"
types = types_path.read_text()
vendor_block = '''export type VendorStatus = "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";
export type VendorType = "manufacturer" | "distributor" | "dealer" | "retailer" | "service_provider" | "other";
export type VendorAvailability = "in_stock" | "limited" | "on_order" | "unknown";
export interface VendorSupplyCapability {
    id?: ID;
    article_id: ID;
    article_name?: string;
    category_id?: ID;
    category_name?: string;
    variant_ids?: ID[];
    brand?: string;
    availability?: VendorAvailability;
    typical_lead_time_days?: number;
    moq?: number;
    preferred?: boolean;
    status?: "active" | "inactive";
    notes?: string;
}
export interface Vendor {
    id: ID;
    name: string;
    legal_name?: string;
    phone?: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    city?: string;
    locality?: string;
    address?: string;
    status?: VendorStatus;
    vendor_type?: VendorType;
    gstin?: string;
    latitude?: number;
    longitude?: number;
    business_card_attachment_id?: ID;
    shop_attachment_id?: ID;
    reliability_rating?: "good" | "very_good" | "average" | "bad";
    delivery_time_rating?: "good" | "very_good" | "average" | "bad";
    return_policy?: "available" | "not_available";
    notes?: string;
    source_partner_id?: ID;
    source_partner_name?: string;
    category?: string;
    categories?: string[];
    brands?: string[];
    supply_capabilities?: VendorSupplyCapability[];
    outstanding?: number;
    reliability_score?: number;
    on_time_pct?: number;
    created_at?: string;
    updated_at?: string;
}
export interface Contractor {'''
types, count = re.subn(r'export interface Vendor \{.*?\n\}\nexport interface Contractor \{', vendor_block, types, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Could not replace Vendor type block")

# Article/Variant own rate-unit conversion and GST configuration.
types = types.replace(
    "    default_unit_id?: ID;\n    base_rate?: number;",
    "    default_unit_id?: ID;\n    conversion_quantity?: number;\n    gst_inclusive?: boolean;\n    gst_percent?: number;\n    base_rate?: number;",
    1,
)
types = types.replace(
    "    unit_id?: ID;\n    brand?: string;",
    "    unit_id?: ID;\n    conversion_quantity?: number;\n    gst_inclusive?: boolean;\n    gst_percent?: number;\n    brand?: string;",
    1,
)

rate_types = '''export type VendorRateSourceType = "PO" | "VENDOR_BILL" | "MANUAL" | "SEED";
export type VendorRateStatus = "active" | "inactive";
export type VendorRateHistoryStatus = "active" | "superseded";
export interface VendorRate {
    id: ID;
    vendor_id: ID;
    article_id: ID;
    variant_id?: ID;
    quoted_rate: number;
    status: VendorRateStatus;
    created_at: string;
    updated_at: string;
}
export interface VendorRateHistory {
    id: ID;
    vendor_rate_id?: ID;
    vendor_id: ID;
    article_id: ID;
    article_name?: string;
    work_required_article_id?: ID;
    variant_id?: ID;
    unit_id?: ID;
    old_rate?: number;
    new_rate: number;
    source_type: VendorRateSourceType;
    source_id?: ID;
    source_no?: string;
    status: VendorRateHistoryStatus;
    effective_from: string;
    effective_to?: string;
    changed_by?: string;
    notes?: string;
    created_at: string;
}
export interface ContractorRate {'''
types, count = re.subn(
    r'export type VendorRateSourceType = .*?\nexport interface ContractorRate \{',
    rate_types,
    types,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace Vendor Rate type block")
types_path.write_text(types)

# ---------------------------------------------------------------------------
# Shared Article/Variant resolver. No module may infer Vendor rate config itself.
# ---------------------------------------------------------------------------
write("src/lib/rdash/article-rate-config.ts", r'''import type { Article, ArticleVariant } from "./types";

export type ArticleRateConfig = {
  rateUnit?: string;
  baseUnit?: string;
  conversionQuantity?: number;
  gstInclusive?: boolean;
  gstPercent?: number;
  isComplete: boolean;
};

function configuredNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function configuredPercent(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function resolveArticleRateConfig({
  articleId,
  variantId,
  articles,
  variants,
}: {
  articleId: string;
  variantId?: string;
  articles: Article[];
  variants: ArticleVariant[];
}): ArticleRateConfig {
  const article = articles.find((row) => row.id === articleId);
  const variant = variantId
    ? variants.find((row) => row.id === variantId && row.article_id === articleId)
    : undefined;
  if (!article) return { isComplete: false };

  const baseUnit = article.default_unit_id || article.unit_id;
  const rateUnit = variant?.unit_id || article.unit_id || baseUnit;
  const explicitConversion = configuredNumber(
    variant?.conversion_quantity ?? article.conversion_quantity,
  );
  const conversionQuantity = explicitConversion ?? (rateUnit && baseUnit && rateUnit === baseUnit ? 1 : undefined);
  const gstInclusive = variant?.gst_inclusive ?? article.gst_inclusive;
  const gstPercent = configuredPercent(variant?.gst_percent ?? article.gst_percent);
  return {
    rateUnit,
    baseUnit,
    conversionQuantity,
    gstInclusive,
    gstPercent,
    isComplete: Boolean(
      rateUnit
      && baseUnit
      && conversionQuantity
      && gstInclusive !== undefined
      && gstPercent !== undefined
    ),
  };
}
''')

# ---------------------------------------------------------------------------
# Strict Vendor Rate domain. History is audit-only and never a live-rate fallback.
# ---------------------------------------------------------------------------
write("src/lib/rdash/vendor-rate.ts", r'''import type {
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
''')

# Current quote averages use current VendorRate only. History never resurrects an old quote.
write("src/lib/rdash/vendor-rate-average.ts", r'''import type { RDashDatabase, VendorRate } from "./types";
import { resolveArticleRateConfig } from "./article-rate-config";

const EPSILON = 1e-9;
export type SelectedVendorArticleRate = {
  sourceId: string;
  vendorId: string;
  articleId: string;
  variantId?: string;
  quotedRate: number;
  rateUnit?: string;
  baseUnit?: string;
  conversionQuantity?: number;
  normalizedQuotedRate?: number;
  active: boolean;
  configComplete: boolean;
  conversionError?: string;
};
export type ArticleVendorRateAverage = {
  articleId: string;
  baseUnit?: string;
  average?: number;
  selected: SelectedVendorArticleRate[];
  included: SelectedVendorArticleRate[];
  skipped: SelectedVendorArticleRate[];
};

function candidate(database: RDashDatabase, rate: VendorRate): SelectedVendorArticleRate {
  const config = resolveArticleRateConfig({ articleId: rate.article_id, variantId: rate.variant_id, articles: database.master.articles, variants: database.master.articleVariants });
  const normalized = config.conversionQuantity ? rate.quoted_rate / config.conversionQuantity : undefined;
  return {
    sourceId: rate.id, vendorId: rate.vendor_id, articleId: rate.article_id, variantId: rate.variant_id,
    quotedRate: rate.quoted_rate, rateUnit: config.rateUnit, baseUnit: config.baseUnit,
    conversionQuantity: config.conversionQuantity, normalizedQuotedRate: normalized,
    active: rate.status === "active", configComplete: config.isComplete,
    conversionError: config.conversionQuantity ? undefined : `Configure the Article/Variant conversion quantity for ${config.rateUnit || "the quoted unit"}.`,
  };
}

export function selectVendorArticleRates(database: RDashDatabase, articleId: string): SelectedVendorArticleRate[] {
  const active = database.master.vendorRates.filter((row) => row.article_id === articleId && row.status === "active");
  const byVendor = new Map<string, VendorRate[]>();
  for (const row of active) byVendor.set(row.vendor_id, [...(byVendor.get(row.vendor_id) || []), row]);
  return [...byVendor.values()].map((rows) => candidate(database, [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]));
}

export function articleVendorRateAverage(database: RDashDatabase, articleId: string): ArticleVendorRateAverage {
  const selected = selectVendorArticleRates(database, articleId);
  const included = selected.filter((row) => Number.isFinite(row.normalizedQuotedRate));
  const skipped = selected.filter((row) => !Number.isFinite(row.normalizedQuotedRate));
  const average = included.length ? included.reduce((sum, row) => sum + (row.normalizedQuotedRate as number), 0) / included.length : undefined;
  const article = database.master.articles.find((row) => row.id === articleId);
  return { articleId, baseUnit: article?.default_unit_id || article?.unit_id, average, selected, included, skipped };
}

function changedArticleIds(previous: RDashDatabase, candidateDb: RDashDatabase) {
  const changed = new Set<string>();
  const before = new Map(previous.master.vendorRates.map((row) => [row.id, row]));
  const after = new Map(candidateDb.master.vendorRates.map((row) => [row.id, row]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(id); const right = after.get(id);
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (left?.article_id) changed.add(left.article_id);
    if (right?.article_id) changed.add(right.article_id);
  }
  return changed;
}

export function applyVendorRateAverages(previous: RDashDatabase, candidateDb: RDashDatabase, options: { articleIds?: Iterable<string>; updatedAt?: string } = {}): RDashDatabase {
  const articleIds = options.articleIds ? new Set(options.articleIds) : changedArticleIds(previous, candidateDb);
  if (!articleIds.size) return candidateDb;
  const updatedAt = options.updatedAt || new Date().toISOString();
  const averages = new Map<string, number>();
  for (const articleId of articleIds) {
    const average = articleVendorRateAverage(candidateDb, articleId).average;
    if (average !== undefined && Number.isFinite(average)) averages.set(articleId, average);
  }
  let articleChanged = false;
  const articles = candidateDb.master.articles.map((article) => {
    const average = averages.get(article.id);
    if (average === undefined || Math.abs((article.base_rate || 0) - average) <= EPSILON) return article;
    articleChanged = true; return { ...article, base_rate: average, updated_at: updatedAt };
  });
  let scopeChanged = false;
  const subcategoryArticleMap = candidateDb.master.subcategoryArticleMap.map((row) => {
    const average = averages.get(row.article_id);
    if (average === undefined || Math.abs((row.reference_rate || 0) - average) <= EPSILON) return row;
    scopeChanged = true; return { ...row, reference_rate: average, updated_at: updatedAt };
  });
  return articleChanged || scopeChanged ? { ...candidateDb, master: { ...candidateDb.master, articles: articleChanged ? articles : candidateDb.master.articles, subcategoryArticleMap: scopeChanged ? subcategoryArticleMap : candidateDb.master.subcategoryArticleMap } } : candidateDb;
}

export function formatRateWithUnit(value: number | undefined, unit?: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 12 }).format(value);
  return unit ? `${amount} / ${unit}` : amount;
}
''')

# Vendor profile helper uses the strict quoted_rate field.
profile = (ROOT / "src/lib/rdash/vendor-profile.ts").read_text()
profile = profile.replace('return Number((rate as any).rate ?? 0);', 'return Number((rate as any).quoted_rate ?? 0);')
(ROOT / "src/lib/rdash/vendor-profile.ts").write_text(profile)

# Price Matrix uses Article/Variant resolver and no longer requires a Work scope.
price_path = ROOT / "src/components/rdash/modules/VendorPriceMasterModule.tsx"
price = price_path.read_text()
price = price.replace('import { canonicalVendorCapabilities, vendorQuotedRate } from "@/lib/rdash/vendor-profile";', 'import { canonicalVendorCapabilities, vendorQuotedRate } from "@/lib/rdash/vendor-profile";\nimport { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";')
price = re.sub(r'function unitIdFor\(master: Master, articleId: string, variantId\?: string\) \{.*?\n\}', '''function unitIdFor(master: Master, articleId: string, variantId?: string) {\n  return resolveArticleRateConfig({ articleId, variantId, articles: master.articles, variants: master.articleVariants }).rateUnit;\n}''', price, count=1, flags=re.S)
price = price.replace('    article_name: rate.article_name,\n', '')
price = price.replace('    rate: vendorQuotedRate(rate),\n', '    quoted_rate: vendorQuotedRate(rate),\n')
price = price.replace('  const selectedScope = draft.articleId ? scopeForArticle(master, draft.articleId) : undefined;\n', '  const selectedScope = draft.articleId ? scopeForArticle(master, draft.articleId) : undefined;\n')
price = price.replace('    if (!selectedScope) return toast.error("This Article has no Work/Article scope mapping. Configure it in Article Master first.");\n', '')
price = price.replace('      scope: selectedScope,\n      articleName: selectedArticle.name,\n      variantId: draft.variantId || undefined,\n      unitId: unitIdFor(current, selectedArticle.id, draft.variantId || undefined),\n      rate: amount,', '      articleId: selectedArticle.id,\n      articleName: selectedArticle.name,\n      workRequiredArticleId: selectedScope?.id,\n      variantId: draft.variantId || undefined,\n      quotedRate: amount,')
price = price.replace('      scope,\n      articleName: master.articles.find((row) => row.id === rate.article_id)?.name || rate.article_name,\n      variantId: rate.variant_id,\n      unitId: unitIdFor(current, rate.article_id, rate.variant_id),\n      rate: amount,', '      articleId: rate.article_id,\n      articleName: master.articles.find((row) => row.id === rate.article_id)?.name,\n      workRequiredArticleId: scope?.id,\n      variantId: rate.variant_id,\n      quotedRate: amount,')
price = price.replace('    if (!scope) return toast.error("Article scope mapping is missing; rate could not be updated.");\n', '')
price = price.replace('rate.article_name', '(master.articles.find((row) => row.id === rate.article_id)?.name || "Unknown Article")')
price_path.write_text(price)

# Work Category deletion logic no longer treats a Vendor Rate as Work-scope-owned.
work_path = ROOT / "src/components/rdash/modules/WorkCategoryMasterModule.tsx"
work = work_path.read_text()
work = work.replace('!scopeIds.has(rate.work_required_article_id || "") && !removedArticleIds.has(rate.article_id)', '!removedArticleIds.has(rate.article_id)')
work = work.replace('!scopeIds.has(rate.work_required_article_id || "")', 'true')
work_path.write_text(work)

# Targeted/full server commits sanitize direct VendorRate upserts before averaging.
for path in ["src/lib/rdash/server/authorized-commit.ts", "src/lib/rdash/server/targeted-commit.ts"]:
    text = (ROOT / path).read_text()
    if 'canonicalizeVendorRateMaster' not in text:
        marker = 'import { applyVendorRateAverages } from "../vendor-rate-average";'
        text = text.replace(marker, marker + '\nimport { canonicalizeVendorRateMaster } from "../vendor-rate";', 1)
    text = text.replace('const candidate = applyWorkspaceOperations(current, operations);\n  const canonical = applyVendorRateAverages(current, candidate);', 'const candidate = applyWorkspaceOperations(current, operations);\n  const canonicalRates = { ...candidate, master: canonicalizeVendorRateMaster(candidate.master) };\n  const canonical = applyVendorRateAverages(current, canonicalRates);')
    text = text.replace('const rawCandidate = applyWorkspaceOperations(current.data, operations);\n  const canonicalCandidate = applyVendorRateAverages(current.data, rawCandidate);', 'const rawCandidate = applyWorkspaceOperations(current.data, operations);\n  const canonicalRates = { ...rawCandidate, master: canonicalizeVendorRateMaster(rawCandidate.master) };\n  const canonicalCandidate = applyVendorRateAverages(current.data, canonicalRates);')
    (ROOT / path).write_text(text)

# Targeted Vendor Rate reads no longer depend on tax configs or Work scopes.
targeted_path = ROOT / "src/lib/rdash/server/targeted-commit.ts"
targeted = targeted_path.read_text()
targeted = targeted.replace('    addId(plan, "master.units", row.unit_id);\n    addId(plan, "master.subcategoryArticleMap", row.work_required_article_id);\n', '')
targeted = targeted.replace('      "master.vendorRates", "master.vendorRateHistories", "master.subcategoryArticleMap",\n      "master.units", "master.articleVariants", "master.vendors", "taxConfigs",\n', '      "master.vendorRates", "master.vendorRateHistories", "master.articles",\n      "master.units", "master.articleVariants", "master.vendors",\n')
targeted_path.write_text(targeted)

# Remove the old Vendor form/bridge implementation entirely. Contractor has its own policy/form.
for old in [
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    "src/lib/rdash/partner-form-store-bridge.ts",
    "src/lib/rdash/partner-form-consistency.ts",
    "src/lib/rdash/partner-form-types.d.ts",
]:
    path = ROOT / old
    if path.exists(): path.unlink()

# Rewrite legacy-removal assertions around the current canonical boundaries.
legacy_test = ROOT / "tests/customer-sites-legacy-removal.test.ts"
legacy = legacy_test.read_text()
start = legacy.index('test("partner create and edit use guarded canonical workflows"')
# Keep only the customer test from this file; Vendor/Contractor now have dedicated suites.
legacy = legacy[:start]
legacy_test.write_text(legacy)

contractor_test = ROOT / "tests/contractor-legacy-removal.test.ts"
ct = contractor_test.read_text()
ct = ct.replace('    const form = await source("src/components/rdash/UnifiedPartnerFormDialog.tsx");\n', '')
ct = ct.replace('    expect(form).not.toContain("addContractor");\n    expect(form).not.toContain("updateContractor");\n    expect(form).not.toContain("contractorPhoto");\n    expect(form).not.toContain(\'type: "contractor"\');\n', '')
ct = ct.replace('    expect(router).toContain(\'<UnifiedVendorForm\\n      type="vendor"\');\n', '    expect(router).toContain("<VendorFormDialog");\n')
old_bridge_test = '''  test("the form store bridge is Vendor-only", async () => {\n    const bridge = await source("src/lib/rdash/partner-form-store-bridge.ts");\n    expect(bridge).not.toContain("updateContractor");\n    expect(bridge).not.toContain(\'"contractor"\');\n  });\n\n'''
ct = ct.replace(old_bridge_test, '''  test("the obsolete shared form bridge is removed", async () => {\n    expect(await Bun.file("src/lib/rdash/partner-form-store-bridge.ts").exists()).toBe(false);\n    expect(await Bun.file("src/components/rdash/UnifiedPartnerFormDialog.tsx").exists()).toBe(false);\n  });\n\n''')
contractor_test.write_text(ct)

# Canonical Vendor tests use quoted_rate and direct Article identity.
vp = (ROOT / "tests/vendor-profile.test.ts").read_text()
vp = vp.replace('article_name: "Switch", rate: 100', 'quoted_rate: 100')
vp = vp.replace('article_name: "Panel", rate: 200', 'quoted_rate: 200')
vp = vp.replace('article_name: "Switch", rate: 90', 'quoted_rate: 90')
vp = vp.replace('article_name: "Switch", rate: 120', 'quoted_rate: 120')
vp = vp.replace('article_name: "Switch", rate: 95', 'quoted_rate: 95')
vp = vp.replace('article_name: "Switch", rate: 110', 'quoted_rate: 110')
vp = vp.replace('      scope: state.master.subcategoryArticleMap[0],\n      articleName: "6A Modular Switch",\n      variantId: "var-white",\n      unitId: "pcs",\n      rate: 125.5,', '      articleId: "art-switch",\n      articleName: "6A Modular Switch",\n      workRequiredArticleId: "scope-switch",\n      variantId: "var-white",\n      quotedRate: 125.5,')
vp = vp.replace('    expect(rate.rate).toBe(125.5);', '    expect(rate.quoted_rate).toBe(125.5);')
vp = vp.replace('for (const excluded of ["quoted_rate",', 'for (const excluded of ["rate", "article_name",')
(ROOT / "tests/vendor-profile.test.ts").write_text(vp)

# Replace rate-average tests with focused canonical resolver/average behavior.
write("tests/vendor-rate-average.test.ts", r'''import { describe, expect, test } from "bun:test";
import { articleVendorRateAverage, selectVendorArticleRates } from "../src/lib/rdash/vendor-rate-average";
import { resolveArticleRateConfig } from "../src/lib/rdash/article-rate-config";

function db() {
  return {
    master: {
      articles: [{ id: "a", name: "Article", unit_id: "box", default_unit_id: "pcs", conversion_quantity: 10, gst_inclusive: false, gst_percent: 18, base_rate: 0 }],
      articleVariants: [{ id: "v", article_id: "a", name: "20 pack", unit_id: "box", conversion_quantity: 20, gst_inclusive: true, gst_percent: 18 }],
      vendorRates: [
        { id: "r1", vendor_id: "ven1", article_id: "a", quoted_rate: 1000, status: "active", created_at: "2026-08-01", updated_at: "2026-08-01" },
        { id: "r2", vendor_id: "ven2", article_id: "a", variant_id: "v", quoted_rate: 1800, status: "active", created_at: "2026-08-02", updated_at: "2026-08-02" },
      ],
      vendorRateHistories: [{ id: "h-old", vendor_id: "ven3", article_id: "a", new_rate: 1, source_type: "MANUAL", status: "active", effective_from: "2020-01-01", created_at: "2020-01-01" }],
      subcategoryArticleMap: [], vendors: [], units: [], workCategories: [], workSubcategories: [], contractorRates: [], contractors: [], staff: [], sourcePartners: [], commissionRules: [], workOptionGroups: [], workOptionValues: [], customerRateSuggestions: [], storageAccounts: [], storageFolderTemplates: [], storageFolderInstances: [], fileAssets: [], catalogues: [], catalogueArticleVendorLinks: [], pinterestBoards: [], referenceMedia: [],
    },
  } as any;
}

describe("Article/Variant rate configuration", () => {
  test("Variant overrides Article and Article supplies defaults", () => {
    const state = db();
    expect(resolveArticleRateConfig({ articleId: "a", articles: state.master.articles, variants: state.master.articleVariants })).toEqual({ rateUnit: "box", baseUnit: "pcs", conversionQuantity: 10, gstInclusive: false, gstPercent: 18, isComplete: true });
    expect(resolveArticleRateConfig({ articleId: "a", variantId: "v", articles: state.master.articles, variants: state.master.articleVariants })).toEqual({ rateUnit: "box", baseUnit: "pcs", conversionQuantity: 20, gstInclusive: true, gstPercent: 18, isComplete: true });
  });
});

describe("canonical Vendor quoted-rate average", () => {
  test("uses current rates only and normalizes with configured conversion quantity", () => {
    const state = db();
    const selected = selectVendorArticleRates(state, "a");
    expect(selected.map((row) => row.normalizedQuotedRate)).toEqual([100, 90]);
    expect(articleVendorRateAverage(state, "a").average).toBe(95);
    expect(selected.some((row) => row.vendorId === "ven3")).toBe(false);
  });
});
''')

# Permanent regression: no old Vendor form/capability/rate model can return.
write("tests/vendor-legacy-removal.test.ts", r'''import { describe, expect, test } from "bun:test";

const source = async (path: string) => Bun.file(path).text();

describe("Vendor canonical architecture", () => {
  test("Vendor has one dedicated form and no shared legacy bridge", async () => {
    const router = await source("src/components/rdash/PartnerFormDialog.tsx");
    expect(router).toContain("VendorFormDialog");
    expect(await Bun.file("src/components/rdash/UnifiedPartnerFormDialog.tsx").exists()).toBe(false);
    expect(await Bun.file("src/lib/rdash/partner-form-store-bridge.ts").exists()).toBe(false);
  });
  test("Vendor profile uses supply_capabilities only", async () => {
    const profile = await source("src/lib/rdash/vendor-profile.ts");
    expect(profile).toContain("supply_capabilities");
    expect(profile).not.toContain("capabilities_v2");
    expect(profile).not.toContain("article_ids");
  });
  test("live VendorRate has only canonical commercial fields", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const start = types.indexOf("export interface VendorRate {");
    const end = types.indexOf("export interface VendorRateHistory", start);
    const block = types.slice(start, end);
    for (const field of ["quoted_rate", "vendor_id", "article_id", "variant_id", "status", "created_at", "updated_at"]) expect(block).toContain(field);
    for (const legacy of ["unit_id", "work_required_article_id", "gst_inclusive", "gst_rate", "discount_pct", "freight_amount", "valid_from", "current_source_type", "article_name", "rate:"]) expect(block).not.toContain(legacy);
  });
  test("all Vendor rate configuration resolves through Article/Variant", async () => {
    const resolver = await source("src/lib/rdash/article-rate-config.ts");
    const average = await source("src/lib/rdash/vendor-rate-average.ts");
    const price = await source("src/components/rdash/modules/VendorPriceMasterModule.tsx");
    expect(resolver).toContain("resolveArticleRateConfig");
    expect(average).toContain("resolveArticleRateConfig");
    expect(average).not.toContain("freight_amount");
    expect(average).not.toContain("gst_rate");
    expect(price).toContain("resolveArticleRateConfig");
  });
});
''')

# Package/CI scripts.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text())
package["scripts"]["test:vendor-module"] = "bun test tests/vendor-profile.test.ts tests/vendor-rate-average.test.ts tests/vendor-legacy-removal.test.ts"
package_path.write_text(json.dumps(package, indent=2) + "\n")

# Reproducible data migration. New code is deployed before this migration is applied live.
write("supabase/migrations/20260813165000_canonicalize_vendor_profile_and_rates.sql", r'''-- Canonical Vendor profile cutover.
-- supply_capabilities is the only Vendor supply model. Live Vendor Rates are
-- already empty in production at this cutover, but legacy keys are stripped
-- defensively if rows exist in another environment.

update public."entity_master_vendors" v
set data = (
  v.data
  - 'article_ids' - 'capabilities_v2' - 'verified_bank'
  - 'pan' - 'bank_account' - 'ifsc' - 'payment_terms' - 'credit_days'
  - 'credit_limit' - 'minimum_order_value' - 'standard_lead_time_days'
  - 'warranty_terms' - 'udyam_no'
) || jsonb_build_object(
  'supply_capabilities',
  case
    when jsonb_typeof(v.data->'supply_capabilities') = 'array' then v.data->'supply_capabilities'
    else coalesce((
      select jsonb_agg(capability order by ord)
      from (
        select ord, jsonb_strip_nulls(jsonb_build_object(
          'id', coalesce(nullif(item->>'id',''), 'vendor-cap-' || coalesce(item->>'article_id','unknown')),
          'article_id', item->>'article_id',
          'article_name', item->>'article_name',
          'variant_ids', case when nullif(item->>'variant_id','') is null then '[]'::jsonb else jsonb_build_array(item->>'variant_id') end,
          'brand', item->>'brand',
          'availability', case coalesce(item->>'supply_mode','') when 'stocked' then 'in_stock' when 'on_order' then 'on_order' when 'special_order' then 'on_order' else 'unknown' end,
          'typical_lead_time_days', nullif(item->>'lead_time_days','')::numeric,
          'moq', nullif(item->>'minimum_order_qty','')::numeric,
          'preferred', coalesce((item->>'preferred')::boolean,false),
          'status', coalesce(nullif(item->>'status',''),'active'),
          'notes', item->>'notes'
        )) capability
        from jsonb_array_elements(case when jsonb_typeof(v.data->'capabilities_v2')='array' then v.data->'capabilities_v2' else '[]'::jsonb end) with ordinality rows(item,ord)
        where nullif(item->>'article_id','') is not null
        union all
        select 100000 + ord, jsonb_build_object('id','vendor-cap-' || article_id,'article_id',article_id,'variant_ids','[]'::jsonb,'availability','unknown','preferred',false,'status','active')
        from jsonb_array_elements_text(case when jsonb_typeof(v.data->'article_ids')='array' then v.data->'article_ids' else '[]'::jsonb end) with ordinality ids(article_id,ord)
        where not exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(v.data->'capabilities_v2')='array' then v.data->'capabilities_v2' else '[]'::jsonb end) old
          where old->>'article_id'=article_id
        )
      ) migrated
    ), '[]'::jsonb)
  end
);

update public."entity_master_vendorRates"
set data = jsonb_strip_nulls(jsonb_build_object(
  'id', data->>'id',
  'vendor_id', data->>'vendor_id',
  'article_id', data->>'article_id',
  'variant_id', nullif(data->>'variant_id',''),
  'quoted_rate', coalesce(nullif(data->>'quoted_rate','')::numeric, nullif(data->>'rate','')::numeric),
  'status', case when data->>'status'='inactive' then 'inactive' else 'active' end,
  'created_at', coalesce(data->>'created_at', data->>'updated_at', now()::text),
  'updated_at', coalesce(data->>'updated_at', now()::text)
));
''')

print("Canonical Vendor module transformation applied.")
