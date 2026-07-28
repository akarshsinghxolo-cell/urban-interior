import { describe, expect, test } from "bun:test";
import {
  aggregateWorkspaceChangeBatches,
  MAX_WORKSPACE_DELTA_BATCHES,
  type WorkspaceChangeBatch,
} from "@/lib/rdash/server/workspace-changes";

function batch(
  revision: number,
  operations: WorkspaceChangeBatch["operations"],
  rowVersions: Record<string, number> = {},
): WorkspaceChangeBatch {
  return {
    revision,
    operations,
    row_versions: rowVersions,
    is_baseline: false,
  };
}

describe("workspace delta aggregation", () => {
  test("collapses repeated upserts and deletions to the latest row state", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 10,
      currentRevision: 13,
      baselineRevision: 10,
      batches: [
        batch(11, [{
          collection: "tasks",
          upsert: [{ id: "task-1", title: "First" }, { id: "task-2", title: "Keep" }],
          deleteIds: [],
        }], { "tasks:task-1": 1, "tasks:task-2": 3 }),
        batch(12, [{
          collection: "tasks",
          upsert: [{ id: "task-1", title: "Latest" }],
          deleteIds: ["task-2"],
        }], { "tasks:task-1": 2 }),
        batch(13, [{
          collection: "tasks",
          upsert: [{ id: "task-2", title: "Revived" }],
          deleteIds: ["task-1"],
        }], { "tasks:task-2": 4 }),
      ],
    });

    expect(delta.requiresFullReload).toBe(false);
    expect(delta.revision).toBe(13);
    expect(delta.changedRows.tasks).toEqual([{ id: "task-2", title: "Revived" }]);
    expect(delta.deletedRowIds.tasks).toEqual(["task-1"]);
    expect(delta.rowVersions).toEqual({ "tasks:task-2": 4 });
    expect(delta.collectionRevisions).toEqual({ tasks: 13 });
    expect(delta.hasMore).toBe(false);
  });

  test("mirrors delete-first then upsert commit ordering inside one revision", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 20,
      currentRevision: 21,
      baselineRevision: 20,
      batches: [batch(21, [{
        collection: "tasks",
        deleteIds: ["task-recreated"],
        upsert: [{ id: "task-recreated", title: "Recreated" }],
      }], { "tasks:task-recreated": 0 })],
    });

    expect(delta.changedRows.tasks).toEqual([{ id: "task-recreated", title: "Recreated" }]);
    expect(delta.deletedRowIds.tasks).toBeUndefined();
    expect(delta.rowVersions).toEqual({ "tasks:task-recreated": 0 });
  });

  test("returns an empty delta when the client is current", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 25,
      currentRevision: 25,
      baselineRevision: 20,
      batches: [],
    });
    expect(delta.requiresFullReload).toBe(false);
    expect(delta.revision).toBe(25);
    expect(delta.batchCount).toBe(0);
    expect(delta.changedRows).toEqual({});
  });

  test("requires a full reload for revisions older than the journal baseline", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 9,
      currentRevision: 20,
      baselineRevision: 10,
      batches: [],
    });
    expect(delta.requiresFullReload).toBe(true);
    expect(delta.reason).toBe("revision_too_old");
  });

  test("requires a full reload when a journal revision is missing", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 10,
      currentRevision: 13,
      baselineRevision: 10,
      batches: [
        batch(11, [{ collection: "tasks", upsert: [], deleteIds: [] }]),
        batch(13, [{ collection: "tasks", upsert: [], deleteIds: [] }]),
      ],
    });
    expect(delta.requiresFullReload).toBe(true);
    expect(delta.reason).toBe("journal_gap");
  });

  test("paginates a long contiguous journal without skipping revisions", () => {
    const batches = Array.from({ length: MAX_WORKSPACE_DELTA_BATCHES + 1 }, (_, index) =>
      batch(index + 1, [{
        collection: "tasks",
        upsert: [{ id: `task-${index + 1}`, title: `Task ${index + 1}` }],
        deleteIds: [],
      }], { [`tasks:task-${index + 1}`]: 0 }),
    );
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 0,
      currentRevision: MAX_WORKSPACE_DELTA_BATCHES + 1,
      baselineRevision: 0,
      batches,
    });

    expect(delta.revision).toBe(MAX_WORKSPACE_DELTA_BATCHES);
    expect(delta.batchCount).toBe(MAX_WORKSPACE_DELTA_BATCHES);
    expect(delta.hasMore).toBe(true);
    expect(delta.changedRows.tasks).toHaveLength(MAX_WORKSPACE_DELTA_BATCHES);
  });

  test("rejects unknown collections and malformed journal rows", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 3,
      currentRevision: 4,
      baselineRevision: 3,
      batches: [batch(4, [{
        collection: "unknownCollection",
        upsert: [{ id: "row-1" }],
        deleteIds: [],
      }])],
    });
    expect(delta.requiresFullReload).toBe(true);
    expect(delta.reason).toBe("invalid_journal");
  });
});

describe("delta journal migration and API contract", () => {
  test("writes the journal batch inside the atomic commit transaction", async () => {
    const migration = await Bun.file(
      "supabase/migrations/20260728055820_workspace_revision_change_journal.sql",
    ).text();

    expect(migration).toContain("create table if not exists public.entity_workspace_change_batches");
    expect(migration).toContain("alter table public.entity_workspace_change_batches enable row level security");
    expect(migration).toContain("revoke all on table public.entity_workspace_change_batches from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, delete on table public.entity_workspace_change_batches to service_role");
    expect(migration).toContain("is_baseline = true");
    expect(migration).toContain("journal_operations jsonb");

    const journalInsert = migration.indexOf("insert into public.entity_workspace_change_batches (\n    workspace_id,\n    revision");
    const revisionUpdate = migration.indexOf("update public.entity_workspace_revision\n     set revision = next_workspace_revision");
    expect(journalInsert).toBeGreaterThan(0);
    expect(revisionUpdate).toBeGreaterThan(journalInsert);
  });

  test("exposes an authenticated, no-store changes endpoint", async () => {
    const route = await Bun.file("src/app/api/changes/route.ts").text();
    expect(route).toContain("requireSession(request)");
    expect(route).toContain('searchParams.get("afterRevision")');
    expect(route).toContain("getWorkspaceChanges(afterRevision, collections || undefined)");
    expect(route).toContain('"X-UC-Delta-Full-Reload"');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("status: 400");
    expect(route).toContain("status: 401");
    expect(route).toContain("status: 503");
  });

  test("bounds server reads and constrains batches to one coherent current revision", async () => {
    const source = await Bun.file("src/lib/rdash/server/workspace-changes.ts").text();
    expect(source).toContain("MAX_WORKSPACE_DELTA_BATCHES + 1");
    expect(source).toContain('.lte("revision", currentRevision)');
    expect(source).toContain('.eq("is_baseline", false)');
    expect(source).toContain("revision_too_old");
    expect(source).toContain("journal_gap");
    expect(source).toContain("invalid_journal");
    expect(source).toContain("PostgreSQL deletes every collection");
  });

  test("resets journal history before revision numbers restart", async () => {
    const reset = await Bun.file("src/lib/rdash/server/workspace-change-reset.ts").text();
    const workspace = await Bun.file("src/lib/rdash/server/workspace.ts").text();
    expect(reset).toContain('from("entity_workspace_change_batches")');
    expect(reset).toContain("revision: 0");
    expect(reset).toContain("is_baseline: true");
    expect(workspace).toContain("await resetWorkspaceChangeJournal()");
    expect(workspace.indexOf("await resetWorkspaceChangeJournal()"))
      .toBeLessThan(workspace.indexOf("return resetRestWorkspace()"));
  });
});
