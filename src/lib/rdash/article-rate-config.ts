import type { Article, ArticleVariant } from "./types";

type ArticleRateConfig = {
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
