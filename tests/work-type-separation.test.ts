import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  defaultWorkTypeId,
  normalizeWorkSubcategoryWorkTypes,
  workTypesForSubcategory,
} from "../src/lib/rdash/work-types";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("work-type master", () => {
  test("legacy subcategory rates become a deterministic Standard work type", () => {
    const normalized = normalizeWorkSubcategoryWorkTypes({
      id: "sub-paint",
      category_id: "cat-paint",
      name: "Interior Painting",
      unit_id: "sqft",
      material_rate: 40,
      labour_rate: 25,
      notes: "Legacy row",
    });

    expect(normalized.material_rate).toBeUndefined();
    expect(normalized.labour_rate).toBeUndefined();
    expect(normalized.work_types).toEqual([{
      id: defaultWorkTypeId("sub-paint"),
      name: "Standard",
      unit_id: "sqft",
      material_rate: 40,
      labour_rate: 25,
      notes: "Legacy row",
      created_at: undefined,
      updated_at: undefined,
    }]);
  });

  test("multiple editable work types retain independent rates", () => {
    const rows = workTypesForSubcategory({
      id: "sub-paint",
      category_id: "cat-paint",
      name: "Interior Painting",
      work_types: [
        { id: "budget", name: "Budget", unit_id: "sqft", material_rate: 30, labour_rate: 15 },
        { id: "luxury", name: "Luxury", unit_id: "sqft", material_rate: 120, labour_rate: 70 },
      ],
    });
    expect(rows.map((row) => [row.name, row.material_rate, row.labour_rate])).toEqual([
      ["Budget", 30, 15],
      ["Luxury", 120, 70],
    ]);
  });
});

describe("contractor and vendor domain separation", () => {
  test("contractor form contains work-type labour rates and no material/article capability editor", () => {
    const source = read("../src/components/rdash/ContractorFormDialog.tsx");
    expect(source).toContain("work_type_rates");
    expect(source).toContain("Labour rate ₹");
    expect(source).not.toContain("subcategoryArticleMap");
    expect(source).not.toContain("with_material_rate");
    expect(source).not.toContain("article_rates");
  });

  test("Master Setup exposes editable work types and scoped article names", () => {
    const source = read("../src/components/rdash/modules/WorkCategoryMasterModule.tsx");
    expect(source).toContain("Add work type");
    expect(source).toContain("Work type</span><span>Execution unit");
    expect(source).toContain("updateArticle(article.id, { name: event.target.value })");
  });

  test("database migration leaves Vendor Article tables untouched", () => {
    const migration = read("../supabase/migrations/20260825121000_separate_contractor_work_types_from_vendor_articles.sql");
    const projection = migration.slice(
      migration.indexOf("create or replace function public.uc_contractor_rate_projection_rows"),
      migration.indexOf("revoke all on function public.uc_contractor_rate_projection_rows"),
    );
    expect(migration).toContain("'work_types'");
    expect(migration).toContain("'work_type_rates'");
    expect(migration).not.toMatch(/update public\.entity_master_vendors/i);
    expect(migration).not.toMatch(/update public\."entity_master_subcategoryArticleMap"/i);
    expect(projection).not.toContain("entity_master_articles");
    expect(projection).not.toContain("subcategoryArticleMap");
    expect(projection).not.toContain("with_material_rate");
  });
});
