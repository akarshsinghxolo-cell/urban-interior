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
        print("Notification coverage patch is CI-only; skipping outside Application CI.")
        return

    subprocess.run(["git", "fetch", "origin", BRANCH], check=True)
    subprocess.run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], check=True)

    path = "src/components/rdash/NotificationCenter.tsx"
    replace_once(
        path,
        'type NotifCategory = "overdue" | "approval" | "blocked" | "risk" | "visit";\n',
        'type NotifCategory = "overdue" | "approval" | "blocked" | "risk" | "visit";\n'
        'const NOTIFICATION_SOURCE_COLLECTION: Record<NotifCategory, string> = {\n'
        '    overdue: "payments",\n'
        '    approval: "actions",\n'
        '    blocked: "blocked",\n'
        '    risk: "risks",\n'
        '    visit: "visits",\n'
        '};\n'
        'const NOTIFICATION_SOURCE_COLLECTIONS = Object.freeze(Object.values(NOTIFICATION_SOURCE_COLLECTION));\n',
    )
    replace_once(
        path,
        '    const [loadedPreferenceKey, setLoadedPreferenceKey] = React.useState<string | null>(null);\n',
        '    const [loadedPreferenceKey, setLoadedPreferenceKey] = React.useState<string | null>(null);\n'
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
    )
    replace_once(
        path,
        '    const dismissAll = () => {\n        setDismissed((current) => new Set([...current, ...notifs.map((notification) => notification.id)]));\n        toast.success("All notifications dismissed");\n    };\n    return (<div className="relative">\n      <button type="button" onClick={() => setOpen((o) => !o)} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-all hover:bg-accent hover:text-foreground" aria-label={`Notifications (${unread.length} unread)`}>\n        <Bell className="h-4 w-4"/>\n        {unread.length > 0 && (<span className={cn("absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-pulse-ring items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", alertCount > 0 ? "bg-destructive" : "bg-primary")}>\n            {unread.length > 9 ? "9+" : unread.length}\n          </span>)}\n      </button>',
        '    const dismissAll = () => {\n        setDismissed((current) => new Set([...current, ...notifs.map((notification) => notification.id)]));\n        toast.success("All notifications dismissed");\n    };\n    const notificationAriaLabel = notificationCoverageComplete\n        ? `Notifications (${unread.length} unread)`\n        : unread.length > 0\n            ? `Notifications (${unread.length} known unread; more alert sources are still loading)`\n            : "Notifications (alert sources are still loading)";\n    return (<div className="relative">\n      <button type="button" onClick={() => setOpen((o) => !o)} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-all hover:bg-accent hover:text-foreground" aria-label={notificationAriaLabel}>\n        <Bell className="h-4 w-4"/>\n        {unread.length > 0 ? (<span className={cn("absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-pulse-ring items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", alertCount > 0 ? "bg-destructive" : "bg-primary")}>\n            {unread.length > 9 ? "9+" : `${unread.length}${notificationCoverageComplete ? "" : "+"}`}\n          </span>) : !notificationCoverageComplete ? (<span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden="true" title="Alert sources are still loading"/>) : null}\n      </button>',
    )
    replace_once(
        path,
        '                  {unread.length > 0 && (<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unread.length} new</span>)}\n',
        '                  {unread.length > 0 && (<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unread.length} new</span>)}\n'
        '                  {!notificationCoverageComplete && (<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Partial</span>)}\n',
    )
    replace_once(
        path,
        '              {filtered.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">\n                  <CheckCircle2 className="h-8 w-8 text-success"/>\n                  <p className="text-xs">{visible.length === 0 ? "All caught up! No pending alerts." : "No notifications in this category."}</p>\n                </div>) : (filtered.map((n) => {',
        '              {filtered.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">\n                  {filterCoverageComplete ? <CheckCircle2 className="h-8 w-8 text-success"/> : <Clock className="h-8 w-8 text-primary"/>}\n                  <p className="text-xs">{visible.length === 0\n                    ? filterCoverageComplete\n                        ? "All caught up! No pending alerts."\n                        : filter === "all"\n                            ? "Notification data will fill in as relevant modules load."\n                            : `${CATEGORY_META[filter].label} data has not loaded yet.`\n                    : "No notifications in this category."}</p>\n                </div>) : (filtered.map((n) => {',
    )
    replace_once(
        path,
        '                  {unread.length} unread · {visible.length} total{Object.keys(activeSnoozed).length > 0 && ` · ${Object.keys(activeSnoozed).length} snoozed`}\n',
        '                  {unread.length} unread · {visible.length} total{!notificationCoverageComplete && " · partial"}{Object.keys(activeSnoozed).length > 0 && ` · ${Object.keys(activeSnoozed).length} snoozed`}\n',
    )

    test_path = "tests/workspace-bootstrap-scoped-flow.test.ts"
    replace_once(
        test_path,
        '  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {',
        '  test("does not present unloaded notification sources as authoritative zero alerts", async () => {\n'
        '    const notifications = await testFile("src/components/rdash/NotificationCenter.tsx").text();\n'
        '    expect(notifications).toContain("_workspace_session_collections");\n'
        '    expect(notifications).toContain("notificationCoverageComplete");\n'
        '    expect(notifications).toContain("filterCoverageComplete");\n'
        '    expect(notifications).toContain("Notification data will fill in as relevant modules load.");\n'
        '    expect(notifications).toContain("All caught up! No pending alerts.");\n'
        '    expect(notifications).toContain("filterCoverageComplete ?");\n'
        '  });\n\n'
        '  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {',
    )

    print("Applied notification coverage fix in CI working tree.")


if __name__ == "__main__":
    main()
