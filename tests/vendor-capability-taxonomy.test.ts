import { describe, expect, test } from "vitest";
import {
  deriveVendorCapabilityTaxonomySelection,
  vendorArticleTaxonomyLabels,
  vendorArticlesForTaxonomy,
  type VendorCapabilityTaxonomyMaster,
} from "../src/lib/rdash/vendor-capability-taxonomy";

const master: VendorCapabilityTaxonomyMaster = {
  workCategories: [
    { id: "cat-wall", name: "Wall Treatments" },
    { id: "cat-paint", name: "Paint Work" },
  ],
  workSubcategories: [
    { id: "sub-panel", category_id: "cat-wall", name: "Wall Panels" },
    { id: "sub-paper", category_id: "cat-wall", name: "Wallpaper" },
    { id: "sub-paint", category_id: "cat-paint", name: "Interior Paint" },
  ],
  articles: [
    { id: "art-panel", name: "PVC Wall Panel", category_id: "cat-wall" },
    { id: "art-paper", name: "Textured Wallpaper", category_id: "cat-wall" },
    { id: "art-primer", name: "Interior Primer", category_id: "cat-paint" },
    { id: "art-orphan", name: "Unmapped Wall Product", category_id: "cat-wall" },
  ],
  subcategoryArticleMap: [
    { id: "map-panel", work_required_id: "sub-panel", article_id: "art-panel", unit_id: "pcs", reference_rate: 0 },
    { id: "map-paper", work_required_id: "sub-paper", article_id: "art-paper", unit_id: "roll", reference_rate: 0 },
    { id: "map-primer", work_required_id: "sub-paint", article_id: "art-primer", unit_id: "ltr", reference_rate: 0 },
  ],
};

describe("Vendor capability taxonomy", () => {
  test("derives Category and Subcategory filters from saved Article capabilities", () => {
    expect(deriveVendorCapabilityTaxonomySelection(master, ["art-panel", "art-primer"])).toEqual({
      categoryIds: ["cat-wall", "cat-paint"],
      subcategoryIds: ["sub-panel", "sub-paint"],
    });
  });

  test("offers only mapped Articles for the selected Category and Subcategory", () => {
    expect(vendorArticlesForTaxonomy(master, {
      selectedCategoryIds: ["cat-wall"],
      selectedSubcategoryIds: ["sub-panel"],
      query: "panel",
    }).map((row) => row.id)).toEqual(["art-panel"]);

    expect(vendorArticlesForTaxonomy(master, {
      selectedCategoryIds: ["cat-wall"],
      selectedSubcategoryIds: ["sub-panel"],
      excludedArticleIds: ["art-panel"],
      query: "panel",
    })).toEqual([]);
  });

  test("requires the complete hierarchy before Article search is enabled", () => {
    expect(vendorArticlesForTaxonomy(master, {
      selectedCategoryIds: ["cat-wall"],
      selectedSubcategoryIds: [],
      query: "panel",
    })).toEqual([]);
  });

  test("labels saved capabilities with their canonical taxonomy path", () => {
    expect(vendorArticleTaxonomyLabels(master, "art-panel")).toEqual({
      categoryName: "Wall Treatments",
      subcategoryNames: ["Wall Panels"],
    });
  });
});

