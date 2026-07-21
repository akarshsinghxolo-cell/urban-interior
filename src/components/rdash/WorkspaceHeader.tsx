"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal, RefreshCw, Menu, Download, Settings, Filter, X, ChevronRight, ChevronLeft, Home, CalendarDays, Command, UserCircle2, Sparkles, Keyboard, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { resolveRenderer, MODULE_GROUPS } from "@/lib/rdash/modules";
import { clearSessionToken } from "@/lib/rdash/client-auth";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./NotificationCenter";
import { CreateMenu } from "./CreateMenu";
import { WorkspaceHealthPill } from "./WorkspaceHealthPill";
import { DemoModeBadge } from "./DemoModeBadge";
import { ProfileNameEditor } from "./ProfileNameEditor";
import { EnhancedSearch } from "./EnhancedSearch";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
function findBreadcrumb(id: string): {
    moduleLabel?: string;
    moduleIcon?: string;
    subLabel?: string;
} {
    for (const g of MODULE_GROUPS) {
        for (const m of g.modules) {
            if (m.id === id)
                return { moduleLabel: m.label, moduleIcon: m.icon };
            const sub = m.submodules.find((s) => s.id === id);
            if (sub)
                return { moduleLabel: m.label, moduleIcon: m.icon, subLabel: sub.label };
        }
    }
    return {};
}
function useTodayClock() {
    const [now, setNow] = React.useState(() => new Date());
    React.useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);
    return now;
}
export function WorkspaceHeader() {
    const activeModuleId = useRDashStore((s) => s.activeModuleId);
    const tabs = useRDashStore((s) => s.tabs);
    const activeTabId = useRDashStore((s) => s.activeTabId);
    const setActiveTab = useRDashStore((s) => s.setActiveTab);
    const closeTab = useRDashStore((s) => s.closeTab);
    const setMobileNavOpen = useRDashStore((s) => s.setMobileNavOpen);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const navigateModuleHistory = useRDashStore((s) => s.navigateModuleHistory);
    const moduleHistoryIndex = useRDashStore((s) => s.moduleHistoryIndex);
    const moduleHistoryLength = useRDashStore((s) => s.moduleHistory.length);
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const authUser = useRDashStore((s) => s.authUser);
    const workspaceSyncStatus = useRDashStore((s) => s.workspaceSyncStatus);
    const workspaceSyncError = useRDashStore((s) => s.workspaceSyncError);
    const setCommandPaletteOpen = useRDashStore((s) => s.setCommandPaletteOpen);
    const setMoreMenuOpen = useRDashStore((s) => s.setMoreMenuOpen);
    const refresh = () => { toast.success("Workspace refreshed"); };
    const r = resolveRenderer(activeModuleId);
    const crumb = findBreadcrumb(activeModuleId);
    const now = useTodayClock();
    const todayStr = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return (<header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/85 backdrop-blur-md">
      <CreateMenu showTrigger={false} enableHotkeys={false}/>
      <div className="flex items-center gap-3 px-[var(--page-pad)] py-2.5">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
          <Menu className="h-5 w-5"/>
        </Button>

        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <div className="hidden items-center gap-0.5 pt-1 sm:flex">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(-1)} disabled={moduleHistoryIndex <= 0} aria-label="Go back (Left Arrow)" title="Back (Left Arrow)"><ChevronLeft className="h-4 w-4"/></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(1)} disabled={moduleHistoryIndex >= moduleHistoryLength - 1} aria-label="Go forward (Right Arrow)" title="Forward (Right Arrow)"><ChevronRight className="h-4 w-4"/></Button>
          </div>
          <div className="min-w-0 flex-1">
          {/* MOB-001 fix: hide breadcrumb row on mobile to give H1 more space */}
          <div className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            <button type="button" onClick={() => setActiveModule("workdesk")} className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">
              <Home className="h-3 w-3"/>
            </button>
            {crumb.moduleLabel && crumb.subLabel && (<>
                <ChevronRight className="h-3 w-3 opacity-50"/>
                <span className="truncate text-foreground/70">{crumb.moduleLabel}</span>
              </>)}
            {crumb.subLabel ? (<>
                <ChevronRight className="h-3 w-3 opacity-50"/>
                <span className="truncate font-semibold text-foreground">{crumb.subLabel}</span>
              </>) : crumb.moduleLabel ? (<>
                <ChevronRight className="h-3 w-3 opacity-50"/>
                <span className="truncate font-semibold text-foreground">{crumb.moduleLabel}</span>
              </>) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none sm:text-xl">{r.icon}</span>
            {/* MOB-001 fix: smaller text on mobile, allow truncation but give it priority space */}
            <h1 className="min-w-0 truncate text-base font-bold tracking-tight sm:text-xl">{r.label}</h1>
          </div>
          {/* MOB-001 fix: hide description on mobile */}
          {r.description && (<p className="hidden truncate text-xs text-muted-foreground sm:block">{r.description}</p>)}
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs lg:flex">
          <CalendarDays className="h-3.5 w-3.5 text-primary"/>
          <div className="leading-tight">
            <p className="font-semibold text-foreground">{todayStr}</p>
            <p className="text-[10px] text-muted-foreground">{timeStr}</p>
          </div>
        </div>
        <DemoModeBadge />
        <WorkspaceHealthPill />

        <EnhancedSearch />
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 md:hidden" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" title="Command palette (Cmd+K)">
          <Command className="h-4 w-4"/>
        </Button>

        {/* Visible keyboard-shortcuts hint button — dispatches the "?" keydown
            that KeyboardShortcutsHelp listens for. Previously this was only
            reachable via the "More" dropdown, and the dropdown's dispatched
            event (Cmd+/) didn't match the listener (expects "?" with no
            modifiers), so the overlay never opened. Now it's a first-class
            header button with a discoverable "?" badge. */}
        {/* Keyboard-shortcuts button — hidden on mobile (keyboard shortcuts are
            less relevant on touch devices; still reachable via the "More"
            dropdown). Shown on md+ where a physical keyboard is likely. */}
        <Button
          variant="outline"
          size="icon"
          className="relative hidden h-11 w-11 shrink-0 md:inline-flex"
          onClick={() => {
            const e = new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true });
            window.dispatchEvent(e);
          }}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[8px] font-bold text-primary-foreground">?</span>
        </Button>

        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={refresh} aria-label="Refresh">
          <RefreshCw className="h-4 w-4"/>
        </Button>

        <NotificationCenter />

        <ThemeToggle />
        <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-foreground md:flex" title="Server-assigned role">
          <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-primary"/>
          <ProfileNameEditor />
          <span className="shrink-0 text-muted-foreground">· {role}</span>
        </div>
        <button type="button" className="hidden text-xs font-semibold text-muted-foreground hover:text-foreground md:inline-flex" onClick={() => { clearSessionToken(); void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/signin")); }}>Sign out</button>
        {workspaceSyncStatus === "saving" ? <span className="hidden text-[10px] font-medium text-muted-foreground lg:inline">Saving…</span> : null}
        {workspaceSyncStatus === "error" ? <span title={workspaceSyncError || "Server save failed"} className="hidden text-[10px] font-semibold text-destructive lg:inline">Save rejected</span> : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="More workspace actions">
              <MoreHorizontal className="h-4 w-4"/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => { const e = new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }); window.dispatchEvent(e); }}>
              <Keyboard className="mr-2 h-4 w-4"/> Keyboard shortcuts
              <kbd className="ml-auto rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">?</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { window.dispatchEvent(new Event("rdash-restart-tour")); toast.success("Onboarding tour restarted"); }}>
              <Sparkles className="mr-2 h-4 w-4"/> Restart onboarding tour
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); toast.info("Saved Views are available per-workspace — look for the 'Save view' button below filter chips"); }}>
              <Filter className="mr-2 h-4 w-4"/> Filters & views
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); setActiveModule("dataExport"); }}>
              <Download className="mr-2 h-4 w-4"/> Export workspace
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); setActiveModule("systemSettings"); }}>
              <Settings className="mr-2 h-4 w-4"/> Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {tabs.length > 0 && (<div className="flex items-center gap-1 overflow-x-auto px-[var(--page-pad)] pb-1 rd-scroll">
          {tabs.map((t) => {
                const active = t.id === activeTabId;
                return (<div key={t.id} role="tab" aria-selected={active} onClick={() => setActiveTab(t.id)} className={cn("group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors", active
                        ? "rd-tab-active border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.icon && !t.label.trim().startsWith(t.icon) && (<span className="text-sm leading-none">{t.icon}</span>)}
                <span className="max-w-[220px] truncate" title={t.label}>{t.label}</span>
                {tabs.length > 1 && (<button type="button" aria-label="Close tab" onClick={(e) => {
                            e.stopPropagation();
                            closeTab(t.id);
                        }} className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100">
                    <X className="h-3 w-3"/>
                  </button>)}
              </div>);
            })}
        </div>)}
    </header>);
}
