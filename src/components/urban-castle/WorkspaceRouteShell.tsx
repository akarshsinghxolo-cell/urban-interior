"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { selectWorkspaceRoute } from "@/lib/rdash/workspace-route-adapter";
import { UrbanCastleApp } from "./UrbanCastleApp";

/**
 * Persistent application shell for every /workspace URL.
 *
 * The URL-selected module is applied in a layout effect before UrbanCastleApp
 * mounts. This lets the existing browser-history hook take its first snapshot
 * at the correct module instead of creating an extra same-URL history entry.
 * The shell stays mounted while the catch-all page changes, preserving uploads,
 * GPS tracking, the workspace outbox and global dialogs.
 */
export function WorkspaceRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [bootstrapped, setBootstrapped] = React.useState(false);

  React.useLayoutEffect(() => {
    const current = useRDashStore.getState();
    const selection = selectWorkspaceRoute(pathname, current.activeModuleId);
    if (selection?.shouldActivate) current.setActiveModule(selection.moduleId);
    if (selection) document.title = selection.title;
    setBootstrapped(true);
  }, [pathname]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange>
      {bootstrapped ? <UrbanCastleApp /> : <WorkspaceRouteLoading />}
      <Toaster richColors position="top-right" />
      {children}
    </ThemeProvider>
  );
}

function WorkspaceRouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <h1 className="text-lg font-bold">Opening Urban Castle</h1>
        <p className="mt-2 text-sm text-muted-foreground">Restoring your workspace location…</p>
      </div>
    </main>
  );
}
