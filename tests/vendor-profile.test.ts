import { describe, expect, test } from "bun:test";
import {
  buildVendorCommercialProfile,
  buildVendorRelationshipTimeline,
  canonicalVendorCapabilities,
  computeVendorPerformance,
  normalizeVendorForWrite,
  recommendVendorsForArticle,
  vendorDuplicateConflicts,
  vendorQuotedRate,
  type VendorProfileRecord,
} from "../src/lib/rdash/vendor-profile";
import { applyVendorRateUpdates } from "../src/lib/rdash/vendor-rate";

function db() {
  return {
    master: {
      units: [{ id: "pcs", name: "Pieces", symbol: "pc" }],
      workCategories: [{ id: "cat-elec", name: "Electrical" }],
      workSubcategories: [{ id: "sub-switch", category_id: "cat-elec", name: "Switches" }],
      articles: [
        { id: "art-switch", name: "6A Modular Switch", category_id: "cat-elec", default_unit_id: "pcs" },
        { id: "art-panel", name: "12W LED Panel", category_id: "cat-elec", default_unit_id: "pcs" },
      ],
      articleVariants: [
        { id: "var-white", article_id: "art-switch", name: "White", unit_id: "pcs", enabled: true },
        { id: "var-black", article_id: "art-switch", name: "Black", unit_id: "pcs", enabled: true },
      ],
      subcategoryArticleMap: [
        { id: "scope-switch", work_required_id: "sub-switch", article_id: "art-switch", unit_id: "pcs", reference_rate: 0 },
        { id: "scope-panel", work_required_id: "sub-switch", article_id: "art-panel", unit_id: "pcs", reference_rate: 0 },
      ],
      vendors: [] as VendorProfileRecord[],
      vendorRates: [] as any[],
      vendorRateHistories: [] as any[],
      contractors: [],
      staff: [],
      sourcePartners: [],
      commissionRules: [],
      contractorRates: [],
      workOptionGroups: [],
      workOptionValues: [],
      customerRateSuggestions: [],
      storageAccounts: [],
      storageFolderTemplates: [],
      storageFolderInstances: [],
      fileAssets: [],
      catalogues: [],
      catalogueArticleVendorLinks: [],
      pinterestBoards: [],
      referenceMedia: [],
    },
    purchaseOrders: [] as any[],
    vendorRfqs: [] as any[],
    vendorBids: [] as any[],
    grns: [] as any[],
    vendorBills: [] as any[],
    vendorPayments: [] as any[],
    auditLog: [] as any[],
  } as any;
}

describe("canonical Vendor profile", () => {
  test("keeps only requested profile concerns and strips excluded business fields", () => {
    const state = db();
    const normalized = normalizeVendorForWrite({
      id: "ven-1",
      name: "  ABC Electricals  ",
      legal_name: " ABC Electricals Private Limited ",
      phone: "9876543210",
      whatsapp: "9876543210",
      email: "SALES@ABC.IN",
      gstin: "09ABCDE1234F1Z5",
      vendor_type: "distributor",
      status: "active",
      city: " Gorakhpur ",
      article_ids: ["art-switch"],
      pan: "ABCDE1234F",
      bank_account: "123456",
      payment_terms: "30 days",
      credit_days: 30,
      credit_limit: 500000,
      warranty_terms: "1 year",
      udyam_no: "UDYAM-1",
      verified_bank: true,
    } as any, state, { id: "ven-1" }) as Record<string, unknown>;

    expect(normalized.name).toBe("ABC Electricals");
    expect(normalized.legal_name).toBe("ABC Electricals Private Limited");
    expect(normalized.email).toBe("sales@abc.in");
    expect(normalized.status).toBe("active");
    expect(normalized.article_ids).toEqual(["art-switch"]);
    expect(normalized.supply_capabilities).toHaveLength(1);
    for (const excluded of ["pan", "bank_account", "payment_terms", "credit_days", "credit_limit", "warranty_terms", "udyam_no", "verified_bank"]) {
      expect(excluded in normalized).toBe(false);
    }
  });

  test("structured capability owns brand, variants, availability, lead time and MOQ", () => {
    const state = db();
    const normalized = normalizeVendorForWrite({
      id: "ven-1",
      name: "ABC",
      supply_capabilities: [{
        article_id: "art-switch",
        variant_ids: ["var-white", "var-white", "var-black", "wrong-variant"],
        brand: "Havells",
        availability: "in_stock",
        typical_lead_time_days: 2,
        moq: 50,
        preferred: true,
      }],
    }, state, { id: "ven-1" });

    expect(normalized.article_ids).toEqual(["art-switch"]);
    expect(normalized.brands).toEqual(["Havells"]);
    expect(normalized.categories).toEqual(["Electrical"]);
    expect(normalized.supply_capabilities?.[0]).toMatchObject({
      article_id: "art-switch",
      article_name: "6A Modular Switch",
      category_name: "Electrical",
      variant_ids: ["var-white", "var-black"],
      brand: "Havells",
      availability: "in_stock",
      typical_lead_time_days: 2,
      moq: 50,
      preferred: true,
    });
  });

  test("legacy flat article links migrate to structured capabilities", () => {
    const state = db();
    expect(canonicalVendorCapabilities({ id: "ven-legacy", name: "Legacy", article_ids: ["art-panel"] }, state)[0]).toMatchObject({
      article_id: "art-panel",
      article_name: "12W LED Panel",
      category_name: "Electrical",
      availability: "unknown",
      status: "active",
    });
  });
});

describe("Vendor duplicate control", () => {
  test("same phone or GSTIN is a hard duplicate while a similar local name is reviewable", () => {
    const state = db();
    state.master.vendors = [
      { id: "ven-1", name: "ABC Electricals", phone: "9876543210", gstin: "09ABCDE1234F1Z5", city: "Gorakhpur" },
      { id: "ven-2", name: "Sharma Lights", phone: "9123456780", city: "Lucknow" },
    ];

    const hard = vendorDuplicateConflicts(state, { name: "Different Name", phone: "+91 98765 43210", city: "Gorakhpur" });
    expect(hard[0]).toMatchObject({ id: "ven-1", hard: true });
    expect(hard[0].reasons).toContain("same mobile number");

    const soft = vendorDuplicateConflicts(state, { name: "ABC Electrical", phone: "9999999999", city: "Gorakhpur" });
    expect(soft[0]).toMatchObject({ id: "ven-1", hard: false });
    expect(soft[0].reasons.some((reason) => reason.includes("similar name"))).toBe(true);
  });
});

describe("Vendor commercial, performance and recommendation intelligence", () => {
  test("commercial profile is computed from rates, POs, bills and payments", () => {
    const state = db();
    state.master.vendors = [{ id: "ven-1", name: "ABC", status: "active" }];
    state.master.vendorRates = [
      { id: "vr-1", vendor_id: "ven-1", article_id: "art-switch", article_name: "Switch", quoted_rate: 100, rate: 100, status: "active", updated_at: "2026-08-01T00:00:00Z" },
      { id: "vr-2", vendor_id: "ven-1", article_id: "art-panel", article_name: "Panel", quoted_rate: 200, rate: 200, status: "active", updated_at: "2026-08-02T00:00:00Z" },
    ];
    state.purchaseOrders = [{ id: "po-1", vendor_id: "ven-1", total_amount: 10000, created_at: "2026-08-01", actual_delivery: "2026-08-04" }];
    state.vendorBills = [{ id: "bill-1", vendor_id: "ven-1", total_amount: 9000 }];
    state.vendorPayments = [{ id: "pay-1", vendor_id: "ven-1", amount: 6000 }];

    expect(buildVendorCommercialProfile(state, "ven-1")).toMatchObject({
      rateCount: 2,
      activeRateCount: 2,
      lowestQuotedRate: 100,
      averageQuotedRate: 150,
      latestQuotedRate: 200,
      purchaseOrderCount: 1,
      totalOrderedValue: 10000,
      totalBilledValue: 9000,
      totalPaidValue: 6000,
      outstandingValue: 3000,
      averageActualDeliveryDays: 3,
    });
  });

  test("performance uses observed delivery, GRN quality, price and relationship", () => {
    const state = db();
    state.master.vendors = [
      { id: "ven-a", name: "A", status: "active", reliability_rating: "very_good", delivery_time_rating: "very_good" },
      { id: "ven-b", name: "B", status: "active", reliability_rating: "average", delivery_time_rating: "average" },
    ];
    state.master.vendorRates = [
      { id: "a-rate", vendor_id: "ven-a", article_id: "art-switch", article_name: "Switch", quoted_rate: 90, rate: 90, status: "active" },
      { id: "b-rate", vendor_id: "ven-b", article_id: "art-switch", article_name: "Switch", quoted_rate: 120, rate: 120, status: "active" },
    ];
    state.purchaseOrders = [
      { id: "po-a", vendor_id: "ven-a", expected_delivery: "2026-08-05", actual_delivery: "2026-08-04", status: "received" },
      { id: "po-b", vendor_id: "ven-b", expected_delivery: "2026-08-05", actual_delivery: "2026-08-09", status: "received" },
    ];
    state.grns = [
      { id: "grn-a", po_id: "po-a", status: "accepted" },
      { id: "grn-b", po_id: "po-b", status: "rejected" },
    ];

    const a = computeVendorPerformance(state, "ven-a");
    const b = computeVendorPerformance(state, "ven-b");
    expect(a.delivery).toBe(100);
    expect(a.quality).toBe(95);
    expect(a.price).toBe(100);
    expect(a.overall).toBeGreaterThan(b.overall);
  });

  test("recommendation ranks capable, available, competitive and reliable Vendors", () => {
    const state = db();
    state.master.vendors = [
      normalizeVendorForWrite({ id: "ven-a", name: "Fast Electric", status: "active", reliability_rating: "very_good", delivery_time_rating: "very_good", supply_capabilities: [{ article_id: "art-switch", availability: "in_stock", typical_lead_time_days: 2 }] }, state, { id: "ven-a" }),
      normalizeVendorForWrite({ id: "ven-b", name: "Slow Electric", status: "active", reliability_rating: "average", delivery_time_rating: "average", supply_capabilities: [{ article_id: "art-switch", availability: "on_order", typical_lead_time_days: 12 }] }, state, { id: "ven-b" }),
    ];
    state.master.vendorRates = [
      { id: "a-rate", vendor_id: "ven-a", article_id: "art-switch", article_name: "Switch", quoted_rate: 95, rate: 95, status: "active" },
      { id: "b-rate", vendor_id: "ven-b", article_id: "art-switch", article_name: "Switch", quoted_rate: 110, rate: 110, status: "active" },
    ];

    const ranked = recommendVendorsForArticle(state, "art-switch");
    expect(ranked.map((row) => row.vendorId)).toEqual(["ven-a", "ven-b"]);
    expect(ranked[0].reasons).toContain("Lowest current quoted rate");
    expect(ranked[0].availability).toBe("in_stock");
  });
});

describe("Vendor relationship timeline", () => {
  test("combines procurement and financial relationship events newest first", () => {
    const state = db();
    state.master.vendors = [{ id: "ven-1", name: "ABC", status: "active", created_at: "2026-07-01T00:00:00Z" }];
    state.vendorRfqs = [{ id: "rfq-1", rfq_no: "RFQ-1", vendor_ids: ["ven-1"], status: "sent", created_at: "2026-07-10T00:00:00Z" }];
    state.vendorBids = [{ id: "bid-1", bid_no: "BID-1", vendor_id: "ven-1", status: "submitted", submitted_at: "2026-07-12T00:00:00Z" }];
    state.purchaseOrders = [{ id: "po-1", po_no: "PO-1", vendor_id: "ven-1", status: "sent", created_at: "2026-07-15T00:00:00Z" }];
    state.grns = [{ id: "grn-1", grn_no: "GRN-1", po_id: "po-1", status: "received", created_at: "2026-07-20T00:00:00Z" }];
    state.vendorBills = [{ id: "bill-1", bill_no: "VB-1", vendor_id: "ven-1", total_amount: 1000, created_at: "2026-07-25T00:00:00Z" }];
    state.vendorPayments = [{ id: "pay-1", payment_no: "VP-1", vendor_id: "ven-1", amount: 1000, paid_at: "2026-07-30T00:00:00Z" }];

    const timeline = buildVendorRelationshipTimeline(state, "ven-1");
    expect(timeline.map((row) => row.kind)).toEqual(["payment", "bill", "grn", "po", "bid", "rfq", "profile"]);
  });
});

describe("canonical Vendor Rate", () => {
  test("new writes keep the live rate minimal and never add validity or duplicated commercial fields", () => {
    const state = db();
    const updated = applyVendorRateUpdates(state.master, [{
      vendorId: "ven-1",
      scope: state.master.subcategoryArticleMap[0],
      articleName: "6A Modular Switch",
      variantId: "var-white",
      unitId: "pcs",
      rate: 125.5,
      sourceType: "MANUAL",
      changedBy: "Tester",
    }], "2026-08-07T10:00:00Z");

    const rate = updated.vendorRates[0] as Record<string, unknown>;
    expect(vendorQuotedRate(rate as any)).toBe(125.5);
    expect(rate.quoted_rate).toBe(125.5);
    expect(rate.rate).toBe(125.5);
    expect(rate.status).toBe("active");
    expect(rate.created_at).toBe("2026-08-07T10:00:00Z");
    expect(rate.updated_at).toBe("2026-08-07T10:00:00Z");
    for (const excluded of ["unit_id", "gst_inclusive", "gst_rate", "discount_pct", "freight_amount", "loading_unloading_amount", "other_charges", "moq", "delivery_days", "brand", "grade", "preferred", "valid_from", "valid_until"]) {
      expect(excluded in rate).toBe(false);
    }
    expect(updated.vendorRateHistories).toHaveLength(1);
    expect(updated.vendorRateHistories[0].unit_id).toBe("pcs");
  });
});
