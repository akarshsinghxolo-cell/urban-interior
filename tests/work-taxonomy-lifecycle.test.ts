import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { forceDeleteWorkType, workTaxonomyReferences } from "../src/lib/rdash/work-category-master";
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

  test("force deletion moves every exact reference to the next work type", () => {
    const db = buildSeedDatabase();
    const subcategory = db.master.workSubcategories.find((row) => workTypesForSubcategory(row).length > 0)!;
    const replacement = workTypesForSubcategory(subcategory)[0];
    const removed = { ...replacement, id: "wt-remove", name: "Remove me" };
    subcategory.work_types = [replacement, removed];
    const work = db.workRequired[0];
    work.work_subcategory_ids = [subcategory.id];
    work.work_type_ids = [replacement.id, removed.id];
    work.structured_items = [{
      id: "line-force-delete", title: "Remove me", quantity: 1, rate: 1, amount: 1,
      subcategory_id: subcategory.id, work_type_id: removed.id,
      option_pairs: [{ subcategory_id: subcategory.id, work_type_id: removed.id }],
    }];
    db.master.contractorRates.push({
      id: "rate-force-delete", contractor_id: "contractor-force-delete", trade: "Remove me", rate: 1,
      work_subcategory_id: subcategory.id, work_type_id: removed.id, work_type_name: removed.name,
    });
    db.auditLog.push({
      id: "audit-force-delete", actor: "Owner", action: "Selected Remove me", entity_type: "workSubcategory",
      entity_id: subcategory.id, kind: "update", after: { work_type_id: removed.id }, timestamp: new Date().toISOString(),
    });
    db.master.contractorRates.push({
      id: "rate-keep-replacement", contractor_id: "contractor-force-delete", trade: "Keep replacement", rate: 99,
      work_subcategory_id: subcategory.id, work_type_id: replacement.id, work_type_name: replacement.name,
    });

    const result = forceDeleteWorkType(db, subcategory.id, removed.id, replacement.id);

    expect(result.movedReferences).toBeGreaterThan(0);
    expect(workTaxonomyReferences(result.db, "workType", removed.id)).toEqual([]);
    expect(workTypesForSubcategory(result.db.master.workSubcategories.find((row) => row.id === subcategory.id)!)).not.toContainEqual(expect.objectContaining({ id: removed.id }));
    expect(result.db.workRequired[0].work_type_ids).toEqual([replacement.id]);
    expect(result.db.workRequired[0].structured_items?.[0]).toMatchObject({ work_type_id: replacement.id, title: "Standard" });
    expect(result.db.auditLog.find((row) => row.id === "audit-force-delete")?.after).toEqual({ work_type_id: removed.id });
    expect(result.db.master.contractorRates.find((row) => row.id === "rate-force-delete")).toBeUndefined();
    expect(result.db.master.contractorRates.find((row) => row.id === "rate-keep-replacement")).toMatchObject({ work_type_id: replacement.id, rate: 99 });
  });
});
