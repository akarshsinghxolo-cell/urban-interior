import { expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createEmptyWorkspaceDatabase } from "../src/lib/rdash/workspace-session-merge";
import { rowsFor } from "../src/lib/rdash/server/rows";
import type { WorkspaceReadPlan } from "../src/lib/rdash/server/workspace";

const mock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../src/lib/rdash/server/workspace", () => ({ getWorkspaceSubset: mock.read }));

import { prepareTargetedCommit } from "../src/lib/rdash/server/targeted-commit";

test("a targeted task save loads its canonical Staff and typed linked parent", async () => {
  const source = buildSeedDatabase();
  const quote = source.quotations[0];
  const staff = source.master.staff[0];
  mock.read.mockImplementation(async (plan: WorkspaceReadPlan) => {
    const data = createEmptyWorkspaceDatabase();
    const collections = new Set([...(plan.fullCollections || []), ...Object.keys(plan.rowsByCollection || {})]);
    for (const collection of collections) {
      const ids = plan.rowsByCollection?.[collection];
      const rows = rowsFor(source, collection).filter((row) => !ids || ids.includes(String(row.id)));
      if (collection.startsWith("master.")) Object.assign(data.master, { [collection.slice(7)]: rows });
      else Object.assign(data, { [collection]: rows });
    }
    return { data, revision: 7, rowVersions: {}, updatedAt: "2026-10-27", queryCount: 1 };
  });
  const result = await prepareTargetedCommit({ userId: "owner", email: "owner@example.test", name: "Owner", role: "Owner", expiresAt: 9_999_999_999 }, 7, [{ collection: "tasks", upsert: [{
    ...source.tasks[0], id: "targeted-registry-task", customer_id: quote.customer_id, site_id: quote.site_id,
    work_order_id: undefined, work_required_id: undefined, po_id: undefined, visit_id: undefined,
    quotation_id: undefined, linked_record_type: "quotation", linked_record_id: quote.id, assigned_staff_id: staff.id,
  }] }]);
  expect(result).not.toBeNull();
  const plans = mock.read.mock.calls.map(([plan]) => plan as WorkspaceReadPlan);
  expect(plans.some((plan) => plan.rowsByCollection?.["master.staff"]?.includes(staff.id))).toBe(true);
  expect(plans.some((plan) => plan.rowsByCollection?.quotations?.includes(quote.id))).toBe(true);
});
