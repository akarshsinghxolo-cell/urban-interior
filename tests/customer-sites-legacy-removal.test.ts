import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");
const customerDetailsFields = readFileSync("src/components/rdash/CustomerDetailsFields.tsx", "utf8");

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

test("shared Add/Edit Customer form orders Sites, Areas, then work interests", () => {
  const sites = customerSitesDialog.indexOf("<CustomerSiteDraftCard");
  const areas = customerSitesDialog.indexOf("<CustomerAreasDraftSection");
  const interests = customerSitesDialog.indexOf("<CustomerWorkInterests");

  expect(customerSitesDialog).toContain('isEdit ? "Edit Customer and Sites" : "Add New Customer"');
  expect(sites).toBeGreaterThanOrEqual(0);
  expect(areas).toBeGreaterThan(sites);
  expect(interests).toBeGreaterThan(areas);
  expect(customerDetailsFields).toContain("export function CustomerWorkInterests");
});
