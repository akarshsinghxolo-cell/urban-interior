import { describe, expect, it } from "vitest";
import { detailKindToFileEntityType } from "../src/components/rdash/EntityFiles";

describe("record Files detail mapping", () => {
  it("maps detail records to their canonical attachment owners", () => {
    expect(detailKindToFileEntityType("customer")).toBe("customer");
    expect(detailKindToFileEntityType("area")).toBe("room");
    expect(detailKindToFileEntityType("workOrder")).toBe("workOrder");
    expect(detailKindToFileEntityType("vendorBill")).toBe("vendor_bill");
    expect(detailKindToFileEntityType("vendorPayment")).toBe("vendor_payment");
    expect(detailKindToFileEntityType("contractorBill")).toBe("contractor_bill");
    expect(detailKindToFileEntityType("contractorPayment")).toBe("contractor_payment");
    expect(detailKindToFileEntityType("po")).toBe("purchase_order");
  });

  it("does not invent attachment ownership for unsupported detail kinds", () => {
    expect(detailKindToFileEntityType("staff")).toBeNull();
    expect(detailKindToFileEntityType("audit")).toBeNull();
    expect(detailKindToFileEntityType("media")).toBeNull();
    expect(detailKindToFileEntityType("unknown-kind")).toBeNull();
    expect(detailKindToFileEntityType()).toBeNull();
  });
});
