import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { assertQuotationRelations, validateBusinessData } from "../src/lib/rdash/business-rules";
import { contractorOutstanding, contractorOutstandingTotal, siteFinancials } from "../src/lib/rdash/store/selectors";
import { computeSitePnLsFromCostLines } from "../src/lib/rdash/store/finance-helpers";
import { introducedIntegrityIssues } from "../src/lib/rdash/server/integrity-delta";
import { FOREIGN_KEYS } from "../src/lib/rdash/integrity/fk-registry";
import type { ContractorPayment, Quotation, VendorPayment } from "../src/lib/rdash/types";

describe("one connected business model", () => {
  test("database commercial links agree with the application relationship registry", () => {
    const migration = readFileSync("supabase/migrations/20260928112656_enforce_commercial_relationships.sql", "utf8");
    const links = [...migration.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (true|false)\)/g)];
    expect(links).toHaveLength(33);
    for (const [, collection, field, parent, required] of links) {
      expect(FOREIGN_KEYS).toContainEqual(expect.objectContaining({
        collection, field, targetCollection: parent.replace(/^master_/, "master."), nullable: required === "false",
      }));
    }
  });
  test("customer-only quotations use the real validator without synthetic sites", () => {
    const db = buildSeedDatabase();
    const quote: Quotation = { ...db.quotations[0], id: "customer-draft", customer_id: db.customers[0].id, site_id: "", coverage: [], items: [], scope_lines: [] };
    db.quotations = [quote];
    const sitesBefore = structuredClone(db.sites);
    expect(() => assertQuotationRelations(db, quote, "Quotation")).not.toThrow();
    expect(validateBusinessData(db).filter((issue) => issue.startsWith("Quotation customer-draft:"))).toEqual([]);
    expect(db.sites).toEqual(sitesBefore);
    quote.coverage = [{ id: "coverage", coverage_label: "Test", status: "proposed", work_required_id: db.workRequired[0].id, area_ids: [], measurement_revision_ids: [] }];
    expect(() => assertQuotationRelations(db, quote, "Quotation")).toThrow("A Site is required");
    expect(validateBusinessData(db).some((issue) => issue.includes("Quotation customer-draft:"))).toBe(true);
    expect(existsSync("src/lib/rdash/business-rules-core.ts")).toBe(false);
    expect(existsSync("supabase/schema-entity-tables.sql")).toBe(false);
  });

  test.each(["vendor", "contractor"] as const)("%s payments cannot point at another partner or job", (kind) => {
    const db = buildSeedDatabase();
    const partnerField = kind === "vendor" ? "vendor_id" : "contractor_id";
    const bills = kind === "vendor" ? db.vendorBills : db.contractorBills;
    const payments = kind === "vendor" ? db.vendorPayments : db.contractorPayments;
    const bill = bills[0];
    expect(bill).toBeDefined();
    const payment: VendorPayment & ContractorPayment = {
      id: "payment-integrity-test", payment_no: "TEST", vendor_name: "Test vendor",
      vendor_id: "vendor_id" in bill ? bill.vendor_id : "unused-vendor",
      contractor_id: "contractor_id" in bill ? bill.contractor_id : "unused-contractor",
      vendor_bill_id: bill.id, contractor_bill_id: bill.id,
      site_id: bill.site_id || "", work_order_id: bill.work_order_id || "", amount: 10, status: "paid",
      mode: "bank_transfer", reference: "TEST", created_at: "2026-09-28", updated_at: "2026-09-28",
    };
    payments.push(payment);
    const prefix = `${kind === "vendor" ? "Vendor" : "Contractor"} Payment ${payment.id}:`;
    const issues = () => validateBusinessData(db).filter((issue) => issue.startsWith(prefix));
    expect(issues()).toEqual([]);
    for (const field of [partnerField, "site_id", "work_order_id"] as const) {
      const original = payment[field];
      payment[field] = "another-record";
      expect(issues().length).toBeGreaterThan(0);
      payment[field] = original;
    }
    payment.amount = -1;
    expect(issues()[0]).toContain("greater than zero");
    payment.amount = 10;
    bills.splice(0, 1);
    expect(issues()[0]).toContain("Bill does not exist");
  });

  test("vendor identity stays consistent from PO through receipt and bill", () => {
    const db = buildSeedDatabase();
    const grn = db.grns[0];
    const bill = db.vendorBills.find((row) => row.grn_id === grn.id)!;
    const baseline = validateBusinessData(db);
    grn.vendor_id = db.master.vendors.find((row) => row.id !== grn.vendor_id)!.id;
    const introduced = introducedIntegrityIssues(baseline, validateBusinessData(db));
    expect(introduced).toContain(`GRN ${grn.id}: GRN: PO and GRN Vendors do not match.`);
    expect(introduced).toContain(`Vendor Bill ${bill.id}: Vendor Bill: Bill, PO, and GRN Vendors do not match.`);
  });

  test("contractor totals cannot offset one partner's dues with another's credit", () => {
    const db = buildSeedDatabase();
    db.contractorBills = [
      { contractor_id: "a", amount: 100, status: "approved" },
      { contractor_id: "b", amount: 500, status: "approved" },
    ] as typeof db.contractorBills;
    db.contractorPayments = [{ contractor_id: "a", amount: 200, status: "paid" }] as typeof db.contractorPayments;
    db.contractorSettlements = [];
    expect(contractorOutstanding(db, "a")).toBe(0);
    expect(contractorOutstanding(db, "b")).toBe(500);
    expect(contractorOutstandingTotal(db)).toBe(500);
    expect(FOREIGN_KEYS).toContainEqual(expect.objectContaining({ collection: "workOrders", field: "contractor_id", targetCollection: "master.contractors", onDelete: "restrict" }));
  });

  test("Customer Desk and Finance agree on site advances before a Work Order exists", () => {
    const db = buildSeedDatabase();
    const siteId = db.sites[0].id;
    db.workOrders = [];
    db.invoices = [
      { id: "advance", site_id: siteId, status: "partial", total_amount: 1000, balance_amount: 600 },
      { id: "cancelled", site_id: siteId, status: "cancelled", total_amount: 2000, balance_amount: 2000 },
      { id: "other-site", site_id: "elsewhere", status: "issued", total_amount: 3000, balance_amount: 3000 },
    ] as typeof db.invoices;
    db.customerReceipts = [
      { site_id: siteId, amount: 400 }, { site_id: "elsewhere", amount: 900 },
    ] as typeof db.customerReceipts;
    const expected = { invoiced: 1000, collected: 400, receivable: 600 };
    expect(computeSitePnLsFromCostLines(db, siteId)).toMatchObject(expected);
    expect(siteFinancials(db, siteId)).toMatchObject(expected);
  });
});
