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

  const syncState = hasPendingChanges
    ? { label: hasConflict ? "Needs review" : "Saved locally", className: hasConflict ? "text-destructive bg-destructive/8 border-destructive/20" : "text-warning bg-warning/8 border-warning/20" }
    : workspaceSyncStatus === "saving"
      ? { label: "Saving…", className: "text-muted-foreground bg-muted/50 border-border/60" }
      : workspaceSyncStatus === "error"
        ? { label: "Sync failed", className: "text-destructive bg-destructive/8 border-destructive/20" }
        : workspaceSyncStatus === "saved"
          ? { label: "Saved", className: "text-success bg-success/8 border-success/20" }
          : null;

  return (
    <header className="sticky top-0 z-30 flex flex-col border-b border-border/80 bg-background/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-xl">
      <CreateMenu showTrigger={false} enableHotkeys={false} />
      <div className="flex min-h-14 items-center gap-2 px-[var(--page-pad)] py-2">
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden items-center gap-0.5 sm:flex">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => navigateModuleHistory(-1)} disabled={moduleHistoryIndex <= 0} aria-label="Go back in module history" title="Back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => navigateModuleHistory(1)} disabled={moduleHistoryIndex >= moduleHistoryLength - 1} aria-label="Go forward in module history" title="Forward">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <DemoModeBadge />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center px-1 sm:px-3">
          <div className="w-full max-w-2xl">
            <EnhancedSearch />
          </div>
          <Button variant="outline" size="icon" className="ml-1 h-10 w-10 shrink-0 md:hidden" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" title="Command palette (Cmd+K)">
            <Command className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
          {syncState ? (
            <button
              type="button"
              onClick={hasPendingChanges ? () => window.dispatchEvent(new CustomEvent("uc-open-pending-uploads")) : undefined}
              title={workspaceSyncError || syncState.label}
              aria-live="polite"
              className={cn("hidden h-7 items-center rounded-full border px-2 text-[10px] font-semibold 2xl:inline-flex", syncState.className)}
            >
              {syncState.label}
            </button>
          ) : null}

          <Button variant="ghost" size="icon" className="hidden h-9 w-9 text-muted-foreground xl:inline-flex" onClick={() => setKeyboardShortcutsOpen(true)} aria-label="Show keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden h-9 w-9 text-muted-foreground xl:inline-flex" onClick={refresh} aria-label="Refresh workspace" title="Refresh workspace">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <UploadStatusIndicator />
          <NotificationCenter />
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 shrink-0 gap-1.5 rounded-full px-1.5 sm:px-2.5" aria-label="Open profile menu">
                <UserCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span className="hidden max-w-[120px] truncate text-xs font-semibold xl:inline">{authUser?.name || "User"}</span>
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
      <div className="border-t border-border/40 bg-muted/15">
        <WorkspaceLocationBreadcrumbs />
        <WorkspaceTabs />
      </div>
    </header>
  );
}
