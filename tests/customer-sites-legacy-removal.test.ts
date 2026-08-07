import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const storeTypes = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const partnerEntry = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");
const partnerHost = readFileSync("src/components/rdash/PartnerFormDialog.tsx", "utf8");
const vendorForm = readFileSync("src/components/rdash/VendorFormDialog.tsx", "utf8");
const vendorProfile = readFileSync("src/lib/rdash/vendor-profile.ts", "utf8");
const vendorRate = readFileSync("src/lib/rdash/vendor-rate.ts", "utf8");
const contractorPolicy = readFileSync("src/lib/rdash/contractor-store-policy.ts", "utf8");
const contractorEntry = readFileSync("src/components/rdash/ContractorFormDialog.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");

test("legacy customer write APIs are removed from active store and UI paths", () => {
  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {
    expect(crm.includes(token)).toBe(false);
    expect(storeTypes.includes(token)).toBe(false);
  }
  expect(customerDesk.includes("<EntityFormDialog type=\"customer\"")).toBe(false);
  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);
  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerEntry.includes("PartnerFormDialog")).toBe(true);
  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);
  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));
  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
});

test("Vendor has exactly one active form and one canonical save path", () => {
  expect(existsSync("src/components/rdash/UnifiedPartnerFormDialog.tsx")).toBe(false);
  expect(existsSync("src/lib/rdash/partner-form-store-bridge.ts")).toBe(false);
  expect(existsSync("src/lib/rdash/partner-form-consistency.ts")).toBe(false);

  expect(partnerHost.includes("VendorFormDialog")).toBe(true);
  expect(partnerHost.includes("ContractorFormDialog")).toBe(true);
  expect(partnerHost.includes("retainPartnerFormStoreBridge")).toBe(false);
  expect(partnerHost.includes("UnifiedPartnerFormDialog")).toBe(false);

  expect(vendorForm.includes("useDirtyFormRegistration")).toBe(true);
  expect(vendorForm.includes("normalizeVendorForWrite")).toBe(true);
  expect(vendorForm.includes("mutateMaster")).toBe(true);
  expect(vendorForm.includes("await awaitServerSync();")).toBe(true);
  expect(vendorForm.indexOf("await awaitServerSync();")).toBeLessThan(vendorForm.indexOf("commitBatches();"));
  expect(vendorForm.includes("supply_capabilities")).toBe(true);

  for (const forbidden of ["addVendor", "updateVendor", "article_ids", "vendorLegacyMigrationPatch", "retainPartnerFormStoreBridge"]) {
    expect(vendorForm.includes(forbidden)).toBe(false);
  }

  expect(contractorEntry.includes("useDirtyFormRegistration")).toBe(true);
  expect(contractorEntry.includes("contractorFormProjection")).toBe(true);
});

test("Vendor capability and rate code has no runtime legacy aliases", () => {
  expect(vendorProfile.includes("vendor.article_ids")).toBe(false);
  expect(vendorProfile.includes("article_ids:")).toBe(false);
  expect(vendorProfile.includes("quoted_rate")).toBe(false);
  expect(vendorProfile.includes("?? (rate as any).rate")).toBe(false);

  expect(vendorRate.includes("quoted_rate")).toBe(false);
  expect(vendorRate.includes("valid_from")).toBe(false);
  expect(vendorRate.includes("valid_until")).toBe(false);
  expect(vendorRate.includes("Compatibility mirror")).toBe(false);
  expect(vendorRate.includes("work_required_article_id: input.change.scope.id")).toBe(false);
});

test("Contractor remains on its independent canonical form and permanent policy boundary", () => {
  expect(contractorPolicy.includes("originalAddContractor")).toBe(true);
  expect(contractorPolicy.includes("contractorProfileValidationError")).toBe(true);
  expect(contractorPolicy.includes("synchronizeRateProjection")).toBe(true);
  expect(contractorEntry.includes("normalizeContractorForWrite")).toBe(true);
});
