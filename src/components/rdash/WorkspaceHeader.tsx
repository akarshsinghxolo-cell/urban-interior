"use client";
import { cn } from "@/lib/utils";
import { RefreshCw, Menu, Download, Settings, ChevronRight, ChevronLeft, ChevronDown, Command, UserCircle2, Keyboard, LogOut } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { clearSessionToken } from "@/lib/rdash/client-auth";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useWorkspaceOutbox } from "@/lib/uploads/use-workspace-outbox";
import { confirmWorkspaceExit } from "@/lib/uploads/workspace-exit-guard";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./NotificationCenter";
import { CreateMenu } from "./CreateMenu";
import { DemoModeBadge } from "./DemoModeBadge";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { WorkspaceLocationBreadcrumbs } from "./WorkspaceLocationBreadcrumbs";
import { EnhancedSearch } from "./EnhancedSearch";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UploadStatusIndicator } from "@/components/uploads/UploadStatusIndicator";

export function WorkspaceHeader() {
  const setMobileNavOpen = useRDashStore((state) => state.setMobileNavOpen);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const navigateModuleHistory = useRDashStore((state) => state.navigateModuleHistory);
  const moduleHistoryIndex = useRDashStore((state) => state.moduleHistoryIndex);
  const moduleHistoryLength = useRDashStore((state) => state.moduleHistory.length);
  const role = useRDashStore((state) => state.authUser?.role || "Unauthenticated");
  const authUser = useRDashStore((state) => state.authUser);
  const workspaceSyncStatus = useRDashStore((state) => state.workspaceSyncStatus);
  const workspaceSyncError = useRDashStore((state) => state.workspaceSyncError);
  const setCommandPaletteOpen = useRDashStore((state) => state.setCommandPaletteOpen);
  const setKeyboardShortcutsOpen = useRDashStore((state) => state.setKeyboardShortcutsOpen);
  const outbox = useWorkspaceOutbox();
  const hasPendingChanges = outbox.items.length > 0;
  const hasConflict = outbox.items.some((item) => item.status === "conflict" || item.status === "failed_permanent");

  const refresh = () => {
    dirtyFormRegistry.requestNavigation(() => {
      if (!confirmWorkspaceExit(outbox, "reload")) return;
      window.location.reload();
    }, { reason: "reload the workspace" });
  };

  const signOut = () => {
    dirtyFormRegistry.requestNavigation(() => {
      if (!confirmWorkspaceExit(outbox, "sign-out")) return;
      clearSessionToken();
      void fetch("/api/auth/logout", { method: "POST" })
        .finally(() => window.location.assign("/signin"));
    }, { reason: "sign out" });
  };

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/85 backdrop-blur-md">
      <CreateMenu showTrigger={false} enableHotkeys={false} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-[var(--page-pad)] py-2.5">
        <div className="flex min-w-0 items-center justify-start gap-2">
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(-1)} disabled={moduleHistoryIndex <= 0} aria-label="Go back in module history" title="Back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateModuleHistory(1)} disabled={moduleHistoryIndex >= moduleHistoryLength - 1} aria-label="Go forward in module history" title="Forward">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <DemoModeBadge />
        </div>

        <div className="flex items-center justify-center">
          <EnhancedSearch />
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 md:hidden" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" title="Command palette (Cmd+K)">
            <Command className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <Button variant="outline" size="icon" className="relative hidden h-11 w-11 shrink-0 xl:inline-flex" onClick={() => setKeyboardShortcutsOpen(true)} aria-label="Show keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard className="h-4 w-4" />
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-[8px] font-bold text-primary-foreground">?</span>
          </Button>
          <Button variant="outline" size="icon" className="hidden h-11 w-11 shrink-0 xl:inline-flex" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <UploadStatusIndicator />
          <NotificationCenter />
          <div className="hidden xl:block">
            <ThemeToggle />
          </div>

          {hasPendingChanges ? (
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("uc-open-pending-uploads"))} title={workspaceSyncError || "Saved locally and waiting to synchronize"} className={cn("hidden text-[10px] font-semibold 2xl:inline", hasConflict ? "text-destructive" : "text-warning")}>
              {hasConflict ? "Needs review" : "Saved locally"}
            </button>
          ) : workspaceSyncStatus === "saving" ? (
            <span className="hidden text-[10px] font-medium text-muted-foreground 2xl:inline">Saving…</span>
          ) : workspaceSyncStatus === "error" ? (
            <span title={workspaceSyncError || "Server synchronization failed"} className="hidden text-[10px] font-semibold text-destructive 2xl:inline">Sync failed</span>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 shrink-0 gap-1.5 px-2" aria-label="Open profile menu">
                <UserCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="hidden max-w-[140px] truncate text-xs font-medium xl:inline">{authUser?.name || "User"}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">· {role}</span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground xl:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-semibold text-foreground">{authUser?.name || "User"}</span>
                <span className="block truncate text-xs text-muted-foreground">{authUser?.email || role}</span>
                {authUser?.email ? <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">{role}</span> : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveModule("systemSettings")}>
                <Settings className="mr-2 h-4 w-4" /> Workspace settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveModule("dataExport")}>
                <Download className="mr-2 h-4 w-4" /> Export workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <WorkspaceLocationBreadcrumbs />
      <WorkspaceTabs />
    </header>
  );
}
