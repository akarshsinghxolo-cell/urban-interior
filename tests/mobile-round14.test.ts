import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Tab close undo", () => {
  test("restoreTabs store action reinstates a pre-close snapshot", async () => {
    const types = await source("src/lib/rdash/store/types.ts");
    expectTokens(types, ["restoreTabs: (tabs: WorkspaceTab[], activeTabId: string) => void;"]);
    const ui = await source("src/lib/rdash/store/slices/ui.ts");
    expectTokens(ui, ["restoreTabs: (tabs, activeTabId)"]);
    // Must reject empty snapshots and re-resolve the active module renderer.
    expectTokens(ui, ["if (!Array.isArray(tabs) || tabs.length === 0) return {};"]);
  });

  test("both close paths announce an Undo toast in WorkspaceTabs", async () => {
    const tabs = await source("src/components/rdash/WorkspaceTabs.tsx");
    expect(tabs).toContain("restoreTabs");
    expectTokens(tabs, ['label: "Undo"']);
    // Single-tab close and the close-others pill both announce.
    expectTokens(tabs, ["announceClose(snapshot, closedLabel, 1)"]);
    expectTokens(tabs, ['announceClose(snapshot, "", closedCount)']);
    expectTokens(tabs, ["duration: 6000"]);
  });
});

describe("Audit log render window", () => {
  test("rows are windowed with a Load-more affordance; exports stay full-fidelity", async () => {
    const mod = await source("src/components/rdash/modules/AuditLogModule.tsx");
    expectTokens(mod, ["const RENDER_CHUNK = 100;"]);
    expect(mod).toContain("groupedVisible");
    expectTokens(mod, ["Load more ("]);
    expectTokens(mod, ["export always includes the full filtered set"]);
    // Window resets when filters change.
    expect(mod).toContain("setVisibleCount(RENDER_CHUNK);");
    // The superseded full-list render must be gone.
    expect(mod).not.toContain("{grouped.map(");
  });
});

describe("Module history learns the restored tab", () => {
  test("boot seeds moduleHistory with the restored active module", async () => {
    const raw = await source("src/lib/rdash/raw-store.ts");
    expect(raw).toContain("restoredHistoryEntry");
    expectTokens(raw, ["moduleHistoryIndex: restoredHistoryEntry ? 1 : 0"]);
  });
});
