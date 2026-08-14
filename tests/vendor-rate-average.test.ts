import { describe, expect, test } from "vitest";
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
