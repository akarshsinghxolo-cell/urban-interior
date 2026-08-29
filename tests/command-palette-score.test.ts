import { describe, expect, test } from "vitest";
import { commandMatchScore, compareCommandMatches } from "../src/lib/rdash/command-palette-score";

describe("command palette match scoring", () => {
  const financeModule = { label: "Finance", group: "Modules", keywords: "vendor and contractor payables, collections" };
  const commissionsSubmodule = { label: "Commissions", group: "Finance" };
  const gstSubmodule = { label: "GST Returns", group: "Finance" };
  const vendorBills = { label: "Vendor Bills & Payments", group: "Finance" };

  test("an exact label match outranks same-priority group-name matches", () => {
    const exact = commandMatchScore(financeModule, "finance");
    const byGroup = commandMatchScore(commissionsSubmodule, "finance");
    expect(exact).toBe(100);
    expect(byGroup).toBe(40);
    expect(exact).toBeGreaterThan(byGroup);
  });

  test("group-name matches still surface for group browsing, ranked below label matches", () => {
    const scored = [financeModule, commissionsSubmodule, gstSubmodule, vendorBills]
      .map((item) => ({ item, score: commandMatchScore(item, "finance") }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => compareCommandMatches(
        { matchScore: a.score, groupPriority: 99, label: a.item.label },
        { matchScore: b.score, groupPriority: 99, label: b.item.label },
      ));
    expect(scored[0].item.label).toBe("Finance");
    // Every "Finance"-group submodule still appears — just after the module itself.
    expect(scored.map((entry) => entry.item.label)).toEqual(["Finance", "Commissions", "GST Returns", "Vendor Bills & Payments"]);
  });

  test("label prefix beats plain substring; keywords are the weakest tier", () => {
    expect(commandMatchScore({ label: "Customer Desk", group: "Modules" }, "cust")).toBe(80);
    expect(commandMatchScore({ label: "My Customers Overview", group: "Misc" }, "cust")).toBe(60);
    expect(commandMatchScore({ label: "Calendar", group: "Workspace", keywords: "schedule visits" }, "visit")).toBe(10);
    expect(commandMatchScore({ label: "Calendar", group: "Workspace" }, "visit")).toBe(-1);
  });

  test("lower groupPriority breaks score ties (records before modules)", () => {
    const record = { matchScore: 60, groupPriority: 5, label: "B" };
    const module_ = { matchScore: 60, groupPriority: 99, label: "A" };
    expect(compareCommandMatches(record, module_)).toBeLessThan(0);
  });

  test("blank queries never match", () => {
    expect(commandMatchScore(financeModule, "")).toBe(-1);
    expect(commandMatchScore(financeModule, "   ")).toBe(-1);
  });
});
