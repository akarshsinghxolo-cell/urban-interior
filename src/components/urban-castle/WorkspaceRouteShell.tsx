"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { detailRecordExists } from "@/lib/rdash/detail-navigation";
import { useRDashStore } from "@/lib/rdash/store";
import {
  workspaceCustomerTabRequest,
  workspaceUrlWithCustomerTab,
} from "@/lib/rdash/workspace-customer-tabs";
import {
  supportsWorkspaceDetailTabs,
  workspaceDetailTabRequest,
  workspaceUrlWithDetailTab,
} from "@/lib/rdash/workspace-detail-tabs";
import { workspaceLocationPresentation } from "@/lib/rdash/workspace-location-presentation";
import { workspaceRouteAccessDecision } from "@/lib/rdash/workspace-route-access";
import { selectWorkspaceRoute } from "@/lib/rdash/workspace-route-adapter";
import { workspacePathForModule } from "@/lib/rdash/workspace-routes";
import { UrbanCastleApp } from "./UrbanCastleApp";

/**
 * Persistent application shell for every /workspace URL.
 *
 * Module routes bootstrap before UrbanCastleApp mounts. Direct entity routes
 * keep the same shell mounted but delay managed browser-history initialization
 * until the secure workspace, requested record and durable tab have been
 * restored. This prevents synthetic module-only or default-tab Back entries.
 */
export function WorkspaceRouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const authUser = useRDashStore((state) => state.authUser);
  const db = useRDashStore((state) => state.db);
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const detailPanel = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);

  const [initialSelection] = React.useState(() =>
    selectWorkspaceRoute(pathname, useRDashStore.getState().activeModuleId),
  );
  const initialEntityKind = initialSelection?.entity?.kind;
  const initialTabExplicit = initialEntityKind === "customer"
    ? workspaceCustomerTabRequest(search).explicit
    : workspaceDetailTabRequest(search, initialEntityKind).explicit;
  const initialHistoryEnabled = !initialSelection?.entity && !initialTabExplicit;
  const historyStartedRef = React.useRef(initialHistoryEnabled);
  const handledEntityRef = React.useRef<string | null>(null);
  const [bootstrapped, setBootstrapped] = React.useState(false);
  const [historyEnabled, setHistoryEnabled] = React.useState(initialHistoryEnabled);

  const selection = React.useMemo(
    () => selectWorkspaceRoute(pathname, activeModuleId),
    [activeModuleId, pathname],
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

    if (!nextSelection?.entity) {
      const tabRequest = workspaceDetailTabRequest(search, undefined);
      if (tabRequest.explicit) {
        const canonicalUrl = workspaceUrlWithDetailTab(pathname, search, undefined, undefined);
        router.replace(canonicalUrl);
      } else {
        startHistory();
      }
    }

    const timer = window.setTimeout(() => setBootstrapped(true), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router, search, startHistory]);

  React.useEffect(() => {
    const moduleId = selection?.moduleId || activeModuleId;
    document.title = workspaceLocationPresentation({
      db,
      moduleId,
      detail: detailPanel,
      contextHistory,
      contextHistoryIndex,
    }).documentTitle;
  }, [activeModuleId, contextHistory, contextHistoryIndex, db, detailPanel, selection]);

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

    const currentUrl = search ? `${pathname}?${search}` : pathname;
    let current = useRDashStore.getState();
    if (current.detailPanel.kind !== entity.kind || current.detailPanel.recordId !== entity.id) {
      current.openDetail(entity.kind, entity.id, selection.moduleId);
      current = useRDashStore.getState();
    }

    let canonicalUrl: string;
    if (entity.kind === "customer") {
      const tabRequest = workspaceCustomerTabRequest(search);
      canonicalUrl = workspaceUrlWithCustomerTab(pathname, search, tabRequest.tab);
      const contextEntry = current.contextHistoryIndex >= 0
        ? current.contextHistory[current.contextHistoryIndex]
        : undefined;
      if (
        current.detailPanel.fromModule === "context" &&
        contextEntry?.kind === "customer" &&
        (contextEntry.customerTab || "overview") !== tabRequest.tab
      ) {
        current.setContextCustomerTab(tabRequest.tab);
      }
    } else {
      const tabRequest = workspaceDetailTabRequest(search, entity.kind);
      canonicalUrl = workspaceUrlWithDetailTab(
        pathname,
        search,
        entity.kind,
        tabRequest.tab,
      );
      if (
        supportsWorkspaceDetailTabs(entity.kind) &&
        current.detailPanel.fromModule === "context" &&
        current.detailPanel.panelTab !== tabRequest.tab
      ) {
        current.setContextDetailTab(tabRequest.tab);
      }
    }

    handledEntityRef.current = `opened:${entityKey}`;
    if (canonicalUrl !== currentUrl) {
      router.replace(canonicalUrl);
      return;
    }
    startHistory();
  }, [authUser, db, pathname, router, search, selection, startHistory]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange>
      {bootstrapped ? <UrbanCastleApp historyEnabled={historyEnabled} /> : <WorkspaceRouteLoading />}
      {/* One Toaster per route root. The shared wrapper (ui/sonner) picks the
          responsive position itself — never pin position here, it used to force
          top-right on phones and cover the sticky workspace header. */}
      <Toaster richColors />
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
