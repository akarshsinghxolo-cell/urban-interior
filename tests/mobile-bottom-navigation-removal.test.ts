import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { expectNoTokens, expectTokens } from "./helpers/source-contract";

const appPath = "src/components/rdash/RDashApp.tsx";
const headerPath = "src/components/rdash/WorkspaceHeader.tsx";
const sidebarPath = "src/components/rdash/Sidebar.tsx";

test("mobile bottom navigation panel is removed from the app shell", () => {
  const app = readFileSync(appPath, "utf8");

  expectNoTokens(app, ['aria-label="Mobile priority actions"']);
  expectNoTokens(app, ['label: "Customers"']);
  expectNoTokens(app, ['label: "Visits"']);
  expectNoTokens(app, ['label: "Tasks"']);
  expectNoTokens(app, ['label: "Workdesk"']);
  expect(app.includes("<span>More</span>")).toBe(false);
  expect(app.includes("activeModuleId")).toBe(false);
  expect(app.includes("setMobileNavOpen")).toBe(false);
  expect(app.includes("indiaBusinessDate")).toBe(false);
  expectNoTokens(app, ["pb-32 lg:pb-0"]);
  expectNoTokens(app, ["calc(96px + env(safe-area-inset-bottom, 0px))"]);
});

test("top-left mobile sidebar navigation remains available", () => {
  const header = readFileSync(headerPath, "utf8");
  const sidebar = readFileSync(sidebarPath, "utf8");

  expect(header.includes("setMobileNavOpen(true)")).toBe(true);
  expectTokens(header, ['aria-label="Open navigation"']);
  expect(sidebar.includes("mobileNavOpen")).toBe(true);
  expect(sidebar.includes("setMobileNavOpen(false)")).toBe(true);
});

test("mobile sidebar uses one header action instead of overlapping close and collapse buttons", () => {
  const sidebar = readFileSync(sidebarPath, "utf8");

  expectTokens(sidebar, ["function SidebarContent({ collapsed, onMobileClose }"]);
  expectTokens(sidebar, ["{onMobileClose ? ("]);
  expectTokens(sidebar, ['<X className="', "h-5", "w-5", '" />']);
  expectTokens(sidebar, ["<SidebarContent onMobileClose={() => setMobileNavOpen(false)} />"]);
  expectNoTokens(sidebar, ['className="absolute right-3 top-3 z-10']);
  expectTokens(sidebar, ['aria-label="Collapse sidebar"']);
});

test("Quick Add remains separate and is repositioned for the removed bottom bar", () => {
  const app = readFileSync(appPath, "utf8");

  expectTokens(app, ['aria-label="Quick add"']);
  expect(app.includes("QuickAddSheet")).toBe(true);
  expectTokens(app, ["calc(16px + env(safe-area-inset-bottom, 0px))"]);
});
