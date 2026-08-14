import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const MIGRATION = "supabase/migrations/20260808120000_remove_contractor_legacy_rate_compatibility.sql";

describe("Contractor database legacy removal", () => {
  test("projects Contractor rates only from work_capabilities", async () => {
    const migration = await testFile(MIGRATION).text();
    expect(migration).toContain("p_contractor -> 'work_capabilities'");
    expect(migration).not.toContain("p_contractor -> 'capabilities_v2'");
    expect(migration).toContain("Builds Contractor rate read rows exclusively from canonical work_capabilities");
  });

  test("does not preserve free-form rate rows for touched Contractors", async () => {
    const migration = await testFile(MIGRATION).text();
    expect(migration).toContain("CONTRACTOR_RATES_READ_ONLY");
    expect(migration).toContain("v_has_rate_operation boolean := false");
    expect(migration).not.toContain("v_preserved_rate_rows");
    expect(migration).toContain("caller-supplied rate rows are discarded");
  });

  test("cleans persisted compatibility keys and unmapped rate rows", async () => {
    const migration = await testFile(MIGRATION).text();
    expect(migration).toContain("data = c.data - 'capabilities_v2'");
    expect(migration).toContain("and c.data ? 'capabilities_v2'");
    expect(migration).toContain("work_subcategory_id");
    expect(migration).toContain("is null;");
    expect(migration).toContain("is_baseline");
  });
});