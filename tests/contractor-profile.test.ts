import { describe, expect, test } from "vitest";
import {
  canonicalContractorCapabilities,
  contractorMasterRecordForCreate,
  contractorDuplicateConflicts,
  contractorGovernanceCapabilityProjection,
  contractorProfileValidationError,
  contractorRateProjection,
  derivedContractorCategoryNames,
  normalizeContractorForWrite,
  verifiedContractorBankProof,
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
          { id: "wt-budget", name: "Budget", unit_id: "sqft", material_rate: 20, labour_rate: 15 },
          { id: "wt-premium", name: "Premium", unit_id: "sqft", material_rate: 55, labour_rate: 30 },
        ] },
        { id: "sub-wood", category_id: "cat-wood", name: "Wardrobes", work_types: [
          { id: "wt-standard", name: "Standard", unit_id: "sqft", material_rate: 100, labour_rate: 50 },
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

const budgetRate = { work_type_id: "wt-budget", work_type_name: "Budget", labour_rate: 18 };
const premiumRate = { work_type_id: "wt-premium", work_type_name: "Premium", labour_rate: 35 };

describe("canonical contractor profile", () => {
  test("normalizes work-type labour rates and derives categories", () => {
    const normalized = normalizeContractorForWrite({
      id: "con-1", name: "  Mr Das  ", phone: "+91 98765 43210", city: " Gorakhpur ", source_partner_id: "sp-1",
      work_capabilities: [{ subcategory_id: "sub-paint", work_type_rates: [budgetRate, { ...budgetRate, labour_rate: 22 }, premiumRate] }],
    }, db(), { id: "con-1" });
    expect(normalized).toMatchObject({ name: "Mr Das", phone: "9876543210", city: "Gorakhpur", status: "onboarding", source_partner_name: "Architect One", categories: ["Painting"] });
    expect(normalized.work_capabilities?.[0].work_type_rates).toEqual([{ ...budgetRate, labour_rate: 22 }, premiumRate]);
  });

  test("legacy contractor material and article fields are discarded", () => {
    const normalized = canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{
      subcategory_id: "sub-paint", labour_rate: 25, with_material_rate: 80, article_ids: ["art-1"],
      article_rates: [{ article_id: "art-1", labour_rate: 30, with_material_rate: 95 }],
    } as any] })[0] as any;
    expect(normalized.work_type_rates).toEqual([{ work_type_id: "wt-sub-paint-standard", work_type_name: "Standard", labour_rate: 25 }]);
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

  test("rate projections are labour-only rows keyed by work type", () => {
    const rates = contractorRateProjection(db(), { id: "con-1", name: "Mr Das", work_capabilities: [{
      subcategory_id: "sub-paint", subcategory_name: "Interior Painting", work_type_rates: [budgetRate, premiumRate],
    }] });
    expect(rates).toHaveLength(2);
    expect(rates.map((rate) => ({ id: rate.id, work_type_id: rate.work_type_id, work_type_name: rate.work_type_name, labour_rate: rate.labour_rate, rate: rate.rate }))).toEqual([
      { id: "crate-con-1-sub-paint-wt-budget", work_type_id: "wt-budget", work_type_name: "Budget", labour_rate: 18, rate: 18 },
      { id: "crate-con-1-sub-paint-wt-premium", work_type_id: "wt-premium", work_type_name: "Premium", labour_rate: 35, rate: 35 },
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

  test("same phone, PAN, GST and bank account is a hard duplicate", () => {
    const state = db();
    state.master.contractors = [{ id: "existing", name: "Das Enterprises", phone: "9876543210", pan: "ABCDE1234F", business_gst: "09ABCDE1234F1Z5", bank_account: "1234567890", city: "Gorakhpur" }];
    const conflicts = contractorDuplicateConflicts(state, { name: "Another Das", phone: "9876543210", pan: "ABCDE1234F", business_gst: "09ABCDE1234F1Z5", bank_account: "1234567890", city: "Lucknow" });
    expect(conflicts[0]).toMatchObject({ hard: true, reasons: ["same GSTIN", "same PAN", "same phone", "same bank account"] });
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

  test("bank verification is derived from verified evidence", () => {
    expect(verifiedContractorBankProof({ compliance_documents: [{ kind: "bank_proof", verified: false }] })).toBe(false);
    expect(verifiedContractorBankProof({ compliance_documents: [{ kind: "bank_proof", verified: true }] })).toBe(true);
  });
});

describe("contractor create persistence and governance projection", () => {
  test("create records preserve the complete normalized form payload", () => {
    const record = contractorMasterRecordForCreate({
      id: "reserved-id", name: "Complete Contractor", legal_name: "Complete Contractor Private Limited", whatsapp: "9876543210", alternate_phone: "9876543211", email: "accounts@example.com",
      supervisor_name: "Site Foreman", supervisor_phone: "9876543212", available_workers: 14, concurrent_site_limit: 3, service_radius_km: 45, labour_registration_no: "LAB-42",
      insurance_expiry: "2027-12-31", pf_no: "PF-42", esi_no: "ESI-42", notes: "Preferred for complex work", work_capabilities: [{ subcategory_id: "sub-paint", work_type_rates: [budgetRate] }],
      obsolete_payload_field: "discard-me", compliance_documents: [{ id: "doc-1", kind: "insurance", verified: false }],
    }, "con-42");
    expect(record).toMatchObject({ id: "con-42", legal_name: "Complete Contractor Private Limited", email: "accounts@example.com", supervisor_name: "Site Foreman", available_workers: 14, labour_registration_no: "LAB-42", pf_no: "PF-42", notes: "Preferred for complex work" });
    expect((record as Record<string, unknown>).obsolete_payload_field).toBeUndefined();
    expect(record.compliance_documents).toHaveLength(1);
  });

  test("form identifiers populate an unverified document register", () => {
    const normalized = normalizeContractorForWrite({ id: "con-1", name: "Mr Das", pan: "ABCDE1234F", bank_account: "1234567890", ifsc: "HDFC0001234", labour_registration_no: "LAB-1", insurance_expiry: "2027-12-31", pf_no: "PF-1", esi_no: "ESI-1" }, db(), { id: "con-1" });
    expect(normalized.compliance_documents?.map((document) => document.kind)).toEqual(["pan_card", "bank_proof", "labour_license", "insurance", "pf_registration", "esi_registration"]);
    expect(normalized.compliance_documents?.every((document) => document.verified === false && document.mandatory === false)).toBe(true);
    expect(normalized.bank_verified).toBe(false);
  });

  test("governance projects work-type rates without material data", () => {
    const canonical = canonicalContractorCapabilities({ id: "con-1", work_capabilities: [{ subcategory_id: "sub-paint", subcategory_name: "Interior Painting", work_type_rates: [budgetRate] }] }, db());
    expect(contractorGovernanceCapabilityProjection("con-1", canonical)[0]).toMatchObject({ id: "ccap-con-1-sub-paint", work_subcategory_id: "sub-paint", work_subcategory_name: "Interior Painting", work_type_rates: [budgetRate], status: "active" });
  });
});
