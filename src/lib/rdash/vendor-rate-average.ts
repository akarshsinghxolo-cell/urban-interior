import type { RDashDatabase, VendorRate } from "./types";
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
