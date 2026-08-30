import type { Article, WorkCategory, WorkRequiredArticle, WorkSubcategory } from "./types";

export type VendorCapabilityTaxonomyMaster = {
  workCategories: WorkCategory[];
  workSubcategories: WorkSubcategory[];
  articles: Article[];
  subcategoryArticleMap: WorkRequiredArticle[];
};

type VendorCapabilityTaxonomySelection = {
  categoryIds: string[];
  subcategoryIds: string[];
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

function vendorArticleSubcategoryIds(
  master: VendorCapabilityTaxonomyMaster,
  articleId: string,
): string[] {
  const validSubcategoryIds = new Set(master.workSubcategories.map((row) => row.id));
  return unique(
    master.subcategoryArticleMap
      .filter((row) => row.article_id === articleId && validSubcategoryIds.has(row.work_required_id))
      .map((row) => row.work_required_id),
  );
}

export function deriveVendorCapabilityTaxonomySelection(
  master: VendorCapabilityTaxonomyMaster,
  articleIds: string[],
): VendorCapabilityTaxonomySelection {
  const selectedArticleIds = new Set(articleIds);
  const subcategoryIds = unique(
    master.subcategoryArticleMap
      .filter((row) => selectedArticleIds.has(row.article_id))
      .map((row) => row.work_required_id),
  ).filter((id) => master.workSubcategories.some((row) => row.id === id));
  const categoryIds = unique([
    ...master.workSubcategories
      .filter((row) => subcategoryIds.includes(row.id))
      .map((row) => row.category_id),
    ...master.articles
      .filter((row) => selectedArticleIds.has(row.id))
      .map((row) => row.category_id || ""),
  ]).filter((id) => master.workCategories.some((row) => row.id === id));

  return { categoryIds, subcategoryIds };
}

export function vendorArticlesForTaxonomy(
  master: VendorCapabilityTaxonomyMaster,
  options: {
    selectedCategoryIds: string[];
    selectedSubcategoryIds: string[];
    excludedArticleIds?: string[];
    query?: string;
    limit?: number;
  },
): Article[] {
  if (!options.selectedCategoryIds.length || !options.selectedSubcategoryIds.length) return [];

  const selectedCategories = new Set(options.selectedCategoryIds);
  const selectedSubcategories = new Set(
    master.workSubcategories
      .filter((row) => selectedCategories.has(row.category_id) && options.selectedSubcategoryIds.includes(row.id))
      .map((row) => row.id),
  );
  if (!selectedSubcategories.size) return [];

  const allowedArticleIds = new Set(
    master.subcategoryArticleMap
      .filter((row) => selectedSubcategories.has(row.work_required_id))
      .map((row) => row.article_id),
  );
  const excludedArticleIds = new Set(options.excludedArticleIds || []);
  const query = String(options.query || "").trim().toLowerCase();
  if (!query) return [];

  return master.articles
    .filter((article) => allowedArticleIds.has(article.id))
    .filter((article) => !excludedArticleIds.has(article.id))
    .filter((article) => article.name.toLowerCase().includes(query))
    .slice(0, options.limit ?? 8);
}

export function vendorArticleTaxonomyLabels(
  master: VendorCapabilityTaxonomyMaster,
  articleId: string,
): { categoryName: string; subcategoryNames: string[] } {
  const article = master.articles.find((row) => row.id === articleId);
  const subcategoryIds = vendorArticleSubcategoryIds(master, articleId);
  const subcategories = master.workSubcategories.filter((row) => subcategoryIds.includes(row.id));
  const categoryId = article?.category_id || subcategories[0]?.category_id;
  const category = master.workCategories.find((row) => row.id === categoryId);

  return {
    categoryName: category?.name || "Uncategorized",
    subcategoryNames: subcategories.map((row) => row.name),
  };
}
