import { expectTokens } from "./helpers/source-contract";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MODULE_ROUTE_REGISTRY } from "../src/lib/rdash/modules";
import { LEGACY_MODULE_ALIASES } from "../src/lib/rdash/module-aliases";

/**
 * Every literal `setActiveModule("<id>")` in src/** must target a module that
 * actually exists in the route registry (or a legacy alias). Dead ids silently
 * fell back to the Workdesk and shipped unnoticed — this scan makes the class
 * of bug fail CI instead (Task 27: procurement, financeOverview,
 * paymentRecovery, sitesExecution, quotations and two "today" chips).
 */
const SRC_ROOT = "src";
const SOURCE_FILE_PATTERN = /\.(tsx?|mts|cts)$/;
const LITERAL_SET_ACTIVE_MODULE = /setActiveModule\(\s*"([^"]+)"\s*\)/g;

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (SOURCE_FILE_PATTERN.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isKnownModuleId(id: string): boolean {
  return MODULE_ROUTE_REGISTRY.has(id) || id in LEGACY_MODULE_ALIASES;
}

describe("module navigation ids", () => {
  test("every literal setActiveModule target is a registered module id or legacy alias", () => {
    const offenders: Array<{ file: string; moduleId: string }> = [];
    let literalCallSites = 0;
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(LITERAL_SET_ACTIVE_MODULE)) {
        literalCallSites += 1;
        if (!isKnownModuleId(match[1])) offenders.push({ file, moduleId: match[1] });
      }
    }
    // The scan must actually see the navigation surface — guard against the
    // pattern or the source tree silently drifting away.
    expect(literalCallSites).toBeGreaterThan(40);
    expect(
      offenders.map(({ file, moduleId }) => `${file}: ${moduleId}`),
    ).toEqual([]);
  });

  test("the retired dead module ids never reappear in the registry or aliases", () => {
    const retiredIds = [
      "procurement",
      "financeOverview",
      "paymentRecovery",
      "sitesExecution",
      "quotations",
      "today",
    ];
    for (const id of retiredIds) {
      expect(MODULE_ROUTE_REGISTRY.has(id)).toBe(false);
      expect(id in LEGACY_MODULE_ALIASES).toBe(false);
    }
  });

  test("the corrected call sites navigate to their canonical modules", () => {
    const replacements: Array<[string, string]> = [
      ["src/components/rdash/ExceptionDashboard.tsx", 'setActiveModule("procurementInventory")'],
      ["src/components/rdash/modules/RateFinderModule.tsx", 'setActiveModule("quotationDesk")'],
      [
        "src/components/rdash/WorkspaceHealthWidget.tsx",
        'onClick={() => setActiveModule("financeDesk")}',
      ],
      [
        "src/components/rdash/WorkspaceHealthWidget.tsx",
        'onClick={() => setActiveModule("payments")}',
      ],
      [
        "src/components/rdash/WorkspaceHealthWidget.tsx",
        'onClick={() => setActiveModule("siteExecution")}',
      ],
      [
        "src/components/rdash/WorkspacePulseStrip.tsx",
        'onClick={() => setActiveModule("siteExecution")}',
      ],
    ];
    for (const [file, expected] of replacements) {
      expect(readFileSync(file, "utf8")).toContain(expected);
    }
  });

  test('"today" chips deep-link through the task-scope intent into Tasks', () => {
    for (const file of [
      "src/components/rdash/WorkspaceHealthWidget.tsx",
      "src/components/rdash/WorkspacePulseStrip.tsx",
    ]) {
      const text = readFileSync(file, "utf8");
      expectTokens(text, ['setTaskScopeIntent("today"); setActiveModule("tasks");']);
      expect(text).not.toContain('setActiveModule("today")');
    }
  });
});
