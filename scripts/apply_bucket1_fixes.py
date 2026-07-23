from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected 1 literal match, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected 1 regex match, found {count}: {pattern!r}")
    write(path, updated)


def mark(label: str) -> None:
    print(f"APPLY {label}", flush=True)


mark("11 unique lead preset IDs")
qualified_matches = 0
for candidate in (ROOT / "src").rglob("*.ts*"):
    text = candidate.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'id:\s*"new"(\s*,\s*label:\s*"Qualified")',
        r'id: "qualified"\1',
        text,
    )
    if count:
        candidate.write_text(updated, encoding="utf-8")
        qualified_matches += count
if qualified_matches != 1:
    raise RuntimeError(f"Expected exactly one duplicate Qualified preset ID, found {qualified_matches}")

mark("13 local mobile date badges")
replace_once(
    "src/components/rdash/RDashApp.tsx",
    "function ModuleLoadingFallback() {",
    "function localDateKey(date = new Date()) {\n    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);\n    return local.toISOString().slice(0, 10);\n}\nfunction ModuleLoadingFallback() {",
)
regex_once(
    "src/components/rdash/RDashApp.tsx",
    r'const badgeCount = item\.target\.id === "tasks" \? db\.tasks\.filter\(\(t: any\) => t\.status !== "completed" && t\.status !== "cancelled" && t\.due_date <= new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)\.length\s*:\s*\n\s*item\.target\.id === "fieldOperations" \? db\.visits\.filter\(\(v: any\) => v\.scheduled_at\?\.slice\(0, 10\) === new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)\.length\s*:',
    'const todayKey = localDateKey();\n            const badgeCount = item.target.id === "tasks" ? db.tasks.filter((t: any) => t.status !== "completed" && t.status !== "cancelled" && t.due_date <= todayKey).length :\n                               item.target.id === "fieldOperations" ? db.visits.filter((v: any) => v.scheduled_at?.slice(0, 10) === todayKey).length :',
)

mark("16 thread search deep links")
regex_once(
    "src/components/rdash/CommandPalette.tsx",
    r'action: \(\) => \{ setActiveModule\("unifiedThreadInbox"\); setOpen\(false\); \}, keywords:',
    'action: () => { try { localStorage.setItem("uc-open-thread-id", t.id); } catch { /* non-fatal */ } setActiveModule("unifiedThreadInbox"); setOpen(false); }, keywords:',
)
regex_once(
    "src/components/rdash/modules/UnifiedThreadInboxModule.tsx",
    r'    const openThread = \(thread: Thread\) => \{\n(.*?)\n    \};',
    '''    const openThread = React.useCallback((thread: Thread) => {\n\\1\n    }, [markThreadRead, openDetail, trackRecentThread]);\n    React.useEffect(() => {\n        let requestedThreadId: string | null = null;\n        try { requestedThreadId = localStorage.getItem("uc-open-thread-id"); } catch { /* non-fatal */ }\n        if (!requestedThreadId) return;\n        const requestedThread = db.threads.find((thread) => thread.id === requestedThreadId);\n        if (!requestedThread) return;\n        openThread(requestedThread);\n        try { localStorage.removeItem("uc-open-thread-id"); } catch { /* non-fatal */ }\n    }, [db.threads, openThread]);''',
    re.S,
)

mark("21 bounded module history")
regex_once(
    "src/lib/rdash/store/slices/ui.ts",
    r'            const history = current\?\.moduleId === moduleId\n                \? state\.moduleHistory\n                : \[\n                    \.\.\.state\.moduleHistory\.slice\(0, state\.moduleHistoryIndex \+ 1\),\n                    entry,\n                \];',
    '''            const candidateHistory = current?.moduleId === moduleId\n                ? state.moduleHistory\n                : [\n                    ...state.moduleHistory.slice(0, state.moduleHistoryIndex + 1),\n                    entry,\n                ];\n            const history = candidateHistory.slice(-100);''',
)

mark("22 remove bare-arrow navigation")
replace_once(
    "src/components/rdash/RDashApp.tsx",
    '    const navigateModuleHistory = useRDashStore((s) => s.navigateModuleHistory);\n',
    "",
)
regex_once(
    "src/components/rdash/RDashApp.tsx",
    r'            if \(event\.key === "ArrowLeft"\) \{\n                event\.preventDefault\(\);\n                navigateModuleHistory\(-1\);\n            \}\n            if \(event\.key === "ArrowRight"\) \{\n                event\.preventDefault\(\);\n                navigateModuleHistory\(1\);\n            \}\n',
    "",
)
replace_once(
    "src/components/rdash/RDashApp.tsx",
    '    }, [navigateModuleHistory, setActiveModule]);',
    '    }, [setActiveModule]);',
)

mark("23 audit activity read state")
replace_once(
    "src/components/rdash/NotificationCenter.tsx",
    '    const unread = visible.filter((n) => !readItems.has(n.id));',
    '    const unread = visible.filter((n) => !n.read && !readItems.has(n.id));',
)
replace_once(
    "src/components/rdash/NotificationCenter.tsx",
    '        visible.forEach((n) => { if (!readItems.has(n.id))\n            counts[n.category]++; });',
    '        visible.forEach((n) => { if (!n.read && !readItems.has(n.id))\n            counts[n.category]++; });',
)
replace_once(
    "src/components/rdash/NotificationCenter.tsx",
    'filtered.some((n) => !readItems.has(n.id))',
    'filtered.some((n) => !n.read && !readItems.has(n.id))',
)

mark("25 newest-first recent activity")
replace_once(
    "src/components/rdash/NotificationCenter.tsx",
    '        db.auditLog.slice(0, 15).forEach((entry) => {',
    '        [...db.auditLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15).forEach((entry) => {',
)

mark("27 real header refresh")
replace_once(
    "src/components/rdash/WorkspaceHeader.tsx",
    '    const refresh = () => { toast.success("Workspace refreshed"); };',
    '    const refresh = () => { window.location.reload(); };',
)

mark("28 remove duplicate activity and theme controls")
replace_once("src/components/rdash/QuickActionsToolbar.tsx", 'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";\n', "")
replace_once("src/components/rdash/QuickActionsToolbar.tsx", 'import { ThemeToggle } from "./ThemeToggle";\n', "")
regex_once(
    "src/components/rdash/QuickActionsToolbar.tsx",
    r'\nfunction RecentItemsDropdown\(\) \{.*?\n\}\n\nexport function QuickActionsToolbar',
    '\nexport function QuickActionsToolbar',
    re.S,
)
regex_once(
    "src/components/rdash/QuickActionsToolbar.tsx",
    r'\n\s*<RecentItemsDropdown />\n\s*<div className="mx-0\.5 h-6 w-px bg-border/50" />\n\s*<ThemeToggle className="h-8 w-8 rounded-lg border-0 bg-transparent hover:bg-accent" />',
    "",
)
replace_once("src/components/rdash/QuickActionsToolbar.tsx", "  Clock,\n", "")
replace_once("src/components/rdash/QuickActionsToolbar.tsx", "  History,\n", "")

mark("31 remember email persistence")
regex_once(
    "src/app/signin/page.tsx",
    r'(      if \(payload\.token\) \{\n        setSessionToken\(payload\.token\);\n        initAuthFetch\(\);\n      \}\n)(      router\.replace\("/"\);)',
    '''\\1      try {\n        if (rememberEmail) localStorage.setItem("uc_remember_email", email.trim());\n        else localStorage.removeItem("uc_remember_email");\n      } catch { /* non-fatal */ }\n\\2''',
)

mark("33 mobile sign out")
replace_once(
    "src/components/rdash/WorkspaceHeader.tsx",
    'import { MoreHorizontal, RefreshCw, Menu, Download, Settings, Filter, X, ChevronRight, ChevronLeft, Command, UserCircle2, Keyboard, PanelLeft, } from "lucide-react";',
    'import { MoreHorizontal, RefreshCw, Menu, Download, Settings, Filter, X, ChevronRight, ChevronLeft, Command, UserCircle2, Keyboard, PanelLeft, LogOut, } from "lucide-react";',
)
regex_once(
    "src/components/rdash/WorkspaceHeader.tsx",
    r'(\s*<DropdownMenuItem onClick=\{\(\) => \{ setMoreMenuOpen\(false\); setActiveModule\("systemSettings"\); \}\}>\n\s*<Settings className="mr-2 h-4 w-4"/> Settings\n\s*</DropdownMenuItem>)',
    '''\\1\n             <DropdownMenuSeparator />\n             <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); clearSessionToken(); void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/signin")); }}>\n               <LogOut className="mr-2 h-4 w-4"/> Sign out\n             </DropdownMenuItem>''',
)

mark("34 current metadata")
replace_once("src/app/layout.tsx", '    title: "Urban Castle Business Workspace — Operational Drive & Pinterest",', '    title: "Urban Castle Business Workspace",')
replace_once("src/app/layout.tsx", '        "Operational Drive",\n        "Pinterest",\n', "")

mark("35 browser zoom")
replace_once("src/app/layout.tsx", '    maximumScale: 1,\n    userScalable: false,\n', "")

mark("36 keyboard password reveal")
replace_once("src/app/signin/page.tsx", '            tabIndex={-1}\n', "")

mark("41 keyboard-visible close and remove controls")
replace_once(
    "src/components/rdash/WorkspaceHeader.tsx",
    'className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"',
    'className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"',
)
replace_once(
    "src/components/rdash/FavoritesBar.tsx",
    'className="ml-0.5 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"',
    'className="ml-0.5 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"',
)

mark("45 small commit errors")
replace_once("src/app/api/operations/commit/route.ts", '    const current = await getWorkspace().catch(() => null);\n', "")
replace_once(
    "src/app/api/operations/commit/route.ts",
    '''      error: message\n        .replace(/^(FORBIDDEN:|INVALID:)/, "")\n        .replace(/^CONFLICT$/, "The workspace changed on another device. The server version was restored."),\n      ...(current ? payload(current) : {}),\n''',
    '''      error: message\n        .replace(/^(FORBIDDEN:|INVALID:)/, "")\n        .replace(/^CONFLICT$/, "The workspace changed on another device. Refresh before retrying."),\n''',
)

mark("46 functional includeRevisions")
replace_once(
    "src/lib/rdash/server/workspace.ts",
    '''export async function getWorkspace(_includeRevisions = false): Promise<WorkspaceWithRevisions> {\n  if (await checkSupabaseSchema()) {\n    const { getRestWorkspace } = await getRestModule();\n    return getRestWorkspace();\n  }\n  const ws = await getInMemoryWorkspace();\n  return { ...ws, rowVersions: {} };\n}''',
    '''export async function getWorkspace(includeRevisions = false): Promise<WorkspaceWithRevisions> {\n  if (await checkSupabaseSchema()) {\n    const { getRestWorkspace } = await getRestModule();\n    const workspace = await getRestWorkspace();\n    if (includeRevisions) return workspace;\n    return { revision: workspace.revision, data: workspace.data, updatedAt: workspace.updatedAt };\n  }\n  const ws = await getInMemoryWorkspace();\n  return includeRevisions ? { ...ws, rowVersions: {} } : ws;\n}''',
)

print("Applied all 17 Bucket 1 fixes.", flush=True)
