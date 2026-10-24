import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { buildWorkCategoryCatalog, getCatalogIssues } from "../src/lib/rdash/work-category-master";
import { workRequiredCategoryIds, workSubcategoryCategoryIds } from "../src/lib/rdash/work-types";
import { assertLineItemCatalogRelations } from "../src/lib/rdash/business-rules";
import { vendorArticlesForTaxonomy } from "../src/lib/rdash/vendor-capability-taxonomy";
import { draftForWorkRequired } from "../src/components/rdash/customer-sites-form-model";
import type { LineItem, WorkRequired } from "../src/lib/rdash/types";

describe("one catalogue service through multiple category paths", () => {
  test.each(["Texture Paint (Exterior)", "Glazing Work"])("seed contains one %s identity", (name) => {
    const catalog = buildWorkCategoryCatalog();
    const rows = catalog.workSubcategories.filter((row) => row.name === name);
    expect(rows).toHaveLength(1);
    expect(workSubcategoryCategoryIds(rows[0])).toHaveLength(2);
    expect(rows[0].work_types).toHaveLength(1);
  });
  test("old single-category records continue to work", () => {
    expect(workSubcategoryCategoryIds({ category_id: "paint" })).toEqual(["paint"]);
    expect(workSubcategoryCategoryIds({ category_id: "paint", category_ids: ["paint", "facade", "facade"] })).toEqual(["paint", "facade"]);
  });
  test("saved selection restores both paths, with only one work type", () => {
    const db = buildSeedDatabase();
    const row = db.master.workSubcategories.find((row) => row.name === "Texture Paint (Exterior)")!;
    const work = { id: "work-1", work_subcategory_ids: [row.id], work_type_ids: [row.work_types![0].id] } as WorkRequired;
    expect(workRequiredCategoryIds(db.master.workSubcategories, work)).toEqual(workSubcategoryCategoryIds(row));
    const draft = draftForWorkRequired(work, db.master);
    expect(draft.categoryIds).toHaveLength(2);
    expect(draft.workTypeIds).toHaveLength(1);
  });
  test("line validation accepts either category but rejects unrelated categories without repricing", () => {
    const db = buildSeedDatabase();
    const row = db.master.workSubcategories.find((row) => row.name === "Texture Paint (Exterior)")!;
    for (const category_id of workSubcategoryCategoryIds(row)) {
      const line = { id: "line-1", title: "Historic quote", category_id, subcategory_id: row.id, work_type_id: row.work_types![0].id, quantity: 7, rate: 123, amount: 861 } as LineItem;
      const original = structuredClone(line);
      expect(() => assertLineItemCatalogRelations(db, line, "Quote")).not.toThrow();
      expect(line).toEqual(original);
      line.category_id = db.master.workCategories.find((category) => !workSubcategoryCategoryIds(row).includes(category.id))!.id;
      expect(() => assertLineItemCatalogRelations(db, line, "Quote")).toThrow();
    }
  });
  test("vendor material filters reuse the same material scope from either path", () => {
    const db = buildSeedDatabase();
    const row = db.master.workSubcategories.find((row) => row.name === "Texture Paint (Exterior)")!;
    const result = workSubcategoryCategoryIds(row).map((id) => vendorArticlesForTaxonomy(db.master, { selectedCategoryIds: [id], selectedSubcategoryIds: [row.id] }).map((article) => article.id));
    expect(result[0].length).toBeGreaterThan(0);
    expect(result[0]).toEqual(result[1]);
  });
  test("catalogue checks detect an invalid secondary category", () => {
    const db = structuredClone(buildSeedDatabase());
    db.master.workSubcategories[0].category_ids = ["missing-category"];
    expect(getCatalogIssues(db.master).some((issue) => issue.message.includes("no valid category"))).toBe(true);
  });
});
