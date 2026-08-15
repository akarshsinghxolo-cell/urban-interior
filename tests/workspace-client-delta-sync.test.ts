import { afterEach, describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";
import {
  applyWorkspaceDelta,
  deletedDeltaVersionKeys,
  expandedDeltaRowVersions,
  loadedWorkspaceCollections,
  workspaceCollectionFilterParam,
  type WorkspaceDeltaPayload,
} from "@/lib/rdash/workspace-delta";
import { workspaceDeltaSyncIsSafe } from "@/lib/rdash/workspace-delta-sync-policy";
import { workspaceFoundationRevisionState } from "@/lib/rdash/workspace-foundation-revision-state";
import {
  mergeWorkspaceRowVersions,
  workspaceRowVersionState,
} from "@/lib/rdash/workspace-row-version-state";
import { aggregateWorkspaceChangeBatches } from "@/lib/rdash/server/workspace-changes";

function delta(overrides: Partial<WorkspaceDeltaPayload> = {}): WorkspaceDeltaPayload {
  return {
    fromRevision: 10,
    revision: 11,
    currentRevision: 11,
    baselineRevision: 0,
    changedRows: {},
    deletedRowIds: {},
    rowVersions: {},
    collectionRevisions: {},
    hasMore: false,
    requiresFullReload: false,
    batchCount: 1,
    ...overrides,
  };
}

function scopedDatabase(): RDashDatabase {
  const database = buildSeedDatabase();
  database.tasks = [{
    id: "task-loaded",
    title: "Old task",
    status: "todo",
    priority: "medium",
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
  } as never];
  database.invoices = [{
    id: "invoice-unloaded",
    invoice_no: "INV-OLD",
    customer_id: "customer-1",
    customer_name: "Customer",
    amount: 100,
    status: "draft",
    issued_at: "2026-07-28T00:00:00.000Z",
    due_date: "2026-08-28",
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
  } as never];
  const metadata = database as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = "workdesk";
  metadata._workspace_read_collections = ["tasks", "followups", "master.staff"];
  metadata._workspace_foundation_embedded = true;
  return database;
}

afterEach(() => {
  workspaceRowVersionState.resetForTests();
  workspaceFoundationRevisionState.reset();
});

describe("client delta application", () => {
  test("applies only collections represented by the current scoped snapshot", () => {
    const database = scopedDatabase();
    const result = applyWorkspaceDelta(database, delta({
      changedRows: {
        tasks: [{ id: "task-loaded", title: "Remote task", status: "todo", priority: "high" }],
        invoices: [{ id: "invoice-unloaded", invoice_no: "INV-REMOTE" }],
      },
      rowVersions: {
        "tasks:task-loaded": 4,
        "invoices:invoice-unloaded": 2,
      },
    }));

    expect(result.operations.map((operation) => operation.collection)).toEqual(["tasks"]);
    expect(result.database.tasks.find((row) => row.id === "task-loaded")?.title).toBe("Remote task");
    expect(result.database.invoices.find((row) => row.id === "invoice-unloaded")?.invoice_no).toBe("INV-OLD");
  });

  test("keeps the safe Staff directory loaded but excludes canonical full Staff journal rows", () => {
    const collections = loadedWorkspaceCollections(scopedDatabase());
    expect(collections).not.toBeNull();
    expect(collections?.has("tasks")).toBe(true);
    expect(collections?.has("staffRolePermissions")).toBe(true);
    expect(collections?.has("master.staff")).toBe(true);

    const filter = workspaceCollectionFilterParam(scopedDatabase());
    expect(filter).toContain("staffRolePermissions");
    expect(filter).not.toContain("master.staff");
    expect(filter).toContain("tasks");
  });

  test("treats full snapshots as unfiltered", () => {
    const database = scopedDatabase();
    (database as unknown as Record<string, unknown>)._workspace_read_scope = "full";
    expect(loadedWorkspaceCollections(database)).toBeNull();
    expect(workspaceCollectionFilterParam(database)).toBeUndefined();
  });

  test("expands row versions for compatibility and removes deletion keys", () => {
    const payload = delta({
      rowVersions: { "tasks:task-1": 7 },
      deletedRowIds: { tasks: ["task-2"] },
    });
    expect(expandedDeltaRowVersions(payload)).toEqual({
      "tasks:task-1": 7,
      "task-1": 7,
    });
    expect(deletedDeltaVersionKeys(payload)).toEqual(["tasks:task-2", "task-2"]);
  });

  test("preserves unchanged CAS versions while replacing changed and deleted rows", () => {
    workspaceRowVersionState.replace({
      "tasks:task-1": 2,
      "task-1": 2,
      "tasks:task-2": 5,
      "task-2": 5,
      "visits:visit-1": 3,
      "visit-1": 3,
    });
    const merged = mergeWorkspaceRowVersions(
      workspaceRowVersionState.getSnapshot(),
      { "tasks:task-1": 3, "task-1": 3 },
      ["tasks:task-2", "task-2"],
    );

    expect(merged).toEqual({
      "tasks:task-1": 3,
      "task-1": 3,
      "visits:visit-1": 3,
      "visit-1": 3,
    });
  });
});

describe("foundation revision state", () => {
  test("advances monotonically and can reset for a new authenticated session", () => {
    workspaceFoundationRevisionState.replace(10);
    workspaceFoundationRevisionState.advance(8);
    expect(workspaceFoundationRevisionState.get()).toBe(10);
    workspaceFoundationRevisionState.advance(12);
    expect(workspaceFoundationRevisionState.get()).toBe(12);
    workspaceFoundationRevisionState.reset();
    expect(workspaceFoundationRevisionState.get()).toBe(0);
  });
});

describe("collection-filtered server deltas", () => {
  test("advances revisions while omitting unrelated collection payloads", () => {
    const result = aggregateWorkspaceChangeBatches({
      afterRevision: 5,
      currentRevision: 7,
      baselineRevision: 0,
      allowedCollections: new Set(["tasks"]),
      batches: [
        {
          revision: 6,
          operations: [{
            collection: "invoices",
            upsert: [{ id: "invoice-1", invoice_no: "INV-1" }],
            deleteIds: [],
          }],
          row_versions: { "invoices:invoice-1": 0 },
        },
        {
          revision: 7,
          operations: [{
            collection: "tasks",
            upsert: [{ id: "task-1", title: "Task" }],
            deleteIds: [],
          }],
          row_versions: { "tasks:task-1": 2 },
        },
      ],
    });

    expect(result.revision).toBe(7);
    expect(result.changedRows.invoices).toBeUndefined();
    expect(result.changedRows.tasks).toEqual([{ id: "task-1", title: "Task" }]);
    expect(result.rowVersions).toEqual({ "tasks:task-1": 2 });
  });
});

describe("delta synchronization safety policy", () => {
  const safe = {
    authenticated: true,
    workspaceSyncStatus: "saved",
    outboxReady: true,
    outboxCount: 0,
    dirtyFormCount: 0,
    routeCovered: true,
    visible: true,
    online: true,
  };

  test("allows remote hydration only when every local-safety condition is satisfied", () => {
    expect(workspaceDeltaSyncIsSafe(safe)).toBe(true);
    for (const [key, unsafeValue] of [
      ["authenticated", false],
      ["workspaceSyncStatus", "saving"],
      ["outboxReady", false],
      ["outboxCount", 1],
      ["dirtyFormCount", 1],
      ["routeCovered", false],
      ["visible", false],
      ["online", false],
    ] as const) {
      expect(workspaceDeltaSyncIsSafe({ ...safe, [key]: unsafeValue })).toBe(false);
    }
  });

  test("browser orchestrator rechecks safety and stays disabled by default", async () => {
    const source = await testFile("src/components/urban-castle/WorkspaceDeltaSync.tsx").text();
    expect(source).toContain("awaitServerSync()");
    expect(source).toContain("currentRunIsSafe(pathname)");
    expect(source).toContain("workspaceSyncStatus");
    expect(source).toContain("dirtyFormRegistry.getSnapshot().dirtyForms.length");
    expect(source).toContain("workspaceOutboxStore.getSnapshot()");
    expect(source).toContain("workspaceReadCoverageIsCompatible");
    expect(source).toContain("workspaceReadTargetForPath(pathname)");
    expect(source).toContain("workspaceCollectionFilterParam");
    expect(source).toContain("hydrateSecureWorkspace");
    expect(source).toContain("restoreWorkspaceOutboxOverlay");
    expect(source).toContain("overlay.db");
    expect(source).toContain("mergeWorkspaceRowVersions");
    expect(source).toContain("deletedDeltaVersionKeys");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("Delta journal did not advance");
    expect(source).toContain("visibilitychange");
    expect(source).toContain('window.addEventListener("online"');
    expect(source).toContain('NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED === "1"');
    expect(source).toContain("DELTA_POLL_INTERVAL_MS = 15 * 60_000");
    expect(source).not.toContain('NEXT_PUBLIC_UC_DELTA_SYNC_ENABLED !== "0"');
    expect(source).not.toContain("initialTimer");
    expect(source).not.toContain("activeModuleId");
    expect(source).not.toContain("DELTA_POLL_INTERVAL_MS = 30_000");
  });

  test("row-version bridge installs before passive workspace hydration", async () => {
    const source = await testFile("src/lib/rdash/use-workspace-row-version-bridge.ts").text();
    const app = await testFile("src/components/urban-castle/UrbanCastleApp.tsx").text();
    expect(source).toContain("React.useLayoutEffect");
    expect(source).toContain("workspaceRowVersionState.merge(input.rowVersions)");
    expect(source).toContain("hydrateSecureWorkspace: wrapped");
    expect(app).toContain("useInstallWorkspaceRowVersionBridge()");
    expect(app.indexOf("useInstallWorkspaceRowVersionBridge()"))
      .toBeLessThan(app.indexOf("useInstallDirtyFormNavigationGuards()"));
  });

  test("changes API validates collection filters", async () => {
    const source = await testFile("src/app/api/changes/route.ts").text();
    expect(source).toContain('searchParams.get("collections")');
    expect(source).toContain("MAX_COLLECTION_FILTERS");
    expect(source).toContain("knownWorkspaceCollection");
    expect(source).toContain('"X-UC-Delta-Filtered"');
  });
});
