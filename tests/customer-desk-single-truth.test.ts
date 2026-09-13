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

  test("rich portfolio restores Customer commercial tabs and summary", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    for (const token of [
      'key: "payments"',
      'key: "invoices"',
      'key: "advances"',
      'key: "liabilities"',
      "Financial Summary",
      "RecordPaymentDialog",
      "siteFinancials",
    ]) {
      expect(portfolio).toContain(token);
    }
  });

  test("restored advanced capture includes the requested two-week behavior", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    for (const token of [
      "StructuredWorkRequiredDialog",
      "seedDetailedAreaLines",
      "contractorWorkTypeAverages",
      "removedSelections",
      "areaDims",
      "editOfItemId",
      "scrollEditDraftIntoView",
      "option_pairs",
      "WorkTypeMultiDropdown",
      "Partial captures are a feature",
      "Mobile: a full-width bottom sheet",
    ]) {
      expect(portfolio).toContain(token);
    }
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
