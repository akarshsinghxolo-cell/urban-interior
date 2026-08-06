import { describe, expect, test } from "bun:test";
import { aggregateWorkspaceChangeBatches } from "@/lib/rdash/server/workspace-changes";

const read = (path: string) => Bun.file(path).text();

describe("navigation-scoped delta cache", () => {
  test("revisited targets use an in-memory per-user cache and delta revalidation", async () => {
    const cache = await read("src/lib/rdash/workspace-read-cache.ts");
    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    const navigationDelta = await read("src/lib/rdash/workspace-navigation-delta.ts");

    expect(cache).toContain("MAX_CACHE_ENTRIES = 32");
    expect(cache).toContain("workspaceReadTargetKey(target)");
    expect(cache).toContain("user.email.trim().toLowerCase()");
    expect(cache).toContain("structuredClone(input.data)");
    expect(boundary).toContain("workspaceReadCache.get(requestedTarget, authUser)");
    expect(boundary).toContain("revalidateWorkspaceReadCacheEntry");
    expect(boundary).toContain("await loadFullScope()");
    expect(boundary).toContain("workspaceReadState.restoreCached");
    expect(navigationDelta).toContain('fetch(`/api/changes?${params.toString()}`');
    expect(navigationDelta).toContain('"X-UC-Delta-Client": "navigation-cache"');
    expect(navigationDelta).toContain("workspaceCollectionFilterParam(entry.data)");
    expect(navigationDelta).toContain("applyWorkspaceDelta(entry.data, delta)");
  });

  test("relationship-selected row graphs reload when relational collections change", async () => {
    const navigationDelta = await read("src/lib/rdash/workspace-navigation-delta.ts");
    expect(navigationDelta).toContain('entry.readState.strategy === "row"');
    expect(navigationDelta).toContain("ROW_SAFE_COLLECTIONS");
    expect(navigationDelta).toContain("row_graph_changed:");
  });

  test("bounded collections reload instead of growing an invalid cached top-N snapshot", async () => {
    const navigationDelta = await read("src/lib/rdash/workspace-navigation-delta.ts");
    expect(navigationDelta).toContain("_workspace_read_limits");
    expect(navigationDelta).toContain("limited_collection:");
  });

  test("directory Staff projection changes force a scoped reload", () => {
    const result = aggregateWorkspaceChangeBatches({
      afterRevision: 20,
      currentRevision: 21,
      baselineRevision: 0,
      allowedCollections: new Set(["tasks", "staffRolePermissions"]),
      refreshOnOmittedCollections: new Set(["master.staff"]),
      batches: [{
        revision: 21,
        operations: [{
          collection: "master.staff",
          upsert: [{ id: "staff-1", name: "Updated Staff" }],
          deleteIds: [],
        }],
        row_versions: { "master.staff:staff-1": 4 },
      }],
    });

    expect(result.requiresFullReload).toBe(true);
    expect(result.reason).toBe("projection_changed");
    expect(result.changedRows).toEqual({});
  });

  test("unrelated changes still advance the cached revision without module payload", () => {
    const result = aggregateWorkspaceChangeBatches({
      afterRevision: 30,
      currentRevision: 31,
      baselineRevision: 0,
      allowedCollections: new Set(["tasks"]),
      refreshOnOmittedCollections: new Set(["master.staff"]),
      batches: [{
        revision: 31,
        operations: [{
          collection: "invoices",
          upsert: [{ id: "invoice-1", invoice_no: "INV-1" }],
          deleteIds: [],
        }],
        row_versions: { "invoices:invoice-1": 1 },
      }],
    });

    expect(result.requiresFullReload).toBe(false);
    expect(result.revision).toBe(31);
    expect(result.changedRows).toEqual({});
    expect(result.deletedRowIds).toEqual({});
  });

  test("aggressive polling remains disabled", async () => {
    const sync = await read("src/components/urban-castle/WorkspaceDeltaSync.tsx");
    expect(sync).toContain('NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED === "1"');
    expect(sync).toContain("DELTA_POLL_INTERVAL_MS = 15 * 60_000");
    expect(sync).not.toContain("DELTA_POLL_INTERVAL_MS = 30_000");
  });
});
