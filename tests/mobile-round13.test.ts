import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { persistWorkspaceTabs, restoreWorkspaceTabs } from "../src/lib/rdash/tab-persistence";
import type { WorkspaceTab } from "../src/lib/rdash/store/ui-types";

const source = async (path: string) => testFile(path).text();

function tab(id: string, moduleId: string): WorkspaceTab {
  return { id, moduleId, label: moduleId, icon: "🧩" };
}

describe("workspace tab persistence (session scope)", () => {
  test("restores a persisted non-default tab set with validated entries", () => {
    const captured: Record<string, string> = {};
    const fakeStorage = {
      setItem: (k: string, v: string) => { captured[k] = v; },
      getItem: (k: string) => captured[k] ?? null,
      removeItem: (k: string) => { delete captured[k]; },
    };
    (globalThis as unknown as { window: unknown }).window = { sessionStorage: fakeStorage };
    const tabs = [tab("tab-today", "workdesk"), tab("tab-tasks", "tasks"), tab("tab-fin", "finance-overview")];
    try {
      persistWorkspaceTabs(tabs, "tab-fin");
      const restored = restoreWorkspaceTabs((moduleId) => ({ label: moduleId.toUpperCase(), icon: "🧩" }));
      expect(restored).not.toBeNull();
      expect(restored?.tabs.map((t) => t.id)).toEqual(["tab-today", "tab-tasks", "tab-fin"]);
      expect(restored?.activeTabId).toBe("tab-fin");
      // unknown moduleIds are dropped, fallback active = first tab
      const restored2 = restoreWorkspaceTabs((moduleId) => (moduleId === "tasks" ? { label: "Tasks", icon: "🗂️" } : null));
      expect(restored2?.tabs.map((t) => t.id)).toEqual(["tab-tasks"]);
      expect(restored2?.activeTabId).toBe("tab-tasks");
    } finally {
      delete (globalThis as unknown as Record<string, unknown>).window;
    }
  });

  test("labels are re-resolved from the module registry on restore, never trusted raw", async () => {
    const src = await source("src/lib/rdash/tab-persistence.ts");
    expect(src).toContain("resolveModule(entry.moduleId)");
    expect(src).toContain('sessionStorage.removeItem(KEY)');
  });

  test("the store restores persisted tabs on boot and persists on every tab-touching commit", async () => {
    const raw = await source("src/lib/rdash/raw-store.ts");
    expect(raw).toContain('restoreWorkspaceTabs');
    expectTokens(raw, ["persistWorkspaceTabs(merged.tabs, merged.activeTabId)"]);
    expect(raw).toContain("isRegisteredModuleId(moduleId)");
  });
});

describe("dormant components wired into the workspace", () => {
  test("OnboardingWizard is mounted in the authenticated app shell with dialog semantics", async () => {
    const app = await source("src/components/rdash/RDashApp.tsx");
    expectTokens(app, ["<OnboardingWizard />"]);
    const wizard = await source("src/components/rdash/OnboardingWizard.tsx");
    expect(wizard).toContain('role="dialog"');
    expect(wizard).toContain('aria-modal="true"');
    expect(wizard).toContain('uc_onboarding_completed');
    // Escape must dismiss (backdrop click alone is not keyboard accessible).
    expectTokens(wizard, ['if (event.key === "Escape")']);
  });

  test("CashFlowChart renders inside the Finance overview module", async () => {
    const finance = await source("src/components/rdash/modules/FinanceOverviewModule.tsx");
    expectTokens(finance, ['import { CashFlowChart } from "../CashFlowChart"']);
    expectTokens(finance, ["<CashFlowChart />"]);
  });

  test("ProfileNameEditor is offered in Settings → Active Role", async () => {
    const settings = await source("src/components/rdash/modules/GenericModule.tsx");
    expectTokens(settings, ['import { ProfileNameEditor } from "../ProfileNameEditor"']);
    expectTokens(settings, ["Signed in as <ProfileNameEditor />"]);
    // The backing endpoint must exist for the editor to function.
    const fs = await import("node:fs");
    expect(fs.existsSync("src/app/api/auth/profile/route.ts")).toBe(true);
  });

  test("ExceptionSummaryCard stays deleted (superseded by the mounted ExceptionDashboard)", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync("src/components/rdash/ExceptionSummaryCard.tsx")).toBe(false);
  });
});
