import { describe, expect, test } from "bun:test";

const source = await Bun.file("src/components/rdash/modules/WorkCategoryMasterModule.tsx").text();

describe("Work & Rate Master category controls", () => {
  test("uses the Sub category label consistently", () => {
    expect(source).toContain('> Sub category</Button>');
    expect(source).toContain('label="Sub categories"');
    expect(source).not.toContain("Add submodule");
    expect(source).not.toContain("Submodules");
  });

  test("renames sub categories from a pencil action instead of an always-visible input", () => {
    expect(source).toContain("const [editingName, setEditingName] = React.useState(false)");
    expect(source).toContain('aria-label={`Rename ${work.name}`}');
    expect(source).toContain("editingName ? (<Input autoFocus");
    expect(source).not.toContain('<div className="mt-3"><Input defaultValue={work.name}');
  });
});
