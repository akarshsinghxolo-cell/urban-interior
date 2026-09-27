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

  test("keeps canonical Staff references in task and visit state", () => {
    const types = source("src/lib/rdash/types.ts");
    expect(types).not.toMatch(/\bassignee_name\??:/);
    expect(types).not.toMatch(/\bassigned_to_staff_id\??:/);
    expect(types).not.toMatch(/\bstaff_name\??:/);
  });
});
