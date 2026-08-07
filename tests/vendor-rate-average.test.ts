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
    { id: "crate", name: "Crate", symbol: "crate", family: "package" },
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
  return db;
}

function rate(input: Partial<VendorRate> & { id: string; vendor_id: string; rate: number }): VendorRate {
  return {
    article_id: "article-1",
    article_name: "Test article",
    status: "active",
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
    ...input,
  } as VendorRateHistory;
}

describe("article-level canonical Vendor quoted-rate averages", () => {
  test("uses each Vendor's latest active quote, then falls back to latest history when needed", () => {
    const db = database();
    db.master.vendorRates = [
      rate({ id: "v1-current", vendor_id: "vendor-1", rate: 120, status: "inactive", updated_at: "2026-07-04T00:00:00.000Z" }),
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

  test("current quoted rates use only the canonical rate amount", () => {
    const db = database();
    db.master.vendorRates = [
      rate({ id: "vendor-1-rate", vendor_id: "vendor-1", rate: 100 }),
      rate({ id: "vendor-2-rate", vendor_id: "vendor-2", rate: 100 }),
    ];
    const result = articleVendorRateAverage(db, "article-1", new Date("2026-08-07"));
    expect(result.included.map((row) => row.normalizedQuotedRate)).toEqual([100, 100]);
    expect(result.average).toBe(100);
  });

  test("derives the quoted unit from Article/Variant Master", () => {
    const db = database();
    db.master.articleVariants = [
      { id: "pair-variant", article_id: "article-1", name: "Pair pack", unit_id: "pair", enabled: true },
    ];
    db.master.vendorRates = [
      rate({ id: "base", vendor_id: "vendor-1", rate: 10 }),
      rate({ id: "pair", vendor_id: "vendor-2", rate: 20, variant_id: "pair-variant" }),
    ];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.included.map((row) => row.normalizedQuotedRate)).toEqual([10, 10]);
    expect(result.average).toBe(10);
  });

  test("uses Article Variant pack size for package conversion", () => {
    const db = database();
    db.master.articleVariants = [
      { id: "box-variant", article_id: "article-1", name: "Box of 100", unit_id: "box", pack_size: "100 pcs", enabled: true },
    ];
    db.master.vendorRates = [rate({ id: "box", vendor_id: "vendor-1", rate: 1000, variant_id: "box-variant" })];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.average).toBe(10);
    expect(result.included[0].conversionFactor).toBe(100);
  });

  test("excludes a quote when Article/Variant Master cannot safely convert its unit", () => {
    const db = database();
    db.master.articleVariants = [
      { id: "crate-variant", article_id: "article-1", name: "Crate", unit_id: "crate", enabled: true },
    ];
    db.master.vendorRates = [rate({ id: "crate", vendor_id: "vendor-1", rate: 1000, variant_id: "crate-variant" })];
    const result = articleVendorRateAverage(db, "article-1");
    expect(result.average).toBeUndefined();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].conversionError).toContain("Article/Variant unit or pack size");
  });

  test("updates Article and every scoped reference rate with no stored rounding", () => {
    const previous = database();
    const candidate = structuredClone(previous);
    candidate.master.vendorRates = [
      rate({ id: "v1", vendor_id: "vendor-1", rate: 1 }),
      rate({ id: "v2", vendor_id: "vendor-2", rate: 2 }),
      rate({ id: "v3", vendor_id: "vendor-3", rate: 2 }),
    ];
    const updated = applyVendorRateAverages(previous, candidate, { updatedAt: "2026-07-29T00:00:00.000Z" });
    expect(updated.master.articles[0].base_rate).toBe(5 / 3);
    expect(updated.master.subcategoryArticleMap.map((row) => row.reference_rate)).toEqual([5 / 3, 5 / 3]);
  });

  test("keeps a manual override until the next Vendor-rate mutation", () => {
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

  test("retains manual Article values when no usable Vendor quote remains", () => {
    const previous = database();
    previous.master.vendorRates = [rate({ id: "v1", vendor_id: "vendor-1", rate: 100 })];
    const candidate = structuredClone(previous);
    candidate.master.vendorRates = [];
    const updated = applyVendorRateAverages(previous, candidate);
    expect(updated.master.articles[0].base_rate).toBe(77);
    expect(updated.master.subcategoryArticleMap.map((row) => row.reference_rate)).toEqual([77, 88]);
  });

  test("recalculates from remaining Vendors after deletion", () => {
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
