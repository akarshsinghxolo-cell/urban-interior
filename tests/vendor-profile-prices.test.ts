import { expect, test } from "vitest";
import type { Master } from "../src/lib/rdash/types";
import { applyVendorRateUpdates, vendorRateUpdatesFromDrafts } from "../src/lib/rdash/vendor-rate";

test("profile prices reuse canonical base/variant records and history without duplicating unchanged rates", () => {
  const master = {
    articles: [{ id: "article", name: "Track", unit_id: "ft" }],
    articleVariants: [{ id: "variant", article_id: "article", name: "Premium", unit_id: "pcs" }],
    subcategoryArticleMap: [], vendorRates: [], vendorRateHistories: [],
  } as unknown as Master;
  const drafts = [{ articleId: "article", value: "120.556" }, { articleId: "article", variantId: "variant", value: "230" }];
  const saved = applyVendorRateUpdates(master, vendorRateUpdatesFromDrafts(master, "vendor", drafts), "2026-09-25T00:00:00Z");
  expect(saved.vendorRates.map((row) => row.quoted_rate)).toEqual([120.56, 230]);
  expect(saved.vendorRateHistories.map((row) => row.unit_id)).toEqual(["ft", "pcs"]);
  expect(vendorRateUpdatesFromDrafts(saved, "vendor", drafts)).toEqual([]);
  const updated = applyVendorRateUpdates(saved, vendorRateUpdatesFromDrafts(saved, "vendor", [{ articleId: "article", value: "150" }]), "2026-09-26T00:00:00Z");
  expect(updated.vendorRates).toHaveLength(2);
  expect(updated.vendorRates[0].id).toBe(saved.vendorRates[0].id);
  expect(updated.vendorRateHistories).toHaveLength(3);
  expect(updated.vendorRateHistories[0].status).toBe("superseded");
  expect(vendorRateUpdatesFromDrafts(master, "vendor", [{ articleId: "article", value: "" }])).toEqual([]);
  for (const value of ["", "0", "-1", "NaN", "Infinity", "0.001"]) {
    expect(() => vendorRateUpdatesFromDrafts(saved, "vendor", [{ articleId: "article", value }])).toThrow(/greater than zero/);
  }
  expect(() => vendorRateUpdatesFromDrafts(master, "vendor", [{ articleId: "article", variantId: "wrong", value: "10" }])).toThrow(/belonging/);
  expect(() => vendorRateUpdatesFromDrafts({ ...master, articles: [{ id: "article", name: "Track" }] }, "vendor", [{ articleId: "article", value: "10" }])).toThrow(/unit first/);
});
