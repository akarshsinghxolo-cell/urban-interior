import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

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
    // Removals are applied first, then additions; the remaining items decide
    // which subcategory/work-type/area ticks survive back to the edit form.
    expect(crm).toContain("removedItemIds");
    expect(crm).toContain("const keptItems = (workRequired.structured_items || []).filter((item: any) => !removedItemIds.has(item.id));");
    expect(crm).toContain("nextSubcategoryIds");
    expect(crm).toContain("nextWorkTypeIds");
    expect(crm).toContain("removedAreaIds");
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
