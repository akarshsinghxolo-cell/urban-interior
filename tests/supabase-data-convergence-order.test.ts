import { describe, expect, test } from "bun:test";
import { buildWorkCategoryCatalog } from "../src/lib/rdash/work-category-master";

const CATALOG_MIGRATION = "supabase/migrations/20260801153000_persist_work_catalog_master.sql";
const RATE_REFRESH_MIGRATION = "supabase/migrations/20260801154000_refresh_contractor_rates_after_catalog.sql";

describe("Supabase convergence rollout ordering", () => {
  test("persists every bundled catalog identity before the final Contractor Rate refresh", async () => {
    const catalogSql = await Bun.file(CATALOG_MIGRATION).text();
    const catalog = buildWorkCategoryCatalog();

    for (const row of catalog.units) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.workCategories) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.workSubcategories) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.articles) expect(catalogSql).toContain(`('${row.id}',`);
    for (const row of catalog.subcategoryArticleMap) expect(catalogSql).toContain(`('${row.id}',`);

    expect(CATALOG_MIGRATION < RATE_REFRESH_MIGRATION).toBe(true);
  });

  test("reprojects Contractor Rates after catalog persistence without churning unchanged row versions", async () => {
    const refresh = await Bun.file(RATE_REFRESH_MIGRATION).text();

    expect(refresh).toContain("uc_contractor_rate_projection_rows");
    expect(refresh).toContain("entity_master_contractor_rates_lookup_idx");
    expect(refresh).toContain("data ->> 'contractor_id'");
    expect(refresh).toContain("data ->> 'work_subcategory_id'");
    expect(refresh).toContain('public."entity_master_contractorRates".data is distinct from excluded.data');
    expect(refresh).toContain('revision = public."entity_master_contractorRates".revision + 1');
    expect(refresh).toContain("not (r.id = any(v_keep_ids))");
    expect(refresh).toContain("is_baseline = true");
  });

  test("keeps Contractor capability and lifecycle statuses separate", async () => {
    const types = await Bun.file("src/lib/rdash/types.ts").text();

    expect(types).toContain('status?: "active" | "inactive";');
    expect(types).toContain('status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";');
  });

  test("keeps auth-owned pending Staff access out of normal Staff edits", async () => {
    const types = await Bun.file("src/lib/rdash/types.ts").text();
    const dialog = await Bun.file("src/components/rdash/StaffEditDialog.tsx").text();

    expect(types).toContain('status?: EntityStatus | "pending" | "blacklisted" | "exited";');
    expect(dialog).toContain('disabled={Boolean(staff?.auth_user_id)}');
    expect(dialog).toContain('email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined');
    expect(dialog).toContain('disabled={staff?.status === "pending"}');
    expect(dialog).toContain('disabled={value === "pending"}');
  });
});
