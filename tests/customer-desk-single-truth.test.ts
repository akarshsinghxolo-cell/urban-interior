import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer Desk single-truth contracts", () => {
  test("does not silently select the first customer", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain("selectedCustomerId\n    ? db.customers.find");
    expect(desk).not.toContain("|| db.customers[0]");
  });

  test("keeps phone optional across list, timeline selector and customer drawer", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain('customer.phone || "No phone"');
    expect(desk).toContain("customerWhatsappHref(customer?.phone)");
    expect(desk).toContain('toast.info("No phone number on file")');
  });

  test("contains no Finance or Procurement cockpit inside Customer Desk", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    for (const token of [
      "db.payments",
      "db.invoices",
      "db.customerReceipts",
      "db.vendorBills",
      "db.vendorPayments",
      "db.contractorBills",
      "db.contractorPayments",
      "db.workOrderCostLines",
      "RecordPaymentDialog",
      'key: "payments"',
      'key: "invoices"',
      'key: "advances"',
      'key: "liabilities"',
      "Financial Summary",
    ]) {
      expect(desk).not.toContain(token);
    }
  });

  test("timeline has one timestamp truth: audited event timestamp", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const start = desk.indexOf("function CustomerTimelineView");
    expect(start).toBeGreaterThanOrEqual(0);
    const timeline = desk.slice(start);

    expect(timeline).toContain("indiaBusinessDate(entry.timestamp)");
    expect(timeline).toContain("formatDate(entry.timestamp)");
    expect(timeline).not.toContain("p.due_date");
    expect(timeline).not.toContain("t.due_date");
    expect(timeline).not.toContain("scheduled_at");
    expect(timeline).not.toContain("vendorBill");
    expect(timeline).not.toContain("purchaseOrders");
    expect(timeline).not.toContain("grns");
  });

  test("headline counters describe what they actually count", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain('<MetricCard label="Customers" value={filtered.length}');
    expect(desk).toContain("LIVE_WORK_ORDER_STATUSES.has(row.status)");
    expect(desk).not.toContain('<MetricCard label="Live work orders" value={db.workOrders.length}');
  });
});
