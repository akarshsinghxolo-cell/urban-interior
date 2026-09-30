import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { expectNoTokens, expectTokens } from "./helpers/source-contract";

describe("canonical Indian phone system", () => {
  test("all phone-entry forms reuse one shared input", async () => {
    const paths = [
      "src/components/rdash/CustomerDetailsFields.tsx",
      "src/components/rdash/StaffEditDialog.tsx",
      "src/components/rdash/VendorFormDialog.tsx",
      "src/components/rdash/ContractorFormDialog.tsx",
      "src/components/rdash/modules/MastersSalesOpsModule.tsx",
    ];
    for (const path of paths) {
      const source = await testFile(path).text();
      expect(source, path).toContain("IndianMobileInput");
    }
  });

  test("entity write paths use the canonical phone helper instead of local normalizers", async () => {
    const customerSave = await testFile("src/lib/rdash/customer-sites-save.ts").text();
    const vendorProfile = await testFile("src/lib/rdash/vendor-profile.ts").text();
    const contractorProfile = await testFile("src/lib/rdash/contractor-profile.ts").text();
    const procurement = await testFile("src/lib/rdash/store/slices/procurement.ts").text();
    const masters = await testFile("src/lib/rdash/store/slices/masters.ts").text();

    expectTokens(customerSave, ["indianMobileForWrite(", "Customer WhatsApp number", "Customer alternate phone"]);
    expectTokens(vendorProfile, ["sanitizeIndianMobile(input.phone)", "isValidIndianMobile(vendor.phone)"]);
    expectTokens(contractorProfile, ["sanitizeIndianMobile(input.phone)", "isValidIndianMobile(candidate.phone)"]);
    expectTokens(procurement, ["indianMobileForWrite(v.phone", "indianMobileForWrite(s.phone", "indianMobileForWrite(s.emergency_contact"]);
    expectTokens(masters, ["indianMobileForWrite(p.phone"]);
  });

  test("duplicate checks, search and WhatsApp reuse the same canonical module", async () => {
    const identity = await testFile("src/lib/rdash/customer-identity.ts").text();
    const duplicateAudit = await testFile("src/lib/rdash/server/customer-duplicates.ts").text();
    const governance = await testFile("src/lib/rdash/partner-governance.ts").text();
    const whatsapp = await testFile("src/lib/whatsapp/server.ts").text();
    const media = await testFile("src/components/rdash/OperationalMediaPanel.tsx").text();

    for (const source of [identity, duplicateAudit, governance]) {
      expect(source).toContain("sanitizeIndianMobile");
    }
    expectTokens(whatsapp, ["indianWhatsAppDialDigits", "sanitizeIndianMobile"]);
    expectTokens(media, ["indianWhatsAppDialDigits", "isValidIndianMobile"]);
    for (const source of [identity, duplicateAudit, governance, whatsapp, media]) {
      expectNoTokens(source, ["normalizePhone(", "cleanPhoneDigits", "comparableIndianPhone", "slice(-10)"]);
    }
  });

  test("CSV imports validate the same Indian mobile contract before save", async () => {
    const source = await testFile("src/components/rdash/modules/DataImportModule.tsx").text();
    expectTokens(source, [
      '["phone", data.phone]',
      '["whatsapp", data.whatsapp]',
      '["alternate_phone", data.alternate_phone]',
      "isValidIndianMobile(value)",
    ]);
  });

  test("Supabase enforces the same stored format without a parallel phone table", async () => {
    const migration = await testFile("supabase/migrations/20260929191500_enforce_canonical_indian_mobile.sql").text();
    expectTokens(migration, [
      "uc_is_canonical_indian_mobile",
      "entity_customers_indian_mobile_chk",
      "entity_master_vendors_indian_mobile_chk",
      "entity_master_contractors_indian_mobile_chk",
      "entity_master_staff_indian_mobile_chk",
      "entity_master_source_partners_indian_mobile_chk",
    ]);
    expectNoTokens(migration, ["create table", "phone_registry", "phone_identity"]);
  });

  test("seed data uses canonical storage values rather than formatted +91 values", async () => {
    const seed = await testFile("src/lib/rdash/seed.ts").text();
    expect(seed).not.toMatch(/(?:phone|whatsapp|alternate_phone|emergency_contact):\s*"\+91/);
  });
});
