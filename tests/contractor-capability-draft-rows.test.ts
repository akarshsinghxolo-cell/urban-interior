import { describe, expect, test } from "vitest";
import {
  contractorCapabilityDraftRows,
  type ContractorCapability,
} from "../src/lib/rdash/contractor-profile";
import type { WorkSubcategory } from "../src/lib/rdash/types";

const subcategory: WorkSubcategory = {
  id: "sub-1",
  name: "SS Railing",
  category_id: "cat-1",
  unit_id: "sqft",
  work_types: [
    { id: "wt-std", name: "Standard", unit_id: "sqft" },
    { id: "wt-prem", name: "premium", unit_id: "sqft" },
  ],
} as unknown as WorkSubcategory;

describe("contractorCapabilityDraftRows", () => {
  test("shows exactly the stored rows — catalog types without stored rates are NOT fabricated", () => {
    const capability: ContractorCapability = {
      subcategory_id: "sub-1",
      work_type_rates: [
        { work_type_id: "wt-prem", work_type_name: "premium", unit_id: "sqft", material_rate: 420, labour_rate: 100 },
      ],
    };
    const rows = contractorCapabilityDraftRows(capability, subcategory);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      work_type_id: "wt-prem",
      work_type_name: "premium",
      material_rate: "420",
      labour_rate: "100",
      custom: false,
    });
  });

  test("deleted work types stay deleted: a capability with no stored rates produces zero rows", () => {
    const capability: ContractorCapability = { subcategory_id: "sub-1", work_type_rates: [] };
    expect(contractorCapabilityDraftRows(capability, subcategory)).toHaveLength(0);
  });

  test("rows missing from the catalog keep an editable name (custom) and fall back to the subcategory unit", () => {
    const capability: ContractorCapability = {
      subcategory_id: "sub-1",
      work_type_rates: [
        { work_type_id: "wt-orphan", work_type_name: "Vintage polish", unit_id: "", labour_rate: 80 },
      ],
    };
    const rows = contractorCapabilityDraftRows(capability, subcategory);
    expect(rows[0]).toMatchObject({
      work_type_id: "wt-orphan",
      work_type_name: "Vintage polish",
      unit_id: "sqft",
      custom: true,
      material_rate: "",
      labour_rate: "80",
    });
  });

  test("stored name/unit win over catalog; missing name resolves from the catalog", () => {
    const capability: ContractorCapability = {
      subcategory_id: "sub-1",
      work_type_rates: [
        { work_type_id: "wt-std", work_type_name: "", unit_id: "ft", material_rate: 10 },
      ],
    };
    const rows = contractorCapabilityDraftRows(capability, subcategory);
    expect(rows[0]).toMatchObject({ work_type_name: "Standard", unit_id: "ft", custom: false });
  });
});
