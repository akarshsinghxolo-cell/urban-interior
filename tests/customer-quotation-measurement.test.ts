import { describe, expect, test } from "vitest";
import { unverifiedAreaIdsForWork, verifiedMeasurementRevisionIds } from "../src/components/rdash/customer/CustomerQuotationDialog";
import type { MeasurementRevision, WorkRequired } from "../src/lib/rdash/types";

const work: Pick<WorkRequired, "id" | "area_ids"> = {
  id: "work-1",
  area_ids: ["hall", "bedroom", "study"],
};

const revision = (overrides: Partial<MeasurementRevision>): MeasurementRevision => ({
  id: "measurement-1",
  site_id: "site-1",
  area_id: "hall",
  work_required_id: "work-1",
  revision_no: 1,
  unit: "ft",
  captured_at: "2026-10-25T00:00:00.000Z",
  photo_count: 0,
  status: "verified",
  ...overrides,
});

describe("quotation measurement readiness", () => {
  test("reports only rooms without a verified revision for the selected site and work", () => {
    const db = {
      measurementRevisions: [
        revision({ id: "hall-verified", area_id: "hall" }),
        revision({ id: "bedroom-superseded", area_id: "bedroom", status: "superseded" }),
        revision({ id: "study-other-work", area_id: "study", work_required_id: "work-2" }),
        revision({ id: "study-other-site", area_id: "study", site_id: "site-2" }),
      ],
    };

    expect(unverifiedAreaIdsForWork(db, "site-1", work)).toEqual(["bedroom", "study"]);
    expect(verifiedMeasurementRevisionIds(db, "site-1", work)).toEqual(["hall-verified"]);
  });

  test("becomes quotation-ready after the in-place verified revision is saved", () => {
    const db = { measurementRevisions: [
      revision({ id: "hall-verified", area_id: "hall" }),
      revision({ id: "bedroom-verified", area_id: "bedroom" }),
      revision({ id: "study-verified", area_id: "study" }),
    ] };

    expect(unverifiedAreaIdsForWork(db, "site-1", work)).toEqual([]);
    expect(verifiedMeasurementRevisionIds(db, "site-1", work)).toEqual([
      "hall-verified",
      "bedroom-verified",
      "study-verified",
    ]);
  });
});
