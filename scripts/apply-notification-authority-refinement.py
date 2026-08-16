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
        print("Notification authority refinement is CI-only; skipping outside Application CI.")
        return

    subprocess.run(["git", "fetch", "origin", BRANCH], check=True)
    subprocess.run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], check=True)

    path = "src/components/rdash/NotificationCenter.tsx"
    replace_once(
        path,
        '    const loadedSessionCollections = React.useMemo(() => {\n'
        '        const raw = (db as unknown as { _workspace_session_collections?: unknown })._workspace_session_collections;\n'
        '        return new Set(Array.isArray(raw)\n'
        '            ? raw.map((value) => String(value || "").trim()).filter(Boolean)\n'
        '            : []);\n'
        '    }, [db]);\n'
        '    const notificationCoverageComplete = NOTIFICATION_SOURCE_COLLECTIONS.every((collection) => loadedSessionCollections.has(collection));\n'
        '    const filterCoverageComplete = filter === "all"\n'
        '        ? notificationCoverageComplete\n'
        '        : loadedSessionCollections.has(NOTIFICATION_SOURCE_COLLECTION[filter]);\n',
        '    const notificationReadCoverage = React.useMemo(() => {\n'
        '        const metadata = db as unknown as { _workspace_read_collections?: unknown; _workspace_read_strategy?: unknown };\n'
        '        const raw = metadata._workspace_read_collections;\n'
        '        const collections = new Set(Array.isArray(raw)\n'
        '            ? raw.map((value) => String(value || "").trim()).filter(Boolean)\n'
        '            : []);\n'
        '        const strategy = String(metadata._workspace_read_strategy || "unknown");\n'
        '        const authoritative = strategy !== "row" && strategy !== "bootstrap" && strategy !== "unknown";\n'
        '        return { collections, authoritative };\n'
        '    }, [db]);\n'
        '    const notificationCoverageComplete = notificationReadCoverage.authoritative\n'
        '        && NOTIFICATION_SOURCE_COLLECTIONS.every((collection) => notificationReadCoverage.collections.has(collection));\n'
        '    const filterCoverageComplete = filter === "all"\n'
        '        ? notificationCoverageComplete\n'
        '        : notificationReadCoverage.authoritative\n'
        '            && notificationReadCoverage.collections.has(NOTIFICATION_SOURCE_COLLECTION[filter]);\n',
    )
    replace_once(
        path,
        '    const notificationAriaLabel = notificationCoverageComplete\n'
        '        ? `Notifications (${unread.length} unread)`\n'
        '        : unread.length > 0\n'
        '            ? `Notifications (${unread.length} known unread; more alert sources are still loading)`\n'
        '            : "Notifications (alert sources are still loading)";\n',
        '    const notificationAriaLabel = notificationCoverageComplete\n'
        '        ? `Notifications (${unread.length} unread)`\n'
        '        : "Notifications (partial alert data; open to view loaded alerts)";\n',
    )
    replace_once(
        path,
        '        {unread.length > 0 ? (<span className={cn("absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-pulse-ring items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", alertCount > 0 ? "bg-destructive" : "bg-primary")}>\n'
        '            {unread.length > 9 ? "9+" : `${unread.length}${notificationCoverageComplete ? "" : "+"}`}\n'
        '          </span>) : !notificationCoverageComplete ? (<span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden="true" title="Alert sources are still loading"/>) : null}\n',
        '        {notificationCoverageComplete && unread.length > 0 ? (<span className={cn("absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-pulse-ring items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", alertCount > 0 ? "bg-destructive" : "bg-primary")}>\n'
        '            {unread.length > 9 ? "9+" : unread.length}\n'
        '          </span>) : !notificationCoverageComplete ? (<span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden="true" title="Alert coverage is partial"/>) : null}\n',
    )
    replace_once(
        path,
        '                  {unread.length > 0 && (<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unread.length} new</span>)}\n',
        '                  {notificationCoverageComplete && unread.length > 0 && (<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unread.length} new</span>)}\n',
    )
    replace_once(
        path,
        '                  {filter !== "all" && filtered.some((n) => !n.read && !readItems.has(n.id)) && (<button type="button" onClick={() => markCategoryRead(filter)}',
        '                  {filter !== "all" && filterCoverageComplete && filtered.some((n) => !n.read && !readItems.has(n.id)) && (<button type="button" onClick={() => markCategoryRead(filter)}',
    )
    replace_once(
        path,
        '                  {unread.length > 0 && (<button type="button" onClick={markAllRead}',
        '                  {notificationCoverageComplete && unread.length > 0 && (<button type="button" onClick={markAllRead}',
    )
    replace_once(
        path,
        '                  <button type="button" onClick={dismissAll} className="rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Dismiss all">\n                    Clear\n                  </button>\n',
        '                  <button type="button" onClick={dismissAll} className="rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={notificationCoverageComplete ? "Dismiss all" : "Dismiss loaded alerts"}>\n                    {notificationCoverageComplete ? "Clear" : "Clear loaded"}\n                  </button>\n',
    )
    replace_once(
        path,
        '                  {unread.length} unread · {visible.length} total{!notificationCoverageComplete && " · partial"}{Object.keys(activeSnoozed).length > 0 && ` · ${Object.keys(activeSnoozed).length} snoozed`}\n',
        '                  {notificationCoverageComplete\n'
        '                    ? `${unread.length} unread · ${visible.length} total`\n'
        '                    : `Showing ${visible.length} loaded alert${visible.length === 1 ? "" : "s"} · partial`}{Object.keys(activeSnoozed).length > 0 && ` · ${Object.keys(activeSnoozed).length} snoozed`}\n',
    )

    test = "tests/workspace-bootstrap-scoped-flow.test.ts"
    replace_once(
        test,
        '    expect(notifications).toContain("_workspace_session_collections");\n'
        '    expect(notifications).toContain("notificationCoverageComplete");\n'
        '    expect(notifications).toContain("filterCoverageComplete");\n',
        '    expect(notifications).toContain("_workspace_read_collections");\n'
        '    expect(notifications).toContain("_workspace_read_strategy");\n'
        '    expect(notifications).toContain("notificationCoverageComplete");\n'
        '    expect(notifications).toContain("filterCoverageComplete");\n'
        '    expect(notifications).toContain(\'strategy !== "row"\');\n'
        '    expect(notifications).toContain("partial alert data");\n'
        '    expect(notifications).toContain("notificationCoverageComplete && unread.length > 0");\n',
    )

    print("Applied notification authority refinement in CI working tree.")


if __name__ == "__main__":
    main()
