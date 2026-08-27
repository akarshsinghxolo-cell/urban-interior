import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MODULE_GROUPS } from "@/lib/rdash/modules";

test("places Customer Desk first and keeps Sort before Filter", () => {
  const workspace = MODULE_GROUPS.find((group) => group.id === "workspace");
  expect(workspace?.modules.slice(0, 2).map((module) => module.id)).toEqual([
    "customerDesk",
    "workdesk",
  ]);

  const source = readFileSync(
    "src/components/rdash/modules/CustomerDesk.tsx",
    "utf8",
  );
  expect(source.indexOf('aria-label="Sort customers"')).toBeLessThan(
    source.indexOf('aria-label="Filter customers"'),
  );
});
