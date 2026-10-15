import { describe, expect, test } from "vitest";
import { filterMultiTickGroups, type MultiTickGroup } from "../src/components/rdash/MultiTickDropdown";

describe("shared multi-tick search", () => {
  const groups: MultiTickGroup[] = [
    { key: "ceiling", items: [{ id: "pvc", name: "PVC False Ceiling" }, { id: "grid", name: "Grid False Ceiling" }] },
    { key: "paint", items: [{ id: "texture", name: "Texture Paint" }] },
  ];

  test("filters every group case-insensitively while keeping an empty search unchanged", () => {
    expect(filterMultiTickGroups(groups, " ceiling ")).toEqual([
      { key: "ceiling", items: groups[0].items },
    ]);
    expect(filterMultiTickGroups(groups, "PVC")[0].items).toEqual([{ id: "pvc", name: "PVC False Ceiling" }]);
    expect(filterMultiTickGroups(groups, "")).toBe(groups);
  });
});
