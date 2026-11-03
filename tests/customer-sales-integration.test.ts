import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { effectiveWorkRequiredStatus, evaluateWorkRequiredTransition } from "../src/lib/rdash/work-required-lifecycle";
import { customerMaterialOptions } from "../src/lib/rdash/customer-material-options";
import { ALL_MODULES } from "../src/lib/rdash/modules";

function fixture() {
  const db = buildSeedDatabase();
  db.visits = []; db.measurementRevisions = []; db.quotations = []; db.acceptedScopes = []; db.workOrders = [];
  const work = { ...db.workRequired[0], id: "auto-work", status: "new" as const, area_ids: ["auto-area"] };
  db.workRequired = [work];
  return { db, work };
}

describe("Customer-owned sales", () => {
  test("keeps legacy routes registered as Customer Desk children, not separate modules", () => {
    expect(ALL_MODULES.some((module) => module.id === "salesPipeline")).toBe(false);
    expect(ALL_MODULES.find((module) => module.id === "customerDesk")?.submodules.map((module) => module.id)).toEqual(expect.arrayContaining(["salesPipeline", "lostClosedReview"]));
  });
  test("advances from real linked evidence without mutating records", () => {
    const { db, work } = fixture();
    db.measurementRevisions = [{ id: "m", site_id: work.site_id, area_id: "auto-area", revision_no: 1, unit: "ft", captured_at: "2026-11-03", photo_count: 0, status: "verified" }];
    expect(effectiveWorkRequiredStatus(db, work)).toBe("measurement_done");
    const quote = { ...buildSeedDatabase().quotations[0], id: "q", status: "draft" as const, coverage: [{ id: "c", work_required_id: work.id, area_ids: [], measurement_revision_ids: [], coverage_label: "Work", status: "proposed" as const }] };
    db.quotations = [quote];
    expect(effectiveWorkRequiredStatus(db, work)).toBe("quotation_in_progress");
    db.quotations[0].status = "sent";
    expect(effectiveWorkRequiredStatus(db, work)).toBe("quotation_sent");
    expect(evaluateWorkRequiredTransition(db, { ...work, status: "on_hold" }, "quotation_sent")).toEqual({ allowed: true, requiresReason: true });
    db.quotations[0].status = "accepted";
    expect(effectiveWorkRequiredStatus(db, work)).toBe("accepted");
    expect(work.status).toBe("new");
    expect(effectiveWorkRequiredStatus(db, { ...work, status: "on_hold" })).toBe("on_hold");
    expect(effectiveWorkRequiredStatus(db, { ...work, status: "lost" })).toBe("lost");
  });
  test("does not advance from cancelled or unrelated quotations, or call partially completed jobs done", () => {
    const { db, work } = fixture();
    const seed = buildSeedDatabase();
    db.quotations = [{ ...seed.quotations[0], status: "cancelled", coverage: [{ id: "c", work_required_id: work.id, area_ids: [], measurement_revision_ids: [], coverage_label: "", status: "declined" }] }];
    expect(effectiveWorkRequiredStatus(db, work)).toBe("new");
    db.workOrders = ["completed", "in_progress"].map((status, index) => ({ ...seed.workOrders[0], id: `order-${index}`, work_required_ids: [work.id], status: status as "completed" | "in_progress" }));
    expect(effectiveWorkRequiredStatus(db, work)).toBe("in_progress");
  });
  test("material choices come only from the customer's scoped catalogue and enabled variants", () => {
    const { db, work } = fixture();
    const sub = db.master.workSubcategories.find((sub) => db.master.subcategoryArticleMap.some((scope) => scope.work_required_id === sub.id))!;
    work.work_subcategory_ids = [sub.id];
    const scope = db.master.subcategoryArticleMap.find((scope) => scope.work_required_id === sub.id)!;
    db.master.articleVariants = [{ id: "v", article_id: scope.article_id, name: "Selected brand", enabled: true }, { id: "off", article_id: scope.article_id, name: "Unavailable", enabled: false }];
    const groups = customerMaterialOptions(db, work.customer_id);
    expect(groups.map((group) => group.id)).toEqual([sub.id]);
    expect(groups.flatMap((group) => group.options).some((option) => option.name.includes("Selected brand"))).toBe(true);
    expect(groups.flatMap((group) => group.options).some((option) => option.name.includes("Unavailable"))).toBe(false);
    expect(customerMaterialOptions(db, "different-customer")).toEqual([]);
  });
});
