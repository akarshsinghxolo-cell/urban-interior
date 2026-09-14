import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer Desk restored-feature contracts", () => {
  test("safe route shell never silently selects the first customer", async () => {
    const shell = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(shell).toContain("const selected = selectedCustomerId");
    expect(shell).toContain("customer.id === selectedCustomerId");
    expect(shell).not.toContain("|| db.customers[0]");
    expect(shell).toContain('title="No customer selected"');
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
    const compatibility = await source("src/components/rdash/CustomerWorkCaptureDialog.tsx");

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
    expect(compatibility).toContain("Compatibility export only");
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

  test("restored operational timeline includes execution/commercial activity and IST grouping", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const start = portfolio.indexOf("function CustomerTimelineView");
    expect(start).toBeGreaterThanOrEqual(0);
    const timeline = portfolio.slice(start);

    expect(timeline).toContain("indiaBusinessDate(entry.ts)");
    expect(timeline).toContain('kind: "drawing"');
    expect(timeline).toContain('kind: "executionLog"');
    expect(timeline).toContain('kind: "po"');
    expect(timeline).toContain('kind: "grn"');
    expect(timeline).toContain('kind: "vendorBill"');
    expect(timeline).toContain('kind: "communication"');
  });

  test("customer referrer search restores vendor and contractor choices without making them unconditional reads", async () => {
    const fields = await source("src/components/rdash/CustomerDetailsFields.tsx");
    expect(fields).toContain("db.master.contractors");
    expect(fields).toContain("db.master.vendors");
    expect(fields).toContain("db.master.sourcePartners");
    expect(fields).toContain("External referrer");
  });
});
