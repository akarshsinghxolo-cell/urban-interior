import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { canonicalAttendanceRecords } from "../src/lib/rdash/attendance-records";
import { assertWorkRequiredDefinition } from "../src/lib/rdash/customer-domain-rules";
import { canonicalContractorCapabilities, contractorRateProjection } from "../src/lib/rdash/contractor-profile";
import { acceptedScopeOverlapsCoverage } from "../src/lib/rdash/store/quotations-helpers";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { getCatalogIssues } from "../src/lib/rdash/work-category-master";
import type { AttendanceRecord } from "../src/lib/rdash/types";

describe("database discrepancy repairs", () => {
  test("attendance is counted once per staff/date and preserves the manually corrected row", () => {
    const base = { staff_id: "staff-1", date: "2026-08-29", status: "absent", created_at: "2026-08-29T08:00:00Z" };
    const records = canonicalAttendanceRecords([
      { ...base, id: "old-auto", auto_generated: true, updated_at: "2026-08-29T09:00:00Z" },
      { ...base, id: "new-auto", auto_generated: true, updated_at: "2026-08-29T10:00:00Z" },
      { ...base, id: "manual", auto_generated: false, status: "present", updated_at: "2026-08-29T09:30:00Z" },
    ] as AttendanceRecord[]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "manual", status: "present" });
  });

  test("accepted scope overlap respects partial areas and whole-scope coverage", () => {
    const scope = { work_required_id: "work-1", area_ids: ["area-a"], status: "contractor_bidding" as const };
    expect(acceptedScopeOverlapsCoverage(scope as any, { work_required_id: "work-1", area_ids: ["area-a"] })).toBe(true);
    expect(acceptedScopeOverlapsCoverage(scope as any, { work_required_id: "work-1", area_ids: ["area-b"] })).toBe(false);
    expect(acceptedScopeOverlapsCoverage(scope as any, { work_required_id: "work-1", area_ids: [] })).toBe(true);
    expect(acceptedScopeOverlapsCoverage({ ...scope, status: "cancelled" } as any, { work_required_id: "work-1", area_ids: ["area-a"] })).toBe(false);
  });

  test("taxonomy work requires a type and detailed alternatives must stay selected", () => {
    const db = {
      sites: [{ id: "site-1", customer_id: "customer-1" }],
      areas: [],
      master: {
        workCategories: [{ id: "cat-1" }],
        workSubcategories: [{ id: "sub-1", category_id: "cat-1", name: "Wardrobe", work_types: [{ id: "type-1", name: "Standard" }] }],
      },
    } as any;
    const base = { title: "Wardrobe", customer_id: "customer-1", site_id: "site-1", area_ids: [], work_subcategory_ids: ["sub-1"] };
    expect(() => assertWorkRequiredDefinition(db, { ...base, work_type_ids: [] })).toThrow(/select at least one Work Type/i);
    expect(() => assertWorkRequiredDefinition(db, {
      ...base,
      work_type_ids: ["type-1"],
      structured_items: [{ id: "line-1", title: "Other", quantity: 1, rate: 1, amount: 1, subcategory_id: "sub-2", work_type_id: "type-2" }],
    })).toThrow(/detailed work still uses an unticked/i);
  });

  test("current catalogue labels win over stale contractor copies", () => {
    const db = { master: {
      workSubcategories: [{ id: "sub-1", category_id: "cat-1", name: "Gypsum False Ceiling", work_types: [{ id: "type-1", name: "Standard", unit_id: "sqft" }] }],
      contractorRates: [],
    } } as any;
    const contractor = { id: "contractor-1", name: "Contractor", work_capabilities: [{
      subcategory_id: "sub-1", subcategory_name: "Old subcategory", work_type_rates: [{ work_type_id: "type-1", work_type_name: "standard old", labour_rate: 20 }],
    }] };
    expect(canonicalContractorCapabilities(contractor, db)[0]).toMatchObject({
      subcategory_name: "Gypsum False Ceiling",
      work_type_rates: [{ work_type_name: "Standard" }],
    });
    expect(contractorRateProjection(db, contractor)[0]).toMatchObject({ work_subcategory_name: "Gypsum False Ceiling", work_type_name: "Standard" });
  });

  test("same-named services in different categories are flagged for review, not merged", () => {
    const master = structuredClone(buildSeedDatabase().master);
    const source = master.workSubcategories[0];
    const otherCategory = master.workCategories.find((category) => category.id !== source.category_id)!;
    master.workSubcategories.push({ ...source, id: "review-duplicate", category_id: otherCategory.id });

    expect(getCatalogIssues(master)).toContainEqual(expect.objectContaining({
      severity: "warning",
      message: expect.stringMatching(/Review shared service identity/),
    }));
  });

  test("migration preserves evidence and enforces the repaired contracts", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261023141147_repair_database_discrepancies.sql", import.meta.url), "utf8");
    expect(sql).toContain("deduplicated_record_ids");
    expect(sql).toContain("entity_attendance_workspace_staff_date_uidx");
    expect(sql).toContain("entity_quotations_workspace_active_number_uidx");
    expect(sql).toContain("SESSION_EXPIRED");
    expect(sql).toContain("jsonb_array_length(data -> 'work_subcategory_ids') = 0");
  });
});
