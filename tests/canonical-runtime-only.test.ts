import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("canonical runtime only", () => {
  test("keeps retired compatibility modules deleted", () => {
    expect(existsSync(join(root, "src/lib/rdash/module-aliases.ts"))).toBe(false);
    expect(existsSync(join(root, "src/lib/rdash/staff-reference-labels.ts"))).toBe(false);
    expect(existsSync(join(root, "src/components/rdash/CustomerWorkCaptureDialog.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/components/rdash/WorkRequiredCreateDialog.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/lib/rdash/store/slices/quotations-core.ts"))).toBe(false);
  });

  test("keeps quotations and data-layer configuration canonical", () => {
    const quotations = source("src/lib/rdash/store/slices/quotations.ts");
    const health = source("src/app/api/health/config/route.ts");
    const signIn = source("src/app/signin/page.tsx");

    expect(quotations).not.toContain("Compatibility facade");
    expect(quotations).not.toContain("createCoreQuotationsSlice");
    expect(quotations).toContain("Customer-level quotation draft created without a Site");
    expect(health).toContain("isSupabaseConfigured");
    expect(health).toContain('dataLayer: "supabase"');
    expect(health).not.toContain("in-memory");
    expect(signIn).not.toContain("in-memory-fallback");
    expect(signIn).not.toContain('"In-memory"');
  });

  test("uses one CAS identity and no local storage fallback", () => {
    const commitRest = source("src/lib/rdash/server/commit-rest.ts");
    const rowVersions = source("src/lib/rdash/workspace-row-version-state.ts");
    const delta = source("src/lib/rdash/workspace-delta.ts");
    const rawStore = source("src/lib/rdash/raw-store.ts");
    const commitRoute = source("src/app/api/operations/commit/route.ts");
    const qaSupabase = source("scripts/qa-mock-supabase.ts");
    const storage = source("src/lib/rdash/storage.ts");
    const migration = source("supabase/migrations/20260928092000_canonicalize_workspace_row_version_keys.sql");

    expect(commitRest).not.toContain("rowVersions[row.id]");
    expect(rowVersions).not.toContain("keys.add(id)");
    expect(delta).not.toContain("expandedDeltaRowVersions");
    expect(rawStore).toContain("touchedVersionKeys");
    expect(rawStore).not.toContain("rowVersionsCache[id]");
    expect(commitRoute).not.toContain("touched.add(id)");
    expect(qaSupabase).not.toContain("const plain = expectedRowVersions[rowId]");
    expect(qaSupabase).toContain("INVALID_ROW_VERSION_KEY");
    expect(storage).not.toContain('accountIds.add("local")');
    expect(storage).not.toContain("inferStoragePurpose");
    expect(migration).toContain("INVALID_ROW_VERSION_KEY");
    expect(migration).not.toContain("when p_expected_row_versions ? row_id");
    expect(migration).not.toContain("jsonb_build_object(row_id, new_row_revision)");
  });

  test("uses canonical workspace routes only", () => {
    const routes = source("src/lib/rdash/workspace-routes.ts");
    expect(routes).not.toContain("LEGACY_MODULE_ALIASES");
    expect(routes).not.toContain("canonicalLegacyModuleId");
    expect(routes).not.toContain("aliases:");
    expect(routes).toContain("isAlias: false");
  });

  test("does not restore Favorites v1 fallback", () => {
    const favorites = source("src/components/rdash/FavoritesBar.tsx");
    expect(favorites).toContain('const STORAGE_KEY = "uc_favorites_v2"');
    expect(favorites).not.toContain("LEGACY_STORAGE_KEY");
    expect(favorites).not.toContain('getItem("uc_favorites")');
  });

  test("does not restore Drive legacy folder-key adoption", () => {
    const engine = source("src/lib/rdash/server/drive-folder-engine.ts");
    const hierarchy = source("src/lib/rdash/server/drive-folder-hierarchy.ts");
    expect(engine).not.toContain("legacyKeys");
    expect(hierarchy).not.toContain("legacyKeys");
  });

  test("keeps one canonical root and commission-rule contract", () => {
    const rootPage = source("src/app/page.tsx");
    const types = source("src/lib/rdash/types.ts");
    const masters = source("src/lib/rdash/store/slices/masters.ts");
    const workTypes = source("src/lib/rdash/work-types.ts");
    const receipts = source("src/app/api/operations/commit/route.ts");

    expect(rootPage).toContain("redirect(WORKSPACE_ROOT_PATH)");
    expect(rootPage).not.toContain("UrbanCastleApp");
    expect(types).toContain('applies_to: "partner" | "category"');
    expect(types).not.toContain('applies_to: "all" | "category" | "workOrder"');
    expect(masters).not.toContain('applies_to === "workOrder"');
    expect(masters).not.toContain('applies_to === "all"');
    expect(workTypes).not.toContain("mergeExplodedOptionItems");
    expect(receipts).not.toContain("compactStoredResult");
    expect(receipts).not.toContain("rewriteAppliedReceiptResult");
  });

  test("keeps canonical Staff references in task and visit state", () => {
    const types = source("src/lib/rdash/types.ts");
    const visit = types.slice(types.indexOf("export interface Visit {"), types.indexOf("export type Priority"));
    const task = types.slice(types.indexOf("export interface Task {"), types.indexOf("export type FollowupStatus"));
    const followup = types.slice(types.indexOf("export interface Followup {"), types.indexOf("export type FinancialContext"));
    for (const section of [visit, task, followup]) {
      expect(section).not.toMatch(/\bassignee_name\??:/);
      expect(section).not.toMatch(/\bassigned_to_staff_id\??:/);
      expect(section).not.toMatch(/\bstaff_name\??:/);
    }
  });
});
