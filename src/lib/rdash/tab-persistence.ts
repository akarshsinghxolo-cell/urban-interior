import type { WorkspaceTab } from "./store/ui-types";

/**
 * Session-scoped persistence for the workspace tab strip.
 *
 * Reloads used to reset the workspace to a lone "Today" tab even mid-session,
 * which is hostile on phones where a reload (network blip, OS tab eviction)
 * silently throws away the user's open modules. Tabs are a *working context*
 * for the current browser session, so sessionStorage (not localStorage) is the
 * right scope: they come back after an accidental refresh, but never haunt a
 * fresh session days later.
 *
 * Labels/icons are re-resolved from the module registry on restore so a
 * renamed module never shows a stale caption; unknown moduleIds are dropped.
 */

const KEY = "uc_workspace_tabs_v1";

export function persistWorkspaceTabs(tabs: WorkspaceTab[], activeTabId: string | null | undefined): void {
    try {
        if (typeof window === "undefined" || !window.sessionStorage) return;
        if (tabs.length <= 1 && (!tabs[0] || tabs[0].moduleId === "workdesk")) {
            // Default state — nothing worth restoring next load.
            window.sessionStorage.removeItem(KEY);
            return;
        }
        window.sessionStorage.setItem(KEY, JSON.stringify({ tabs, activeTabId }));
    } catch {
        // Storage may be unavailable (private mode, quota) — persistence is best-effort.
    }
}

export function restoreWorkspaceTabs(
    resolveModule: (moduleId: string) => { label: string; icon: string } | null,
): { tabs: WorkspaceTab[]; activeTabId: string } | null {
    try {
        if (typeof window === "undefined" || !window.sessionStorage) return null;
        const raw = window.sessionStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            tabs?: Array<{ id?: unknown; moduleId?: unknown; label?: unknown; icon?: unknown }>;
            activeTabId?: unknown;
        };
        if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
        const seen = new Set<string>();
        const tabs: WorkspaceTab[] = [];
        for (const entry of parsed.tabs) {
            if (!entry || typeof entry.id !== "string" || typeof entry.moduleId !== "string") continue;
            if (seen.has(entry.id)) continue;
            const resolved = resolveModule(entry.moduleId);
            if (!resolved) continue;
            seen.add(entry.id);
            tabs.push({
                id: entry.id,
                moduleId: entry.moduleId,
                label: typeof entry.label === "string" && entry.label.trim() ? entry.label : resolved.label,
                icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon : resolved.icon,
            });
        }
        if (tabs.length === 0) return null;
        const activeTabId =
            typeof parsed.activeTabId === "string" && tabs.some((tab) => tab.id === parsed.activeTabId)
                ? (parsed.activeTabId as string)
                : tabs[0].id;
        return { tabs, activeTabId };
    } catch {
        return null;
    }
}
