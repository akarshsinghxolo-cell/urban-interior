from pathlib import Path

PROFILE = Path("src/lib/rdash/contractor-profile.ts")
GOVERNANCE = Path("src/lib/rdash/partner-governance.ts")
GOVERNANCE_UI = Path("src/components/rdash/modules/PartnerGovernanceModule.tsx")
TYPES = Path("src/lib/rdash/types.ts")
LEGACY_TEST = Path("tests/contractor-legacy-removal.test.ts")
PROFILE_TEST = Path("tests/contractor-profile.test.ts")

profile = PROFILE.read_text()

old_type = '  capabilities_v2?: Array<Record<string, unknown>>;\n'
if old_type not in profile:
    raise SystemExit("Expected Contractor compatibility type field was not found")
profile = profile.replace(old_type, "", 1)

marker = '''export type ContractorDuplicateConflict = {
  id: string;
  name: string;
  reasons: string[];
  hard: boolean;
};

'''
if marker not in profile:
    raise SystemExit("ContractorDuplicateConflict marker not found")

canonical_guard = '''export type ContractorDuplicateConflict = {
  id: string;
  name: string;
  reasons: string[];
  hard: boolean;
};

// Only current Contractor-domain fields are allowed to survive normalization.
// Unknown payload keys are discarded rather than maintained as compatibility
// fields. Operational/performance fields remain explicitly preserved.
const CONTRACTOR_PROFILE_KEYS = new Set([
  "id",
  "name",
  "legal_name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "city",
  "locality",
  "address",
  "trade",
  "rating",
  "active_jobs",
  "outstanding",
  "reliability_score",
  "on_time_pct",
  "past_jobs_count",
  "specializations",
  "latitude",
  "longitude",
  "photo_attachment_id",
  "business_card_attachment_id",
  "reliability_rating",
  "politeness_rating",
  "worker_count_range",
  "deadline_commitment",
  "source_partner_id",
  "source_partner_name",
  "work_capabilities",
  "business_gst",
  "pan",
  "bank_account",
  "ifsc",
  "categories",
  "supervisor_name",
  "supervisor_phone",
  "available_workers",
  "concurrent_site_limit",
  "earliest_mobilisation_date",
  "service_radius_km",
  "labour_registration_no",
  "insurance_expiry",
  "pf_no",
  "esi_no",
  "notes",
  "bank_verified",
  "compliance_documents",
  "duplicate_of_id",
  "duplicate_resolved_at",
  "duplicate_resolution_note",
  "status",
  "performance_recomputed_at",
]);

function canonicalContractorInput(input: ContractorProfileRecord): ContractorProfileRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => CONTRACTOR_PROFILE_KEYS.has(key)),
  ) as ContractorProfileRecord;
}

'''
profile = profile.replace(marker, canonical_guard, 1)

old_create = '''  const canonicalInput: ContractorProfileRecord = { ...input };
  delete canonicalInput.capabilities_v2;
'''
new_create = '''  const canonicalInput = canonicalContractorInput(input);
'''
if old_create not in profile:
    raise SystemExit("Expected create-time compatibility cleanup was not found")
profile = profile.replace(old_create, new_create, 1)

old_normalize = '''  const normalized: ContractorProfileRecord = {
    ...input,
'''
new_normalize = '''  const normalized: ContractorProfileRecord = {
    ...canonicalContractorInput(input),
'''
if old_normalize not in profile:
    raise SystemExit("Expected normalize spread was not found")
profile = profile.replace(old_normalize, new_normalize, 1)

old_delete = '  delete normalized.capabilities_v2;\n'
if old_delete not in profile:
    raise SystemExit("Expected normalize-time compatibility cleanup was not found")
profile = profile.replace(old_delete, "", 1)

if "capabilities_v2" in profile:
    raise SystemExit("Removed Contractor capability symbol still exists in contractor-profile.ts")
PROFILE.write_text(profile)

# The shared master type still had an explicit Contractor compatibility projection.
types = TYPES.read_text()
old_contract_projection = '''    /** Compatibility projection for the governance UI. `work_capabilities` is canonical. */
    capabilities_v2?: Array<{
        id: ID;
        work_subcategory_id: ID;
        work_subcategory_name?: string;
        unit_id?: ID;
        labour_rate?: number;
        with_material_rate?: number;
        article_ids?: ID[];
        article_rates?: Array<{
            article_id: ID;
            article_name?: string;
            labour_rate?: number;
            with_material_rate?: number;
        }>;
        crew_required?: number;
        max_daily_capacity?: number;
        preferred?: boolean;
        status: "active" | "inactive";
        notes?: string;
        created_at?: string;
        updated_at?: string;
    }>;
'''
if old_contract_projection not in types:
    raise SystemExit("Expected Contractor capabilities compatibility block was not found in types.ts")
types = types.replace(old_contract_projection, "", 1)
TYPES.write_text(types)

# partnerCapabilities mixed Contractor work_capabilities with Vendor capabilities_v2.
# Split it into a Vendor-only helper so no shared helper can revive the old
# Contractor fallback while preserving the Vendor module's current data model.
governance = GOVERNANCE.read_text()
old_partner_capabilities = '''export function partnerCapabilities(partner: Record<string, unknown>): PartnerCapability[] {
  if (Array.isArray(partner.work_capabilities)) {
    const partnerId = String(partner.id || "contractor");
    return (partner.work_capabilities as Array<Record<string, unknown>>).flatMap((row) => {
      const subcategoryId = String(row.subcategory_id || row.work_subcategory_id || "").trim();
      if (!subcategoryId) return [];
      return [{
        ...row,
        id: String(row.id || `ccap-${partnerId}-${subcategoryId}`),
        work_subcategory_id: subcategoryId,
        work_subcategory_name: row.subcategory_name || row.work_subcategory_name,
        status: row.status === "inactive" ? "inactive" : "active",
        created_at: String(row.created_at || new Date(0).toISOString()),
        updated_at: String(row.updated_at || new Date(0).toISOString()),
      } as PartnerCapability];
    });
  }
  return Array.isArray(partner.capabilities_v2)
    ? (partner.capabilities_v2 as PartnerCapability[])
    : [];
}
'''
new_vendor_capabilities = '''export function vendorCapabilities(partner: Record<string, unknown>): VendorArticleCapability[] {
  return Array.isArray(partner.capabilities_v2)
    ? (partner.capabilities_v2 as VendorArticleCapability[])
    : [];
}
'''
if old_partner_capabilities not in governance:
    raise SystemExit("Expected mixed partnerCapabilities helper was not found")
governance = governance.replace(old_partner_capabilities, new_vendor_capabilities, 1)
GOVERNANCE.write_text(governance)

ui = GOVERNANCE_UI.read_text()
if ui.count("partnerCapabilities") != 3:
    raise SystemExit(f"Unexpected partnerCapabilities usage count in governance UI: {ui.count('partnerCapabilities')}")
ui = ui.replace("partnerCapabilities,", "vendorCapabilities,", 1)
ui = ui.replace("partnerCapabilities(selected)", "vendorCapabilities(selected)", 1)
ui = ui.replace("partnerCapabilities(partner)", "vendorCapabilities(partner)", 1)
if "partnerCapabilities" in ui:
    raise SystemExit("Mixed partnerCapabilities helper still remains in governance UI")
GOVERNANCE_UI.write_text(ui)

# Update permanent legacy-removal regression coverage. Vendor capabilities_v2
# remains a Vendor field; assertions isolate Contractor runtime/type surfaces.
test = LEGACY_TEST.read_text()
old_expectation = '    expect(profile).toContain("delete normalized.capabilities_v2");\n'
new_expectation = '    expect(profile).not.toContain("capabilities_v2");\n'
if old_expectation not in test:
    raise SystemExit("Expected Contractor legacy regression assertion was not found")
test = test.replace(old_expectation, new_expectation, 1)

insert_before = '''  test("Contractor referrals and operations do not use the removed paths", async () => {
'''
new_test = '''  test("Contractor types and shared helpers expose no compatibility fallback", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const contractorStart = types.indexOf("export interface Contractor {");
    const contractorEnd = types.indexOf("export type StaffRoleKey", contractorStart);
    const contractorType = types.slice(contractorStart, contractorEnd);
    const governance = await source("src/lib/rdash/partner-governance.ts");
    const governanceUi = await source("src/components/rdash/modules/PartnerGovernanceModule.tsx");

    expect(contractorStart).toBeGreaterThanOrEqual(0);
    expect(contractorEnd).toBeGreaterThan(contractorStart);
    expect(contractorType).not.toContain("capabilities_v2");
    expect(governance).toContain("export function vendorCapabilities");
    expect(governance).not.toContain("export function partnerCapabilities");
    expect(governance).not.toContain("partner.work_capabilities");
    expect(governanceUi).toContain("vendorCapabilities(selected)");
    expect(governanceUi).toContain("vendorCapabilities(partner)");
    expect(governanceUi).toContain("canonicalContractorCapabilities(selected, db)");
  });

  test("Contractor referrals and operations do not use the removed paths", async () => {
'''
if insert_before not in test:
    raise SystemExit("Contractor referral test marker not found")
test = test.replace(insert_before, new_test, 1)
LEGACY_TEST.write_text(test)

# Convert the functional Contractor test away from the removed mixed helper and
# prove generic obsolete payload keys are dropped without naming old fields.
profile_test = PROFILE_TEST.read_text()
profile_test = profile_test.replace(
  '  contractorDuplicateConflicts,\n',
  '  contractorDuplicateConflicts,\n  contractorGovernanceCapabilityProjection,\n',
  1,
)
old_import = 'import { partnerCapabilities } from "../src/lib/rdash/partner-governance";\n'
if old_import not in profile_test:
    raise SystemExit("Expected old governance helper import was not found in Contractor tests")
profile_test = profile_test.replace(old_import, "", 1)

old_fixture = '      capabilities_v2: [{ id: "ccap-1", work_subcategory_id: "sub-paint" }],\n'
if old_fixture not in profile_test:
    raise SystemExit("Expected old Contractor compatibility fixture was not found")
profile_test = profile_test.replace(old_fixture, '      obsolete_payload_field: "discard-me",\n', 1)
old_assertion = '    expect(record.capabilities_v2).toBeUndefined();\n'
if old_assertion not in profile_test:
    raise SystemExit("Expected old Contractor compatibility assertion was not found")
profile_test = profile_test.replace(
  old_assertion,
  '    expect((record as Record<string, unknown>).obsolete_payload_field).toBeUndefined();\n',
  1,
)

old_governance_test = '''  test("governance reads canonical work capabilities when the legacy projection is missing", () => {
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
'''
new_governance_test = '''  test("governance projects canonical work capabilities directly", () => {
    const state = db();
    const canonical = canonicalContractorCapabilities({
      id: "con-1",
      work_capabilities: [{
        subcategory_id: "sub-paint",
        subcategory_name: "Interior Painting",
        labour_rate: 40,
        with_material_rate: 110,
      }],
    }, state);
    const capabilities = contractorGovernanceCapabilityProjection("con-1", canonical);

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
'''
if old_governance_test not in profile_test:
    raise SystemExit("Expected old Contractor governance projection test was not found")
profile_test = profile_test.replace(old_governance_test, new_governance_test, 1)
PROFILE_TEST.write_text(profile_test)

# Final targeted audit: Vendor may legitimately keep capabilities_v2, but none of
# the Contractor type/profile paths or generic governance helper may use it.
profile = PROFILE.read_text()
types = TYPES.read_text()
contractor_start = types.index("export interface Contractor {")
contractor_end = types.index("export type StaffRoleKey", contractor_start)
contractor_type = types[contractor_start:contractor_end]
governance = GOVERNANCE.read_text()
ui = GOVERNERNANCE_UI.read_text() if False else GOVERNANCE_UI.read_text()
profile_test = PROFILE_TEST.read_text()

problems = []
if "capabilities_v2" in profile:
    problems.append("contractor-profile.ts still names the removed field")
if "capabilities_v2" in contractor_type:
    problems.append("Contractor interface still declares the removed field")
if "partner.work_capabilities" in governance or "function partnerCapabilities" in governance:
    problems.append("shared governance helper still accepts Contractor capability data")
if "partnerCapabilities" in ui:
    problems.append("governance UI still imports/calls mixed partnerCapabilities")
if "partnerCapabilities" in profile_test:
    problems.append("Contractor functional tests still depend on mixed partnerCapabilities")
if problems:
    raise SystemExit("; ".join(problems))

print("Final Contractor compatibility residue removed without changing Vendor capabilities.")
