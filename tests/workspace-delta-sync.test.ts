import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
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

  test("requires a fresh scoped read for revisions older than the journal baseline", () => {
    const delta = aggregateWorkspaceChangeBatches({
      afterRevision: 9,
      currentRevision: 20,
      baselineRevision: 10,
      batches: [],
    });
    expect(delta.requiresFullReload).toBe(true);
    expect(delta.reason).toBe("revision_too_old");
  });

  test("requires a fresh scoped read when a journal revision is missing", () => {
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
    const migration = (await testFile(
      "supabase/migrations/20260728055820_workspace_revision_change_journal.sql",
    ).text()).replace(/\r\n/g, "\n");

    expectTokens(migration, ["create table if not exists public.entity_workspace_change_batches"]);
    expectTokens(migration, ["alter table public.entity_workspace_change_batches enable row level security"]);
    expectTokens(migration, ["revoke all on table public.entity_workspace_change_batches from public, anon, authenticated"]);
    expectTokens(migration, ["grant select, insert, delete on table public.entity_workspace_change_batches to service_role"]);
    expectTokens(migration, ["is_baseline = true"]);
    expectTokens(migration, ["journal_operations jsonb"]);

    const journalInsert = migration.indexOf("insert into public.entity_workspace_change_batches (\n    workspace_id,\n    revision");
    const revisionUpdate = migration.indexOf("update public.entity_workspace_revision\n     set revision = next_workspace_revision");
    expect(journalInsert).toBeGreaterThan(0);
    expect(revisionUpdate).toBeGreaterThan(journalInsert);
  });

  test("exposes an authenticated, private no-store changes endpoint", async () => {
    const route = await testFile("src/app/api/changes/route.ts").text();
    expect(route).toContain("requireSession(request)");
    expect(route).toContain('searchParams.get("afterRevision")');
    expect(route).toContain('headers.get("x-uc-delta-module")');
    expectTokens(route, ["authorizeWorkspaceDeltaTarget(user, moduleId, requestedCollections)"]);
    expect(route).toContain("getWorkspaceChanges(");
    expect(route).toContain("DIRECTORY_PROJECTION_COLLECTIONS");
    expectTokens(route, ["canReturnFullStaffRows ? undefined : DIRECTORY_PROJECTION_COLLECTIONS"]);
    expectTokens(route, ['request.headers.get("x-uc-foundation-delta") === "1"']);
    expectTokens(route, ["canReturnFullStaffRows = canReadFullStaff && !foundationProjection"]);
    expect(route).toContain('"X-UC-Delta-Full-Reload"');
    expectTokens(route, ['"Cache-Control": "private, no-store, max-age=0"']);
    expectTokens(route, ['"X-Content-Type-Options": "nosniff"']);
    expectTokens(route, ['errorJson("afterRevision must be a non-negative integer.", 400)']);
    expectTokens(route, ['errorJson("Your session is missing or expired.", 401)']);
    expectTokens(route, ['errorJson(message.slice("FORBIDDEN:".length), 403)']);
    expectTokens(route, ['errorJson("Workspace changes are temporarily unavailable.", 503']);
  });

  test("bounds server reads and constrains batches to one coherent current revision", async () => {
    const source = await testFile("src/lib/rdash/server/workspace-changes.ts").text();
    expectTokens(source, ["MAX_WORKSPACE_DELTA_BATCHES + 1"]);
    expectTokens(source, ['.lte("revision", currentRevision)']);
    expectTokens(source, ['.eq("is_baseline", false)']);
    expect(source).toContain("revision_too_old");
    expect(source).toContain("journal_gap");
    expect(source).toContain("invalid_journal");
    expect(source).toContain("projection_changed");
    expect(source).toContain("refreshOnOmittedCollections");
    expectTokens(source, ["PostgreSQL deletes every collection"]);
  });

  test("runs destructive reset through the same atomic revision-CAS transaction", async () => {
    const rest = await testFile("src/lib/rdash/server/commit-rest.ts").text();
    const workspace = await testFile("src/lib/rdash/server/workspace.ts").text();

    expectTokens(rest, ["const current = await getRestWorkspace()"]);
    expectTokens(rest, ["diffWorkspaceOperations(current.data, seedData)"]);
    expectTokens(rest, ["commitRestOperations(operations, current.revision, {})"]);
    expect(rest).toContain("customer-conversation:${thread.record_id}");
    expectTokens(rest, ["Could not read workspace collection ${collection}"]);
    expectNoTokens(rest, ["Existing reset behavior is intentionally preserved for now"]);
    expectNoTokens(rest, ["revision: 0, updated_at: new Date().toISOString()"]);
    expect(workspace).not.toContain("resetWorkspaceChangeJournal");
    expect(workspace).not.toContain("canonicalizeResetCustomerThreads");
    expectTokens(workspace, ["return resetRestWorkspace()"]);
  });
});
