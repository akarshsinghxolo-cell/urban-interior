import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  defaultWorkTypeId,
  normalizeWorkSubcategoryWorkTypes,
  pruneWorkTypeIds,
  resolveWorkTypes,
  workTypeNamesForIds,
  workTypesForSubcategory,
} from "../src/lib/rdash/work-types";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("work-type master", () => {
  test("a subcategory without work types receives only a deterministic identity row", () => {
    const normalized = normalizeWorkSubcategoryWorkTypes({
      id: "sub-paint",
      category_id: "cat-paint",
      name: "Interior Painting",
      unit_id: "sqft",
      notes: "Scope row",
    });

    expect(normalized.work_types).toEqual([{
      id: defaultWorkTypeId("sub-paint"),
      name: "Standard",
      unit_id: "sqft",
      notes: "Scope row",
      created_at: undefined,
      updated_at: undefined,
    }]);
  });

  test("multiple editable work types retain identity, unit and notes only", () => {
    const rows = workTypesForSubcategory({
      id: "sub-paint",
      category_id: "cat-paint",
      name: "Interior Painting",
      work_types: [
        { id: "budget", name: "Budget", unit_id: "sqft", notes: "Budget finish" },
        { id: "luxury", name: "Luxury", unit_id: "sqft", notes: "Luxury finish" },
      ],
    });
    expect(rows.map((row) => [row.name, row.unit_id, row.notes])).toEqual([
      ["Budget", "sqft", "Budget finish"],
      ["Luxury", "sqft", "Luxury finish"],
    ]);
  });

  test("resolveWorkTypes and workTypeNamesForIds resolve rows across subcategories", () => {
    const subcategories = [
      { id: "sub-kitchen", category_id: "cat-wood", name: "Kitchen Cabinets (Modular)", work_types: [
        { id: "wt-sub-kitchen-premium", name: "Premium" },
        { id: "wt-sub-kitchen-luxury", name: "Luxury" },
        { id: "wt-sub-kitchen-economy", name: "Economy" },
      ] },
      { id: "sub-wardrobe", category_id: "cat-wood", name: "Wardrobes", work_types: [
        { id: "wt-sub-wardrobe-premium", name: "Premium" },
      ] },
    ];

    const rows = resolveWorkTypes(subcategories, ["wt-sub-kitchen-luxury", "wt-sub-wardrobe-premium", "wt-sub-kitchen-missing"]);
    expect(rows.map((row) => row.id)).toEqual(["wt-sub-kitchen-luxury", "wt-sub-wardrobe-premium"]);
    expect(workTypeNamesForIds(subcategories, ["wt-sub-kitchen-luxury", "wt-sub-wardrobe-premium"])).toEqual(["Luxury", "Premium"]);
    expect(workTypeNamesForIds(subcategories, undefined)).toEqual([]);
  });

  test("pruneWorkTypeIds keeps only work types of the selected subcategories", () => {
    const subcategories = [
      { id: "sub-kitchen", category_id: "cat-wood", name: "Kitchen Cabinets (Modular)", work_types: [
        { id: "wt-sub-kitchen-premium", name: "Premium" },
        { id: "wt-sub-kitchen-luxury", name: "Luxury" },
      ] },
      { id: "sub-wardrobe", category_id: "cat-wood", name: "Wardrobes", work_types: [
        { id: "wt-sub-wardrobe-premium", name: "Premium" },
      ] },
    ];

    expect(pruneWorkTypeIds(subcategories, ["sub-kitchen"], ["wt-sub-kitchen-premium", "wt-sub-wardrobe-premium"]))
      .toEqual(["wt-sub-kitchen-premium"]);
    expect(pruneWorkTypeIds(subcategories, [], ["wt-sub-kitchen-premium"])).toEqual([]);
  });
});

describe("work types in the customer add/edit form and shared creation paths", () => {
  test("WorkRequiredFields exposes the work-type picker and prunes on subcategory change", () => {
    const source = read("../src/components/rdash/WorkRequiredFields.tsx");
    expect(source).toContain("Work Types");
    expect(source).toContain("workTypeIds");
    expect(source).toContain("pruneWorkTypeIds");
    expect(source).toContain("value.workTypeIds.includes(workType.id)");
  });

  test("the shared WorkRequiredCreateDialog persists work_type_ids", () => {
    const source = read("../src/components/rdash/WorkRequiredCreateDialog.tsx");
    expect(source).toContain("work_type_ids: draft.workTypeIds");
  });

  test("the detailed-area capture editor selects a work type per line", () => {
    const source = read("../src/components/rdash/modules/CustomerDesk.tsx");
    expect(source).toContain('ariaLabel="Work type"');
    expect(source).toContain("workTypeTicks");
    expect(source).toContain("work_type_id: line.work_type_id");
  });
});

describe("customer-module single canonical create dialog", () => {
  test("CreateMenuCore no longer carries the duplicated quotation branch", () => {
    const source = read("../src/components/rdash/CreateMenuCore.tsx");
    expect(source).not.toContain("addQuotation");
    expect(source).not.toContain("General scope");
    expect(source).not.toContain('kind === "quotation"');
  });

  test("CreateMenu routes quotation dialogs to the single customer quotation dialog", () => {
    const source = read("../src/components/rdash/CreateMenu.tsx");
    expect(source).toContain('createDialog?.kind === "quotation"');
    expect(source).toContain("CustomerQuotationDialog");
  });
});

describe("contractor and vendor domain separation", () => {
  test("contractor form contains the standard work-type rate row and no Article editor", () => {
    const source = read("../src/components/rdash/ContractorFormDialog.tsx");
    expect(source).toContain("work_type_rates");
    expect(source).toContain(">Work type</span>");
    expect(source).toContain(">Execution unit</span>");
    expect(source).toContain(">Material rate</span>");
    expect(source).toContain(">Labour rate</span>");
    expect(source).toContain(">Total rate</span>");
    expect(source).toContain(">Notes</span>");
    expect(source).toContain("Add work type");
    expect(source).toContain("sm:max-w-4xl");
    expect(source).toContain("grid-cols-1 gap-2");
    expect(source).not.toContain("min-w-[860px]");
    expect(source).not.toContain("overflow-x-auto");
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
    const migration = read("../supabase/migrations/20260825172252_canonical_contractor_work_type_rates.sql");
    const projection = migration.slice(
      migration.indexOf("create or replace function public.uc_contractor_rate_projection_rows"),
      migration.indexOf("revoke all on function public.uc_contractor_rate_projection_rows"),
    );
    expect(migration).toContain("'work_types'");
    expect(migration).toContain("'work_type_rates'");
    expect(migration).toContain("'material_rate', v_material");
    expect(migration).not.toMatch(/update public\.entity_master_vendors/i);
    expect(migration).not.toMatch(/update public\."entity_master_subcategoryArticleMap"/i);
    expect(projection).not.toContain("entity_master_articles");
    expect(projection).not.toContain("subcategoryArticleMap");
    expect(projection).not.toContain("with_material_rate");
  });
});
