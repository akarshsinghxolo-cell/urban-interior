import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { buildWorkCategoryCatalog } from "../src/lib/rdash/work-category-master";

const CATALOG_MIGRATION = "supabase/migrations/20260801153000_persist_work_catalog_master.sql";
const RATE_REFRESH_MIGRATION = "supabase/migrations/20260801154000_refresh_contractor_rates_after_catalog.sql";

describe("Supabase convergence rollout ordering", () => {
  test("persists every bundled catalog identity before the final Contractor Rate refresh", async () => {
    const catalogSql = await testFile(CATALOG_MIGRATION).text();
    const catalog = buildWorkCategoryCatalog();

    for (const row of catalog.units) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.workCategories) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.workSubcategories) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.articles) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.subcategoryArticleMap) expect(catalogSql).toContain(`('${row.id}',`);

    expect(CATALOG_MIGRATION < RATE_REFRESH_MIGRATION).toBe(true);
  });

  test("reprojects Contractor Rates after catalog persistence without churning unchanged row versions", async () => {
    const refresh = await testFile(RATE_REFRESH_MIGRATION).text();

    expect(refresh).toContain("uc_contractor_rate_projection_rows");
    expect(refresh).toContain("entity_master_contractor_rates_lookup_idx");
    expectTokens(refresh, ["data ->> 'contractor_id'"]);
    expectTokens(refresh, ["data ->> 'work_subcategory_id'"]);
    expectTokens(refresh, ['public."entity_master_contractorRates".data is distinct from excluded.data']);
    expectTokens(refresh, ['revision = public."entity_master_contractorRates".revision + 1']);
    expectTokens(refresh, ["not (r.id = any(v_keep_ids))"]);
    expectTokens(refresh, ["is_baseline = true"]);
  });

  test("keeps Contractor capability and lifecycle statuses separate", async () => {
    const types = await testFile("src/lib/rdash/types.ts").text();

    expectTokens(types, ['status?: "active" | "inactive";']);
    expectTokens(types, ['status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";']);
  });

  test("keeps auth-owned pending Staff access out of normal Staff edits", async () => {
    const types = await testFile("src/lib/rdash/types.ts").text();
    const dialog = await testFile("src/components/rdash/StaffEditDialog.tsx").text();

    expectTokens(types, ['status?: EntityStatus | "pending" | "blacklisted" | "exited";']);
    expect(dialog).toContain('disabled={Boolean(staff?.auth_user_id)}');
    expectTokens(dialog, ["email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined"]);
    expectTokens(dialog, ['disabled={staff?.status === "pending"}']);
    expectTokens(dialog, ['disabled={value === "pending"}']);
  });
});
