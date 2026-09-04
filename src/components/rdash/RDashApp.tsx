"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { initAuthFetch, clearSessionToken } from "@/lib/rdash/client-auth";
import { workspaceReadState } from "@/lib/rdash/workspace-read-state";
import { loadedWorkspaceCollections } from "@/lib/rdash/workspace-delta";
import { workspaceFoundationRevisionState } from "@/lib/rdash/workspace-foundation-revision-state";
import { toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceModulePanels } from "./WorkspaceModuleRouter";
import { FavoritesBar } from "./FavoritesBar";
import { requestNotificationPermission, notifyPendingApprovals } from "@/lib/rdash/notifications";
import { configureWorkspaceOutboxScope } from "@/lib/uploads/workspace-outbox";
const DetailPanel = React.lazy(() => import("./DetailPanelWithHistory").then((module) => ({ default: module.DetailPanelWithHistory })));
const CommandPalette = React.lazy(() => import("./CommandPalette").then((module) => ({ default: module.CommandPalette })));
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { OnboardingWizard } from "./OnboardingWizard";
import { PromptDialogProvider } from "./PromptDialog";
import { ConfirmDialogProvider } from "./ConfirmDialog";
const ActionDialogsHost = React.lazy(() => import("./ActionDialogs").then((module) => ({ default: module.ActionDialogsHost })));
const QuotationAcceptanceDialog = React.lazy(() => import("./QuotationAcceptanceDialog").then((module) => ({ default: module.QuotationAcceptanceDialog })));
const EditDetailsDialogHost = React.lazy(() => import("./EditDetailsDialogHost").then((module) => ({ default: module.EditDetailsDialogHost })));
const ScrollToTop = React.lazy(() => import("./ScrollToTop").then((module) => ({ default: module.ScrollToTop })));
const QuickAddSheet = React.lazy(() => import("./QuickAddSheet").then((module) => ({ default: module.QuickAddSheet })));
const MapCacheRegistration = React.lazy(() => import("./MapCacheRegistration").then((module) => ({ default: module.MapCacheRegistration })));
const AutoGeofenceMonitor = React.lazy(() => import("./AutoGeofenceMonitor").then((module) => ({ default: module.AutoGeofenceMonitor })));
const StaffLocationTracker = React.lazy(() => import("./StaffLocationTracker").then((module) => ({ default: module.StaffLocationTracker })));
export function RDashApp() {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const setCommandPaletteOpen = useRDashStore((s) => s.setCommandPaletteOpen);
    const quickAddOpen = useRDashStore((s) => s.quickAddOpen);
    const setQuickAddOpen = useRDashStore((s) => s.setQuickAddOpen);
    const loadedCollections = React.useMemo(() => loadedWorkspaceCollections(db), [db]);
    const collectionCount = React.useCallback((collection: string, count: number) =>
        loadedCollections && !loadedCollections.has(collection) ? "—" : String(count), [loadedCollections]);
    const [secureBootstrapReady, setSecureBootstrapReady] = React.useState(false);
    const [secureWorkspaceError, setSecureWorkspaceError] = React.useState<string | null>(null);
    const secureWorkspaceReady = secureBootstrapReady;
    // CRON-7: Request notification permission on mount + check pending approvals
    React.useEffect(() => {
        requestNotificationPermission();
    }, []);
    React.useEffect(() => {
        if (!secureWorkspaceReady) return;
        const pendingCount = db.actions?.filter((a: any) => a.status === "pending").length || 0;
        if (pendingCount > 0) {
            const id = setTimeout(() => notifyPendingApprovals(pendingCount), 3000);
            return () => clearTimeout(id);
        }
    }, [secureWorkspaceReady, db.actions]);
    React.useEffect(() => {
        initAuthFetch();
        let active = true;
        void fetch("/api/bootstrap", { credentials: "same-origin", cache: "no-store" })
            .then(async (response) => {
            const payload = await response.json().catch(() => ({})) as {
                error?: string;
                revision?: number;
                workspaceId?: string;
                data?: import("@/lib/rdash/types").RDashDatabase;
                rowVersions?: Record<string, number>;
                user?: {
                    userId: string;
                    name: string;
                    email: string;
                    role: string;
                    staffId?: string;
                    expiresAt: number;
                };
            };
            if (response.status === 401) {
                clearSessionToken();
                window.location.replace("/signin");
                return;
            }
            if (!response.ok || typeof payload.revision !== "number" || !payload.user || !payload.data)
                throw new Error(payload.error || "The secure workspace session could not be initialized.");
            if (!active)
                return;
            configureWorkspaceOutboxScope({
                workspaceId: payload.workspaceId || "default",
                ownerUserId: payload.user.userId,
            });
            const hydrated = useRDashStore.getState().hydrateSecureWorkspace({
                db: payload.data,
                revision: payload.revision,
                user: payload.user,
                rowVersions: payload.rowVersions,
            });
            if (!hydrated)
                throw new Error("The workspace bootstrap was older than the active browser session. Reload to establish a clean revision epoch.");
            workspaceFoundationRevisionState.replace(payload.revision);
            workspaceReadState.recordResponse(response);
            setSecureBootstrapReady(true);
        })
            .catch((error) => {
            if (active)
                setSecureWorkspaceError(error instanceof Error ? error.message : "The secure workspace session could not be initialized.");
        });
        return () => { active = false; };
    }, []);

    // Welcome once per loaded app shell. Workspace health belongs in the
    // persistent header notification center and its respective modules, not
    // in the transient toast stack on every hard refresh.
    const welcomedRef = React.useRef(false);
    React.useEffect(() => {
        if (!secureWorkspaceReady || welcomedRef.current) return;
        welcomedRef.current = true;
        const authUser = useRDashStore.getState().authUser;
        const firstName = authUser?.name?.split(" ")[0] || "there";
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Working late";
        // Fire an immediate welcome toast (don't wait for the summary fetch).
        toast.success(`${greeting}, ${firstName}`, {
            description: authUser?.role ? `Signed in as ${authUser.role}` : "Session active",
            duration: 4000,
        });
    }, [secureWorkspaceReady]);
    // Surface workspace sync errors as a visible toast so users know when an
    // edit was rejected by the server (validation, conflict, or permission).
    // Without this, rejections only show as a tiny "Save rejected" header text
    // that is easy to miss — especially on mobile/tablet where it's hidden.
    const workspaceSyncStatus = useRDashStore((s) => s.workspaceSyncStatus);
    const workspaceSyncError = useRDashStore((s) => s.workspaceSyncError);
    const lastSyncErrorRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (workspaceSyncStatus === "error" && workspaceSyncError && workspaceSyncError !== lastSyncErrorRef.current) {
            lastSyncErrorRef.current = workspaceSyncError;
            toast.error("Change rejected", {
                description: workspaceSyncError,
                duration: 8000,
                action: {
                    label: "Refresh workspace",
                    onClick: () => window.location.reload(),
                },
            });
        }
        if (workspaceSyncStatus === "saved") {
            lastSyncErrorRef.current = null;
        }
    }, [workspaceSyncStatus, workspaceSyncError]);
    // G-then-key navigation (like Slack/Gmail): press G, then a letter to jump
    // to a module. G+I = Thread Inbox, G+D = Daily Work, G+C = Customer Desk,
    // G+S = Sales Pipeline, G+F = Field Visits, G+P = Procurement.
    const gSequenceRef = React.useRef<number | null>(null);
    React.useEffect(() => {
        const G_MODULE_MAP: Record<string, string> = {
            i: "unifiedThreadInbox",
            d: "workdesk",
            c: "customerTimeline",
            s: "salesPipeline",
            f: "siteMeasurement",
            p: "grn",
        };
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable))
                return;
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                return;
            // G-then-key sequence for quick module navigation.
            if (gSequenceRef.current !== null) {
                const key = event.key.toLowerCase();
                const moduleId = G_MODULE_MAP[key];
                if (moduleId) {
                    event.preventDefault();
                    setActiveModule(moduleId);
                }
                // Clear the G-sequence regardless (single-use).
                gSequenceRef.current = null;
                return;
            }
            if (event.key === "g" || event.key === "G") {
                event.preventDefault();
                gSequenceRef.current = Date.now();
                // Auto-clear after 1.2s if no second key pressed.
                setTimeout(() => {
                    if (gSequenceRef.current !== null) gSequenceRef.current = null;
                }, 1200);
                return;
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [setActiveModule]);
    if (!secureWorkspaceReady) {
        const loadingMessage = secureWorkspaceError || "Verifying your session and loading the workspace bootstrap…";
        return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card"><h1 className="text-lg font-bold">Loading protected workspace</h1><p className="mt-2 text-sm text-muted-foreground">{loadingMessage}</p>{secureWorkspaceError ? <button type="button" className="mt-4 text-sm font-semibold text-primary underline" onClick={() => window.location.reload()}>Retry</button> : null}</div></main>;
    }
    return (<PromptDialogProvider><ConfirmDialogProvider><div className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <WorkspaceHeader />
          <FavoritesBar />
          <main className="rd-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0">
            <WorkspaceModulePanels />
          </main>
          <button type="button" aria-label="Quick add" onClick={() => setQuickAddOpen(true)} className="absolute bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 animate-pulse-ring lg:hidden" style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
            <Plus className="h-5 w-5"/>
          </button>
          <React.Suspense fallback={null}>
            <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen}/>
          </React.Suspense>
          <OnboardingWizard />
          <footer className="rd-sidebar-header mt-auto hidden shrink-0 items-center justify-between gap-2 border-t border-border px-[var(--page-pad)] py-2 text-[11px] text-muted-foreground md:flex">
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-primary/10 text-[8px] font-black text-primary">
                UC
              </span>
              <span className="font-semibold text-foreground/80">Urban Castle</span>
            </div>
            <div className="flex items-center gap-2" title="A dash means that collection is outside the current module's scoped snapshot.">
              <span className="rd-tabular">{collectionCount("customers", db.customers.length)} customers</span>
              <span className="hidden sm:inline" aria-hidden>
                ·
              </span>
              <span className="hidden sm:inline rd-tabular">
                {collectionCount("workOrders", db.workOrders.length)} workOrders
              </span>
              <span className="hidden sm:inline" aria-hidden>
                ·
              </span>
              <span className="hidden sm:inline rd-tabular">
                {collectionCount("purchaseOrders", db.purchaseOrders.length)} POs
              </span>
            </div>
          </footer>
        </div>
      </div>
      <React.Suspense fallback={null}>
        <MapCacheRegistration />
        <AutoGeofenceMonitor />
        <StaffLocationTracker />
        <DetailPanel />
        <CommandPalette />
        <KeyboardShortcutsHelp />
        <ActionDialogsHost />
        <QuotationAcceptanceDialogHost />
        <EditDetailsDialogHost />
        <ScrollToTop />
      </React.Suspense>
    </div></ConfirmDialogProvider></PromptDialogProvider>);
}
function QuotationAcceptanceDialogHost() {
    const quotationAcceptanceDialog = useRDashStore((s) => s.quotationAcceptanceDialog);
    const closeQuotationAcceptanceDialog = useRDashStore((s) => s.closeQuotationAcceptanceDialog);
    return (<QuotationAcceptanceDialog open={!!quotationAcceptanceDialog} quotationId={quotationAcceptanceDialog?.quotationId} onClose={closeQuotationAcceptanceDialog}/>);
}
