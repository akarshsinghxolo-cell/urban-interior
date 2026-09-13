import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import {
  reconcileWorkRequiredSelection,
  seedDetailedAreaLines,
} from "../src/lib/rdash/work-types";

const source = async (path: string) => testFile(path).text();

describe("site work ownership", () => {
  test("Customer Desk no longer embeds a second detailed-area capture editor", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).not.toContain("StructuredWorkRequiredDialog");
    expect(desk).not.toContain("Capture detailed area");
    expect(desk).not.toContain("contractorWorkTypeAverages");
    expect(desk).not.toContain("captureStructuredWorkRequired");
  });

  test("site-level scope creation lives in Sites & Execution", async () => {
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
    expect(siteExecution).toContain("scheduleMeasurement");
  });

  test("the store retains one canonical structured-work mutation primitive", async () => {
    const crm = await source("src/lib/rdash/store/slices/crm.ts");
    expect(crm).toContain("captureStructuredWorkRequired:");
    expect(crm).toContain("removedItemIds");
    expect(crm).toContain("removedSelections");
    expect(crm).toContain("reconcileWorkRequiredSelection({");
  });
});

describe("detailed-area seed and reconciliation primitives", () => {
  const workSubcategories = [
    { id: "sub-glass", category_id: "cat-railing", name: "Toughened Glass Railing", unit_id: "rft", work_types: [{ id: "wt-glass-standard", name: "Standard", unit_id: "rft" }] },
    { id: "sub-ss", category_id: "cat-railing", name: "SS Railing", unit_id: "rft", work_types: [{ id: "wt-ss-standard", name: "Standard", unit_id: "rft" }] },
  ] as any;
  const work = {
    id: "wr-railing",
    work_category_id: "cat-railing",
    work_subcategory_ids: ["sub-glass", "sub-ss"],
    work_type_ids: ["wt-glass-standard", "wt-ss-standard"],
    area_ids: ["area-rooftop"],
    structured_items: [],
  } as any;

  test("groups alternative work types into one measured seed", () => {
    const seeds = seedDetailedAreaLines({ siteWorks: [work], workSubcategories });
    expect(seeds).toHaveLength(1);
    expect(seeds[0].area_id).toBe("area-rooftop");
    expect(seeds[0].option_pairs).toEqual([
      { subcategory_id: "sub-glass", work_type_id: "wt-glass-standard" },
      { subcategory_id: "sub-ss", work_type_id: "wt-ss-standard" },
    ]);
  });

  test("reconciliation removes a dropped option without corrupting the remaining declaration", () => {
    const reconciled = reconcileWorkRequiredSelection({
      workSubcategories,
      work,
      keptItems: [],
      freshItems: [],
      droppedSelections: [{
        work_required_id: work.id,
        area_id: "area-rooftop",
        subcategory_id: "sub-glass",
        work_type_id: "wt-glass-standard",
      }],
    });
    expect(reconciled.work_subcategory_ids).toEqual(["sub-ss"]);
    expect(reconciled.work_type_ids).toEqual(["wt-ss-standard"]);
    expect(reconciled.area_ids).toEqual(["area-rooftop"]);
  });
});
