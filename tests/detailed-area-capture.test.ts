import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { reconcileWorkRequiredSelection, seedDetailedAreaLines, workRequiredDisplayTitle } from "../src/lib/rdash/work-types";

const source = async (path: string) => testFile(path).text();

describe("Detailed-area capture (annotated UX rework)", () => {
  test("Sites tab: AREAS chip row removed, work meta shows its area names", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    // Annotation 1: the static "Areas (n)" chip row is gone from the site card.
    expect(desk).not.toContain("Areas ({siteAreas.length})");
    // Annotation 2: each work row lists the areas it belongs to.
    expect(desk).toContain("` with ${workAreaNames}`");
    expect(desk).toContain("siteAreas.find((area) => area.id === areaId)?.name");
  });

  test("capture entry points renamed to 'Capture detailed area'", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain("Capture detailed area");
    expect(desk).not.toContain("Capture structured work");
  });

  test("area-grouped capture: one collapsible per area with shared dimensions", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    // The flat "Line 1/Line 2" rows are replaced by one collapsible group per
    // area: expanding "Kitchen 1" shows every work item captured in that kitchen.
    expect(desk).toContain("DetailedAreaGroup");
    expect(desk).toContain('aria-expanded={group.open}');
    expect(desk).toContain(">Area dimensions (ft) — shared by the work below</p>");
    expect(desk).toContain(">Length (ft)</label>");
    expect(desk).toContain(">Breadth (ft)</label>");
    expect(desk).toContain(">Height (ft)</label>");
    // Work items can be added or removed from inside the area group, and the
    // group itself can be dropped from the capture.
    expect(desk).toContain("Add work</Button>");
    expect(desk).toContain("Add area</Button>");
    expect(desk).toContain("toggleExistingRemoval");
    expect(desk).not.toContain(">Wall area / length *</label>");
  });

  test("per-work-type measurement: basis derived per subcategory, direct sqft/rft entry", async () => {
    const workTypes = await source("src/lib/rdash/work-types.ts");
    // Tiles → floor plan; paint → walls + ceiling; modular kitchen/railings →
    // the run of 1–2 walls in running feet. Every basis stays user-editable.
    expect(workTypes).toContain("defaultMeasureBasisFor");
    expect(workTypes).toContain('wall: "Wall area (sqft)"');
    expect(workTypes).toContain('floor_ceiling: "Floor / ceiling area (sqft)"');
    expect(workTypes).toContain('wall_ceiling: "Walls + ceiling (sqft)"');
    expect(workTypes).toContain('length: "Running length (rft)"');
    expect(workTypes).toContain("walls === 2");
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain("measuredQuantity(line.measure, groupDims(group), line.walls)");
    // Measure basis select drives the quantity label; direct entry always allowed.
    expect(desk).toContain("{WORK_MEASURE_LABELS[line.measure]} *</label>");
    expect(desk).not.toContain(">Quantity *</label>");
  });

  test("category + subcategory dropdowns: tickboxes, ticked first, group gap", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    // Annotation 4A: ticked categories include work required in the line's area.
    expect(desk).toContain("areaWorkCategories");
    expect(desk).toContain("categoryTicks");
    // Annotation 4: only the selected category's subcategories, ticked group on
    // top, blank-space separator between the ticked group and the rest.
    expect(desk).toContain('key: "ticked", items: subOptions.filter((option) => subTicks.has(option.id))');
    expect(desk).toContain('key: "others", items: subOptions.filter((option) => !subTicks.has(option.id))');
    expect(desk).toContain("{groupIndex > 0 && <div className=\"h-3\" aria-hidden=\"true\"/>}");
    // Subcategory options stay scoped to the selected category.
    expect(desk).toContain("row.category_id === line.category_id");
  });

  test("store capture: removals + bidirectional tick sync with the add/edit form", async () => {
    const crm = await source("src/lib/rdash/store/slices/crm.ts");
    expect(crm).toContain("requires Area, Category, and Subcategory.");
    expect(crm).toContain('const unitId = line.unit_id || (Number(line.height_ft) > 0 ? "sqft" : "rft");');
    expect(crm).not.toContain("!line.article_id || !line.unit_id");
    expect(crm).toContain("subcategory_id: subcategory.id");
    expect(crm).toContain("length_ft: num(line.length_ft)");
    expect(crm).toContain("floor_ceiling_area: num(line.floor_area)");
    // Detailed-area capture is the per-area master for the whole Site: lines
    // target ANY site Work Required (seeded lines carry their source row,
    // fresh lines resolve by category or create one), and every touched row
    // re-derives its ticks through the shared reconcileWorkRequiredSelection.
    expect(crm).toContain("removedItemIds");
    expect(crm).toContain("removedSelections");
    expect(crm).toContain("const siteWorks = state.db.workRequired.filter((row: any) => row.site_id === workRequired.site_id);");
    expect(crm).toContain("const target = targetForLine(line);");
    expect(crm).toContain("const skeletonFor = (categoryId: string)");
    expect(crm).toContain("reconcileWorkRequiredSelection({");
    expect(crm).toContain("withPrimaryWorkTypeIds(workSubcategories, rec.work_subcategory_ids, rec.work_type_ids)");
  });

  test("capture view pre-populates planned work from every site Work Required selection", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const workTypes = await source("src/lib/rdash/work-types.ts");
    // Seeds are derived across all site rows so expanding "Kitchen 1" shows
    // every work required in that kitchen (annotation C), and deleting a
    // planned line un-ticks it from the Add/Edit form on save.
    expect(workTypes).toContain("export function seedDetailedAreaLines");
    expect(workTypes).toContain("export function reconcileWorkRequiredSelection");
    expect(workTypes).toContain("export function workRequiredDisplayTitle");
    expect(desk).toContain("seedDetailedAreaLines({ siteWorks, workSubcategories: db.master.workSubcategories })");
    expect(desk).toContain("removedSelections: groups.flatMap((group) => group.removedSeeds)");
    expect(desk).toContain("target_work_required_id: line.target_work_required_id");
    // Legacy stored titles are not rendered raw anywhere: scorecards, site
    // rows and detail links show the tier-qualified derived title instead.
    expect(desk).toContain("workRequiredDisplayTitle(db.master.workSubcategories, work)");
    expect(desk).not.toContain('{work.title}</span>');
  });

  test("partner scorecards: one derivation shared by actions and reconciliation agent", async () => {
    // ponytail: the store actions delegate to the same pure derivation the
    // PerformanceReconciliationAgent uses, so their diff converges instead of
    // fighting a second formula (infinite "Maximum update depth" loop).
    const contractors = await source("src/lib/rdash/store/slices/contractors.ts");
    const procurement = await source("src/lib/rdash/store/slices/procurement.ts");
    const reconciliation = await source("src/lib/rdash/performance-reconciliation.ts");
    expect(contractors).toContain("deriveContractorPerformanceEvidenceExport(state.db, contractorId)");
    expect(procurement).toContain("deriveVendorPerformanceEvidenceExport(state.db, vendorId)");
    expect(reconciliation).toContain("export function deriveContractorPerformanceEvidenceExport");
    expect(reconciliation).toContain("export function deriveVendorPerformanceEvidenceExport");
    // No evidence → nothing to reconcile, no commit, no audit noise.
    expect(contractors).toContain("if (derived.evidenceCount === 0)");
    expect(procurement).toContain("if (derived.evidenceCount === 0)");
  });
});

describe("Detailed-area seed derivation + selection reconciliation (annotation A/C)", () => {
  // Kunal ji-like site: a railing requirement (two subcategories, one Standard
  // type each) and a UPVC requirement, both covering the Rooftop.
  const workSubcategories = [
    { id: "sub-tgr", category_id: "cat-railing", name: "Toughened Glass Railing", unit_id: "rft", work_types: [{ id: "wt-sub-tgr-std", name: "Standard", unit_id: "rft" }] },
    { id: "sub-ssr", category_id: "cat-railing", name: "SS Railing", unit_id: "rft", work_types: [{ id: "wt-sub-ssr-std", name: "Standard", unit_id: "rft" }] },
    { id: "sub-upvc", category_id: "cat-windows", name: "UPVC Sliding Windows", unit_id: "sqft", work_types: [{ id: "wt-sub-upvc-std", name: "Standard", unit_id: "sqft" }] },
  ] as any;
  const railingWork = {
    id: "wr-railing",
    work_category_id: "cat-railing",
    work_subcategory_ids: ["sub-tgr", "sub-ssr"],
    work_type_ids: ["wt-sub-tgr-std", "wt-sub-ssr-std"],
    area_ids: ["area-rooftop"],
    structured_items: [],
  } as any;
  const upvcWork = {
    id: "wr-upvc",
    work_category_id: "cat-windows",
    work_subcategory_ids: ["sub-upvc"],
    work_type_ids: ["wt-sub-upvc-std"],
    area_ids: ["area-rooftop", "area-kitchen"],
    structured_items: [],
  } as any;

  test("seeds cover every (area × work type) of every site Work Required", () => {
    const seeds = seedDetailedAreaLines({ siteWorks: [railingWork, upvcWork], workSubcategories });
    // Rooftop opens with the railing work (both tier-qualified types) AND the
    // UPVC work — annotation C's "2 works" instead of an empty group.
    expect(seeds.map((seed) => [seed.area_id, seed.subcategory_id, seed.work_type_id])).toEqual([
      ["area-rooftop", "sub-tgr", "wt-sub-tgr-std"],
      ["area-rooftop", "sub-ssr", "wt-sub-ssr-std"],
      ["area-rooftop", "sub-upvc", "wt-sub-upvc-std"],
      ["area-kitchen", "sub-upvc", "wt-sub-upvc-std"],
    ]);
    // Railing plans running feet; UPVC plans the wall area.
    expect(seeds[0].measure).toBe("length");
    expect(seeds[2].measure).toBe("wall");
  });

  test("already captured scopes are not seeded again", () => {
    const captured: any = { ...upvcWork, structured_items: [{ id: "li-1", area_id: "area-kitchen", subcategory_id: "sub-upvc", work_type_id: "wt-sub-upvc-std" }] };
    const seeds = seedDetailedAreaLines({ siteWorks: [railingWork, captured], workSubcategories });
    expect(seeds.map((seed) => seed.area_id)).toEqual(["area-rooftop", "area-rooftop", "area-rooftop"]);
  });

  test("deleting a planned seed un-ticks its type and subcategory, clamped at the last tick", () => {
    const dropped = reconcileWorkRequiredSelection({
      workSubcategories,
      work: railingWork,
      keptItems: [],
      freshItems: [],
      droppedSelections: [{ work_required_id: "wr-railing", area_id: "area-rooftop", subcategory_id: "sub-tgr", work_type_id: "wt-sub-tgr-std" }],
    });
    expect(dropped.work_type_ids).toEqual(["wt-sub-ssr-std"]);
    expect(dropped.work_subcategory_ids).toEqual(["sub-ssr"]);
    expect(dropped.area_ids).toEqual(["area-rooftop"]);

    // Dropping every planned work cannot empty the declaration (invariant).
    const clamped = reconcileWorkRequiredSelection({
      workSubcategories,
      work: railingWork,
      keptItems: [],
      freshItems: [],
      droppedSelections: [
        { work_required_id: "wr-railing", area_id: "area-rooftop", subcategory_id: "sub-tgr", work_type_id: "wt-sub-tgr-std" },
        { work_required_id: "wr-railing", area_id: "area-rooftop", subcategory_id: "sub-ssr", work_type_id: "wt-sub-ssr-std" },
      ],
    });
    expect(clamped.work_type_ids).toEqual(["wt-sub-tgr-std", "wt-sub-ssr-std"]);
    expect(clamped.work_subcategory_ids).toEqual(["sub-tgr", "sub-ssr"]);
    expect(clamped.area_ids).toEqual(["area-rooftop"]);
  });

  test("capturing a seed replaces it: the item owns the scope, other seeds survive", () => {
    const rec = reconcileWorkRequiredSelection({
      workSubcategories,
      work: railingWork,
      keptItems: [],
      freshItems: [{ area_id: "area-rooftop", subcategory_id: "sub-tgr", work_type_id: "wt-sub-tgr-std" }],
      droppedSelections: [],
    });
    expect(rec.work_type_ids).toEqual(["wt-sub-tgr-std", "wt-sub-ssr-std"]);
    expect(rec.work_subcategory_ids).toEqual(["sub-tgr", "sub-ssr"]);
    expect(rec.area_ids).toEqual(["area-rooftop"]);
  });

  test("removing a captured line drops its declaration (no silent re-seed)", () => {
    // The store converts removed items into dropped selections before
    // reconciling — replicate that for the wardrobe-style row where one of
    // two subcategories is being removed from the only area.
    const removedAsDropped = [{ work_required_id: "wr-railing", area_id: "area-rooftop", subcategory_id: "sub-tgr", work_type_id: "wt-sub-tgr-std" }];
    const rec = reconcileWorkRequiredSelection({
      workSubcategories,
      work: railingWork,
      keptItems: [{ area_id: "area-rooftop", subcategory_id: "sub-ssr", work_type_id: "wt-sub-ssr-std" }],
      freshItems: [],
      droppedSelections: removedAsDropped,
    });
    expect(rec.work_type_ids).toEqual(["wt-sub-ssr-std"]);
    expect(rec.work_subcategory_ids).toEqual(["sub-ssr"]);
    expect(rec.area_ids).toEqual(["area-rooftop"]);
  });

  test("display title re-derives tier-qualified labels; legacy rows keep their title", () => {
    expect(workRequiredDisplayTitle(workSubcategories, { ...railingWork, title: "Toughened Glass Railing / SS Railing" }))
      .toBe("Toughened Glass Railing · Standard / SS Railing · Standard");
    // Ticked subcategories without explicit work types normalize to the
    // primary (Standard) tier — the way the Add/Edit form would save them.
    expect(workRequiredDisplayTitle(workSubcategories, { title: "Gypsum False Ceiling", work_subcategory_ids: ["sub-upvc"], work_type_ids: [] }))
      .toBe("UPVC Sliding Windows · Standard");
    expect(workRequiredDisplayTitle(workSubcategories, { title: "Legacy row", work_subcategory_ids: [], work_type_ids: [] }))
      .toBe("Legacy row");
  });
});
