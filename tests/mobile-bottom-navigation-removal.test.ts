import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const appPath = "src/components/rdash/RDashApp.tsx";
const headerPath = "src/components/rdash/WorkspaceHeader.tsx";
const sidebarPath = "src/components/rdash/Sidebar.tsx";

test("mobile bottom navigation panel is removed from the app shell", () => {
  const app = readFileSync(appPath, "utf8");

  expect(app.includes('aria-label="Mobile priority actions"')).toBe(false);
  expect(app.includes('label: "Customers"')).toBe(false);
  expect(app.includes('label: "Visits"')).toBe(false);
  expect(app.includes('label: "Tasks"')).toBe(false);
  expect(app.includes('label: "Workdesk"')).toBe(false);
  expect(app.includes('<span>More</span>')).toBe(false);
  expect(app.includes("activeModuleId")).toBe(false);
  expect(app.includes("setMobileNavOpen")).toBe(false);
  expect(app.includes("indiaBusinessDate")).toBe(false);
  expect(app.includes("pb-32 lg:pb-0")).toBe(false);
  expect(app.includes("calc(96px + env(safe-area-inset-bottom, 0px))")).toBe(false);
});

test("top-left mobile sidebar navigation remains available", () => {
  const header = readFileSync(headerPath, "utf8");
  const sidebar = readFileSync(sidebarPath, "utf8");

  expect(header.includes("setMobileNavOpen(true)")).toBe(true);
  expect(header.includes('aria-label="Open navigation"')).toBe(true);
  expect(sidebar.includes("mobileNavOpen")).toBe(true);
  expect(sidebar.includes("setMobileNavOpen(false)")).toBe(true);
});

test("Quick Add remains separate and is repositioned for the removed bottom bar", () => {
  const app = readFileSync(appPath, "utf8");

  expect(app.includes('aria-label="Quick add"')).toBe(true);
  expect(app.includes("QuickAddSheet")).toBe(true);
  expect(app.includes("calc(16px + env(safe-area-inset-bottom, 0px))")).toBe(true);
});
