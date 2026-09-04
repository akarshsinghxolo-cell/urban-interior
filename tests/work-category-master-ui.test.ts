import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = await testFile("src/components/rdash/modules/WorkCategoryMasterModule.tsx").text();

describe("Work & Rate Master category controls", () => {
  test("uses the Sub category label consistently", () => {
    expectTokens(source, ["> Sub category</Button>"]);
    expectTokens(source, ['label="Sub categories"']);
    expectNoTokens(source, ["Add submodule"]);
    expect(source).not.toContain("Submodules");
  });

  test("renames sub categories from a pencil action instead of an always-visible input", () => {
    expectTokens(source, ["const [editingName, setEditingName] = React.useState(false)"]);
    expectTokens(source, ["aria-label={`Rename ${work.name}`}"]);
    expectTokens(source, ["editingName ? (<Input autoFocus"]);
    expectNoTokens(source, ['<div className="mt-3"><Input defaultValue={work.name}']);
  });
});
