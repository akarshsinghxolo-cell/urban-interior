import { describe, expect, it } from "vitest";
import { detailKindToFileEntityType } from "../src/components/rdash/EntityFiles";

describe("record Files detail mapping", () => {
  it("maps detail records to their canonical attachment owners", () => {
    expect(detailKindToFileEntityType("customer")).toBe("customer");
    expect(detailKindToFileEntityType("area")).toBe("room");
    expect(detailKindToFileEntityType("workOrder")).toBe("workOrder");
    expect(detailKindToFileEntityType("vendorBill")).toBe("vendor_bill");
    expect(detailKindToFileEntityType("po")).toBe("purchase_order");
  });

  it("does not invent attachment ownership for unknown detail kinds", () => {
    expect(detailKindToFileEntityType("unknown-kind")).toBeNull();
    expect(detailKindToFileEntityType()).toBeNull();
  });
});
