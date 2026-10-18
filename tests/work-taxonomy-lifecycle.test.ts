import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { workTaxonomyReferences } from "../src/lib/rdash/work-category-master";
import { isActiveWorkTaxonomy, withPrimaryWorkTypeIds, workTypesForSubcategory } from "../src/lib/rdash/work-types";

describe("work taxonomy lifecycle", () => {
  test("treats existing rows as active and archived rows as unavailable", () => {
    expect(isActiveWorkTaxonomy({})).toBe(true);
    expect(isActiveWorkTaxonomy({ status: "active" })).toBe(true);
    expect(isActiveWorkTaxonomy({ status: "archived" })).toBe(false);
  });

  test("chooses the first active work type as the default", () => {
    const subcategory = {
      id: "sub-1",
      category_id: "cat-1",
      name: "Painting",
      work_types: [
        { id: "old", name: "Old", status: "archived" as const },
        { id: "standard", name: "Standard" },
      ],
    };
    expect(withPrimaryWorkTypeIds([subcategory], [subcategory.id], [])).toEqual(["standard"]);
  });

  test("finds exact reverse references without counting the definition", () => {
    const db = buildSeedDatabase();
    const category = db.master.workCategories[0];
    if (!category) throw new Error("Seed database must include a work category.");
    const subcategory = db.master.workSubcategories.find((row) => row.category_id === category.id);
    if (!subcategory) throw new Error("Seed database must include a work subcategory.");
    const workType = workTypesForSubcategory(subcategory)[0];
    if (!workType) throw new Error("Seed database must include a work type.");
    db.workRequired.push({
      id: "work-taxonomy-reference",
      customer_id: db.customers[0].id,
      site_id: db.sites[0].id,
      title: "Reference",
      work_subcategory_ids: [subcategory.id],
      work_type_ids: [workType.id],
      area_ids: [],
      status: "new",
      priority: "medium",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(workTaxonomyReferences(db, "category", category.id).some((row) => row.collection === "Work Subcategories")).toBe(true);
    expect(workTaxonomyReferences(db, "subcategory", subcategory.id).some((row) => row.collection === "Work Required")).toBe(true);
    expect(workTaxonomyReferences(db, "workType", workType.id).some((row) => row.collection === "Work Required")).toBe(true);
  });
});
