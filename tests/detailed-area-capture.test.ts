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

  test("line editor: dimension fields replace article/variant/unit", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    // Annotation 5: ARTICLE → Length; Annotation 6: VARIANT → Breadth + Height.
    expect(desk).toContain(">Length (ft)</label>");
    expect(desk).toContain(">Breadth (ft)</label>");
    expect(desk).toContain(">Height (ft)</label>");
    // Quantity → wall area/length, plus a floor/ceiling area box; Unit removed.
    expect(desk).toContain(">Wall area / length *</label>");
    expect(desk).toContain(">Floor / ceiling area</label>");
    expect(desk).not.toContain(">Unit *</label>");
    expect(desk).not.toContain(">Article *</label>");
    expect(desk).not.toContain(">Variant</label>");
    expect(desk).not.toContain(">Quantity *</label>");
  });

  test("wall area auto-fill: 2(L+B)H with height, running feet 2(L+B) without", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain("next.wall_area = areaStr(h > 0 ? 2 * (l + b) * h : 2 * (l + b))");
    expect(desk).toContain("next.floor_area = areaStr(l * b)");
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

  test("store capture: article/unit optional, unit derived from height", async () => {
    const crm = await source("src/lib/rdash/store/slices/crm.ts");
    expect(crm).toContain("requires Area, Category, and Subcategory.");
    expect(crm).toContain('const unitId = line.unit_id || (Number(line.height_ft) > 0 ? "sqft" : "rft");');
    expect(crm).not.toContain("!line.article_id || !line.unit_id");
    expect(crm).toContain("subcategory_id: subcategory.id");
    expect(crm).toContain("length_ft: num(line.length_ft)");
    expect(crm).toContain("floor_ceiling_area: num(line.floor_area)");
  });
});
