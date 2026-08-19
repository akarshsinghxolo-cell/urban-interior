import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const quickActionsPath = "src/components/rdash/QuickActionsToolbar.tsx";
const quickAddPath = "src/components/rdash/QuickAddSheet.tsx";
const appPath = "src/components/rdash/RDashApp.tsx";

function runtimeSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return runtimeSourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test("Quick Actions toolbar and its global shortcuts are removed", () => {
  expect(existsSync(quickActionsPath)).toBe(false);

  const app = readFileSync(appPath, "utf8");
  expect(app.includes("QuickActionsToolbar")).toBe(false);
  expect(app.includes("Quick actions toolbar")).toBe(false);
  expect(app.includes("Alt+1-6")).toBe(false);
});

test("runtime source contains no Quick Actions feature mount or label", () => {
  const forbidden = [
    "QuickActionsToolbar",
    'aria-label="Quick actions"',
    ">Quick actions<",
    "Alt+1-6",
  ];

  for (const path of runtimeSourceFiles("src")) {
    const source = readFileSync(path, "utf8");
    for (const token of forbidden) {
      expect(source.includes(token), `${path} still contains ${token}`).toBe(false);
    }
  }
});

test("Quick Add remains available as the separate mobile create workflow", () => {
  expect(existsSync(quickAddPath)).toBe(true);
  const app = readFileSync(appPath, "utf8");
  expect(app.includes("QuickAddSheet")).toBe(true);
  expect(app.includes('aria-label="Quick add"')).toBe(true);
});
