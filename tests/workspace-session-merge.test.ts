import { describe, expect, test } from "vitest";
import {
  createEmptyWorkspaceDatabase,
  mergeWorkspaceSnapshot,
  normalizeWorkspaceSession,
  workspaceHydrationRevisionIsCurrent,
  workspaceSnapshotRemovedRowVersionKeys,
  WORKSPACE_SESSION_FOUNDATION_COLLECTIONS,
} from "@/lib/rdash/workspace-session-merge";
import type { RDashDatabase } from "@/lib/rdash/types";

function scoped(collections: string[], patch: (db: RDashDatabase) => void, options?: { strategy?: "module" | "scope" | "row"; pageOnly?: boolean }): RDashDatabase {
  const db = createEmptyWorkspaceDatabase();
  patch(db);
  const metadata = db as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = options?.strategy === "row" ? "customer" : "workdesk";
  metadata._workspace_read_mode = options?.strategy === "row" ? "customer-row" : "workdesk";
  metadata._workspace_read_strategy = options?.strategy || "module";
  metadata._workspace_read_collections = collections;
  metadata._workspace_foundation_embedded = false;
  if (options?.pageOnly) metadata._workspace_page_only = true;
  return db;
}

describe("workspace session merge", () => {
  test("starts empty instead of booting demo Customer data", () => {
    const db = createEmptyWorkspaceDatabase();
    expect(db.customers).toEqual([]);
    expect(db.sites).toEqual([]);
    expect(db.tasks).toEqual([]);
  });

  test("keeps bootstrap Master foundation resident across module switches", () => {
    const current = createEmptyWorkspaceDatabase();
    current.master.units = [{ id: "pcs", name: "Pieces", symbol: "pcs", family: "count" }];
    const meta = current as unknown as Record<string, unknown>;
    meta._workspace_foundation_embedded = true;
    meta._workspace_read_collections = [...WORKSPACE_SESSION_FOUNDATION_COLLECTIONS];
    const incoming = scoped(["tasks"], (db) => { db.tasks = [{ id: "t1", title: "Task", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as unknown as RDashDatabase["tasks"]; });
    const merged = mergeWorkspaceSnapshot(current, incoming);
    expect(merged.master.units.map((row) => row.id)).toEqual(["pcs"]);
    expect(merged.tasks.map((row) => row.id)).toEqual(["t1"]);
  });

  test("complete module collections replace old rows", () => {
    const current = createEmptyWorkspaceDatabase();
    current.tasks = [{ id: "old", title: "Old", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as unknown as RDashDatabase["tasks"];
    const incoming = scoped(["tasks"], (db) => { db.tasks = [{ id: "new", title: "New", status: "pending", priority: "normal", created_at: "", updated_at: "" }] as unknown as RDashDatabase["tasks"]; });
    expect(mergeWorkspaceSnapshot(current, incoming).tasks.map((row) => row.id)).toEqual(["new"]);
  });

  test("row graphs and page-only payloads merge", () => {
    const current = createEmptyWorkspaceDatabase();
    current.customers = [{ id: "c1", name: "One", status: "active", created_at: "", updated_at: "" }, { id: "c2", name: "Two", status: "active", created_at: "", updated_at: "" }] as unknown as RDashDatabase["customers"];
    const row = scoped(["customers"], (db) => { db.customers = [{ id: "c1", name: "Updated", status: "active", created_at: "", updated_at: "" }] as unknown as RDashDatabase["customers"]; }, { strategy: "row" });
    const rowMerged = mergeWorkspaceSnapshot(current, row);
    expect(rowMerged.customers.map((customer) => customer.id).sort()).toEqual(["c1", "c2"]);
    const page = scoped(["customers"], (db) => { db.customers = [{ id: "c3", name: "Three", status: "active", created_at: "", updated_at: "" }] as unknown as RDashDatabase["customers"]; }, { pageOnly: true });
    expect(mergeWorkspaceSnapshot(rowMerged, page).customers.map((customer) => customer.id).sort()).toEqual(["c1", "c2", "c3"]);
  });

  test("rejects older hydration revisions while allowing equal-revision partial merges", () => {
    expect(workspaceHydrationRevisionIsCurrent(10, 11, 10, 9)).toBe(false);
    expect(workspaceHydrationRevisionIsCurrent(11, 11, 10, 9)).toBe(true);
    expect(workspaceHydrationRevisionIsCurrent(12, 11, 10, 9)).toBe(true);
    expect(workspaceHydrationRevisionIsCurrent(Number.NaN, 11)).toBe(false);
  });

  test("derives CAS tombstones only for authoritative collection replacement", () => {
    const current = createEmptyWorkspaceDatabase();
    current.tasks = [
      { id: "task-keep", title: "Keep" },
      { id: "task-remove", title: "Remove" },
    ] as never;

    const complete = createEmptyWorkspaceDatabase();
    complete.tasks = [{ id: "task-keep", title: "Keep" }] as never;
    Object.assign(complete as unknown as Record<string, unknown>, {
      _workspace_read_scope: "workdesk",
      _workspace_read_mode: "workdesk",
      _workspace_read_strategy: "full",
      _workspace_read_collections: ["tasks"],
    });
    expect(workspaceSnapshotRemovedRowVersionKeys(current, complete)).toEqual(
      expect.arrayContaining(["task-remove", "tasks:task-remove"]),
    );

    const partial = structuredClone(complete);
    Object.assign(partial as unknown as Record<string, unknown>, {
      _workspace_read_strategy: "row",
    });
    expect(workspaceSnapshotRemovedRowVersionKeys(current, partial)).toEqual([]);
  });

  test("normalization does not synthesize threads or follow-ups", () => {
    const db = createEmptyWorkspaceDatabase();
    const first = normalizeWorkspaceSession(db);
    const second = normalizeWorkspaceSession(first);
    expect(first.threads).toEqual([]);
    expect(first.followups).toEqual([]);
    expect(second).toEqual(first);
  });
});
