import { describe, expect, it } from "vitest";
import { MODULE_GROUPS } from "../src/lib/rdash/modules";
import { workspacePathForModule } from "../src/lib/rdash/workspace-routes";
import { workspaceEntityPath } from "../src/lib/rdash/workspace-entity-routes";

describe("quotation finance ownership", () => {
  it("owns Quotation Desk under Finance instead of Workspace", () => {
    const workspace = MODULE_GROUPS.find((group) => group.id === "workspace");
    const operations = MODULE_GROUPS.find((group) => group.id === "operations");
    const finance = operations?.modules.find((module) => module.id === "financeDesk");

    expect(workspace?.modules.some((module) => module.id === "quotationDesk")).toBe(false);
    expect(finance?.submodules.map((module) => module.id)).toContain("quotationDesk");
    expect(finance?.submodules.map((module) => module.id)).toContain("quotationConfig");
  });

  it("uses Finance-owned quotation URLs", () => {
    expect(workspacePathForModule("quotationDesk")).toBe("/workspace/finance/quotations");
    expect(workspacePathForModule("quotationConfig")).toBe("/workspace/finance/quotations/settings");
    expect(workspaceEntityPath("quotation", "q-1")).toBe("/workspace/finance/quotations/q-1");
  });
});
