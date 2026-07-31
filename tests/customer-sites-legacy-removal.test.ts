import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const partnerDialog = readFileSync("src/components/rdash/EntityFormDialog.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");

test("legacy customer write APIs are removed from active store and UI paths", () => {
  for (const token of ["addCustomer:", "createCustomerWithFirstSite:", "updateCustomer:", "addSite:", "updateSite:"]) {
    expect(crm.includes(token)).toBe(false);
    expect(types.includes(token)).toBe(false);
  }
  expect(customerDesk.includes("<EntityFormDialog type=\"customer\"")).toBe(false);
  expect(customerDesk.includes("CustomerSitesDialog")).toBe(true);
  expect(dataImport.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerDialog.includes("type === \"customer\"")).toBe(false);
  expect(partnerDialog.includes("createCustomerWithFirstSite")).toBe(false);
  expect(partnerDialog.includes("saveCustomerWithSites")).toBe(false);
  expect(customerSitesDialog.includes("initializedKeyRef")).toBe(true);
  expect(customerSitesDialog.indexOf("await awaitServerSync();")).toBeLessThan(customerSitesDialog.indexOf("commitBatches();"));
  expect(customerSitesDialog.includes("dirtyFormRegistry.requestNavigation")).toBe(true);
});

test("partner form retains structured article and capability fields", () => {
  expect(partnerDialog.includes("vendorArticleIds")).toBe(true);
  expect(partnerDialog.includes("article_ids")).toBe(true);
});
