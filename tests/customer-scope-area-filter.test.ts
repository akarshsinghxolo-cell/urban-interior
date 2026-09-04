import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer scope area filter (per-area work visibility)", () => {
  test("area chips are toggle filters with counts, not static labels", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).toContain("scopeAreaId");
    expect(desk).toContain("aria-pressed={active}");
    expectTokens(desk, ["setScopeAreaId(active ? null : area.id)"]);
    // Each chip shows how many works were captured in that area.
    expect(desk).toContain("areaWorkCount");
  });

  test("work list filters by the selected area's area_ids", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expectTokens(desk, ["work.area_ids || []).includes(scopeAreaId)"]);
    // Empty filtered state tells the user how to get back to the full list.
    expectTokens(desk, ["No Work Required in the selected area"]);
  });
});
