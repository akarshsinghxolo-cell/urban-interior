import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { quotationChoiceLines, quotationWorkChoices, spacedQuotationTitle } from "../src/lib/rdash/quotation-work-choices";
import { activeQuotationForWork } from "../src/components/rdash/customer/CustomerQuotationDialog";
import type { WorkRequired } from "../src/lib/rdash/types";
import { repairOperationalWorkspace } from "../src/lib/rdash/operational-repair";

function fixture() {
  const db = buildSeedDatabase();
  db.master.workSubcategories = [
    { id: "panels", category_id: "walls", name: "Wall Panels — PVC / WPC", work_types: [{ id: "charcoal", name: "charcoal" }] },
    { id: "ceiling", category_id: "ceilings", name: "Gypsum False Ceiling", work_types: [{ id: "standard", name: "Standard" }] },
  ];
  db.master.contractorRates = [{ contractor_id: "contractor", work_subcategory_id: "ceiling", work_type_id: "standard", material_rate: 235, labour_rate: 20 }] as typeof db.master.contractorRates;
  const work = { id: "work", site_id: "site", customer_id: "customer", title: "Combined work", area_ids: ["hall", "guest"],
    work_subcategory_ids: ["panels", "ceiling"], work_type_ids: ["charcoal", "standard"],
    structured_items: ["hall", "guest"].map((area_id, index) => ({ id: `item-${index}`, title: "Combined work", area_id,
      subcategory_id: "panels", work_type_id: "charcoal", quantity: (index + 1) * 10, rate: 100, amount: (index + 1) * 1000,
      option_pairs: [{ subcategory_id: "panels", work_type_id: "charcoal" }, { subcategory_id: "ceiling", work_type_id: "standard" }] })),
  } as WorkRequired;
  db.areas = [{ id: "hall", name: "Hall" }, { id: "guest", name: "Guest room" }] as typeof db.areas;
  db.workRequired = [work];
  db.measurementRevisions = [];
  return { db, work };
}

describe("independent quotation work types", () => {
  test("server repair keeps each line's category when its parent requirement spans categories", () => {
    const db = buildSeedDatabase();
    const subcategories = ["fc2_tv", "fc_gyp"].map((id) => db.master.workSubcategories.find((row) => row.id === id)!);
    const work = { ...db.workRequired[0], work_subcategory_ids: subcategories.map((row) => row.id) };
    db.workRequired = [work];
    db.quotations[0].scope_lines = subcategories.map((subcategory, index) => ({ id: `line-${index}`, title: subcategory.name,
      work_required_id: work.id, category_id: subcategory.category_id, subcategory_id: subcategory.id, work_type_id: subcategory.work_types?.[0].id,
      quantity: 10, rate: 100, amount: 1000 }));
    const repaired = repairOperationalWorkspace(db).quotations[0].scope_lines;
    expect(repaired.map((line) => line.category_id)).toEqual(subcategories.map((row) => row.category_id));
  });
  test("splits a combined requirement into independently keyed choices without changing the source", () => {
    const { db, work } = fixture();
    const before = JSON.stringify(work);
    const choices = quotationWorkChoices(db, [work]);
    expect(choices.map((row) => row.title)).toEqual(["Wall Panels — PVC / WPC · charcoal", "Gypsum False Ceiling · Standard"]);
    expect(new Set(choices.map((row) => row.id)).size).toBe(2);
    expect(choices.every((row) => row.sourceWorkId === work.id)).toBe(true);
    expect(JSON.stringify(work)).toBe(before);
  });

  test("quoting only ceiling in Guest room excludes panels and Hall and uses the ceiling rate", () => {
    const { db, work } = fixture();
    const ceiling = quotationWorkChoices(db, [work])[1];
    const lines = quotationChoiceLines(db, [{ ...ceiling, area_ids: ["guest"] }], "work", () => "quote-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ title: "Gypsum False Ceiling · Standard", work_required_id: "work", work_type_id: "standard", category_id: "ceilings", quantity: 20, rate: 255, amount: 5100 });
    expect(lines[0].option_pairs).toBeUndefined();
    expect(lines[0].area_chips).toEqual([{ area_id: "guest", area_name: "Guest room", quantity: 20 }]);
  });

  test("room layout saves separate types and their own prices", () => {
    const { db, work } = fixture();
    let next = 0;
    const lines = quotationChoiceLines(db, quotationWorkChoices(db, [work]), "area", () => `line-${++next}`);
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.area_id)).toEqual(["hall", "hall", "guest", "guest"]);
    expect(lines.map((line) => line.amount)).toEqual([1000, 2550, 2000, 5100]);
    expect(new Set(lines.map((line) => line.id)).size).toBe(4);
  });

  test("an existing quotation for panels does not block ceiling for the same room", () => {
    const { db, work } = fixture();
    const lines = quotationChoiceLines(db, [quotationWorkChoices(db, [work])[0]], "work", () => "line");
    db.quotations = [{ id: "quote", status: "draft", coverage: [{ work_required_id: work.id, area_ids: work.area_ids }], scope_lines: lines }] as typeof db.quotations;
    expect(activeQuotationForWork(db, "work", ["guest"], ["standard"])).toBeUndefined();
    expect(activeQuotationForWork(db, "work", ["guest"], ["charcoal"])?.id).toBe("quote");
  });

  test("adds fifteen spaces between works without breaking slashes inside service names", () => {
    const { db } = fixture();
    expect(spacedQuotationTitle("Wall Panels — PVC / WPC · charcoal / Gypsum False Ceiling · Standard", db))
      .toBe(`Wall Panels — PVC / WPC · charcoal${" ".repeat(15)}Gypsum False Ceiling · Standard`);
    expect(spacedQuotationTitle("Moulding · Standard      Wallpapers · Standard", db))
      .toBe(`Moulding · Standard${" ".repeat(15)}Wallpapers · Standard`);
  });
});
