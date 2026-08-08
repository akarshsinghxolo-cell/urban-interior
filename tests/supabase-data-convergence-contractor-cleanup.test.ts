import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260808120000_remove_contractor_legacy_rate_compatibility.sql";

describe("Contractor database legacy removal", () => {
  test("projects Contractor rates only from work_capabilities", async () => {
    const migration = await Bun.file(MIGRATION).text();
    expect(migration).toContain("p_contractor -> 'work_capabilities'");
    expect(migration).not.toContain("p_contractor -> 'capabilities_v2'");
    expect(migration).toContain("Builds Contractor rate read rows exclusively from canonical work_capabilities");
  });

  test("does not preserve free-form rate rows for touched Contractors", async () => {
    const migration = await Bun.file(MIGRATION).text();
    expect(migration).toContain("Every rate row for a touched Contractor must belong to the canonical");
    expect(migration).toContain("if v_contractor_id = any(v_affected_ids) then");
    expect(migration).not.toContain("v_subcategory_id is not null");
    expect(migration).toContain("free-form legacy rates are not preserved");
  });

  test("cleans persisted compatibility keys and unmapped rate rows", async () => {
    const migration = await Bun.file(MIGRATION).text();
    expect(migration).toContain("data = c.data - 'capabilities_v2'");
    expect(migration).toContain("and c.data ? 'capabilities_v2'");
    expect(migration).toContain("work_subcategory_id");
    expect(migration).toContain("is null;");
    expect(migration).toContain("is_baseline");
  });
});
