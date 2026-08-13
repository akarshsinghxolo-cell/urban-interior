from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

# Correct the temporary consumer transformer markers against the audited source
# shape, then run the consumer cutover. Both helper scripts are deleted before
# the verified tree is committed back to the PR branch.
subprocess.check_call(["python", "scripts/prepare-vendor-consumer-fixer.py"], cwd=ROOT)
(ROOT / "scripts/prepare-vendor-consumer-fixer.py").unlink()
subprocess.check_call(["python", "scripts/fix-vendor-consumers.py"], cwd=ROOT)
(ROOT / "scripts/fix-vendor-consumers.py").unlink()

# Customer/Site regression used to import the shared Vendor form/bridge even
# though those files were unrelated to Customer persistence. Keep this test
# focused on the canonical Customer/Site boundary now that Vendor has its own form.
(ROOT / "tests/customer-sites-legacy-removal.test.ts").write_text(r'''import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");

test("legacy customer write APIs are removed from active store and UI paths", () => {
  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {
    expect(crm.includes(token)).toBe(false);
    expect(types.includes(token)).toBe(false);
  }
  expect(customerDesk.includes("<EntityFormDialog type=\\\"customer\\\"")).toBe(false);
  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);
  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);
});

test("Customer/Site dialog retains canonical sync and dirty-form protection", () => {
  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);
  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));
});
''')

# The generated Vendor regression must distinguish a removed `rate` field from
# the canonical `quoted_rate` field instead of using a substring check.
legacy_test = ROOT / "tests/vendor-legacy-removal.test.ts"
legacy_text = legacy_test.read_text()
legacy_text = legacy_text.replace(
    '"valid_from", "current_source_type", "article_name", "rate:"])',
    '"valid_from", "current_source_type", "article_name"])',
)
legacy_text = legacy_text.replace(
    'expect(block).not.toContain(legacy);\n',
    'expect(block).not.toContain(legacy);\n    expect(block).not.toContain("\\n    rate:");\n',
    1,
)
legacy_test.write_text(legacy_text)

# React's refs rule correctly rejects calling buildPayload() during render while
# that callback reads baselineRef.current. Keep the mutable baseline ref for
# event-time save/discard behavior, but mirror the render-time metadata in state
# so dirty/duplicate/validation calculations are pure during render.
vendor_form_path = ROOT / "src/components/rdash/VendorFormDialog.tsx"
vendor_form = vendor_form_path.read_text()
old_state = '''  const baselineRef = React.useRef<VendorProfileRecord>({});
  const [baselineKey, setBaselineKey] = React.useState("");'''
new_state = '''  const baselineRef = React.useRef<VendorProfileRecord>({});
  const [baselineMetadata, setBaselineMetadata] = React.useState<Pick<VendorProfileRecord, "source_partner_id" | "source_partner_name" | "created_at">>({});
  const [baselineKey, setBaselineKey] = React.useState("");'''
if old_state not in vendor_form:
    raise SystemExit("Vendor form baseline state marker not found")
vendor_form = vendor_form.replace(old_state, new_state, 1)

old_metadata = '''    source_partner_id: baselineRef.current.source_partner_id,
    source_partner_name: baselineRef.current.source_partner_name,
    supply_capabilities: capabilities.map((row) => ({'''
new_metadata = '''    source_partner_id: baselineMetadata.source_partner_id,
    source_partner_name: baselineMetadata.source_partner_name,
    supply_capabilities: capabilities.map((row) => ({'''
if old_metadata not in vendor_form:
    raise SystemExit("Vendor form source-partner baseline marker not found")
vendor_form = vendor_form.replace(old_metadata, new_metadata, 1)

old_created = '''    created_at: baselineRef.current.created_at,
  }, db, { id: editId || reservedId || undefined }), [businessCard, capabilities, db, draft, editId, latitude, longitude, reservedId, shopPhoto]);'''
new_created = '''    created_at: baselineMetadata.created_at,
  }, db, { id: editId || reservedId || undefined }), [baselineMetadata, businessCard, capabilities, db, draft, editId, latitude, longitude, reservedId, shopPhoto]);'''
if old_created not in vendor_form:
    raise SystemExit("Vendor form created-at baseline marker not found")
vendor_form = vendor_form.replace(old_created, new_created, 1)

old_initialize = '''    baselineRef.current = normalized;
    setBaselineKey(fingerprint(normalized));'''
new_initialize = '''    baselineRef.current = normalized;
    setBaselineMetadata({
      source_partner_id: normalized.source_partner_id,
      source_partner_name: normalized.source_partner_name,
      created_at: normalized.created_at,
    });
    setBaselineKey(fingerprint(normalized));'''
if old_initialize not in vendor_form:
    raise SystemExit("Vendor form baseline initialization marker not found")
vendor_form = vendor_form.replace(old_initialize, new_initialize, 1)

old_save_baseline = '''      baselineRef.current = record;
      setBaselineKey(fingerprint(record));'''
new_save_baseline = '''      baselineRef.current = record;
      setBaselineMetadata({
        source_partner_id: record.source_partner_id,
        source_partner_name: record.source_partner_name,
        created_at: record.created_at,
      });
      setBaselineKey(fingerprint(record));'''
if old_save_baseline not in vendor_form:
    raise SystemExit("Vendor form saved baseline marker not found")
vendor_form = vendor_form.replace(old_save_baseline, new_save_baseline, 1)
vendor_form_path.write_text(vendor_form)

required_absent = [
    "src/components/rdash/UnifiedPartnerFormDialog.tsx",
    "src/lib/rdash/partner-form-store-bridge.ts",
    "src/lib/rdash/partner-form-consistency.ts",
    "src/lib/rdash/partner-form-types.d.ts",
]
for path in required_absent:
    if (ROOT / path).exists():
        raise SystemExit(f"Obsolete Vendor path still exists: {path}")

router = (ROOT / "src/components/rdash/PartnerFormDialog.tsx").read_text()
if "VendorFormDialog" not in router or "ContractorFormDialog" not in router:
    raise SystemExit("Partner router does not use the dedicated Vendor and Contractor forms")

performance = (ROOT / "src/components/rdash/modules/VendorPerformanceModule.tsx").read_text()
if "VendorWorkspaceModule" not in performance or "Partner360Phase2Workspace" in performance:
    raise SystemExit("Vendor module is still routed through old shared governance")

profile = (ROOT / "src/lib/rdash/vendor-profile.ts").read_text()
for token in ["capabilities_v2", "article_ids", "verified_bank", "payment_terms", "credit_limit"]:
    if token in profile:
        raise SystemExit(f"Vendor profile still contains removed compatibility token: {token}")

rate_types = (ROOT / "src/lib/rdash/types.ts").read_text()
start = rate_types.index("export interface VendorRate {")
end = rate_types.index("export interface VendorRateHistory", start)
block = rate_types[start:end]
for required in ["vendor_id", "article_id", "quoted_rate", "status", "created_at", "updated_at"]:
    if required not in block:
        raise SystemExit(f"Canonical VendorRate field missing: {required}")
for forbidden in ["unit_id", "work_required_article_id", "gst_inclusive", "gst_rate", "discount_pct", "freight_amount", "valid_from", "article_name"]:
    if forbidden in block:
        raise SystemExit(f"Legacy VendorRate field remains: {forbidden}")
if "\n    rate:" in block:
    raise SystemExit("Legacy VendorRate field remains: rate")

average = (ROOT / "src/lib/rdash/vendor-rate-average.ts").read_text()
for forbidden in ["LandedCostFields", "freight_amount", "discount_pct", "gst_rate", "default_units_per_rate_unit", "vendorRateHistories"]:
    if forbidden in average:
        raise SystemExit(f"Legacy rate averaging behavior remains: {forbidden}")
if "resolveArticleRateConfig" not in average:
    raise SystemExit("Vendor rate average bypasses Article/Variant resolver")

# Inspect known live VendorRate consumers directly. Generic strings such as
# work_required_article_id remain valid in procurement/work records and must not
# be treated as VendorRate compatibility merely because the same file also reads
# vendorRates.
consumer_files = [
    "src/components/rdash/MaterialPriceTracker.tsx",
    "src/components/rdash/modules/MastersSalesOpsModule.tsx",
    "src/components/rdash/modules/ProcurementModule.tsx",
    "src/components/rdash/modules/RateFinderModule.tsx",
    "src/components/rdash/modules/VendorPriceMasterModule.tsx",
    "src/components/rdash/modules/VendorWorkspaceModule.tsx",
    "src/components/rdash/modules/WorkCategoryMasterModule.tsx",
    "src/lib/rdash/work-category-master.ts",
    "src/lib/rdash/operational-repair.ts",
]
for relative in consumer_files:
    source = (ROOT / relative).read_text()
    if "vendorRates" not in source and "VendorPriceMasterModule" not in relative and "RateFinderModule" not in relative:
        continue
    for old_expression in ["vendorRate.rate", "vr.rate", "rate.article_name", "vr.article_name", "rate.unit_id", "vr.unit_id", "rate.work_required_article_id", "vr.work_required_article_id"]:
        if old_expression in source:
            raise SystemExit(f"Legacy VendorRate expression remains in {relative}: {old_expression}")

migration = (ROOT / "supabase/migrations/20260813165000_canonicalize_vendor_profile_and_rates.sql").read_text()
if "supply_capabilities" not in migration or "quoted_rate" not in migration:
    raise SystemExit("Vendor cutover migration is incomplete")

print("Vendor re-audit gate passed.")