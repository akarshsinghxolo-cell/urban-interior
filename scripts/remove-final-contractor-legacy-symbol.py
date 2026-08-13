from pathlib import Path

PROFILE = Path("src/lib/rdash/contractor-profile.ts")
TEST = Path("tests/contractor-legacy-removal.test.ts")

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
// This prevents obsolete or accidental payload keys from becoming persisted
// Contractor state without maintaining field-by-field legacy compatibility.
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
  "latitude",
  "longitude",
  "source_partner_id",
  "source_partner_name",
  "photo_attachment_id",
  "business_card_attachment_id",
  "reliability_rating",
  "politeness_rating",
  "worker_count_range",
  "deadline_commitment",
  "business_gst",
  "pan",
  "bank_account",
  "ifsc",
  "status",
  "categories",
  "work_capabilities",
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
  "active_jobs",
  "outstanding",
  "past_jobs_count",
  "specializations",
  "duplicate_of_id",
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

test = TEST.read_text()
old_expectation = '    expect(profile).toContain("delete normalized.capabilities_v2");\n'
new_expectation = '    expect(profile).not.toContain("capabilities_v2");\n'
if old_expectation not in test:
    raise SystemExit("Expected Contractor legacy regression assertion was not found")
test = test.replace(old_expectation, new_expectation, 1)

insert_before = '''  test("Contractor referrals and operations do not use the removed paths", async () => {
'''
new_test = '''  test("active TypeScript contains no removed Contractor capability symbol", async () => {
    const hits: string[] = [];
    for (const pattern of ["src/**/*.ts", "src/**/*.tsx"]) {
      const glob = new Bun.Glob(pattern);
      for await (const path of glob.scan(".")) {
        const text = await source(path);
        if (text.includes("capabilities_v2")) hits.push(path);
      }
    }
    expect(hits).toEqual([]);
  });

  test("Contractor referrals and operations do not use the removed paths", async () => {
'''
if insert_before not in test:
    raise SystemExit("Contractor referral test marker not found")
test = test.replace(insert_before, new_test, 1)
TEST.write_text(test)

hits = []
for path in Path("src").rglob("*"):
    if path.suffix not in {".ts", ".tsx"}:
        continue
    if "capabilities_v2" in path.read_text():
        hits.append(str(path))
if hits:
    raise SystemExit(f"Removed Contractor capability symbol remains in active source: {hits}")

print("Final Contractor legacy symbol removed; active TypeScript is clean.")
