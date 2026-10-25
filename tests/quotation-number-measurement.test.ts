import { describe, expect, it } from "vitest";
import { quotationMeasuredLine } from "@/lib/rdash/quotation-measurement";
import { nextQuotationNo } from "@/lib/rdash/store/slices/quotations";

describe("quotation numbering", () => {
  it("uses India date, site token and a four-digit daily sequence", () => {
    const createdAt = "2026-10-24T20:30:00.000Z"; // 25 Oct in India
    const existing = [{ quotation_no: "Q-25-10-26-Other-0001", created_at: createdAt }] as any;

    expect(nextQuotationNo(existing, createdAt, "Atri Muni Jee Sites"))
      .toBe("Q-25-10-26-Atri-0002");
  });
});

describe("in-quotation measurement", () => {
  it("creates the measured room line on the selected Work Required record", () => {
    const line = quotationMeasuredLine({
      id: "req-line-guest",
      work: {
        id: "work-gypsum",
        site_id: "site-atri",
        customer_id: "customer-atri",
        title: "Gypsum False Ceiling · Standard",
        area_ids: ["area-hall"],
        work_subcategory_ids: ["fc-gyp"],
        work_type_ids: ["wt-standard"],
        structured_items: [{
          id: "req-line-hall",
          title: "Hall · Gypsum False Ceiling · Standard",
          subcategory_id: "fc-gyp",
          work_type_id: "wt-standard",
          quantity: 99.36,
          rate: 255,
          amount: 25336.8,
          tax_rate: 18,
        }],
      } as any,
      area: { id: "area-guest", name: "Guest room" },
      siteName: "Atri Muni Jee Site",
      dimensions: { length: 17, breadth: 13, height: 10 },
      workSubcategories: [{
        id: "fc-gyp",
        category_id: "fc",
        name: "Gypsum False Ceiling",
        work_types: [{ id: "wt-standard", name: "Standard" }],
      }] as any,
      contractorRates: [],
    });

    expect(line.work_required_id).toBe("work-gypsum");
    expect(line.area_name).toBe("Guest room");
    expect(line.quantity).toBe(221);
    expect(line.amount).toBe(56355);
    expect(line.title).toContain("Guest room");
  });
});
