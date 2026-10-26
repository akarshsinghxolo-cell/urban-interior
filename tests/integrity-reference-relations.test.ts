import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { checkWorkspaceIntegrity } from "../src/lib/rdash/integrity/checker";
import { cascadeDelete } from "../src/lib/rdash/integrity/cascade";
import { repairIntegrityIssues } from "../src/lib/rdash/integrity/repair";
import { introducedFkIntegrityIssues } from "../src/lib/rdash/server/integrity-delta";

describe("canonical references through shared tables and embedded records", () => {
  test("checks assigned_staff_id for tasks, follow-ups and visits", () => {
    const db = buildSeedDatabase();
    for (const collection of ["tasks", "followups", "visits"] as const) {
      db[collection][0].assigned_staff_id = "missing-staff";
    }
    const issues = checkWorkspaceIntegrity(db).issues.filter((issue) => issue.field === "assigned_staff_id");
    expect(issues.map((issue) => issue.collection).sort()).toEqual(["followups", "tasks", "visits"]);
  });

  test("checks and repairs nested scalar fields without creating dotted properties", () => {
    const db = buildSeedDatabase();
    db.vendorBills[0].three_way_match = {
      ...db.vendorBills[0].three_way_match,
      obstacle_id: "missing-obstacle",
    } as typeof db.vendorBills[number]["three_way_match"];
    const report = checkWorkspaceIntegrity(db);
    expect(report.issues).toContainEqual(expect.objectContaining({ collection: "vendorBills", field: "three_way_match.obstacle_id", targetId: "missing-obstacle" }));
    const repaired = repairIntegrityIssues(db).db;
    expect(repaired.vendorBills[0].three_way_match?.obstacle_id).toBeUndefined();
    expect(Object.hasOwn(repaired.vendorBills[0], "three_way_match.obstacle_id")).toBe(false);
    expect(db.vendorBills[0].three_way_match?.obstacle_id).toBe("missing-obstacle");
  });

  test("BOQ item references resolve to items and repair removes all missing array entries", () => {
    const db = buildSeedDatabase();
    const itemId = db.boqs[0].items[0].id;
    db.drawings[0].derived_boq_item_ids = [itemId, "missing-item-one", "missing-item-two"];
    const issues = checkWorkspaceIntegrity(db).issues.filter((issue) => issue.field === "derived_boq_item_ids");
    expect(issues.map((issue) => issue.targetId)).toEqual(["missing-item-one", "missing-item-two"]);
    expect(issues.every((issue) => issue.targetCollection === "boqItems")).toBe(true);
    expect(repairIntegrityIssues(db).db.drawings[0].derived_boq_item_ids).toEqual([itemId]);
  });

  test("cascade removes the parent ID from a child array while retaining other references", () => {
    const db = buildSeedDatabase();
    const work = db.workOrders[0];
    const retained = work.area_ids || [];
    db.areas.push({ ...db.areas[0], id: "fk-unused-area", site_id: work.site_id, name: "Unused area" });
    work.area_ids = [...retained, "fk-unused-area"];
    const deletion = cascadeDelete(db, "areas", "fk-unused-area");
    expect(deletion.result.success).toBe(true);
    expect(deletion.db.workOrders.find((row) => row.id === work.id)?.area_ids).toEqual(retained);
    expect(db.workOrders[0].area_ids).toContain("fk-unused-area");
  });

  test("embedded thread-message references are checked using the loaded owning collection", () => {
    const baseline = buildSeedDatabase();
    const candidate = structuredClone(baseline);
    candidate.visits[0].checkout_thread_message_id = "missing-message";
    expect(introducedFkIntegrityIssues(baseline, candidate, ["visits", "threads"])).toEqual([
      'visits.checkout_thread_message_id references missing threadMessages "missing-message".',
    ]);
    expect(introducedFkIntegrityIssues(baseline, candidate, ["visits"])).toEqual([]);
  });

  test("deleting a thread clears links to its embedded messages", () => {
    const db = buildSeedDatabase();
    const thread = db.threads.find((row) => row.messages.length > 0);
    if (!thread) throw new Error("Seed must include a thread message");
    db.visits[0].checkout_thread_message_id = thread.messages[0].id;
    const deletion = cascadeDelete(db, "threads", thread.id);
    expect(deletion.result.success).toBe(true);
    expect(deletion.db.visits[0].checkout_thread_message_id).toBeUndefined();
    expect(Object.hasOwn(deletion.db, "threadMessages")).toBe(false);
  });

  test("missing required parents are not advertised as safe automatic row deletions", () => {
    const db = buildSeedDatabase();
    db.master.articleVariants.push({ id: "missing-required-parent" } as typeof db.master.articleVariants[number]);
    expect(checkWorkspaceIntegrity(db).issues).toContainEqual(expect.objectContaining({
      collection: "master.articleVariants", recordId: "missing-required-parent", field: "article_id", autoFixable: false,
    }));
  });
});
