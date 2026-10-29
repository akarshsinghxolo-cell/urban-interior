import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("workspace clutter cleanup", () => {
  test("report quick links select an in-page report instead of navigating to fake modules", () => {
    const source = read("src/components/rdash/modules/ReportsModule.tsx");
    expect(source).toContain("onSelectReport(id as string)");
    expect(source).not.toContain("useRDashStore.getState().setActiveModule(id as string)");

    for (const reportId of [
      "staffProductivity",
      "quotationConversion",
      "leadSourceReport",
      "visitCompliance",
      "taskThroughput",
    ]) {
      expect(source.match(new RegExp(`case "${reportId}"`, "g"))?.length).toBe(3);
    }
  });

  test("settings exposes only safe registered destinations", () => {
    const source = read("src/components/rdash/modules/GenericModule.tsx");
    expect(source).not.toContain("ResetWorkspaceControl");
    expect(source).not.toContain('setActiveModule("usersRoles")');
    expect(source).not.toContain('setActiveModule("threads")');
    expect(source).toContain('setActiveModule("integrity")');
  });

  test("workspace navigation limits automatic tab buildup", () => {
    const source = read("src/lib/rdash/store/slices/ui.ts");
    expect(source).toContain("const MAX_OPEN_MODULE_TABS = 5");
    expect(source).toContain("[...state.tabs, tab].slice(-MAX_OPEN_MODULE_TABS)");
  });

  test("secondary report and maintenance routes remain searchable but leave the sidebar", () => {
    const modules = read("src/lib/rdash/modules.ts");
    const sidebar = read("src/components/rdash/Sidebar.tsx");
    for (const id of ["salesAnalytics", "collectionAnalytics", "operationsAnalytics", "financialAnalytics", "auditLog", "dataImport", "dataExport", "integrity"]) {
      expect(modules).toMatch(new RegExp(`id: "${id}"[\\s\\S]{0,120}showInSidebar: false`));
    }
    expect(sidebar).toContain("submodule.showInSidebar !== false");
  });
});
