import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  contractorCapabilityRateError,
  fieldChanges,
  legacyVendorArticleNames,
  partnerChangedPatch,
  partnerFormFingerprint,
  vendorLegacyMigrationPatch,
  vendorNotesWithoutLegacyArticles,
} from "../src/lib/rdash/partner-form-consistency";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const partnerEntry = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");
const partnerHost = readFileSync("src/components/rdash/PartnerFormDialog.tsx", "utf8");
const partnerDialog = readFileSync("src/components/rdash/UnifiedPartnerFormDialog.tsx", "utf8");
const partnerBridge = readFileSync("src/lib/rdash/partner-form-store-bridge.ts", "utf8");
const contractorPolicy = readFileSync("src/lib/rdash/contractor-store-policy.ts", "utf8");
const contractorEntry = readFileSync("src/components/rdash/ContractorFormDialog.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");

test("legacy customer write APIs are removed from active store and UI paths", () => {
  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {
    expect(crm.includes(token)).toBe(false);
    expect(types.includes(token)).toBe(false);
  }
  expect(customerDesk.includes("<EntityFormDialog type=\"customer\"")).toBe(false);
  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);
  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerEntry.includes("PartnerFormDialog")).toBe(true);
  expect(partnerDialog.includes("type === \"customer\"")).toBe(false);
  expect(partnerDialog.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);
  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);
  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));
  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
});

test("partner create and edit use guarded canonical workflows", () => {
  expect(partnerHost.includes("retainPartnerFormStoreBridge")).toBe(true);
  expect(partnerHost.includes("ContractorFormDialog")).toBe(true);
  expect(partnerHost.includes("<UnifiedVendorForm")).toBe(true);
  expect(partnerDialog.includes("useDirtyFormRegistration")).toBe(true);
  expect(partnerDialog.includes("partnerChangedPatch")).toBe(true);
  expect(partnerDialog.includes("isEdit && !dirty")).toBe(true);
  expect(partnerDialog.includes("await awaitServerSync();")).toBe(true);
  expect(partnerDialog.indexOf("await awaitServerSync();")).toBeLessThan(partnerDialog.indexOf("commitBatches();"));
  expect(partnerDialog.includes("article_ids: [...vendorArticleIds]")).toBe(true);
  expect(partnerDialog.includes("article_ids: [...row.article_ids]")).toBe(false);
  expect(partnerDialog.includes("Will save as an unlinked referrer name")).toBe(true);
  expect(partnerDialog.includes("combinedNotes")).toBe(false);
  expect(contractorEntry.includes("useDirtyFormRegistration")).toBe(true);
  expect(contractorEntry.includes("contractorFormProjection")).toBe(true);
  expect(contractorEntry.includes("article_rates")).toBe(true);
});

test("partner patches contain only modified fields", () => {
  const before = { name: "Vendor", phone: "9876543210", article_ids: ["a1"] };
  const after = { name: "Vendor", phone: "9123456789", article_ids: ["a1"] };
  expect(partnerChangedPatch(before, after)).toEqual({ phone: "9123456789" });
  expect(fieldChanges(before, after)).toEqual([
    { field: "phone", before: "9876543210", after: "9123456789" },
  ]);
});

test("record metadata and absent optional collections do not create false dirty state", () => {
  const stored = {
    id: "contractor-1",
    name: "Contractor",
    phone: undefined,
    city: undefined,
    outstanding: 500,
    reliability_score: 92,
  };
  const form = {
    name: "Contractor",
    phone: "",
    city: "",
    locality: undefined,
    address: undefined,
    categories: [],
    work_capabilities: [],
  };
  expect(partnerFormFingerprint(stored)).toBe(partnerFormFingerprint(form));
  expect(
    partnerChangedPatch(
      { categories: ["Painting"] },
      { categories: [] },
    ),
  ).toEqual({ categories: [] });
});

test("legacy Vendor article migration preserves explicit user edits", () => {
  const before = {
    notes: "Cash only\nSupplies articles: Cement, Primer\nDeliver before noon",
  };
  const articles = [
    { id: "cement", name: "Cement" },
    { id: "primer", name: "Primer" },
  ];
  expect(legacyVendorArticleNames(before.notes)).toEqual(["Cement", "Primer"]);
  expect(vendorNotesWithoutLegacyArticles(before.notes)).toBe(
    "Cash only\nDeliver before noon",
  );
  expect(vendorLegacyMigrationPatch(before, { phone: "9876543210" }, articles)).toEqual({
    phone: "9876543210",
    article_ids: ["cement", "primer"],
    notes: "Cash only\nDeliver before noon",
  });
  expect(
    vendorLegacyMigrationPatch(
      before,
      { notes: "User-edited notes", article_ids: ["primer"] },
      articles,
    ),
  ).toEqual({ notes: "User-edited notes", article_ids: ["primer"] });
});

test("legacy Vendor migration keeps unresolved text and respects an explicit empty list", () => {
  const before = { notes: "Supplies articles: Cement, Unknown Article" };
  expect(
    vendorLegacyMigrationPatch(before, { phone: "9876543210" }, [
      { id: "cement", name: "Cement" },
    ]),
  ).toEqual({ phone: "9876543210", article_ids: ["cement"] });
  expect(
    vendorLegacyMigrationPatch(
      { ...before, article_ids: [] },
      { phone: "9876543210" },
      [{ id: "cement", name: "Cement" }],
    ),
  ).toEqual({ phone: "9876543210" });
  expect(partnerBridge.includes("vendorLegacyMigrationPatch")).toBe(true);
});

test("Contractor rates reject negative and nonnumeric values at the permanent write boundary", () => {
  expect(
    contractorCapabilityRateError([
      { labour_rate: 100, with_material_rate: 250 },
    ]),
  ).toBeNull();
  expect(
    contractorCapabilityRateError([{ labour_rate: -1 }]),
  ).toBe("Contractor rates must be valid non-negative numbers.");
  expect(
    contractorCapabilityRateError([{ with_material_rate: "invalid" }]),
  ).toBe("Contractor rates must be valid non-negative numbers.");
  expect(contractorPolicy.includes("originalAddContractor")).toBe(true);
  expect(contractorPolicy.includes("contractorProfileValidationError")).toBe(true);
  expect(contractorPolicy.includes("synchronizeRateProjection")).toBe(true);
  expect(partnerBridge.includes("originalAddContractor")).toBe(false);
});

test("partner updates emit one detailed audit instead of the generic edit audit", () => {
  expect(partnerBridge.includes("withSuppressedGenericAudit")).toBe(true);
  expect(partnerBridge.includes("detailedAudit")).toBe(true);
  expect(partnerBridge.includes("isActiveScope")).toBe(true);
  expect(partnerBridge.includes("before,")).toBe(true);
  expect(partnerBridge.includes("after,")).toBe(true);
  expect(partnerBridge.includes("Changed fields:")).toBe(true);
});

test("Vendor create does not emit an empty or duplicate follow-up audit", () => {
  expect(partnerBridge.includes("activeCreates > 0")).toBe(true);
  expect(partnerBridge.includes('suppliedFields[0] === "article_ids"')).toBe(true);
  expect(partnerBridge.includes("if (!articleIds.length) return;")).toBe(true);
  expect(partnerBridge.includes("withSuppressedGenericAudit")).toBe(true);
});
