import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  fieldChanges,
  legacyVendorArticleNames,
  partnerChangedPatch,
  vendorNotesWithoutLegacyArticles,
} from "../src/lib/rdash/partner-form-consistency";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const partnerEntry = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");
const partnerDialog = readFileSync("src/components/rdash/UnifiedPartnerFormDialog.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");

test("legacy customer write APIs are removed from active store and UI paths", () => {
  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {
    expect(crm.includes(token)).toBe(false);
    expect(types.includes(token)).toBe(false);
  }
  expect(customerDesk.includes("<EntityFormDialog type=\"customer\"")).toBe(false);
  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);
  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerEntry.includes("UnifiedPartnerFormDialog")).toBe(true);
  expect(partnerDialog.includes("type === \"customer\"")).toBe(false);
  expect(partnerDialog.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);
  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);
  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));
  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
});

test("partner create and edit use one guarded patch-only workflow", () => {
  expect(partnerDialog.includes("useDirtyFormRegistration")).toBe(true);
  expect(partnerDialog.includes("partnerChangedPatch")).toBe(true);
  expect(partnerDialog.includes("isEdit && !dirty")).toBe(true);
  expect(partnerDialog.includes("await awaitServerSync();")).toBe(true);
  expect(partnerDialog.indexOf("await awaitServerSync();")).toBeLessThan(partnerDialog.indexOf("commitBatches();"));
  expect(partnerDialog.includes("article_ids: [...vendorArticleIds]")).toBe(true);
  expect(partnerDialog.includes("article_ids: [...row.article_ids]")).toBe(true);
  expect(partnerDialog.includes("Will save as an unlinked referrer name")).toBe(true);
  expect(partnerDialog.includes("combinedNotes")).toBe(false);
});

test("partner patches contain only modified fields", () => {
  const before = { name: "Vendor", phone: "9876543210", article_ids: ["a1"] };
  const after = { name: "Vendor", phone: "9123456789", article_ids: ["a1"] };
  expect(partnerChangedPatch(before, after)).toEqual({ phone: "9123456789" });
  expect(fieldChanges(before, after)).toEqual([
    { field: "phone", before: "9876543210", after: "9123456789" },
  ]);
});

test("legacy Vendor article text is migrated without polluting Notes", () => {
  const notes = "Cash only\nSupplies articles: Cement, Primer\nDeliver before noon";
  expect(legacyVendorArticleNames(notes)).toEqual(["Cement", "Primer"]);
  expect(vendorNotesWithoutLegacyArticles(notes)).toBe(
    "Cash only\nDeliver before noon",
  );
});
