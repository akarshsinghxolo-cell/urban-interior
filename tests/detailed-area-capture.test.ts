import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import {
  reconcileWorkRequiredSelection,
  seedDetailedAreaLines,
} from "../src/lib/rdash/work-types";

const source = async (path: string) => testFile(path).text();

describe("canonical Customer site / Area / Work Required workflow", () => {
  test("Customer owns the one rich detailed-area implementation", async () => {
    const capture = await source("src/components/rdash/customer/CustomerWorkCaptureDialog.tsx");
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");

    for (const token of [
      "seedDetailedAreaLines",
      "captureStructuredWorkRequired",
      "CustomerAreaDimensionsFields",
      "contractorWorkTypeAverages",
      "removedSelections",
      "areaDims",
      "editOfItemId",
      "scrollEditDraftIntoView",
      "option_pairs",
      "addAlternative",
      "removeAlternative",
      "manualQuantity",
      "incomplete/duplicate row(s) left untouched",
    ]) expect(capture).toContain(token);

    expect(portfolio).toContain('from "../customer/CustomerWorkCaptureDialog"');
    expect(portfolio).not.toContain("StructuredWorkRequiredDialog");
    expect(portfolio).not.toContain("captureStructuredWorkRequired");
    expect(portfolio).not.toContain("seedDetailedAreaLines");
    expect(portfolio).not.toContain("measuredQuantity");
  });

  test("alternatives remain one measured decision in the canonical Customer capture", async () => {
    const capture = await source("src/components/rdash/customer/CustomerWorkCaptureDialog.tsx");
    expect(capture).toContain("pairsForLine");
    expect(capture).toContain("option_pairs");
    expect(capture).toContain("Alternatives · customer takes any one · one shared measurement");
    expect(capture).toContain("addAlternative");
    expect(capture).toContain("removeAlternative");
    expect(capture).toContain("itemScopeKeys");
  });

  test("Site Execution launches Customer workflows and cannot build a second Area or quotation path", async () => {
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("CustomerWorkCaptureDialog");
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
    expect(siteExecution).toContain('kind: "quotation"');
    expect(siteExecution).toContain("customerId: selectedSite.customer_id");
    expect(siteExecution).toContain("siteId: selectedSite.id");
    expect(siteExecution).toContain("workRequiredId: work.id");
    expect(siteExecution).not.toContain("const addArea = useRDashStore");
    expect(siteExecution).not.toContain("const addQuotation = useRDashStore");
    expect(siteExecution).not.toContain("coverage: [{");
  });

  test("Measurement uses the Customer-owned Area/measurement save implementation", async () => {
    const measurement = await source("src/components/rdash/modules/SiteMeasurementModule.tsx");
    const canonical = await source("src/components/rdash/customer/CustomerMeasurementDialog.tsx");
    expect(measurement).toContain("CustomerMeasurementDialog");
    for (const forbidden of [
      "const addArea = useRDashStore",
      "const updateArea = useRDashStore",
      "const updateWorkRequired = useRDashStore",
      "const addMeasurementRevision = useRDashStore",
      "const fileVisitReport = useRDashStore",
      "function MeasurementDialog",
    ]) expect(measurement).not.toContain(forbidden);
    expect(canonical).toContain("CustomerAreaDimensionsFields");
    expect(canonical).toContain("addMeasurementRevision");
    expect(canonical).toContain("updateWorkRequired");
    expect(canonical).toContain("fileVisitReport");
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
