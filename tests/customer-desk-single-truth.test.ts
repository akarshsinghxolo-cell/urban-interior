import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer Desk restored-feature contracts", () => {
  test("customer menus and drawer editing reuse the existing actions and form", async () => {
    const shell = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(shell).toContain("buildCustomerActions(id, useRDashStore.getState()");
    expect(shell.match(/actions=\{actionsForCustomer\(customer.id\)\}/g)).toHaveLength(1);
    expect(shell).toContain("editId={customerForm?.editId}");
    expect(portfolio).toContain("Edit customer</Button>");
    expect(portfolio.match(/<CustomerSitesDialog /g)).toHaveLength(1);
    expect(portfolio).toContain("autoAddSite={customerForm?.autoAddSite}");
    expect(portfolio).toContain("expandSiteId={customerForm?.expandSiteId}");
  });

  test("safe route shell opens only the customer explicitly selected from the list", async () => {
    const shell = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(shell).toContain("const selected = selectedCustomerId");
    expect(shell).toContain("customer.id === selectedCustomerId");
    expect(shell).not.toContain("|| db.customers[0]");
    expect(shell).toContain('openDetail("customer", customer.id, "customerDesk")');
  });

  test("safe shell keeps phone optional and headline counters truthful", async () => {
    const shell = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(shell).toContain('customer.phone || "No phone"');
    expect(shell).toContain('<MetricCard label="Customers" value={filtered.length}');
    expect(shell).toContain("LIVE_WORK_ORDER_STATUSES.has(row.status)");
    expect(shell).not.toContain('<MetricCard label="Live work orders" value={db.workOrders.length}');
  });

  test("Customer portfolio keeps the restored commercial cockpit while launching shared workflows", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    for (const token of [
      'key: "payments"',
      'key: "invoices"',
      'key: "advances"',
      'key: "liabilities"',
      "Financial Summary",
      "RecordPaymentDialog",
      "siteFinancials",
      "CustomerWorkCaptureDialog",
      'kind: "quotation"',
    ]) expect(portfolio).toContain(token);
  });

  test("rich advanced capture lives once under Customer ownership", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const capture = await source("src/components/rdash/customer/CustomerWorkCaptureDialog.tsx");

    for (const token of [
      "seedDetailedAreaLines",
      "contractorWorkTypeAverages",
      "removedSelections",
      "areaDims",
      "editOfItemId",
      "scrollEditDraftIntoView",
      "option_pairs",
      "addAlternative",
      "removeAlternative",
      "incomplete/duplicate row(s) left untouched",
      "flex items-end justify-center",
    ]) expect(capture).toContain(token);

    expect(portfolio).toContain('from "../customer/CustomerWorkCaptureDialog"');
    expect(portfolio).not.toContain("StructuredWorkRequiredDialog");
    expect(portfolio).not.toContain("seedDetailedAreaLines");
    expect(portfolio).not.toContain("captureStructuredWorkRequired");
  });

  test("Customer-owned quotation workflow is the only quotation creation/coverage builder", async () => {
    const canonical = await source("src/components/rdash/customer/CustomerQuotationDialog.tsx");
    const createHost = await source("src/components/rdash/CreateMenu.tsx");
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");

    expect(canonical).toContain("verifiedMeasurementRevisionIds");
    expect(canonical).toContain("activeQuotationForWork");
    expect(canonical).toContain("const coverage = site");
    expect(canonical).toContain("addQuotation({");
    expect(createHost).toContain("CustomerQuotationDialog");
    expect(siteExecution).toContain('kind: "quotation"');
    expect(siteExecution).not.toContain("const addQuotation = useRDashStore");
    expect(siteExecution).not.toContain("coverage: [{");
  });

  test("rich cross-domain reads are permission-aware rather than granted by Customers permission", async () => {
    const plan = await source("src/lib/rdash/server/customer-read-plan.ts");
    const scoped = await source("src/lib/rdash/server/module-scoped-read.ts");

    expect(plan).toContain("CUSTOMER_FINANCE_COLLECTIONS");
    expect(plan).toContain("CUSTOMER_PROCUREMENT_COLLECTIONS");
    expect(plan).toContain("CUSTOMER_MEDIA_COLLECTIONS");
    expect(plan).toContain("CUSTOMER_CONTRACTOR_COLLECTIONS");
    expect(plan).toContain("CUSTOMER_VENDOR_COLLECTIONS");
    expect(scoped).toContain('canRole(permissions, user.role, "finance", "view")');
    expect(scoped).toContain('canRole(permissions, user.role, "contractors", "view")');
    expect(scoped).toContain('canRole(permissions, user.role, "vendors", "view")');
    expect(scoped).toContain('canRole(permissions, user.role, "media", "view")');
  });

  test("shared Customer history includes operational, finance and note activity", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const historyQueries = await source("src/lib/rdash/customer-desk-queries.ts");
    const start = portfolio.indexOf("function CustomerHistoryView");
    expect(start).toBeGreaterThanOrEqual(0);
    const history = portfolio.slice(start);

    expect(history).toContain("indiaBusinessDate(entry.ts)");
    expect(history).toContain("Add internal note");
    for (const token of ['kind: "drawing"', 'kind: "execution"', 'kind: "purchase order"', 'kind: "goods receipt"', 'kind: "vendor bill"', 'kind: "communication"', 'kind: "invoice"', 'kind: "money received"']) {
      expect(historyQueries).toContain(token);
    }
  });

  test("Rapido handoff copies the selected Site Plus Code and opens the booking page", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(portfolio).toContain("customerSitePlusCode(site.latitude, site.longitude)");
    expect(portfolio).toContain("Book Rapido");
    expect(portfolio).toContain("https://m.rapido.bike/home");
    expect(portfolio).toContain("navigator.clipboard?.writeText(plusCode)");
    expect(portfolio.indexOf("Book Rapido")).toBeGreaterThan(portfolio.indexOf("Directions</Button>"));
  });

  test("customer referrer search restores vendor and contractor choices without making them unconditional reads", async () => {
    const fields = await source("src/components/rdash/CustomerDetailsFields.tsx");
    expect(fields).toContain("db.master.contractors");
    expect(fields).toContain("db.master.vendors");
    expect(fields).toContain("db.master.sourcePartners");
    expect(fields).toContain("External referrer");
  });
});
