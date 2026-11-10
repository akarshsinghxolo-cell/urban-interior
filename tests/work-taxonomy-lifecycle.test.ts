import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { deleteWorkSubcategory, forceDeleteWorkType, workTaxonomyReferences } from "../src/lib/rdash/work-category-master";
import { isActiveWorkTaxonomy, withPrimaryWorkTypeIds, workTypesForSubcategory } from "../src/lib/rdash/work-types";

describe("work taxonomy lifecycle", () => {
  test("deleting a service preserves customer history but removes capabilities and material links", () => {
    const db = buildSeedDatabase();
    const sub = db.master.workSubcategories[0];
    const type = workTypesForSubcategory(sub)[0];
    const map = db.master.subcategoryArticleMap.find((row) => row.work_required_id === sub.id)!;
    db.workRequired[0].work_subcategory_ids = [sub.id];
    db.workRequired[0].work_type_ids = [type.id];
    db.workRequired[0].title = `${sub.name} · ${type.name}`;
    const line = { id: "history-line", title: sub.name, subcategory_id: sub.id, work_type_id: type.id,
      work_required_article_id: map.id, quantity: 7, rate: 125, amount: 875 };
    db.quotations[0].scope_lines = [line];
    db.quotations[0].items = [line];
    db.master.contractors[0].work_capabilities = [{ subcategory_id: sub.id, work_type_rates: [{ work_type_id: type.id }] },
      { subcategory_id: "unrelated", work_type_rates: [] }];
    const result = deleteWorkSubcategory(db, sub.id);
    expect(result.master.workSubcategories.some((row) => row.id === sub.id)).toBe(false);
    expect(result.master.workSubcategories.find((row) => row.id === `deleted-subcategory:${sub.id}`)).toMatchObject({ name: "Deleted subcategory", status: "archived" });
    expect(result.master.subcategoryArticleMap.some((row) => row.work_required_id === sub.id)).toBe(false);
    expect(result.master.contractors[0].work_capabilities).toEqual([{ subcategory_id: "unrelated", work_type_rates: [] }]);
    expect(result.master.contractors).toHaveLength(db.master.contractors.length);
    expect(result.master.articles).toEqual(db.master.articles);
    expect(result.workRequired[0].title).toContain("Deleted subcategory");
    expect(result.quotations[0].scope_lines[0]).toMatchObject({ title: "Deleted subcategory", quantity: 7, rate: 125, amount: 875 });
    expect(result.quotations[0].scope_lines[0].work_required_article_id).toBeUndefined();
    expect(workTaxonomyReferences(result, "subcategory", sub.id)).toEqual([]);
    expect(db.quotations[0].scope_lines[0].subcategory_id).toBe(sub.id);
  });

  test("replacement need not be Standard and must be active", () => {
    const db = buildSeedDatabase();
    const sub = db.master.workSubcategories[0];
    sub.work_types = [{ id: "old", name: "Old" }, { id: "premium", name: "Premium" }];
    expect(forceDeleteWorkType(db, sub.id, "old", "premium").db.master.workSubcategories[0].work_types).toHaveLength(1);
    sub.work_types[1].status = "archived";
    expect(() => forceDeleteWorkType(db, sub.id, "old", "premium")).toThrow("active replacement");
  });
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
