import { describe, expect, test } from "bun:test";
import { aggregateWorkspaceChangeBatches } from "@/lib/rdash/server/workspace-changes";

const read = (path: string) => Bun.file(path).text();

describe("workspace navigation freshness", () => {
  test("revalidates a compatible scope when navigation enters another target", async () => {
    const source = await read(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    );

    expect(source).toContain(
      "const previousEffectTargetKeyRef = React.useRef(targetKey)",
    );
    expect(source).toContain(
      "const enteredNewTarget = previousEffectTargetKeyRef.current !== targetKey",
    );
    expect(source).toContain(
      "if (!needsExpansion && !enteredNewTarget)",
    );
    expect(source).toContain("workspaceReadCache.get(requestedTarget, authUser)");
    expect(source).toContain("revalidateWorkspaceReadCacheEntry");
    expect(source).toContain('"X-UC-Read-Revalidate": enteredNewTarget ? "navigation-full" : "coverage"');
  });

  test("keeps compatible data visible while navigation refreshes it", async () => {
    const source = await read(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    );

    expect(source).toContain("if (!needsExpansion) return null");
    expect(source).not.toContain("if (!needsExpansion && !enteredNewTarget) return null");
  });

  test("caches bounded targets by user and target revision", async () => {
    const source = await read("src/lib/rdash/workspace-read-cache.ts");
    expect(source).toContain("MAX_CACHE_ENTRIES = 32");
    expect(source).toContain("workspaceReadTargetKey(target)");
    expect(source).toContain("user.email.trim().toLowerCase()");
    expect(source).toContain("revision: input.revision");
    expect(source).toContain("structuredClone(input.data)");
  });

  test("navigation delta uses cached collection coverage and changed rows only", async () => {
    const source = await read("src/lib/rdash/workspace-navigation-delta.ts");
    expect(source).toContain("workspaceCollectionFilterParam(entry.data)");
    expect(source).toContain('fetch(`/api/changes?${params.toString()}`');
    expect(source).toContain('"X-UC-Delta-Client": "navigation-cache"');
    expect(source).toContain("applyWorkspaceDelta(entry.data, delta)");
    expect(source).toContain("mergeWorkspaceRowVersions");
  });

  test("relationship row graphs and bounded collections recover with a full scoped read", async () => {
    const source = await read("src/lib/rdash/workspace-navigation-delta.ts");
    expect(source).toContain('entry.readState.strategy === "row"');
    expect(source).toContain("ROW_SAFE_COLLECTIONS");
    expect(source).toContain("row_graph_changed:");
    expect(source).toContain("_workspace_read_limits");
    expect(source).toContain("limited_collection:");
  });

  test("directory Staff projection changes request a safe reload", () => {
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

  test("unrelated collection changes advance revision without module payload", () => {
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
    const source = await read("src/components/urban-castle/WorkspaceDeltaSync.tsx");
    expect(source).toContain('NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED === "1"');
    expect(source).toContain("DELTA_POLL_INTERVAL_MS = 15 * 60_000");
    expect(source).not.toContain("DELTA_POLL_INTERVAL_MS = 30_000");
  });
});
