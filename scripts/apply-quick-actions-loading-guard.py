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
        print("Quick action loading guard is CI-only; skipping outside Application CI.")
        return

    subprocess.run(["git", "fetch", "origin", BRANCH], check=True)
    subprocess.run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], check=True)

    path = "src/components/rdash/RDashApp.tsx"
    replace_once(
        path,
        'import { workspaceFoundationRevisionState } from "@/lib/rdash/workspace-foundation-revision-state";\n',
        'import { workspaceFoundationRevisionState } from "@/lib/rdash/workspace-foundation-revision-state";\n'
        'import { WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS } from "@/lib/rdash/workspace-session-merge";\n',
    )
    replace_once(
        path,
        'const StaffLocationTracker = React.lazy(() => import("./StaffLocationTracker").then((module) => ({ default: module.StaffLocationTracker })));\n',
        'const StaffLocationTracker = React.lazy(() => import("./StaffLocationTracker").then((module) => ({ default: module.StaffLocationTracker })));\n'
        'const BOOTSTRAP_COLLECTION_SET = new Set<string>(WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS);\n',
    )
    replace_once(
        path,
        '    const loadedCollections = React.useMemo(() => loadedWorkspaceCollections(db), [db]);\n',
        '    const loadedCollections = React.useMemo(() => loadedWorkspaceCollections(db), [db]);\n'
        '    const hasOperationalSessionData = React.useMemo(() => {\n'
        '        const raw = (db as unknown as { _workspace_session_collections?: unknown })._workspace_session_collections;\n'
        '        if (!Array.isArray(raw)) return false;\n'
        '        return raw.some((value) => {\n'
        '            const collection = String(value || "").trim();\n'
        '            return Boolean(collection) && !BOOTSTRAP_COLLECTION_SET.has(collection);\n'
        '        });\n'
        '    }, [db]);\n',
    )
    replace_once(
        path,
        '            <QuickActionsToolbar />\n',
        '            {hasOperationalSessionData ? <QuickActionsToolbar /> : (\n'
        '              <div className="flex h-[53px] items-center gap-2 border-b border-border/50 py-2" aria-label="Quick actions are preparing">\n'
        '                <span className="h-8 w-24 animate-pulse rounded-lg bg-muted" aria-hidden="true"/>\n'
        '                <span className="h-8 w-28 animate-pulse rounded-lg bg-muted" aria-hidden="true"/>\n'
        '                <span className="hidden h-8 w-24 animate-pulse rounded-lg bg-muted sm:block" aria-hidden="true"/>\n'
        '              </div>\n'
        '            )}\n',
    )
    replace_once(
        path,
        '          <button type="button" aria-label="Quick add" onClick={() => setQuickAddOpen(true)} className="absolute bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 animate-pulse-ring lg:hidden" style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>\n            <Plus className="h-5 w-5"/>\n          </button>\n',
        '          {hasOperationalSessionData ? (\n            <button type="button" aria-label="Quick add" onClick={() => setQuickAddOpen(true)} className="absolute bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 animate-pulse-ring lg:hidden" style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>\n              <Plus className="h-5 w-5"/>\n            </button>\n          ) : null}\n',
    )

    test_path = "tests/workspace-bootstrap-scoped-flow.test.ts"
    replace_once(
        test_path,
        '    expect(app).not.toContain(\'readState.scope !== "bootstrap"\');\n',
        '    expect(app).not.toContain(\'readState.scope !== "bootstrap"\');\n'
        '    expect(app).toContain("hasOperationalSessionData");\n'
        '    expect(app).toContain("WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS");\n'
        '    expect(app).toContain("Quick actions are preparing");\n'
        '    expect(app).toContain("hasOperationalSessionData ? <QuickActionsToolbar />");\n',
    )

    print("Applied quick action loading guard in CI working tree.")


if __name__ == "__main__":
    main()
