import { describe, expect, test } from "vitest";
import { quotationCoveredAreaIdsForDraft } from "../src/components/rdash/CustomerWorkRequiredDraftSection";
import { buildSeedDatabase } from "../src/lib/rdash/seed";

describe("customer editor quotation coverage", () => {
  test("pins quoted rooms from related Work Required rows sharing the selected work type", () => {
    const db = structuredClone(buildSeedDatabase());
    db.workRequired = [
      {
        id: "work-combined",
        customer_id: "customer-1",
        site_id: "site-1",
        title: "Gypsum False Ceiling · Standard / Hehsh",
        work_subcategory_ids: ["fc_gyp"],
        work_type_ids: ["wt-fc_gyp-standard", "wt-fc-gyp-hehsh"],
        area_ids: ["guest-room"],
        status: "new",
        priority: "medium",
        created_at: "2026-10-25T00:00:00.000Z",
        updated_at: "2026-10-25T00:00:00.000Z",
      },
      {
        id: "work-standard-hall",
        customer_id: "customer-1",
        site_id: "site-1",
        title: "Gypsum False Ceiling · Standard",
        work_subcategory_ids: ["fc_gyp"],
        work_type_ids: ["wt-fc_gyp-standard"],
        area_ids: ["hall"],
        status: "quotation_in_progress",
        priority: "medium",
        created_at: "2026-10-25T00:00:00.000Z",
        updated_at: "2026-10-25T00:00:00.000Z",
      },
    ];
    db.quotations = [{
      id: "quotation-1",
      quotation_no: "Q-25-10-26-Atri-0001",
      customer_id: "customer-1",
      site_id: "site-1",
      title: "Gypsum quotation",
      status: "draft",
      revision_no: 0,
      valid_until: "2026-11-25",
      subtotal: 100,
      tax_amount: 18,
      total_amount: 118,
      payment_terms: [],
      coverage: [{ id: "coverage-1", work_required_id: "work-standard-hall", area_ids: ["hall"], measurement_revision_ids: [], coverage_label: "Hall", status: "proposed" }],
      scope_lines: [],
      items: [],
      work_order_ids: [],
      created_at: "2026-10-25T00:00:00.000Z",
      updated_at: "2026-10-25T00:00:00.000Z",
    }];

    expect(quotationCoveredAreaIdsForDraft(db, "customer-1", {
      siteId: "site-1",
      workTypeIds: ["wt-fc_gyp-standard", "wt-fc-gyp-hehsh"],
    })).toEqual(["hall"]);
  });

  test("ignores cancelled quotations and unrelated work types", () => {
    const db = structuredClone(buildSeedDatabase());
    const work = db.workRequired[0];
    db.quotations = db.quotations.map((quotation) => ({ ...quotation, status: "cancelled" as const }));

    expect(quotationCoveredAreaIdsForDraft(db, work.customer_id, {
      siteId: work.site_id,
      workTypeIds: ["unrelated-work-type"],
    })).toEqual([]);
  });
});
