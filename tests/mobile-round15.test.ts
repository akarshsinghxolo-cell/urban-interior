import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Task overdue scope", () => {
  test("overdue is a first-class workspace task scope", async () => {
    const mod = await source("src/lib/rdash/workspace-task-scope.ts");
    expect(mod).toContain('"overdue"');
    // Invalid values must still canonicalize to All (guard the parser).
    expect(mod).toContain('return { scope: "all", explicit: true, valid: false };');
  });

  test("Tasks & Follow-ups filters overdue to open tasks past due and shows the scope tab", async () => {
    const tasks = await source("src/components/rdash/modules/TasksFollowups.tsx");
    expect(tasks).toContain('{ key: "overdue", label: "Overdue" }');
    // Overdue means: past due AND still open — completed tasks never resurface.
    expect(tasks).toContain(
      'case "overdue": return isDateOnlyOverdue(t.due_date) && (t.status === "todo" || t.status === "in_progress");',
    );
  });

  test("one-shot taskScopeIntent deep-link channel exists end to end", async () => {
    const types = await source("src/lib/rdash/store/types.ts");
    expect(types).toContain("taskScopeIntent: WorkspaceTaskScope | null;");
    expect(types).toContain("setTaskScopeIntent: (scope: WorkspaceTaskScope | null) => void;");
    const raw = await source("src/lib/rdash/raw-store.ts");
    expect(raw).toContain("taskScopeIntent: null,");
    const ui = await source("src/lib/rdash/store/slices/ui.ts");
    expect(ui).toContain("setTaskScopeIntent: (scope) => commitState({ taskScopeIntent: scope })");
    const tasks = await source("src/components/rdash/modules/TasksFollowups.tsx");
    // Applied idempotently when the module becomes frontmost (kept-alive
    // tabpanels) — NOT cleared at apply time (StrictMode double-mount would
    // consume it and drop it on the remount).
    expect(tasks).toContain("useRDashStore.getState().taskScopeIntent");
    expect(tasks).toContain("if (intent && applied !== intent) {");
    expect(tasks).toContain("if (activeWorkspaceModuleId !== moduleId)");
    expect(tasks).not.toContain("setTaskScopeIntent(null);\n        setScope(intent);");
    // Retired only when the applied intent no longer matches the visible scope.
    expect(tasks).toContain("if (applied && scope !== applied) {");
    // Mirrored into the address bar via the canonical module path (parent
    // history-sync effects run after children, so window.location.pathname
    // may still read /workspace at apply time).
    expect(tasks).toContain('window.location.pathname.startsWith("/workspace")');
    expect(tasks).toContain('workspaceUrlWithTaskScope(modulePath, window.location.search, intent)');
  });
});

describe("Hub focus chips are tap-through", () => {
  test("Due today / Overdue deep-link into Tasks with scope intents; Visits opens Calendar", async () => {
    const work = await source("src/components/rdash/modules/DailyWork.tsx");
    expect(work).toContain('setTaskScopeIntent("today"); setActiveModule("tasks");');
    expect(work).toContain('setTaskScopeIntent("overdue"); setActiveModule("tasks");');
    expect(work).toContain('setActiveModule("calendarRecurring")');
    // Chips render as real buttons (keyboard/touch reachable) with a chevron hint.
    expect(work).toContain('type="button" onClick={f.onClick}');
    expect(work).toContain("group-hover/focus:translate-x-0.5");
    // 44px touch target.
    expect(work).toContain("min-h-11");
  });

  test("revenue KPI shows a period-over-period delta", async () => {
    const work = await source("src/components/rdash/modules/DailyWork.tsx");
    expect(work).toContain("prevWeeklyRevenue");
    expect(work).toContain("% vs prev 7d");
    // Negative deltas read as danger, everything else success.
    expect(work).toContain('revenueDeltaPct < 0 ? "text-destructive" : "text-success"');
  });
});

describe("Offline banner", () => {
  test("banner tracks connectivity, reports queued edits and mounts in the header", async () => {
    const banner = await source("src/components/rdash/OfflineBanner.tsx");
    expect(banner).toContain('window.addEventListener("online", update)');
    expect(banner).toContain('window.addEventListener("offline", update)');
    expect(banner).toContain('role="status"');
    expect(banner).toContain("useWorkspaceOutbox()");
    expect(banner).toContain("Back online");
    // The offline message tells users their edits are safe on-device.
    expect(banner).toContain("saved on this device");
    const header = await source("src/components/rdash/WorkspaceHeader.tsx");
    expect(header).toContain("<OfflineBanner />");
  });
});

describe("Tab strip scroll affordance", () => {
  test("fade masks appear only on sides with off-screen tabs", async () => {
    const tabs = await source("src/components/rdash/WorkspaceTabs.tsx");
    expect(tabs).toContain("updateScrollEdges");
    expect(tabs).toContain("onScroll={updateScrollEdges}");
    // Left and right gradient masks, click-through and screen-reader silent.
    expect(tabs).toContain("pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-background");
    expect(tabs).toContain("pointer-events-none absolute inset-y-0 right-0 z-10 w-7 bg-gradient-to-l from-background");
    expect(tabs).toContain("strip.scrollLeft > 4");
  });
});
