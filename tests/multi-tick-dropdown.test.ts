import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
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

  test("wraps long option labels instead of truncating them", () => {
    const source = readFileSync(new URL("../src/components/rdash/MultiTickDropdown.tsx", import.meta.url), "utf8");
    expect(source).toContain("whitespace-normal break-words leading-4");
    expect(source).not.toContain('className="min-w-0 truncate" title={item.name}');
  });
});
