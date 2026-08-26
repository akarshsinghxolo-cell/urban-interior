import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  canonicalContractorCapabilities,
  contractorMasterRecordForCreate,
  contractorDuplicateConflicts,
  contractorGovernanceCapabilityProjection,
  contractorProfileValidationError,
  contractorRateProjection,
  contractorWorkTypeAverages,
  derivedContractorCategoryNames,
  normalizeContractorForWrite,
  type ContractorProfileRecord,
} from "../src/lib/rdash/contractor-profile";

function db() {
  return {
    master: {
      contractors: [] as ContractorProfileRecord[],
      contractorRates: [] as any[],
      workCategories: [{ id: "cat-paint", name: "Painting" }, { id: "cat-wood", name: "Carpentry" }],
      workSubcategories: [
        { id: "sub-paint", category_id: "cat-paint", name: "Interior Painting", work_types: [
          { id: "wt-budget", name: "Budget", unit_id: "sqft" },
          { id: "wt-premium", name: "Premium", unit_id: "sqft" },
        ] },
        { id: "sub-wood", category_id: "cat-wood", name: "Wardrobes", work_types: [
          { id: "wt-standard", name: "Standard", unit_id: "sqft" },
        ] },
      ],
      articles: [{ id: "art-1", name: "Primer" }, { id: "art-2", name: "Premium Paint" }],
      subcategoryArticleMap: [
        { id: "scope-1", work_required_id: "sub-paint", article_id: "art-1", unit_id: "sqft" },
        { id: "scope-2", work_required_id: "sub-paint", article_id: "art-2", unit_id: "sqft" },
      ],
      sourcePartners: [{ id: "sp-1", name: "Architect One", type: "Architect" }],
    },
  } as any;
}

const budgetRate = { work_type_id: "wt-budget", work_type_name: "Budget", unit_id: "sqft", material_rate: 42, labour_rate: 18 };
const premiumRate = { work_type_id: "wt-premium", work_type_name: "Premium", unit_id: "sqft", material_rate: 75, labour_rate: 35 };

describe("canonical contractor profile", () => {
  test("normalizes work-type labour rates and derives categories", () => {
    const normalized = normalizeContractorForWrite({
      id: "con-1", name: "  Mr Das  ", phone: "+91 98765 43210", city: " Gorakhpur ", source_partner_id: "sp-1",
      work_capabilities: [{ subcategory_id: "sub-paint", work_type_rates: [budgetRate, { ...budgetRate, labour_rate: 22 }, premiumRate] }],
    }, db(), { id: "con-1" });
    expect(normalized).toMatchObject({ name: "Mr Das", phone: "9876543210", city: "Gorakhpur", status: "onboarding", source_partner_name: "Architect One", categories: ["Painting"] });
    expect(normalized.work_capabilities?.[0].work_type_rates).toEqual([{ ...budgetRate, labour_rate: 22 }, premiumRate]);
  });

  test("non-canonical capability fields are discarded without resurrecting a rate", () => {
    const normalized = canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{
      subcategory_id: "sub-paint", labour_rate: 25, with_material_rate: 80, article_ids: ["art-1"],
      article_rates: [{ article_id: "art-1", labour_rate: 30, with_material_rate: 95 }],
    } as any] })[0] as any;
    expect(normalized.work_type_rates).toEqual([]);
    expect(normalized.article_ids).toBeUndefined();
    expect(normalized.article_rates).toBeUndefined();
    expect(normalized.with_material_rate).toBeUndefined();
  });

  test("missing capabilities do not resurrect projection rows", () => {
    const state = db();
    state.master.contractorRates = [{ id: "rate-1", contractor_id: "con-1", trade: "Interior Painting", rate: 30 }];
    expect(canonicalContractorCapabilities({ id: "con-1" }, state)).toEqual([]);
  });

  test("category names cannot drift from selected subcategories", () => {
    expect(derivedContractorCategoryNames(db(), [{ subcategory_id: "sub-paint" }, { subcategory_id: "sub-wood" }])).toEqual(["Painting", "Carpentry"]);
  });

  test("rate projections contain material, labour and total keyed by work type", () => {
    const rates = contractorRateProjection(db(), { id: "con-1", name: "Mr Das", work_capabilities: [{
      subcategory_id: "sub-paint", subcategory_name: "Interior Painting", work_type_rates: [budgetRate, premiumRate],
    }] });
    expect(rates).toHaveLength(2);
    expect(rates.map((rate) => ({ id: rate.id, work_type_id: rate.work_type_id, material_rate: rate.material_rate, labour_rate: rate.labour_rate, rate: rate.rate }))).toEqual([
      { id: "crate-con-1-sub-paint-wt-budget", work_type_id: "wt-budget", material_rate: 42, labour_rate: 18, rate: 60 },
      { id: "crate-con-1-sub-paint-wt-premium", work_type_id: "wt-premium", material_rate: 75, labour_rate: 35, rate: 110 },
    ]);
    expect(rates.every((rate: any) => rate.article_id === undefined && rate.with_material_rate === undefined)).toBe(true);
  });
});

describe("contractor validation and duplicate prevention", () => {
  test("create requires phone, city and at least one capability", () => {
    expect(contractorProfileValidationError({ name: "Mr Das", phone: "9876543210", city: "Gorakhpur", work_capabilities: [] }, { isCreate: true })).toBe("Select at least one work capability for the contractor.");
  });

  test("invalid work-type rates and business fields are rejected", () => {
    expect(contractorProfileValidationError({ name: "Mr Das", email: "invalid" })).toBe("Enter a valid contractor email address.");
    expect(contractorProfileValidationError({ name: "Mr Das", work_capabilities: [{ subcategory_id: "sub-paint", work_type_rates: [{ ...budgetRate, labour_rate: -1 }] }] })).toBe("Contractor rates must be valid non-negative numbers.");
  });

  test("same phone is a hard duplicate", () => {
    const state = db();
    state.master.contractors = [{ id: "existing", name: "Das Enterprises", phone: "9876543210", city: "Gorakhpur" }];
    const conflicts = contractorDuplicateConflicts(state, { name: "Another Das", phone: "9876543210", city: "Lucknow" });
    expect(conflicts[0]).toMatchObject({ hard: true, reasons: ["same phone"] });
  });

  test("same normalized name and city remains a warning", () => {
    const state = db();
    state.master.contractors = [{ id: "existing", name: "Das Contractors Pvt Ltd", city: "Gorakhpur" }];
    expect(contractorDuplicateConflicts(state, { name: "Das Contractor", city: "Gorakhpur" })[0].hard).toBe(false);
  });

  test("referrals require Source Partner ids", () => {
    expect(() => normalizeContractorForWrite({ id: "con-1", name: "Mr Das", source_partner_id: "vendor-1" }, db(), { id: "con-1" })).toThrow("Choose a valid Source Partner");
    expect(normalizeContractorForWrite({ id: "con-1", name: "Mr Das", source_partner_name: "Old free text" }, db(), { id: "con-1" }).source_partner_name).toBeUndefined();
  });

});

describe("contractor create persistence and governance projection", () => {
  test("create records preserve the complete normalized form payload", () => {
    const record = contractorMasterRecordForCreate({
      id: "reserved-id", name: "Complete Contractor", legal_name: "Complete Contractor Private Limited", whatsapp: "9876543210", alternate_phone: "9876543211", email: "accounts@example.com",
      available_workers: 14, service_radius_km: 45,
      notes: "Preferred for complex work", work_capabilities: [{ subcategory_id: "sub-paint", work_type_rates: [budgetRate] }],
      obsolete_payload_field: "discard-me", compliance_documents: [{ id: "doc-1", kind: "insurance", verified: false }],
    } as ContractorProfileRecord, "con-42");
    expect(record).toMatchObject({ id: "con-42", legal_name: "Complete Contractor Private Limited", email: "accounts@example.com", available_workers: 14, service_radius_km: 45, notes: "Preferred for complex work" });
    expect((record as Record<string, unknown>).obsolete_payload_field).toBeUndefined();
    expect(record.compliance_documents).toHaveLength(1);
  });

  test("generated profile documents are removed while manual documents remain", () => {
    const normalized = normalizeContractorForWrite({ id: "con-1", name: "Mr Das", compliance_documents: [{ id: "generated", source: "contractor_profile" }, { id: "manual", kind: "agreement" }] }, db(), { id: "con-1" });
    expect(normalized.compliance_documents).toEqual([{ id: "manual", kind: "agreement" }]);
  });

  test("governance projects work-type rates without material data", () => {
    const canonical = canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{ subcategory_id: "sub-paint", subcategory_name: "Interior Painting", work_type_rates: [budgetRate] }] }, db());
    expect(contractorGovernanceCapabilityProjection("con-1", canonical)[0]).toMatchObject({ id: "ccap-con-1-sub-paint", work_subcategory_id: "sub-paint", work_subcategory_name: "Interior Painting", work_type_rates: [budgetRate] });
  });

  test("averages are derived from contractor quote rows", () => {
    const average = contractorWorkTypeAverages([
      { id: "r1", contractor_id: "c1", trade: "Paint", rate: 60, work_subcategory_id: "sub-paint", work_type_id: "wt-budget", material_rate: 40, labour_rate: 20 },
      { id: "r2", contractor_id: "c2", trade: "Paint", rate: 90, work_subcategory_id: "sub-paint", work_type_id: "wt-budget", material_rate: 60, labour_rate: 30 },
    ], "sub-paint", "wt-budget");
    expect(average).toEqual({ material_rate: 50, labour_rate: 25, total_rate: 75, contractor_count: 2 });
  });
});

describe("contractor capability picker layout", () => {
  test("uses compact wrapping category chips with a single active subcategory panel", () => {
    const source = readFileSync(new URL("../src/components/rdash/ContractorFormDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="Work capability categories"');
    expect(source).toContain('rounded-full border px-3 py-1.5');
    expect(source).toContain("activeCapabilityCategoryId");
    expect(source).toContain("activeCapabilityCategory ? (");
    expect(source).not.toContain("<details key={category.id}");
  });
});
