import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer entity rich read", () => {
  test("keeps the base customer relation graph CRM-only", async () => {
    const entity = await source("src/lib/rdash/server/entity-scoped-read.ts");
    expect(entity).toContain("CUSTOMER_RELATION_COLLECTIONS = CUSTOMER_CRM_DIRECT_RELATIONS");
    expect(entity).toContain("customerDownstreamPlan");
    expect(entity).toContain("INVALID:Customer entity read escaped CRM graph");
  });

  test("adds rich Customer rows only after owning-domain permission checks", async () => {
    const entity = await source("src/lib/rdash/server/entity-scoped-read.ts");
    expect(entity).toContain("function customerEntityPermissions");
    expect(entity).toContain('canRole(permissions, user.role, "finance", "view")');
    expect(entity).toContain('canRole(permissions, user.role, "media", "view")');
    expect(entity).toContain('canRole(permissions, user.role, "vendors", "view")');
    expect(entity).toContain('canRole(permissions, user.role, "contractors", "view")');
    expect(entity).toContain("function customerExtensionPlan");
    expect(entity).toContain("function customerExtensionDownstreamPlan");
  });

  test("restored row graph includes commercial, procurement, media and rate relations", async () => {
    const entity = await source("src/lib/rdash/server/entity-scoped-read.ts");
    for (const token of [
      '"payments", "invoices", "customerReceipts"',
      '"purchaseOrders", "grns", "dispatches", "vendorRfqs", "vendorBids"',
      '"entityReferenceAssignments"',
      '"master.vendors"',
      '"master.contractors", "master.contractorRates"',
      '"vendorPayments", "vendor_bill_id"',
      '"contractorPayments", "contractor_bill_id"',
    ]) {
      expect(entity).toContain(token);
    }
  });

  test("file resolution only follows reference assignments already loaded by permission-aware reads", async () => {
    const entity = await source("src/lib/rdash/server/entity-scoped-read.ts");
    expect(entity).toContain("When a Customer role lacks Media permission there are no loaded assignment");
    expect(entity).toContain("master.catalogues");
    expect(entity).toContain("master.pinterestBoards");
    expect(entity).toContain("master.referenceMedia");
  });
});
