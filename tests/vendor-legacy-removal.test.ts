import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Vendor canonical architecture", () => {
  test("Vendor has one dedicated form and no shared legacy bridge", async () => {
    const router = await source("src/components/rdash/PartnerFormDialog.tsx");
    expect(router).toContain("VendorFormDialog");
    expect(await testFile("src/components/rdash/UnifiedPartnerFormDialog.tsx").exists()).toBe(false);
    expect(await testFile("src/lib/rdash/partner-form-store-bridge.ts").exists()).toBe(false);
  });
  test("Vendor profile uses supply_capabilities only", async () => {
    const profile = await source("src/lib/rdash/vendor-profile.ts");
    expect(profile).toContain("supply_capabilities");
    expect(profile).not.toContain("capabilities_v2");
    expect(profile).not.toContain("article_ids");
  });
  test("live VendorRate has only canonical commercial fields", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const start = types.indexOf("export interface VendorRate {");
    const end = types.indexOf("export interface VendorRateHistory", start);
    const block = types.slice(start, end);
    for (const field of ["quoted_rate", "vendor_id", "article_id", "variant_id", "status", "created_at", "updated_at"]) expect(block).toContain(field);
    for (const legacy of ["unit_id", "work_required_article_id", "gst_inclusive", "gst_rate", "discount_pct", "freight_amount", "valid_from", "current_source_type", "article_name"]) expect(block).not.toContain(legacy);
    expect(block).not.toContain("\n    rate:");
  });
  test("all Vendor rate configuration resolves through Article/Variant", async () => {
    const resolver = await source("src/lib/rdash/article-rate-config.ts");
    const average = await source("src/lib/rdash/vendor-rate-average.ts");
    const price = await source("src/components/rdash/modules/VendorPriceMasterModule.tsx");
    expect(resolver).toContain("resolveArticleRateConfig");
    expect(average).toContain("resolveArticleRateConfig");
    expect(average).not.toContain("freight_amount");
    expect(average).not.toContain("gst_rate");
    expect(price).toContain("resolveArticleRateConfig");
  });
});
