import { describe, expect, test } from "bun:test";
import {
  canonicalContractorCapabilities,
  contractorMasterRecordForCreate,
  contractorDuplicateConflicts,
  contractorProfileValidationError,
  contractorRateProjection,
  derivedContractorCategoryNames,
  normalizeContractorForWrite,
  verifiedContractorBankProof,
  type ContractorProfileRecord,
} from "../src/lib/rdash/contractor-profile";
import { partnerCapabilities } from "../src/lib/rdash/partner-governance";

function db() {
  return {
    master: {
      contractors: [] as ContractorProfileRecord[],
      contractorRates: [] as any[],
      workCategories: [
        { id: "cat-paint", name: "Painting" },
        { id: "cat-wood", name: "Carpentry" },
      ],
      workSubcategories: [
        { id: "sub-paint", category_id: "cat-paint", name: "Interior Painting" },
        { id: "sub-wood", category_id: "cat-wood", name: "Wardrobes" },
      ],
      articles: [
        { id: "art-1", name: "Primer" },
        { id: "art-2", name: "Premium Paint" },
      ],
      subcategoryArticleMap: [
        { id: "scope-1", work_required_id: "sub-paint", article_id: "art-1", unit_id: "sqft" },
        { id: "scope-2", work_required_id: "sub-paint", article_id: "art-2", unit_id: "sqft" },
      ],
      sourcePartners: [{ id: "sp-1", name: "Architect One", type: "Architect" }],
    },
  } as any;
}

describe("canonical contractor profile", () => {
  test("new contractors normalize to onboarding and derive categories from capabilities", () => {
    const state = db();
    const normalized = normalizeContractorForWrite(
      {
        id: "con-1",
        name: "  Mr Das  ",
        phone: "+91 98765 43210",
        city: " Gorakhpur ",
        source_partner_id: "sp-1",
        work_capabilities: [
          {
            subcategory_id: "sub-paint",
            subcategory_name: "Interior Painting",
            labour_rate: 25,
            with_material_rate: 80,
            article_ids: ["art-1", "art-1"],
            article_rates: [
              { article_id: "art-1", labour_rate: 30, with_material_rate: 95 },
              { article_id: "art-1", labour_rate: 35, with_material_rate: 100 },
            ],
          },
        ],
      },
      state,
      { id: "con-1" },
    );

    expect(normalized.name).toBe("Mr Das");
    expect(normalized.phone).toBe("9876543210");
    expect(normalized.city).toBe("Gorakhpur");
    expect(normalized.status).toBe("onboarding");
    expect(normalized.source_partner_name).toBe("Architect One");
    expect(normalized.categories).toEqual(["Painting"]);
    expect(normalized.work_capabilities?.[0].article_ids).toEqual(["art-1"]);
    expect(normalized.work_capabilities?.[0].article_rates).toEqual([
      { article_id: "art-1", labour_rate: 35, with_material_rate: 100 },
    ]);
    expect(normalized.capabilities_v2).toBeUndefined();
  });

  test("missing canonical capabilities does not resurrect legacy rate rows", () => {
    const state = db();
    state.master.contractorRates = [{
      id: "rate-1",
      contractor_id: "con-1",
      trade: "Interior Painting",
      rate: 30,
      work_subcategory_id: "sub-paint",
      labour_rate: 30,
    }];

    expect(canonicalContractorCapabilities({ id: "con-1" }, state)).toEqual([]);
    expect(canonicalContractorCapabilities({
      id: "con-1",
      work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }],
    }, state)[0].labour_rate).toBe(40);
  });

  test("category names cannot drift from selected subcategories", () => {
    const state = db();
    expect(
      derivedContractorCategoryNames(state, [
        { subcategory_id: "sub-paint" },
        { subcategory_id: "sub-wood" },
      ]),
    ).toEqual(["Painting", "Carpentry"]);
    expect(derivedContractorCategoryNames(state, [])).toEqual([]);
  });

  test("contractor rate master rows are projections of canonical capabilities", () => {
    const state = db();
    const contractor: ContractorProfileRecord = {
      id: "con-1",
      name: "Mr Das",
      work_capabilities: [
        {
          subcategory_id: "sub-paint",
          subcategory_name: "Interior Painting",
          labour_rate: 40,
          with_material_rate: 110,
        },
      ],
    };
    const rates = contractorRateProjection(state, contractor);
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      contractor_id: "con-1",
      work_subcategory_id: "sub-paint",
      labour_rate: 40,
      with_material_rate: 110,
      rate: 40,
    });
  });

  test("existing projected rows cannot become a second rate source", () => {
    const state = db();
    state.master.contractorRates = [{
      id: "rate-default",
      contractor_id: "con-1",
      trade: "Interior Painting",
      rate: 30,
      work_subcategory_id: "sub-paint",
      labour_rate: 30,
    }];
    const capability = canonicalContractorCapabilities({
      id: "con-1",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        labour_rate: 55,
        with_material_rate: 125,
      }],
    }, state)[0];
    expect(capability.labour_rate).toBe(55);
    expect(capability.with_material_rate).toBe(125);
  });

  test("material-specific rates project as separate contractor rate rows", () => {
    const state = db();
    const rates = contractorRateProjection(state, {
      id: "con-1",
      name: "Mr Das",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        subcategory_name: "Interior Painting",
        article_ids: ["art-1", "art-2"],
        article_rates: [
          { article_id: "art-1", labour_rate: 30, with_material_rate: 90 },
          { article_id: "art-2", labour_rate: 45, with_material_rate: 140 },
        ],
      }],
    });

    expect(rates).toHaveLength(2);
    expect(rates.map((rate) => ({
      article_id: rate.article_id,
      labour_rate: rate.labour_rate,
      with_material_rate: rate.with_material_rate,
    }))).toEqual([
      { article_id: "art-1", labour_rate: 30, with_material_rate: 90 },
      { article_id: "art-2", labour_rate: 45, with_material_rate: 140 },
    ]);
  });
});

describe("contractor validation and duplicate prevention", () => {
  test("create requires phone, city and at least one capability", () => {
    expect(
      contractorProfileValidationError(
        { name: "Mr Das", phone: "9876543210", city: "Gorakhpur", work_capabilities: [] },
        { isCreate: true },
      ),
    ).toBe("Select at least one work capability for the contractor.");
  });

  test("invalid rates and business fields are rejected", () => {
    expect(
      contractorProfileValidationError({
        name: "Mr Das",
        email: "invalid",
      }),
    ).toBe("Enter a valid contractor email address.");
    expect(
      contractorProfileValidationError({
        name: "Mr Das",
        work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: -1 }],
      }),
    ).toBe("Contractor rates must be valid non-negative numbers.");
  });

  test("same phone/PAN/GST/bank account is a hard duplicate", () => {
    const state = db();
    state.master.contractors = [
      {
        id: "existing",
        name: "Das Enterprises",
        phone: "9876543210",
        pan: "ABCDE1234F",
        business_gst: "09ABCDE1234F1Z5",
        bank_account: "1234567890",
        city: "Gorakhpur",
      },
    ];
    const conflicts = contractorDuplicateConflicts(state, {
      name: "Another Das",
      phone: "9876543210",
      pan: "ABCDE1234F",
      business_gst: "09ABCDE1234F1Z5",
      bank_account: "1234567890",
      city: "Lucknow",
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].hard).toBe(true);
    expect(conflicts[0].reasons).toEqual([
      "same GSTIN",
      "same PAN",
      "same phone",
      "same bank account",
    ]);
  });

  test("same normalized name and city is a warning, not a hard block", () => {
    const state = db();
    state.master.contractors = [
      { id: "existing", name: "Das Contractors Pvt Ltd", city: "Gorakhpur" },
    ];
    const conflicts = contractorDuplicateConflicts(state, {
      name: "Das Contractor",
      city: "Gorakhpur",
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].hard).toBe(false);
  });

  test("referrals require Source Partner ids and discard free-text compatibility", () => {
    const state = db();
    expect(() =>
      normalizeContractorForWrite(
        { id: "con-1", name: "Mr Das", source_partner_id: "vendor-1" },
        state,
        { id: "con-1" },
      ),
    ).toThrow("Choose a valid Source Partner");
    const normalized = normalizeContractorForWrite(
      { id: "con-1", name: "Mr Das", source_partner_name: "Old free text" },
      state,
      { id: "con-1" },
    );
    expect(normalized.source_partner_name).toBeUndefined();
  });

  test("bank verification is derived from verified bank-proof evidence", () => {
    expect(
      verifiedContractorBankProof({
        compliance_documents: [
          { kind: "bank_proof", verified: false },
          { kind: "pan_card", verified: true },
        ],
      }),
    ).toBe(false);
    expect(
      verifiedContractorBankProof({
        compliance_documents: [{ kind: "bank_proof", verified: true }],
      }),
    ).toBe(true);
  });
});

describe("contractor create persistence and governance projection", () => {
  test("create records preserve the complete normalized form payload", () => {
    const record = contractorMasterRecordForCreate({
      id: "reserved-id",
      name: "Complete Contractor",
      legal_name: "Complete Contractor Private Limited",
      whatsapp: "9876543210",
      alternate_phone: "9876543211",
      email: "accounts@example.com",
      supervisor_name: "Site Foreman",
      supervisor_phone: "9876543212",
      available_workers: 14,
      concurrent_site_limit: 3,
      service_radius_km: 45,
      labour_registration_no: "LAB-42",
      insurance_expiry: "2027-12-31",
      pf_no: "PF-42",
      esi_no: "ESI-42",
      notes: "Preferred for complex work",
      work_capabilities: [{ subcategory_id: "sub-paint", labour_rate: 40 }],
      capabilities_v2: [{ id: "ccap-1", work_subcategory_id: "sub-paint" }],
      compliance_documents: [{ id: "doc-1", kind: "insurance", verified: false }],
    }, "con-42");

    expect(record).toMatchObject({
      id: "con-42",
      legal_name: "Complete Contractor Private Limited",
      email: "accounts@example.com",
      supervisor_name: "Site Foreman",
      available_workers: 14,
      labour_registration_no: "LAB-42",
      pf_no: "PF-42",
      notes: "Preferred for complex work",
    });
    expect(record.capabilities_v2).toBeUndefined();
    expect(record.compliance_documents).toHaveLength(1);
  });

  test("form-entered compliance identifiers populate the document register as unverified evidence", () => {
    const normalized = normalizeContractorForWrite({
      id: "con-1",
      name: "Mr Das",
      pan: "ABCDE1234F",
      bank_account: "1234567890",
      ifsc: "HDFC0001234",
      labour_registration_no: "LAB-1",
      insurance_expiry: "2027-12-31",
      pf_no: "PF-1",
      esi_no: "ESI-1",
    }, db(), { id: "con-1" });

    expect(normalized.compliance_documents?.map((document) => document.kind)).toEqual([
      "pan_card",
      "bank_proof",
      "labour_license",
      "insurance",
      "pf_registration",
      "esi_registration",
    ]);
    expect(normalized.compliance_documents?.every((document) => document.verified === false)).toBe(true);
    expect(normalized.compliance_documents?.every((document) => document.mandatory === false)).toBe(true);
    expect(normalized.bank_verified).toBe(false);
  });

  test("governance reads canonical work capabilities when the legacy projection is missing", () => {
    const capabilities = partnerCapabilities({
      id: "con-1",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        subcategory_name: "Interior Painting",
        labour_rate: 40,
        with_material_rate: 110,
      }],
    });

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]).toMatchObject({
      id: "ccap-con-1-sub-paint",
      work_subcategory_id: "sub-paint",
      work_subcategory_name: "Interior Painting",
      labour_rate: 40,
      with_material_rate: 110,
      status: "active",
    });
  });
});