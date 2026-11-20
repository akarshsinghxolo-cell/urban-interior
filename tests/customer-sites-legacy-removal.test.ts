import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { emptyCustomerDraft, fingerprint, newSiteDraft } from "@/components/rdash/customer-sites-form-model";

const crm = readFileSync("src/lib/rdash/store/slices/crm.ts", "utf8");
const types = readFileSync("src/lib/rdash/store/types.ts", "utf8");
const customerDesk = readFileSync("src/components/rdash/modules/CustomerDesk.tsx", "utf8");
const dataImport = readFileSync("src/components/rdash/modules/DataImportModule.tsx", "utf8");
const customerSitesDialog = readFileSync("src/components/rdash/CustomerSitesDialog.tsx", "utf8");
const customerSiteDraftCard = readFileSync("src/components/rdash/CustomerSiteDraftCard.tsx", "utf8");
const customerDetailsFields = readFileSync("src/components/rdash/CustomerDetailsFields.tsx", "utf8");
const workRequiredFields = readFileSync("src/components/rdash/WorkRequiredFields.tsx", "utf8");
const customerWorkRequiredDraftSection = readFileSync("src/components/rdash/CustomerWorkRequiredDraftSection.tsx", "utf8");
const createMenu = readFileSync("src/components/rdash/CreateMenu.tsx", "utf8");
const createMenuCore = readFileSync("src/components/rdash/CreateMenuCore.tsx", "utf8");
const customerQuotationDialog = readFileSync("src/components/rdash/customer/CustomerQuotationDialog.tsx", "utf8");

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

test("expanding a Site card is presentation state, not an unsaved business change", () => {
  const customer = emptyCustomerDraft();
  const site = newSiteDraft("Example Customer");
  const collapsed = fingerprint(customer, [{ ...site, expanded: false }], [], false);
  const expanded = fingerprint(customer, [{ ...site, expanded: true }], [], false);
  expect(expanded).toBe(collapsed);
});

test("Site coordinates use one reverse-geocode action and queued photos do not create nested dialogs", () => {
  expectTokens(customerSiteDraftCard, [
    "findAddressFromCoordinates",
    "findAddressAtCoordinates",
    "onPaste",
    "Site address filled from pasted coordinates",
    "Site address filled from map pin",
    'aria-label="Find address from coordinates"',
    "reverseGeocodeWithNominatim",
    "interactive={false}",
  ]);
  expectNoTokens(customerSiteDraftCard, [
    "searchAddressWithNominatim",
    "Search address or landmark",
    "searchResults",
  ]);
});

test("shared Add/Edit Customer form orders Sites then editable Work Required without customer interests", () => {
  const sites = customerSitesDialog.indexOf("<CustomerSiteDraftCard");
  const workRequired = customerSitesDialog.indexOf("<CustomerWorkRequiredDraftSection");

  expectTokens(customerSitesDialog, ['isEdit ? "Edit Customer and Sites" : "Add New Customer"']);
  expect(customerSitesDialog).toContain("sm:max-w-[calc(100vw-2rem)] xl:max-w-6xl");
  expect(sites).toBeGreaterThanOrEqual(0);
  expect(workRequired).toBeGreaterThan(sites);
  expect(customerSitesDialog).not.toContain("CustomerWorkInterests");
  expect(customerDetailsFields).not.toContain("CustomerWorkInterests");
  expect(customerSitesDialog).toContain("draftForWorkRequired");
  expectNoTokens(workRequiredFields, ["suggested from this customer"]);
  expectTokens(workRequiredFields, ["+ Add category"]);
  expectTokens(workRequiredFields, ["+ Add subcategory"]);
  expect(workRequiredFields).toContain("grid gap-3 md:grid-cols-3");
  expect(workRequiredFields.indexOf("Covered Areas")).toBeGreaterThan(workRequiredFields.indexOf("Work Categories"));
  expect(workRequiredFields).toContain("flex flex-wrap items-center justify-start gap-2");
  expect(workRequiredFields.indexOf("Add another using these Areas")).toBeLessThan(workRequiredFields.indexOf("Copy this requirement"));
  expect(customerWorkRequiredDraftSection).toContain("space-y-4 border-t border-border pt-4");
  expect(customerWorkRequiredDraftSection).toContain("border-primary/20 bg-primary/[0.025]");
  expect(customerWorkRequiredDraftSection).toContain("border-border bg-muted/20");
  expectTokens(workRequiredFields, ['site?.name || "this Customer"']);

  // Quotation selection/serialization is intentionally Customer-owned. The
  // global Create menu only routes quotation requests into the one canonical
  // dialog; CreateMenuCore must not retain a second quotation implementation.
  expect(createMenu).toContain("CustomerQuotationDialog");
  expect(createMenu).toContain('createDialog?.kind === "quotation"');
  expectNoTokens(createMenuCore, ["addQuotation", 'kind === "quotation"', "selectedWorkRequired.map"]);
  expect(customerQuotationDialog).toContain('type="checkbox"');
  expect(customerQuotationDialog).toContain("selectedWorkRequired.map");
  expect(customerQuotationDialog).toContain("const id = addQuotation({");
  expectTokens(customerQuotationDialog, ['`${customer.name}${site ? ` · ${site.name}` : ""}`']);
});
