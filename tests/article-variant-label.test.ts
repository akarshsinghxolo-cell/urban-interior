import { describe, expect, test } from "vitest";
import { articleVariantLabel } from "../src/lib/rdash/article-variant-label";

describe("article Variant labels", () => {
  test("shows the master Variant together with brand and colour without repeating its name", () => {
    expect(articleVariantLabel({ id: "variant-1", article_id: "article-1", name: "Premium", brand: "Alstone", color: "Black" })).toBe("Premium · Alstone · Black");
    expect(articleVariantLabel({ id: "variant-2", article_id: "article-1", name: "Black", color: "Black" })).toBe("Black");
  });
});
