"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal, RefreshCw, Menu, Download, Settings, Filter, ChevronRight, ChevronLeft, Command, UserCircle2, Keyboard, PanelLeft, LogOut, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { clearSessionToken } from "@/lib/rdash/client-auth";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./NotificationCenter";
import { CreateMenu } from "./CreateMenu";
import { DemoModeBadge } from "./DemoModeBadge";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { EnhancedSearch } from "./EnhancedSearch";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
export function WorkspaceHeader() {
    const setMobileNavOpen = useRDashStore((s) => s.setMobileNavOpen);
    const toggleSidebar = useRDashStore((s) => s.toggleSidebar);
    const sidebarCollapsed = useRDashStore((s) => s.sidebarCollapsed);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const navigateModuleHistory = useRDashStore((s) => s.navigateModuleHistory);
    const moduleHistoryIndex = useRDashStore((s) => s.moduleHistoryIndex);
    const moduleHistoryLength = useRDashStore((s) => s.moduleHistory.length);
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const authUser = useRDashStore((s) => s.authUser);
    const workspaceSyncStatus = useRDashStore((s) => s.workspaceSyncStatus);
    const workspaceSyncError = useRDashStore((s) => s.workspaceSyncError);
    const setCommandPaletteOpen = useRDashStore((s) => s.setCommandPaletteOpen);
    const setKeyboardShortcutsOpen = useRDashStore((s) => s.setKeyboardShortcutsOpen);
    const moreMenuOpen = useRDashStore((s) => s.moreMenuOpen);
    const setMoreMenuOpen = useRDashStore((s) => s.setMoreMenuOpen);
    const refresh = () => { window.location.reload(); };
    return (<header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/85 backdrop-blur-md">
      <CreateMenu showTrigger={false} enableHotkeys={false}/>
      <div className="flex items-center gap-3 px-[var(--page-pad)] py-2.5">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
          <Menu className="h-5 w-5"/>
        </Button>
        {/* Desktop sidebar collapse/expand toggle */}
        <Button variant="ghost" size="icon" className="hidden h-11 w-11 shrink-0 lg:inline-flex" onClick={() => toggleSidebar()} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <PanelLeft className={cn("h-5 w-5 transition-transform", sidebarCollapsed && "rotate-180")} />
        </Button>

        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(-1)} disabled={moduleHistoryIndex <= 0} aria-label="Go back in module history" title="Back"><ChevronLeft className="h-4 w-4"/></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(1)} disabled={moduleHistoryIndex >= moduleHistoryLength - 1} aria-label="Go forward in module history" title="Forward"><ChevronRight className="h-4 w-4"/></Button>
        </div>
        <DemoModeBadge />

        <EnhancedSearch />
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 md:hidden" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" title="Command palette (Cmd+K)">
          <Command className="h-4 w-4"/>
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="relative hidden h-11 w-11 shrink-0 md:inline-flex"
          onClick={() => setKeyboardShortcutsOpen(true)}
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
          <span className="max-w-[140px] truncate">{authUser?.name || "User"}</span>
          <span className="shrink-0 text-muted-foreground">· {role}</span>
        </div>
        <button type="button" className="hidden text-xs font-semibold text-muted-foreground hover:text-foreground md:inline-flex" onClick={() => { clearSessionToken(); void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/signin")); }}>Sign out</button>
        {workspaceSyncStatus === "saving" ? <span className="hidden text-[10px] font-medium text-muted-foreground lg:inline">Saving…</span> : null}
        {workspaceSyncStatus === "error" ? <span title={workspaceSyncError || "Server save failed"} className="hidden text-[10px] font-semibold text-destructive lg:inline">Save rejected</span> : null}

        <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="More workspace actions">
              <MoreHorizontal className="h-4 w-4"/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setKeyboardShortcutsOpen(true)}>
              <Keyboard className="mr-2 h-4 w-4"/> Keyboard shortcuts
              <kbd className="ml-auto rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">?</kbd>
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
             <DropdownMenuSeparator />
             <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); clearSessionToken(); void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/signin")); }}>
               <LogOut className="mr-2 h-4 w-4"/> Sign out
             </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <WorkspaceTabs />
    </header>);
}
