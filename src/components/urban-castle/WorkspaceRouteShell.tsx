"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { detailRecordExists } from "@/lib/rdash/detail-navigation";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceRouteAccessDecision } from "@/lib/rdash/workspace-route-access";
import { selectWorkspaceRoute } from "@/lib/rdash/workspace-route-adapter";
import { workspacePathForModule } from "@/lib/rdash/workspace-routes";
import { UrbanCastleApp } from "./UrbanCastleApp";

/**
 * Persistent application shell for every /workspace URL.
 *
 * Module routes bootstrap before UrbanCastleApp mounts. Direct entity routes
 * keep the same shell mounted but delay managed browser-history initialization
 * until the secure workspace has hydrated and the existing detail panel has
 * been restored. This prevents a synthetic module-only Back entry.
 */
export function WorkspaceRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const initialSelectionRef = React.useRef(
    selectWorkspaceRoute(pathname, useRDashStore.getState().activeModuleId),
  );
  const historyStartedRef = React.useRef(!initialSelectionRef.current?.entity);
  const handledEntityRef = React.useRef<string | null>(null);
  const [bootstrapped, setBootstrapped] = React.useState(false);
  const [historyEnabled, setHistoryEnabled] = React.useState(historyStartedRef.current);

  const authUser = useRDashStore((state) => state.authUser);
  const db = useRDashStore((state) => state.db);
  const detailPanel = useRDashStore((state) => state.detailPanel);
  const selection = React.useMemo(
    () => selectWorkspaceRoute(pathname, useRDashStore.getState().activeModuleId),
    [pathname],
  );

  const startHistory = React.useCallback(() => {
    if (historyStartedRef.current) return;
    historyStartedRef.current = true;
    setHistoryEnabled(true);
  }, []);

  React.useLayoutEffect(() => {
    const current = useRDashStore.getState();
    const nextSelection = selectWorkspaceRoute(pathname, current.activeModuleId);
    if (nextSelection?.shouldActivate) current.setActiveModule(nextSelection.moduleId);
    if (nextSelection) document.title = nextSelection.title;
    if (!nextSelection?.entity) startHistory();
    setBootstrapped(true);
  }, [pathname, startHistory]);

  React.useEffect(() => {
    const entity = selection?.entity;
    if (!entity || !authUser) return;

    const access = workspaceRouteAccessDecision(
      selection.moduleId,
      authUser.role,
      (db as unknown as { staffRolePermissions?: unknown[] }).staffRolePermissions,
      entity.permissionModule,
    );
    const entityKey = `${entity.kind}:${entity.id}`;
    const parentPath = workspacePathForModule(selection.moduleId);

    if (access.status === "denied") {
      if (handledEntityRef.current !== `denied:${entityKey}`) {
        handledEntityRef.current = `denied:${entityKey}`;
        toast.error("Access denied", {
          description: `Your role cannot open ${access.moduleLabel}.`,
        });
      }
      startHistory();
      router.replace(parentPath);
      return;
    }
    if (access.status !== "allowed") return;

    if (!detailRecordExists(db, entity.kind, entity.id)) {
      if (handledEntityRef.current !== `missing:${entityKey}`) {
        handledEntityRef.current = `missing:${entityKey}`;
        toast.error("Record not found", {
          description: "This link may be outdated, deleted, or unavailable in your workspace.",
        });
      }
      startHistory();
      router.replace(parentPath);
      return;
    }

    if (detailPanel.kind !== entity.kind || detailPanel.recordId !== entity.id) {
      useRDashStore.getState().openDetail(entity.kind, entity.id, selection.moduleId);
    }
    handledEntityRef.current = `opened:${entityKey}`;
    startHistory();
  }, [authUser, db, detailPanel.kind, detailPanel.recordId, router, selection, startHistory]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange>
      {bootstrapped ? <UrbanCastleApp historyEnabled={historyEnabled} /> : <WorkspaceRouteLoading />}
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
