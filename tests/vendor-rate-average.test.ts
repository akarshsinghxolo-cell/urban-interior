import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  applyVendorRateAverages,
  articleVendorRateAverage,
  selectVendorArticleRates,
} from "../src/lib/rdash/vendor-rate-average";
import type { RDashDatabase, VendorRate, VendorRateHistory } from "../src/lib/rdash/types";

function database(): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  db.master.units = [
    { id: "pcs", name: "Pieces", symbol: "pcs", family: "count" },
    { id: "pair", name: "Pair", symbol: "pair", family: "count" },
    { id: "box", name: "Box", symbol: "box", family: "package" },
    { id: "mtr", name: "Metres", symbol: "mtr", family: "length" },
    { id: "rft", name: "Running feet", symbol: "rft", family: "length" },
  ];
  db.master.articles = [{
    id: "article-1",
    name: "Test article",
    default_unit_id: "pcs",
    unit_id: "pcs",
    base_rate: 77,
  }];
  db.master.subcategoryArticleMap = [
    { id: "scope-1", work_required_id: "sub-1", article_id: "article-1", unit_id: "pcs", reference_rate: 77 },
    { id: "scope-2", work_required_id: "sub-2", article_id: "article-1", unit_id: "pcs", reference_rate: 88 },
  ];
  db.master.articleVariants = [];
  db.master.vendorRates = [];
  db.master.vendorRateHistories = [];
  db.taxConfigs = [{ id: "gst-18", name: "GST", rate: 18, type: "gst", enabled: true }];
  return db;
}

function rate(input: Partial<VendorRate> & { id: string; vendor_id: string; rate: number }): VendorRate {
  return {
    article_id: "article-1",
    article_name: "Test article",
    unit_id: "pcs",
    gst_inclusive: true,
    ...input,
  } as VendorRate;
}

function history(input: Partial<VendorRateHistory> & { id: string; vendor_id: string; new_rate: number; status: VendorRateHistory["status"] }): VendorRateHistory {
  return {
    article_id: "article-1",
    article_name: "Test article",
    work_required_article_id: "scope-1",
    unit_id: "pcs",
    source_type: "MANUAL",
    effective_from: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    gst_inclusive: true,
    ...input,
  } as VendorRateHistory;
}

describe("article-level vendor rate averages", () => {
  test("uses each vendor's latest active rate, then falls back to latest available", () => {
    const db = database();
    db.master.vendorRates = [
      rate({ id: "v1-current", vendor_id: "vendor-1", rate: 120, status: "inactive", updated_at: "2026-07-04T00:00:00.000Z" } as any),
    ];
    db.master.vendorRateHistories = [
      history({ id: "v1-active", vendor_id: "vendor-1", new_rate: 100, status: "active", effective_from: "2026-07-02T00:00:00.000Z" }),
      history({ id: "v2-rejected", vendor_id: "vendor-2", new_rate: 130, status: "rejected", effective_from: "2026-07-02T00:00:00.000Z" }),
      history({ id: "v2-draft", vendor_id: "vendor-2", new_rate: 140, status: "draft" as any, effective_from: "2026-07-05T00:00:00.000Z" }),
    ];

    const selected = selectVendorArticleRates(db, "article-1", new Date("2026-07-10T00:00:00.000Z"));
    expect(selected.find((row) => row.vendorId === "vendor-1")?.rawRate).toBe(100);
    expect(selected.find((row) => row.vendorId === "vendor-1")?.active).toBe(true);
    expect(selected.find((row) => row.vendorId === "vendor-2")?.rawRate).toBe(140);
    expect(selected.find((row) => row.vendorId === "vendor-2")?.active).toBe(false);
    expect(articleVendorRateAverage(db, "article-1", new Date("2026-07-10T00:00:00.000Z")).average).toBe(120);
  });

  test("calculates landed cost without double-adding inclusive GST", () => {
    const db = database();
    db.master.vendorRates = [
      rate({
        id: "exclusive",
        vendor_id: "vendor-1",
        rate: 100,
        gst_inclusive: false,
        discount_pct: 10,
        freight_amount: 10,
      } as any),
      rate({ id: "inclusive", vendor_id: "vendor-2", rate: 118, gst_inclusive: true }),
    ];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.included[0].normalizedLandedRate).toBeCloseTo(118, 10);
    expect(result.included[1].normalizedLandedRate).toBeCloseTo(118, 10);
    expect(result.average).toBeCloseTo(118, 10);
  });

  test("converts quoted packages and standard units to the article default unit", () => {
    const db = database();
    db.master.vendorRates = [
      rate({ id: "box", vendor_id: "vendor-1", rate: 1000, unit_id: "box", default_units_per_rate_unit: 100 } as any),
      rate({ id: "pair", vendor_id: "vendor-2", rate: 20, unit_id: "pair" }),
    ];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.included.map((row) => row.normalizedLandedRate)).toEqual([10, 10]);
    expect(result.average).toBe(10);

    db.master.articles[0] = { ...db.master.articles[0], default_unit_id: "rft", unit_id: "rft" };
    db.master.vendorRates = [rate({ id: "metre", vendor_id: "vendor-1", rate: 32.80839895, unit_id: "mtr" })];
    expect(articleVendorRateAverage(db, "article-1").average).toBeCloseTo(10, 8);
  });

  test("excludes an unsafe cross-unit rate until a conversion factor exists", () => {
    const db = database();
    db.master.vendorRates = [rate({ id: "unknown-box", vendor_id: "vendor-1", rate: 1000, unit_id: "box" })];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.average).toBeUndefined();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].conversionError).toContain("Set how many pcs");
  });

  test("updates the article and every scoped reference rate with no stored rounding", () => {
    const previous = database();
    const candidate = structuredClone(previous);
    candidate.master.vendorRates = [
      rate({ id: "v1", vendor_id: "vendor-1", rate: 1, gst_inclusive: true }),
      rate({ id: "v2", vendor_id: "vendor-2", rate: 2, gst_inclusive: true }),
      rate({ id: "v3", vendor_id: "vendor-3", rate: 2, gst_inclusive: true }),
    ];
    const updated = applyVendorRateAverages(previous, candidate, { updatedAt: "2026-07-29T00:00:00.000Z" });
    expect(updated.master.articles[0].base_rate).toBe(5 / 3);
    expect(updated.master.subcategoryArticleMap.map((row) => row.reference_rate)).toEqual([5 / 3, 5 / 3]);
  });

  test("keeps a manual override until the next vendor-rate mutation", () => {
    const previous = database();
    previous.master.vendorRates = [rate({ id: "v1", vendor_id: "vendor-1", rate: 100 })];
    const manual = structuredClone(previous);
    manual.master.articles[0].base_rate = 999;
    manual.master.subcategoryArticleMap = manual.master.subcategoryArticleMap.map((row) => ({ ...row, reference_rate: 999 }));
    expect(applyVendorRateAverages(previous, manual)).toBe(manual);

    const next = structuredClone(manual);
    next.master.vendorRates = [...next.master.vendorRates, rate({ id: "v2", vendor_id: "vendor-2", rate: 200 })];
    const recalculated = applyVendorRateAverages(manual, next);
    expect(recalculated.master.articles[0].base_rate).toBe(150);
    expect(recalculated.master.subcategoryArticleMap.every((row) => row.reference_rate === 150)).toBe(true);
  });

  test("retains the current manual value when no usable vendor rate remains", () => {
    const previous = database();
    previous.master.vendorRates = [rate({ id: "v1", vendor_id: "vendor-1", rate: 100 })];
    const candidate = structuredClone(previous);
    candidate.master.vendorRates = [];
    const updated = applyVendorRateAverages(previous, candidate);
    expect(updated.master.articles[0].base_rate).toBe(77);
    expect(updated.master.subcategoryArticleMap.map((row) => row.reference_rate)).toEqual([77, 88]);
  });

  test("recalculates from the remaining vendors after a deletion", () => {
    const previous = database();
    previous.master.vendorRates = [
      rate({ id: "v1", vendor_id: "vendor-1", rate: 100 }),
      rate({ id: "v2", vendor_id: "vendor-2", rate: 200 }),
    ];
    const candidate = structuredClone(previous);
    candidate.master.vendorRates = candidate.master.vendorRates.filter((row) => row.id !== "v2");
    const updated = applyVendorRateAverages(previous, candidate);
    expect(updated.master.articles[0].base_rate).toBe(100);
    expect(updated.master.subcategoryArticleMap.every((row) => row.reference_rate === 100)).toBe(true);
  });
});
