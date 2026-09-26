import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { COLLECTION_TO_TABLE, emptyWorkspaceData, putCollectionRows } from "../src/lib/rdash/server/commit-rest";
import { isValidWorkspaceDelta, type WorkspaceDeltaPayload } from "../src/lib/rdash/workspace-delta";
import { normalizeWorkspacePath, resolveWorkspacePath } from "../src/lib/rdash/workspace-routes";
import { resolveWorkspaceLocation } from "../src/lib/rdash/workspace-entity-routes";

describe("shared workspace foundations", () => {
  test("storage covers each canonical seed collection once, without a second table registry", () => {
    const seed = buildSeedDatabase();
    const names = [
      ...Object.entries(seed).filter(([, value]) => Array.isArray(value)).map(([key]) => key),
      ...Object.entries(seed.master).filter(([, value]) => Array.isArray(value)).map(([key]) => `master.${key}`),
      // These collections are initialized by HR/bootstrap, not the minimal seed.
      "leaveRequests", "payrollLines", "payrollPeriods", "salaryAdjustments", "staffDocuments", "staffRolePermissions",
    ];
    expect(Object.keys(COLLECTION_TO_TABLE).sort()).toEqual(names.sort());
    expect(new Set(Object.values(COLLECTION_TO_TABLE)).size).toBe(names.length);
    for (const name of names) expect(COLLECTION_TO_TABLE[name]).toBe(`entity_${name.replace(".", "_")}`);
    expect(COLLECTION_TO_TABLE["master.notACollection"]).toBeUndefined();
    expect(COLLECTION_TO_TABLE["uc_user_roles"]).toBeUndefined();
  });

  test("both readers share row decoding and scoped revision keys without sharing mutable arrays", () => {
    const data = emptyWorkspaceData();
    const other = emptyWorkspaceData();
    const versions: Record<string, number> = {};
    putCollectionRows(data, versions, "customers", [
      { id: "c1", revision: 5, data: '{"id":"c1","name":"Customer"}' },
      { id: "invalid", data: "not json" },
      { id: "null", data: null },
    ]);
    putCollectionRows(data, versions, "master.vendors", [{ id: "v1", revision: 7, data: { id: "v1", name: "Vendor" } }]);
    expect(data.customers).toEqual([{ id: "c1", name: "Customer" }]);
    expect(data.master.vendors).toEqual([{ id: "v1", name: "Vendor" }]);
    expect(versions).toEqual({ c1: 5, "customers:c1": 5, v1: 7, "master.vendors:v1": 7 });
    expect(other.customers).toEqual([]);
    expect(other.master.vendors).toEqual([]);
    expect(data.master.catalog_version).toBeUndefined(); // Scoped readers do not invent catalogue metadata.
  });

  test("all sync consumers use the same revision validation", () => {
    const valid = { fromRevision: 10, revision: 11, currentRevision: 12, hasMore: true } as WorkspaceDeltaPayload;
    expect(isValidWorkspaceDelta(valid, 10)).toBe(true);
    expect(isValidWorkspaceDelta({ ...valid, revision: 10, hasMore: false }, 10)).toBe(true);
    for (const patch of [{ fromRevision: 9 }, { revision: 9 }, { currentRevision: 10 }, { revision: 10.5 }, { currentRevision: NaN }, { hasMore: "yes" }]) {
      expect(isValidWorkspaceDelta({ ...valid, ...patch } as WorkspaceDeltaPayload, 10)).toBe(false);
    }
    for (const path of ["src/components/urban-castle/WorkspaceDeltaSync.tsx", "src/components/urban-castle/WorkspaceFoundationSync.tsx", "src/lib/rdash/workspace-navigation-delta.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("isValidWorkspaceDelta(delta, afterRevision)");
      expect(source).not.toContain("function isValidDelta");
    }
  });

  test("module and entity URLs share normalization without changing public links", () => {
    expect(normalizeWorkspacePath("workspace//vendors///?q=1#tab")).toBe("/workspace/vendors");
    expect(resolveWorkspacePath("workspace//vendors///?q=1#tab")?.canonicalPath).toBe("/workspace/vendors");
    expect(resolveWorkspaceLocation("workspace//vendors/vendor%20one///?tab=files")?.canonicalPath).toBe("/workspace/vendors/vendor%20one");
    expect(resolveWorkspaceLocation("/workspace/vendors/%2Fsecret")).toBeUndefined();
  });
});
