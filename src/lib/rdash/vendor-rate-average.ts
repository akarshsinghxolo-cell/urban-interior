import type {
  Article,
  ArticleVariant,
  RDashDatabase,
  VendorRate,
  VendorRateHistory,
} from "./types";
import { vendorQuotedRate } from "./vendor-profile";

const EPSILON = 1e-9;
const PACKAGE_UNITS = new Set(["box", "roll", "bag", "tube"]);

type RateTimingFields = {
  status?: string;
  effective_from?: string;
  effective_to?: string;
  updated_at?: string;
  created_at?: string;
};

export type VendorArticleRateCandidate = RateTimingFields & {
  sourceKind: "current" | "history";
  sourceId: string;
  vendorRateId?: string;
  vendorId: string;
  articleId: string;
  variantId?: string;
  rawRate: number;
  rawUnitId?: string;
};

export type SelectedVendorArticleRate = VendorArticleRateCandidate & {
  defaultUnitId?: string;
  quotedRate: number;
  conversionFactor?: number;
  normalizedQuotedRate?: number;
  active: boolean;
  conversionError?: string;
};

export type ArticleVendorRateAverage = {
  articleId: string;
  defaultUnitId?: string;
  average?: number;
  selected: SelectedVendorArticleRate[];
  included: SelectedVendorArticleRate[];
  skipped: SelectedVendorArticleRate[];
};

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizedUnitId(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\./g, "");
}

function dateTime(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function effectiveTime(candidate: VendorArticleRateCandidate): number {
  return Math.max(
    dateTime(candidate.updated_at),
    dateTime(candidate.effective_from),
    dateTime(candidate.created_at),
  );
}

function isActiveCandidate(candidate: VendorArticleRateCandidate, at: Date): boolean {
  const status = String(candidate.status || "active").trim().toLowerCase();
  if (status !== "active") return false;
  if (candidate.sourceKind === "current") return true;
  const instant = at.getTime();
  const startsAt = dateTime(candidate.effective_from);
  const endsAt = dateTime(candidate.effective_to);
  if (startsAt && startsAt > instant) return false;
  if (endsAt && endsAt < instant) return false;
  return true;
}

const COUNT_IN_PIECES: Record<string, number> = {
  pcs: 1,
  piece: 1,
  pieces: 1,
  nos: 1,
  number: 1,
  numbers: 1,
  unit: 1,
  pair: 2,
};
const LENGTH_IN_METRES: Record<string, number> = {
  mtr: 1,
  metre: 1,
  meter: 1,
  rft: 0.3048,
  ft: 0.3048,
};
const VOLUME_IN_LITRES: Record<string, number> = {
  ltr: 1,
  litre: 1,
  liter: 1,
  cft: 28.316846592,
};

function standardConversionFactor(rawUnitId: string, defaultUnitId: string): number | undefined {
  if (!rawUnitId || !defaultUnitId) return undefined;
  if (rawUnitId === defaultUnitId) return 1;
  for (const family of [COUNT_IN_PIECES, LENGTH_IN_METRES, VOLUME_IN_LITRES]) {
    const raw = family[rawUnitId];
    const target = family[defaultUnitId];
    if (raw && target) return raw / target;
  }
  return undefined;
}

function parsedPackFactor(
  variant: ArticleVariant | undefined,
  rawUnitId: string,
  defaultUnitId: string,
): number | undefined {
  if (!variant?.pack_size || !PACKAGE_UNITS.has(rawUnitId)) return undefined;
  const match = variant.pack_size.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z. ]+)$/);
  if (!match) return undefined;
  const quantity = positiveNumber(match[1]);
  const packedUnit = normalizedUnitId(match[2]).replace(/\s+/g, "");
  if (!quantity) return undefined;
  const packedToDefault = standardConversionFactor(packedUnit, defaultUnitId);
  return packedToDefault ? quantity * packedToDefault : undefined;
}

function configuredQuotedUnit(
  database: RDashDatabase,
  article: Article,
  candidate: VendorArticleRateCandidate,
) {
  if (candidate.sourceKind === "history" && candidate.rawUnitId) return candidate.rawUnitId;
  const variant = candidate.variantId
    ? database.master.articleVariants.find((row) => row.id === candidate.variantId && row.article_id === article.id)
    : undefined;
  return variant?.unit_id || article.default_unit_id || article.unit_id;
}

export function defaultUnitsPerQuotedUnit(
  database: RDashDatabase,
  article: Article,
  candidate: VendorArticleRateCandidate,
): number | undefined {
  const defaultUnitId = normalizedUnitId(article.default_unit_id || article.unit_id);
  const rawUnitId = normalizedUnitId(configuredQuotedUnit(database, article, candidate) || defaultUnitId);
  const standard = standardConversionFactor(rawUnitId, defaultUnitId);
  if (standard) return standard;
  const variant = candidate.variantId
    ? database.master.articleVariants.find((row) => row.id === candidate.variantId && row.article_id === article.id)
    : undefined;
  return parsedPackFactor(variant, rawUnitId, defaultUnitId);
}

function currentCandidate(database: RDashDatabase, rate: VendorRate): VendorArticleRateCandidate {
  const article = database.master.articles.find((row) => row.id === rate.article_id);
  const variant = rate.variant_id
    ? database.master.articleVariants.find((row) => row.id === rate.variant_id && row.article_id === rate.article_id)
    : undefined;
  return {
    sourceKind: "current",
    sourceId: rate.id,
    vendorRateId: rate.id,
    vendorId: rate.vendor_id,
    articleId: rate.article_id,
    variantId: rate.variant_id,
    rawRate: vendorQuotedRate(rate),
    rawUnitId: variant?.unit_id || article?.default_unit_id || article?.unit_id,
    status: rate.status,
    updated_at: rate.updated_at,
    created_at: rate.created_at,
  };
}

function historyCandidate(history: VendorRateHistory): VendorArticleRateCandidate {
  return {
    sourceKind: "history",
    sourceId: history.id,
    vendorRateId: history.vendor_rate_id,
    vendorId: history.vendor_id,
    articleId: history.article_id,
    variantId: history.variant_id,
    rawRate: finiteNumber(history.new_rate),
    rawUnitId: history.unit_id,
    status: history.status,
    effective_from: history.effective_from,
    effective_to: history.effective_to,
    created_at: history.created_at,
  };
}

export function vendorRateCandidatesForArticle(
  database: RDashDatabase,
  articleId: string,
): VendorArticleRateCandidate[] {
  return [
    ...database.master.vendorRates
      .filter((rate) => rate.article_id === articleId)
      .map((rate) => currentCandidate(database, rate)),
    ...database.master.vendorRateHistories
      .filter((rate) => rate.article_id === articleId)
      .map(historyCandidate),
  ].filter((candidate) => candidate.vendorId && Number.isFinite(Number(candidate.rawRate)) && candidate.rawRate > 0);
}

export function selectVendorArticleRates(
  database: RDashDatabase,
  articleId: string,
  at = new Date(),
): SelectedVendorArticleRate[] {
  const article = database.master.articles.find((row) => row.id === articleId);
  if (!article) return [];
  const defaultUnitId = article.default_unit_id || article.unit_id;
  const byVendor = new Map<string, VendorArticleRateCandidate[]>();
  for (const candidate of vendorRateCandidatesForArticle(database, articleId)) {
    const rows = byVendor.get(candidate.vendorId) || [];
    rows.push(candidate);
    byVendor.set(candidate.vendorId, rows);
  }

  return [...byVendor.values()].map((rows) => {
    const latestFirst = [...rows].sort((left, right) => {
      const timeDiff = effectiveTime(right) - effectiveTime(left);
      if (timeDiff) return timeDiff;
      return Number(right.sourceKind === "current") - Number(left.sourceKind === "current");
    });
    const selected = latestFirst.find((candidate) => isActiveCandidate(candidate, at)) || latestFirst[0];
    const quoted = Math.max(0, finiteNumber(selected.rawRate));
    const conversionFactor = defaultUnitsPerQuotedUnit(database, article, selected);
    const normalized = conversionFactor ? quoted / conversionFactor : undefined;
    return {
      ...selected,
      rawUnitId: configuredQuotedUnit(database, article, selected),
      defaultUnitId,
      quotedRate: quoted,
      conversionFactor,
      normalizedQuotedRate: normalized,
      active: isActiveCandidate(selected, at),
      conversionError: conversionFactor
        ? undefined
        : `Configure the Article/Variant unit or pack size so this quote can be converted to ${defaultUnitId || "the default unit"}.`,
    };
  });
}

export function articleVendorRateAverage(
  database: RDashDatabase,
  articleId: string,
  at = new Date(),
): ArticleVendorRateAverage {
  const article = database.master.articles.find((row) => row.id === articleId);
  const selected = selectVendorArticleRates(database, articleId, at);
  const included = selected.filter((row) => Number.isFinite(row.normalizedQuotedRate));
  const skipped = selected.filter((row) => !Number.isFinite(row.normalizedQuotedRate));
  const average = included.length
    ? included.reduce((sum, row) => sum + (row.normalizedQuotedRate as number), 0) / included.length
    : undefined;
  return {
    articleId,
    defaultUnitId: article?.default_unit_id || article?.unit_id,
    average,
    selected,
    included,
    skipped,
  };
}

function changedArticleIds(previous: RDashDatabase, candidate: RDashDatabase): Set<string> {
  const changed = new Set<string>();
  const compare = (
    previousRows: Array<{ id: string; article_id: string }>,
    candidateRows: Array<{ id: string; article_id: string }>,
  ) => {
    const before = new Map(previousRows.map((row) => [row.id, row]));
    const after = new Map(candidateRows.map((row) => [row.id, row]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const left = before.get(id);
      const right = after.get(id);
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
      if (left?.article_id) changed.add(left.article_id);
      if (right?.article_id) changed.add(right.article_id);
    }
  };
  compare(previous.master.vendorRates, candidate.master.vendorRates);
  compare(previous.master.vendorRateHistories, candidate.master.vendorRateHistories);
  return changed;
}

export function applyVendorRateAverages(
  previous: RDashDatabase,
  candidate: RDashDatabase,
  options: { articleIds?: Iterable<string>; at?: Date; updatedAt?: string } = {},
): RDashDatabase {
  if (!options.articleIds
    && previous.master.vendorRates === candidate.master.vendorRates
    && previous.master.vendorRateHistories === candidate.master.vendorRateHistories) {
    return candidate;
  }
  const articleIds = options.articleIds
    ? new Set(options.articleIds)
    : changedArticleIds(previous, candidate);
  if (!articleIds.size) return candidate;

  const updatedAt = options.updatedAt || new Date().toISOString();
  const averages = new Map<string, number>();
  for (const articleId of articleIds) {
    const average = articleVendorRateAverage(candidate, articleId, options.at).average;
    if (average !== undefined && Number.isFinite(average)) averages.set(articleId, average);
  }
  if (!averages.size) return candidate;

  let articleChanged = false;
  const articles = candidate.master.articles.map((article) => {
    const average = averages.get(article.id);
    if (average === undefined || Math.abs((article.base_rate ?? 0) - average) <= EPSILON) return article;
    articleChanged = true;
    return { ...article, base_rate: average, updated_at: updatedAt };
  });
  let mapChanged = false;
  const subcategoryArticleMap = candidate.master.subcategoryArticleMap.map((row) => {
    const average = averages.get(row.article_id);
    if (average === undefined || Math.abs(row.reference_rate - average) <= EPSILON) return row;
    mapChanged = true;
    return { ...row, reference_rate: average, updated_at: updatedAt };
  });
  if (!articleChanged && !mapChanged) return candidate;
  return {
    ...candidate,
    master: {
      ...candidate.master,
      articles: articleChanged ? articles : candidate.master.articles,
      subcategoryArticleMap: mapChanged ? subcategoryArticleMap : candidate.master.subcategoryArticleMap,
    },
  };
}

export function formatRateWithUnit(value: number | undefined, unit?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 12,
  }).format(value);
  return unit ? `${amount} / ${unit}` : amount;
}
