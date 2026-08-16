from __future__ import annotations

import os
import subprocess
from pathlib import Path

BRANCH = "agent/nonblocking-module-loading"


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


def main() -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_WORKFLOW") != "Application CI":
        print("Quick create readiness refinement is CI-only; skipping outside Application CI.")
        return

    subprocess.run(["git", "fetch", "origin", BRANCH], check=True)
    subprocess.run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], check=True)

    readiness = Path("src/lib/rdash/workspace-create-readiness.ts")
    readiness.write_text(r'''import type { RDashDatabase } from "./types";
import type { CreateDialogKind } from "./store/ui-types";

const GLOBAL_QUICK_CREATE_REQUIREMENTS: Readonly<Partial<Record<CreateDialogKind, readonly string[]>>> = Object.freeze({
  quotation: Object.freeze(["customers", "sites", "workRequired"]),
  visit: Object.freeze(["customers", "sites", "workRequired", "master.vendors", "master.contractors"]),
});

export interface WorkspaceCreateReadiness {
  ready: boolean;
  reason?: string;
}

/**
 * Global quick-create controls must not interpret an omitted or row-scoped
 * collection as an authoritative empty selector. General Tasks/Follow-ups are
 * safe from bootstrap; Quotation/Visit require complete relationship lookups in
 * the current module snapshot. Contextual entity actions are intentionally not
 * routed through this helper because they already carry explicit entity IDs.
 */
export function workspaceGlobalCreateReadiness(
  database: RDashDatabase,
  kind: CreateDialogKind,
): WorkspaceCreateReadiness {
  const required = GLOBAL_QUICK_CREATE_REQUIREMENTS[kind];
  if (!required?.length) return { ready: true };

  const metadata = database as unknown as Record<string, unknown>;
  const strategy = String(metadata._workspace_read_strategy || "");
  const declared = metadata._workspace_read_collections;
  if (strategy === "row" || strategy === "bootstrap" || !Array.isArray(declared)) {
    return {
      ready: false,
      reason: "Required Customer/Site data is still loading for this screen.",
    };
  }

  const represented = new Set(
    declared.map((value) => String(value || "").trim()).filter(Boolean),
  );
  const missing = required.filter((collection) => !represented.has(collection));
  if (missing.length) {
    return {
      ready: false,
      reason: "Open a Customer/Site, Workdesk, Sales, Quotation, or Field module before using this shortcut.",
    };
  }
  return { ready: true };
}
''')

    app = "src/components/rdash/RDashApp.tsx"
    replace_once(app, 'import { WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS } from "@/lib/rdash/workspace-session-merge";\n', '')
    replace_once(app, 'const BOOTSTRAP_COLLECTION_SET = new Set<string>(WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS);\n', '')
    replace_once(
        app,
        '    const loadedCollections = React.useMemo(() => loadedWorkspaceCollections(db), [db]);\n'
        '    const hasOperationalSessionData = React.useMemo(() => {\n'
        '        const raw = (db as unknown as { _workspace_session_collections?: unknown })._workspace_session_collections;\n'
        '        if (!Array.isArray(raw)) return false;\n'
        '        return raw.some((value) => {\n'
        '            const collection = String(value || "").trim();\n'
        '            return Boolean(collection) && !BOOTSTRAP_COLLECTION_SET.has(collection);\n'
        '        });\n'
        '    }, [db]);\n',
        '    const loadedCollections = React.useMemo(() => loadedWorkspaceCollections(db), [db]);\n',
    )
    replace_once(
        app,
        '            {hasOperationalSessionData ? <QuickActionsToolbar /> : (\n'
        '              <div className="flex h-[53px] items-center gap-2 border-b border-border/50 py-2" aria-label="Quick actions are preparing">\n'
        '                <span className="h-8 w-24 animate-pulse rounded-lg bg-muted" aria-hidden="true"/>\n'
        '                <span className="h-8 w-28 animate-pulse rounded-lg bg-muted" aria-hidden="true"/>\n'
        '                <span className="hidden h-8 w-24 animate-pulse rounded-lg bg-muted sm:block" aria-hidden="true"/>\n'
        '              </div>\n'
        '            )}\n',
        '            <QuickActionsToolbar />\n',
    )
    replace_once(
        app,
        '          {hasOperationalSessionData ? (\n'
        '            <button type="button" aria-label="Quick add" onClick={() => setQuickAddOpen(true)} className="absolute bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 animate-pulse-ring lg:hidden" style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>\n'
        '              <Plus className="h-5 w-5"/>\n'
        '            </button>\n'
        '          ) : null}\n',
        '          <button type="button" aria-label="Quick add" onClick={() => setQuickAddOpen(true)} className="absolute bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 animate-pulse-ring lg:hidden" style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>\n'
        '            <Plus className="h-5 w-5"/>\n'
        '          </button>\n',
    )

    toolbar = "src/components/rdash/QuickActionsToolbar.tsx"
    replace_once(
        toolbar,
        'import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";\n',
        'import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";\n'
        'import { workspaceGlobalCreateReadiness } from "@/lib/rdash/workspace-create-readiness";\n',
    )
    replace_once(
        toolbar,
        '  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);\n  const setActiveModule = useRDashStore((state) => state.setActiveModule);\n',
        '  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);\n'
        '  const setActiveModule = useRDashStore((state) => state.setActiveModule);\n'
        '  const db = useRDashStore((state) => state.db);\n',
    )
    replace_once(
        toolbar,
        '      const action = ACTIONS[index];\n      if (action.kind) {\n        openCreateDialog({ kind: action.kind });\n',
        '      const action = ACTIONS[index];\n'
        '      if (action.kind) {\n'
        '        const readiness = workspaceGlobalCreateReadiness(useRDashStore.getState().db, action.kind);\n'
        '        if (!readiness.ready) return;\n'
        '        openCreateDialog({ kind: action.kind });\n',
    )
    replace_once(
        toolbar,
        '  const handleClick = (action: QuickAction) => {\n    if (action.kind) {\n      openCreateDialog({ kind: action.kind });\n',
        '  const handleClick = (action: QuickAction) => {\n'
        '    if (action.kind) {\n'
        '      const readiness = workspaceGlobalCreateReadiness(db, action.kind);\n'
        '      if (!readiness.ready) return;\n'
        '      openCreateDialog({ kind: action.kind });\n',
    )
    replace_once(
        toolbar,
        '        {ACTIONS.map((action) => {\n          const Icon = action.icon;\n          return (\n',
        '        {ACTIONS.map((action) => {\n'
        '          const Icon = action.icon;\n'
        '          const readiness = action.kind ? workspaceGlobalCreateReadiness(db, action.kind) : { ready: true };\n'
        '          return (\n',
    )
    replace_once(
        toolbar,
        '              onClick={() => handleClick(action)}\n              title={`${action.label} (Alt+${action.shortcut})`}\n              className="group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-accent"\n',
        '              onClick={() => handleClick(action)}\n'
        '              disabled={!readiness.ready}\n'
        '              title={readiness.ready ? `${action.label} (Alt+${action.shortcut})` : readiness.reason}\n'
        '              className="group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-card"\n',
    )

    sheet = "src/components/rdash/QuickAddSheet.tsx"
    replace_once(
        sheet,
        'import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";\n',
        'import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";\n'
        'import { workspaceGlobalCreateReadiness } from "@/lib/rdash/workspace-create-readiness";\n',
    )
    replace_once(
        sheet,
        '    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);\n    const handleSelect = React.useCallback((kind: CreateDialogKind) => {\n        openCreateDialog({ kind });\n        onOpenChange(false);\n    }, [openCreateDialog, onOpenChange]);\n',
        '    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);\n'
        '    const db = useRDashStore((s) => s.db);\n'
        '    const handleSelect = React.useCallback((kind: CreateDialogKind) => {\n'
        '        const readiness = workspaceGlobalCreateReadiness(db, kind);\n'
        '        if (!readiness.ready) return;\n'
        '        openCreateDialog({ kind });\n'
        '        onOpenChange(false);\n'
        '    }, [db, openCreateDialog, onOpenChange]);\n',
    )
    replace_once(
        sheet,
        '          {QUICK_OPTIONS.map((opt) => (<button key={opt.kind} type="button" onClick={() => handleSelect(opt.kind)} className="group relative flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">\n              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/60 text-[10px] font-bold text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">{opt.shortcut}</span>\n              <span className={"flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105 " + opt.tone}><opt.icon className="h-4 w-4"/></span>\n              <span className="text-sm font-semibold text-foreground">{opt.label}</span>\n              <span className="text-[10px] text-muted-foreground">{opt.desc}</span>\n            </button>))}\n',
        '          {QUICK_OPTIONS.map((opt) => {\n'
        '            const readiness = workspaceGlobalCreateReadiness(db, opt.kind);\n'
        '            return <button key={opt.kind} type="button" onClick={() => handleSelect(opt.kind)} disabled={!readiness.ready} title={readiness.ready ? opt.desc : readiness.reason} className="group relative flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-background disabled:hover:shadow-none">\n'
        '              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/60 text-[10px] font-bold text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">{opt.shortcut}</span>\n'
        '              <span className={"flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105 " + opt.tone}><opt.icon className="h-4 w-4"/></span>\n'
        '              <span className="text-sm font-semibold text-foreground">{opt.label}</span>\n'
        '              <span className="text-[10px] text-muted-foreground">{readiness.ready ? opt.desc : "Load the required module data first"}</span>\n'
        '            </button>;\n'
        '          })}\n',
    )

    test = "tests/workspace-bootstrap-scoped-flow.test.ts"
    replace_once(
        test,
        '    expect(app).not.toContain(\'readState.scope !== "bootstrap"\');\n'
        '    expect(app).toContain("hasOperationalSessionData");\n'
        '    expect(app).toContain("WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS");\n'
        '    expect(app).toContain("Quick actions are preparing");\n'
        '    expect(app).toContain("hasOperationalSessionData ? <QuickActionsToolbar />");\n',
        '    expect(app).not.toContain(\'readState.scope !== "bootstrap"\');\n'
        '    expect(app).toContain("<QuickActionsToolbar />");\n',
    )
    replace_once(
        test,
        '  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {',
        '  test("keeps global quick-create selectors closed until their current scoped lookups are authoritative", async () => {\n'
        '    const readiness = await testFile("src/lib/rdash/workspace-create-readiness.ts").text();\n'
        '    const toolbar = await testFile("src/components/rdash/QuickActionsToolbar.tsx").text();\n'
        '    const sheet = await testFile("src/components/rdash/QuickAddSheet.tsx").text();\n'
        '    expect(readiness).toContain(\'quotation: Object.freeze(["customers", "sites", "workRequired"])\');\n'
        '    expect(readiness).toContain(\'visit: Object.freeze(["customers", "sites", "workRequired", "master.vendors", "master.contractors"])\');\n'
        '    expect(readiness).toContain(\'strategy === "row" || strategy === "bootstrap"\');\n'
        '    expect(toolbar).toContain("workspaceGlobalCreateReadiness");\n'
        '    expect(toolbar).toContain("disabled={!readiness.ready}");\n'
        '    expect(sheet).toContain("workspaceGlobalCreateReadiness");\n'
        '    expect(sheet).toContain("disabled={!readiness.ready}");\n'
        '  });\n\n'
        '  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {',
    )

    print("Applied per-action global quick-create readiness refinement in CI working tree.")


if __name__ == "__main__":
    main()
