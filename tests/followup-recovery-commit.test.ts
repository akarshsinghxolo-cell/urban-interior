import { beforeEach, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import type { Followup, Task } from "../src/lib/rdash/types";
import type { AuthenticatedUser } from "../src/lib/rdash/server/auth";

const mocks = vi.hoisted(() => ({ subset: vi.fn(), selectors: vi.fn(), authorize: vi.fn() }));
vi.mock("../src/lib/rdash/server/workspace", () => ({ getWorkspaceSubset: mocks.subset }));
vi.mock("../src/lib/rdash/server/entity-scoped-rest", () => ({ getRestWorkspaceBySelectors: mocks.selectors }));
vi.mock("../src/lib/rdash/server/mutation-policy", () => ({ assertWorkspaceMutationAllowed: mocks.authorize }));
import { prepareTargetedCommit } from "../src/lib/rdash/server/targeted-commit";

beforeEach(() => vi.clearAllMocks());

test("a source-only update finds and resolves recovery not loaded by the browser", async () => {
  const db = structuredClone(buildSeedDatabase());
  db.tasks = [];
  db.followups = [{ id: "followup-1", title: "Call", status: "missed", updated_at: "2026-10-24T00:00:00Z" } as Followup];
  const recovery = { id: "task-1", title: "Recovery", task_type: "followup_recovery", source_followup_id: "followup-1", status: "todo" } as Task;
  const subset = { data: db, revision: 7, rowVersions: {}, queryCount: 1 };
  mocks.subset.mockResolvedValue(subset);
  mocks.selectors.mockResolvedValue({ ...subset, data: { ...db, tasks: [recovery] } });
  const result = await prepareTargetedCommit({ role: "Owner" } as AuthenticatedUser, 7, [
    { collection: "followups", upsert: [{ ...db.followups[0], status: "completed", completed_at: "2026-10-24T01:00:00Z" }] },
  ]);
  expect(mocks.selectors).toHaveBeenCalledWith({ jsonFieldValuesByCollection: { tasks: { source_followup_id: ["followup-1"] } } });
  expect(result?.operations.find((op) => op.collection === "tasks")?.upsert).toEqual([
    expect.objectContaining({ id: "task-1", status: "completed", source_followup_id: "followup-1" }),
  ]);
  expect(mocks.authorize).toHaveBeenCalledOnce();
});

test("a revision change during linked-record loading rejects the commit", async () => {
  const db = structuredClone(buildSeedDatabase());
  mocks.subset.mockResolvedValue({ data: db, revision: 7, rowVersions: {}, queryCount: 1 });
  mocks.selectors.mockResolvedValue({ data: db, revision: 8, rowVersions: {}, queryCount: 1 });
  await expect(prepareTargetedCommit({ role: "Owner" } as AuthenticatedUser, 7, [
    { collection: "followups", upsert: [{ id: "followup-1", status: "completed" }] },
  ])).rejects.toThrow("CONFLICT");
  expect(mocks.authorize).not.toHaveBeenCalled();
});
