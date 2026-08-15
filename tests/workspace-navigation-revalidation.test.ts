import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { aggregateWorkspaceChangeBatches } from "@/lib/rdash/server/workspace-changes";
import { workspaceReadTargetForActiveNavigation } from "@/lib/rdash/workspace-active-read-target";

const read = (path: string) => testFile(path).text();

describe("workspace navigation freshness", () => {
  test("active module wins while managed pathname catches up", () => {
    const masterDuringWorkdeskUrl = workspaceReadTargetForActiveNavigation(
      "/workspace/tasks",
      "masterSetup",
    );
    expect(masterDuringWorkdeskUrl.moduleId).toBe("masterSetup");
    expect(masterDuringWorkdeskUrl.scope).toBe("master");

    const customerDuringMasterUrl = workspaceReadTargetForActiveNavigation(
      "/workspace/masters",
      "customerDesk",
    );
    expect(customerDuringMasterUrl.moduleId).toBe("customerDesk");
    expect(customerDuringMasterUrl.scope).toBe("customer");
  });

  test("keeps matching entity paths row-scoped after navigation settles", () => {
    const target = workspaceReadTargetForActiveNavigation(
      "/workspace/customers/cust-123",
      "customerDesk",
    );
    expect(target.moduleId).toBe("customerDesk");
    expect(target.entity).toEqual({ kind: "customer", id: "cust-123" });
  });

  test("read boundary and module gate use the same active-navigation resolver", async () => {
    const boundary = await read(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    );
    const router = await read("src/components/rdash/WorkspaceModuleRouter.tsx");

    expect(boundary).toContain("workspaceReadTargetForActiveNavigation(pathname, activeModuleId)");
    expect(router).toContain("workspaceReadTargetForActiveNavigation(pathname, currentActiveModuleId)");
    expect(boundary).not.toContain("workspaceReadTargetForPath(pathname)");
  });

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

    // Compatible module data must never be covered by the blocking refresh UI.
    // A small non-blocking Load-more card is allowed when bounded collections
    // advertise another page.
    expect(source).toContain("if (!needsExpansion) {");
    expect(source).toContain("if (!pageCursors.length && !pageError) return null");
    expect(source).toContain("More records are available");
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

  test("navigation delta uses cached collection coverage and an authorized module target", async () => {
    const source = await read("src/lib/rdash/workspace-navigation-delta.ts");
    expect(source).toContain("workspaceCollectionFilterParam(entry.data)");
    expect(source).toContain('fetch(`/api/changes?${params.toString()}`');
    expect(source).toContain('"X-UC-Delta-Client": "navigation-cache"');
    expect(source).toContain('"X-UC-Delta-Module": entry.target.moduleId');
    expect(source).toContain("applyWorkspaceDelta(entry.data, delta)");
    expect(source).toContain("mergeWorkspaceRowVersions");
  });

  test("relationship row graphs never request collection-wide delta row bodies", async () => {
    const source = await read("src/lib/rdash/workspace-navigation-delta.ts");
    const rowGuard = source.indexOf('input.readState.strategy === "row"');
    const deltaFetch = source.indexOf('fetch(`/api/changes?${params.toString()}`');
    expect(rowGuard).toBeGreaterThan(-1);
    expect(deltaFetch).toBeGreaterThan(-1);
    expect(rowGuard).toBeLessThan(deltaFetch);
    expect(source).toContain('reason: "row_scope_requires_server_graph"');
    expect(source).not.toContain("ROW_SAFE_COLLECTIONS");
    expect(source).not.toContain("row_graph_changed:");
  });

  test("bounded collections recover with a full scoped read", async () => {
    const source = await read("src/lib/rdash/workspace-navigation-delta.ts");
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
