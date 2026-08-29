"use client";
import { create } from "zustand";
import type { RDashDatabase, Customer, Task, Followup, Visit, Quotation, QuotationItem, Payment, CustomerInvoice, CustomerReceipt, ApprovalAction, WorkOrder, WorkOrderBOQ, WorkOrderBOQ as WorkOrderBOQT, PurchaseOrder, GRN, InventoryItem, StockMovement, SiteDispatch, VendorBill, VendorPayment, ContractorBill, ContractorPayment, Commission, WorkOrderCostLine, ContractorBid, ContractorSettlement, Drawing, DailyExecutionLog, VisitRoutePoint, Site, Area, Thread, ThreadMessage, ThreadKind, LineItem, BlockedItem, RiskItem, Master, FileAsset, FileAssetCreateInput, EntityFileAttachment, EntityReferenceAssignment, AttendancePolicy, AttendanceRecord, VariationRequest, RecurringTaskDefinition, VisitType, } from "./types";
// mergeStaffLocationPings, StaffLocationPing moved to slices/core.ts (Phase 3o)
import { applyVendorRateAverages } from "./vendor-rate-average";
import { attachCustomerLabels, customerName, customerNameForJob, } from "./customer";
import { assertUniqueCustomerIdentity } from "./customer-identity";
import { dateFromIso, isAtOrAfterTime, minutesLate, verifyOfficeExitGps, verifyOfficeGps, verifyVisitExitGps, verifyVisitGps, type GpsCapture, } from "./gps";
import { areaDependencySummary, BusinessRuleError, assertAreaBelongsToSite, assertCustomerExists, assertAreasBelongToSite, assertWorkCategoryId, assertWorkSubcategoryId, assertFinanceContext, assertMeasurementRevisionRelations, assertQuotationRelations, assertSiteBelongsToCustomer, assertSiteExists, assertWorkOrderRelations, assertWorkRequiredMatchesContext, replaceAreaId, validateBusinessData, } from "./business-rules";
import { resolveCustomerIdFromLinks } from "./customer-relations";
import { diffWorkspaceOperations } from "./workspace-operations";
import { createEmptyWorkspaceDatabase, mergeWorkspaceSnapshot, mergeWorkspaceVersionMap, normalizeWorkspaceSession, workspaceHydrationRevisionIsCurrent, workspaceSnapshotRemovedRowVersionKeys } from "./workspace-session-merge";
import { workspaceFoundationRevisionState } from "./workspace-foundation-revision-state";
import { workspaceReadCache } from "./workspace-read-cache";
import { deletedWorkspaceOperationVersionKeys, workspaceRowVersionState } from "./workspace-row-version-state";
import { invalidateWorkspaceClientCaches } from "./client-auth";
import { beginWorkspaceOutboxResetBarrier, cancelWorkspaceOutboxResetBarrier, resetWorkspaceOutboxAfterWorkspaceReset } from "../uploads/workspace-outbox";
import { classifyWorkspaceSaveOutcome } from "./workspace-save-outcome";
import { persistWorkspaceTabs, restoreWorkspaceTabs } from "./tab-persistence";
import { isRegisteredModuleId, resolveRenderer } from "./modules";
// canonicalModuleId, resolveRenderer moved to slices/ui.ts (Phase 3o)
import { attendancePolicyForStaff, attendancePolicyForVisit, createDefaultAttendancePolicy } from "./attendance-policy";
// Re-export UI types from the store/ subfolder (Phase 1 split)
export type { WorkspaceTab, DetailPanelKind, ContextCustomerTab, ContextDetailTab, ContextHistoryEntry, DetailPanelState, ContextRecord, CurrentUserContext, AuthenticatedWorkspaceUser, WorkspaceSyncStatus, GuardResult, SavedView, CreateDialogKind, CreateDialogRequest, } from "./store/ui-types";
import type { WorkspaceTab, DetailPanelKind, ContextCustomerTab, ContextDetailTab, ContextHistoryEntry, DetailPanelState, ContextRecord, CurrentUserContext, AuthenticatedWorkspaceUser, WorkspaceSyncStatus, GuardResult, SavedView, CreateDialogKind, CreateDialogRequest, } from "./store/ui-types";
import type { RDashState } from "./store/types";
import type { StoreContext } from "./store/context";
import { createRisksSlice } from "./store/slices/risks";
import { createThreadsSlice } from "./store/slices/threads";
import { createFilesSlice } from "./store/slices/files";
import { createMastersSlice } from "./store/slices/masters";
import { createFinanceSlice } from "./store/slices/finance";
import { createVendorBillsSlice } from "./store/slices/vendor-bills";
import { createContractorsSlice } from "./store/slices/contractors";
import { createProcurementSlice } from "./store/slices/procurement";
import { createQuotationsSlice } from "./store/slices/quotations";
import { createExecutionSlice } from "./store/slices/execution";
import { createVisitsSlice } from "./store/slices/visits";
import { createTasksSlice } from "./store/slices/tasks";
import { createCrmSlice } from "./store/slices/crm";
import { createUISlice } from "./store/slices/ui";
import { createCoreSlice } from "./store/slices/core";
import { googleFileIdFromUrl, isStoredMediaUrl, userForRole, userForAnyRole, addDays, isOwnerOrOperations } from "./store/helpers";
import {
    milestoneOrder, paymentSequenceGroup, assertPaymentMilestoneSequence,
    dateOnlyFrom, isPaymentChaseNeeded, assertServiceFinanceContext,
    paymentFollowupTitle, invoiceStatusFromPayment, paymentStatusFromInvoice,
    buildInvoiceDraftFromPayment, syncInvoiceWithPayment,
    isOpenFollowup, findOpenLinkedFollowup, upsertPaymentFollowup,
    canonicalPaymentEvent, materializePaymentSchedule, eventMatchesPaymentTrigger,
} from "./store/finance-helpers";
// inferAttachmentRole, resolveAttachmentEntityLabel moved to files slice (Phase 3c)
// userForRole, userForAnyRole moved to helpers (Phase 3g)
function permissionError(role: string, action: string) {
    return new Error(`Permission denied: ${role} cannot ${action}.`);
}
function assertRole(role: string, allowed: string[], action: string) {
    if (!allowed.includes(role))
        throw permissionError(role, action);
}
// contractorPaymentProofStatus moved to helpers (Phase 3h)
// milestoneOrder, paymentSequenceGroup, assertPaymentMilestoneSequence moved to finance-helpers (Phase 3f)
function visitRoutePoint(kind: VisitRoutePoint["kind"], latitude: number, longitude: number, source: VisitRoutePoint["source"], note?: string): VisitRoutePoint {
    return {
        id: genId(`route-${kind}`),
        kind,
        latitude,
        longitude,
        captured_at: nowIso(),
        source,
        note,
    };
}
// resolveVisitLocation moved to slices/visits.ts (Phase 3l)
function genId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}
const nowIso = () => new Date().toISOString();
// coverageAcceptedValue, quotationAcceptanceWarnings moved to store/quotations-helpers.ts (Phase 3j)
// assertQuotationEditable, assertQuotationStatusTransition moved to slices/quotations.ts (Phase 3j)
const today = () => businessDate();
// dateOnlyFrom moved to finance-helpers (Phase 3f)
// addDays moved to helpers (Phase 3h)
// isStoredMediaUrl moved to store/helpers.ts (Phase 3i)
// googleFileIdFromUrl moved to store/helpers.ts (Phase 3c)
// canonicalPaymentEvent, materializePaymentSchedule, eventMatchesPaymentTrigger moved to finance-helpers (Phase 3h)
// isOpenFollowup moved to finance-helpers (Phase 3f)
// BUSINESS_DECISION_TASK_TYPES, isBusinessDecisionTask moved to slices/tasks.ts (Phase 3m)
function businessDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
function isOverdueDate(dueDate: string | undefined, at = new Date()) {
    return Boolean(dueDate && dueDate < businessDate(at));
}
// isScheduledBefore moved to slices/tasks.ts (Phase 3m)
// visitAssigneeType, activeStaffMember, activeContractor, assertVisitOwnership moved to slices/visits.ts (Phase 3l)
// isOwnerOrOperations moved to store/helpers.ts (Phase 3l)
// isAssignedToActor moved to slices/tasks.ts (Phase 3m)
// assertTaskActor moved to slices/tasks.ts (Phase 3m)
// assertFollowupActor moved to slices/tasks.ts (Phase 3m)
// assertVisitTimeWindow, visitAssigneeKey, assertVisitSchedulingAvailability moved to slices/visits.ts (Phase 3l)
// nextRecurringRun moved to slices/tasks.ts (Phase 3m)
// normalizeVisitSchedule moved to slices/visits.ts (Phase 3l)
// isPaymentChaseNeeded, assertServiceFinanceContext moved to finance-helpers (Phase 3f)
// assertProcurementContext moved to slices/procurement.ts (Phase 3i)
// Work Required lifecycle policies live in work-required-lifecycle.ts and are shared across slices.
// paymentFollowupTitle, invoiceStatusFromPayment, paymentStatusFromInvoice,
// buildInvoiceDraftFromPayment, syncInvoiceWithPayment moved to finance-helpers (Phase 3f)
// Hydration is pure; record creation belongs to explicit business actions.
// quotationWorkRequiredIds, primaryWorkRequiredId, upsertQuotationFollowup moved to slices/quotations.ts (Phase 3j)
// upsertPaymentFollowup moved to finance-helpers (Phase 3f)
// upsertMissedVisitFollowup moved to slices/visits.ts (Phase 3l)
// detailRecordExists, detailRecordCustomerId, contextDetailPanel moved to slices/ui.ts (Phase 3o)
export const useRDashStore = create<RDashState>()((setBase, get) => {
    type StateUpdate = Partial<RDashState> | ((state: RDashState) => Partial<RDashState>);
    let serverRevisionForQueue = 0;
    let lastAcceptedServerRevision = 0;
    let lastAcceptedServerDb: RDashDatabase | null = null;
    let serverSyncQueue: Promise<void> = Promise.resolve();
    let syncEpoch = 0;
    // Per-row revisions are the canonical optimistic-concurrency signal.
    let rowVersionsCache: Record<string, number> | null = null;
    interface WorkspaceTransaction {
        name: string;
        depth: number;
        baselineDb: RDashDatabase | null;
        dirty: boolean;
    }
    let activeWorkspaceTransaction: WorkspaceTransaction | null = null;
    const restoreAcceptedWorkspace = (error: string) => {
        const source = lastAcceptedServerDb;
        if (source) {
            const restored = normalizeWorkspaceSession(structuredClone(source) as RDashDatabase);
            setBase({
                db: restored,
                serverRevision: lastAcceptedServerRevision,
                workspaceSyncStatus: "error",
                workspaceSyncError: error,
            });
            serverRevisionForQueue = lastAcceptedServerRevision;
            return;
        }
        setBase({ workspaceSyncStatus: "error", workspaceSyncError: error });
    };
    const queueSecureWorkspaceSave = (db: RDashDatabase) => {
        if (typeof window === "undefined")
            return;
        const snapshot = structuredClone(db) as RDashDatabase;
        const saveEpoch = syncEpoch;
        serverSyncQueue = serverSyncQueue
            .catch(() => undefined)
            .then(async () => {
            if (saveEpoch !== syncEpoch)
                throw new Error(get().workspaceSyncError || "The server rejected this change before it could be confirmed.");
            if (!get().authUser)
                throw new Error("Sign in before saving changes to the workspace.");
            setBase({ workspaceSyncStatus: "saving", workspaceSyncError: null });
            const baseline = lastAcceptedServerDb || snapshot;
            const operations = diffWorkspaceOperations(baseline, snapshot);
            if (!operations.length) {
                setBase({ workspaceSyncStatus: "saved", workspaceSyncError: null });
                return;
            }
            let response: Response;
            try {
                const commitBody: Record<string, unknown> = {
                    revision: serverRevisionForQueue,
                    operations,
                };
                if (rowVersionsCache && Object.keys(rowVersionsCache).length > 0) {
                    // Only send expectedRowVersions for rows this commit touches
                    // (to avoid sending the entire version map every time).
                    const touchedIds = new Set<string>();
                    for (const op of operations) {
                        for (const row of op.upsert || []) {
                            const id = String(row.id || "");
                            if (id && rowVersionsCache[id] !== undefined) touchedIds.add(id);
                        }
                    }
                    if (touchedIds.size > 0) {
                        const expectedRowVersions: Record<string, number> = {};
                        for (const id of touchedIds) expectedRowVersions[id] = rowVersionsCache[id];
                        commitBody.expectedRowVersions = expectedRowVersions;
                    }
                }
                response = await fetch("/api/operations/commit", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(commitBody),
                });
            }
            catch (error) {
                if (saveEpoch !== syncEpoch) return;
                const message = error instanceof Error && error.message
                    ? error.message
                    : "Could not reach the PostgreSQL operation server. Your change is saved locally and will retry after connectivity is restored.";
                setBase({
                    workspaceSyncStatus: "error",
                    workspaceSyncError: message,
                });
                throw new Error(message, { cause: error });
            }
            if (saveEpoch !== syncEpoch) return;
            const payload = (await response.json().catch(() => ({}))) as {
                status?: "applied" | "processing";
                error?: string;
                revision?: number;
                patches?: import("./workspace-operations").WorkspaceOperation[];
                rowVersions?: Record<string, number>;
            };
            const outcome = classifyWorkspaceSaveOutcome(response.status, payload.status);
            if (outcome === "rejected") {
                syncEpoch += 1;
                const message = payload.error || "The server rejected this change. The last confirmed workspace was restored.";
                restoreAcceptedWorkspace(message);
                if (response.status === 401)
                    window.location.assign("/signin");
                throw new Error(message);
            }
            if (outcome === "pending") {
                const message = "Saved locally and waiting for server confirmation. Keep this form open until synchronization completes.";
                setBase({ workspaceSyncStatus: "saving", workspaceSyncError: message });
                throw new Error(message);
            }
            if (typeof payload.revision === "number") {
                const accepted = normalizeWorkspaceSession(snapshot);
                serverRevisionForQueue = payload.revision;
                lastAcceptedServerRevision = payload.revision;
                lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
                const acceptedOperations = Array.isArray(payload.patches) ? payload.patches : operations;
                const deletedVersionKeys = deletedWorkspaceOperationVersionKeys(acceptedOperations);
                rowVersionsCache = mergeWorkspaceVersionMap(rowVersionsCache, payload.rowVersions);
                for (const key of deletedVersionKeys) {
                    if (rowVersionsCache) delete rowVersionsCache[key];
                }
                workspaceRowVersionState.merge(payload.rowVersions);
                workspaceRowVersionState.remove(deletedVersionKeys);
                setBase({
                    serverRevision: payload.revision,
                    workspaceSyncStatus: "saved",
                    workspaceSyncError: null,
                });
            }
        });
    };
    const commitState = (partial: StateUpdate) => {
        // Persist the tab strip whenever a commit touches it (open/close/activate
        // tabs) so a reload restores the same working set.
        const maybePersistTabs = (previous: { tabs?: WorkspaceTab[]; activeTabId?: string | null }, next: Partial<RDashState>) => {
            if (!("tabs" in next) && !("activeTabId" in next)) return;
            const merged = { ...previous, ...next } as { tabs: WorkspaceTab[]; activeTabId: string | null };
            if (Array.isArray(merged.tabs)) persistWorkspaceTabs(merged.tabs, merged.activeTabId);
        };
        if (activeWorkspaceTransaction) {
            setBase((state) => {
                const next = typeof partial === "function" ? partial(state) : partial;
                maybePersistTabs(state, next);
                if (!next.db)
                    return next;
                if (!activeWorkspaceTransaction!.baselineDb) {
                    activeWorkspaceTransaction!.baselineDb = structuredClone(state.db) as RDashDatabase;
                }
                activeWorkspaceTransaction!.dirty = true;
                const averagedDb = applyVendorRateAverages(state.db, next.db);
                return { ...next, db: attachCustomerLabels(averagedDb) };
            });
            return;
        }
        let persisted: RDashDatabase | null = null;
        setBase((state) => {
            const next = typeof partial === "function" ? partial(state) : partial;
            maybePersistTabs(state, next);
            if (!next.db)
                return next;
            const db = attachCustomerLabels(applyVendorRateAverages(state.db, next.db));
            // Validate but don't block — log issues instead of throwing.
            // Throwing inside setBase can leave the Zustand state inconsistent
            // and cause the UI to hang (setSaving(false) in finally blocks
            // never runs because the error propagates through the setter).
            const dataIssues = validateBusinessData(db);
            if (dataIssues.length) {
                console.warn("[commitState] Data integrity warning:", dataIssues[0]);
            }
            persisted = db;
            return { ...next, db };
        });
        if (persisted)
            queueSecureWorkspaceSave(persisted);
    };
    // StoreContext — passed to every slice factory (Phase 3 split)
    const ctx: StoreContext = {
        get: get as any,
        setBase: setBase as any,
        commitState: commitState as any,
        isNestedTransaction: () => Boolean(activeWorkspaceTransaction && activeWorkspaceTransaction.depth > 1),
    };
    const runWorkspaceTransaction = <T,>(name: string, operation: () => T): T => {
        if (activeWorkspaceTransaction) {
            activeWorkspaceTransaction.depth += 1;
            try {
                return operation();
            }
            finally {
                activeWorkspaceTransaction.depth -= 1;
            }
        }
        const transaction: WorkspaceTransaction = {
            name,
            depth: 1,
            baselineDb: null,
            dirty: false,
        };
        activeWorkspaceTransaction = transaction;
        // STAGE-5-FIX (5.3): Shared finish/error/cleanup helpers. The lock is
        // cleared in the sync path's finally OR in the async path's .then/.catch
        // — NOT in a shared finally (which would run synchronously and clear the
        // lock before the async Promise resolves, defeating the fix).
        const finishSync = () => {
            if (transaction.dirty) {
                const finalDb = attachCustomerLabels(get().db);
                const dataIssues = validateBusinessData(finalDb);
                if (dataIssues.length) {
                    console.warn(`[runWorkspaceTransaction:${name}] Data integrity warning:`, dataIssues[0]);
                }
                setBase({ db: finalDb });
                queueSecureWorkspaceSave(finalDb);
            }
        };
        const handleError = (error: unknown) => {
            if (transaction.baselineDb) {
                setBase({
                    db: attachCustomerLabels(transaction.baselineDb),
                    workspaceSyncStatus: "error",
                    workspaceSyncError: error instanceof Error
                        ? `${name} was rolled back: ${error.message}`
                        : `${name} was rolled back.`,
                });
            }
        };
        const isPromise = (v: unknown): v is Promise<unknown> =>
            v != null && typeof (v as { then?: unknown }).then === "function";

        try {
            const result = operation();
            if (isPromise(result)) {
                // Async path: chain finish/cleanup onto the Promise so the
                // transaction lock persists until the async work resolves.
                // Do NOT clear the lock in the sync finally below.
                return result.then(
                    (v: unknown) => { finishSync(); activeWorkspaceTransaction = null; return v; },
                    (e: unknown) => { handleError(e); activeWorkspaceTransaction = null; throw e; },
                ) as unknown as T;
            }
            // Sync path
            finishSync();
            return result;
        }
        catch (error) {
            handleError(error);
            throw error;
        }
        finally {
            // Only clear the lock for the SYNC path. For the async path, the
            // lock was already cleared in .then/.catch above. We detect the
            // sync path by checking if the transaction is still active (async
            // path already set it to null in .then/.catch).
            if (activeWorkspaceTransaction === transaction) {
                activeWorkspaceTransaction = null;
            }
        }
    };
    // Core slice (Phase 3o) — 7 extractable core actions. hydrateSecureWorkspace +
    // resetDatabase stay inline below because they read/write closure vars
    // (serverRevisionForQueue, lastAcceptedServerRevision, lastAcceptedServerDb,
    // syncEpoch, restoreAcceptedWorkspace).
    const coreSlice = createCoreSlice(ctx);
    // UI slice (Phase 3o) — 31 UI actions. State field initializers stay inline below.
    const uiSlice = createUISlice(ctx);
    // Tab persistence: restore the session's open tab strip across reloads
    // (labels re-resolved from the registry; unknown moduleIds dropped).
    const restoredTabs = restoreWorkspaceTabs((moduleId) => {
        try {
            if (!isRegisteredModuleId(moduleId)) return null;
            const resolved = resolveRenderer(moduleId);
            return { label: resolved.label, icon: resolved.icon };
        } catch {
            return null;
        }
    });
    // Seed the in-app module history with the restored active module so the
    // header Back button can return to Today after a tab-restore reload
    // (previously the strip came back but history still thought the user had
    // never left the workdesk).
    const restoredActiveTab = restoredTabs?.tabs.find((tab) => tab.id === restoredTabs.activeTabId);
    const restoredHistoryEntry = restoredActiveTab && restoredActiveTab.moduleId !== "workdesk"
        ? (() => {
            try {
                if (!isRegisteredModuleId(restoredActiveTab.moduleId)) return null;
                const resolved = resolveRenderer(restoredActiveTab.moduleId);
                return { id: `nav-${restoredActiveTab.moduleId}`, moduleId: restoredActiveTab.moduleId, label: resolved.label, icon: resolved.icon };
            } catch {
                return null;
            }
        })()
        : null;
    const state: RDashState = {
        db: createEmptyWorkspaceDatabase(),
        activeModuleId: restoredActiveTab?.moduleId ?? "workdesk",
        moduleHistory: restoredHistoryEntry
            ? [
                { id: "nav-today", moduleId: "workdesk", label: "Today", icon: "🗂️" },
                restoredHistoryEntry,
            ]
            : [
                { id: "nav-today", moduleId: "workdesk", label: "Today", icon: "🗂️" },
            ],
        moduleHistoryIndex: restoredHistoryEntry ? 1 : 0,
        moduleSearch: "",
        workspaceSearch: "",
        tabs: restoredTabs?.tabs ?? [
            { id: "tab-today", moduleId: "workdesk", label: "🗂️ Today", icon: "🗂️" },
        ],
        activeTabId: restoredTabs?.activeTabId ?? "tab-today",
        selectedCustomerId: null,
        mobileNavOpen: false,
        sidebarCollapsed: false,
        moreMenuOpen: false,
        quickAddOpen: false,
        keyboardShortcutsOpen: false,
        authUser: null,
        serverRevision: 0,
        workspaceSyncStatus: "idle",
        workspaceSyncError: null,
        // FIX-E2E-001: Expose the server sync queue so callers can await the
        // commit before starting dependent operations (e.g. file uploads that
        // require the entity to exist server-side). Without this, uploads
        // started immediately after createCustomerWithFirstSite race the
        // server commit and fail with "Site does not exist" (422).
        awaitServerSync: () => serverSyncQueue,
        staffLocationPings: [],
        // ── Integrity layer (Phase 4): initial state. The first
        //     runIntegrityCheck() call (or hydration) populates this. ──
        integrityReport: null,
        // ── Core slice (Phase 3o) — 7 extractable core actions:
        //     replaceStaffLocationPings, upsertStaffLocationPing, currentUser,
        //     canReleaseContractorPayment, mutateMaster, dataIssues, logAudit.
        //     hydrateSecureWorkspace + resetDatabase stay inline (closure vars). ──
        ...coreSlice,
        acceptWorkspaceServerRevision: ({ revision, rowVersions, deletedRowVersionKeys }) => {
            const current = get();
            const nextRevision = Math.max(
                revision,
                current.serverRevision,
                serverRevisionForQueue,
                lastAcceptedServerRevision,
            );
            serverRevisionForQueue = nextRevision;
            lastAcceptedServerRevision = nextRevision;
            lastAcceptedServerDb = structuredClone(current.db) as RDashDatabase;
            rowVersionsCache = mergeWorkspaceVersionMap(rowVersionsCache, rowVersions);
            for (const key of deletedRowVersionKeys || []) {
                if (rowVersionsCache) delete rowVersionsCache[key];
            }
            workspaceRowVersionState.merge(rowVersions);
            workspaceRowVersionState.remove(deletedRowVersionKeys || []);
            setBase({
                serverRevision: nextRevision,
                workspaceSyncStatus: "saved",
                workspaceSyncError: null,
            });
        },
        hydrateSecureWorkspace: ({ db, revision, user, rowVersions, deletedRowVersionKeys }) => {
            const current = get();
            if (!workspaceHydrationRevisionIsCurrent(
                revision,
                current.serverRevision,
                serverRevisionForQueue,
                lastAcceptedServerRevision,
            )) {
                return false;
            }
            const removedVersionKeys = [
                ...workspaceSnapshotRemovedRowVersionKeys(current.db, db),
                ...(deletedRowVersionKeys || []),
            ];
            const accepted = mergeWorkspaceSnapshot(current.db, db);
            const nextRevision = revision;
            serverRevisionForQueue = nextRevision;
            lastAcceptedServerRevision = nextRevision;
            lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
            rowVersionsCache = mergeWorkspaceVersionMap(rowVersionsCache, rowVersions);
            for (const key of removedVersionKeys) {
                if (rowVersionsCache) delete rowVersionsCache[key];
            }
            const selectedCustomerId = current.selectedCustomerId;
            const resolvedCustomerId = accepted.customers.some((customer) => customer.id === selectedCustomerId)
                ? selectedCustomerId
                : accepted.customers[0]?.id || null;
            setBase({
                db: accepted,
                selectedCustomerId: resolvedCustomerId,
                serverRevision: nextRevision,
                authUser: user,
                workspaceSyncStatus: "saved",
                workspaceSyncError: null,
            });
            return true;
        },
        // currentUser, canReleaseContractorPayment moved to core slice (Phase 3o)
        taskPriorityOrder: [],
        recentCreated: [],
        createDialog: null,
        detailPanel: { kind: null, recordId: null },
        contextHistory: [],
        contextHistoryIndex: -1,
        actionDialog: { type: null, customerId: undefined },
        commandPaletteOpen: false,
        savedViews: [],
        quotationAcceptanceDialog: null,
        reportFilter: null,
        // ── UI slice (Phase 3o) — 31 UI actions: openCreateDialog, closeCreateDialog,
        //     openActionDialog, closeActionDialog, setCommandPaletteOpen, addSavedView,
        //     deleteSavedView, renameSavedView, openQuotationAcceptanceDialog,
        //     closeQuotationAcceptanceDialog, quotationAcceptanceWarnings, setActiveModule,
        //     navigateModuleHistory, setModuleSearch, setWorkspaceSearch, openTab, closeTab,
        //     setActiveTab, selectCustomer, setMobileNavOpen, setMoreMenuOpen,
        //     setTaskPriorityOrder, addRecentCreated, openContextCustomer, openContextDetail,
        //     setContextCustomerTab, setContextDetailTab, navigateContextHistory, clearContextHistory,
        //     openDetail, closeDetail ──
        ...uiSlice,
        // ── Tasks slice (Phase 3m) — 12 tasks actions:
        //     addTask, updateTask, completeTask, blockTask, reopenTask,
        //     addFollowup, updateFollowup, completeFollowup,
        //     rescheduleFollowup, runFollowupReconciliation,
        //     toggleRecurringTask, runRecurringTasks ──
        ...createTasksSlice(ctx),
        // ── addWorkRequired, updateWorkRequired moved to crm slice (Phase 3n) ──
        // ── addFollowup, updateFollowup, completeFollowup, rescheduleFollowup,
        //     runFollowupReconciliation moved to tasks slice (Phase 3m) ──
        // ── Visits slice (Phase 3l) — 12 visits actions:
        //     addVisit, markVisitEnRoute, recordVisitTrackingPoint,
        //     startContractorVisit, completeContractorVisit, cancelVisit,
        //     reassignVisit, rescheduleVisit, runVisitReconciliation,
        //     checkInVisit, checkOutVisit, fileVisitReport ──
        ...createVisitsSlice(ctx),
        // ── payment/invoice actions moved to finance slice (Phase 3f) ──
        // ── quotation master + items + milestones actions (updateQuotation, addQuotation,
        //     addQuotationItem, updateQuotationItem, removeQuotationItem,
        //     addQuotationMilestone, updateQuotationMilestone, removeQuotationMilestone)
        //     moved to quotations slice (Phase 3j) ──
        // ── resolveApproval moved to finance slice (Phase 3e) ──
        ...createFinanceSlice(ctx),
        // ── Risks slice (Phase 3a) ──
        ...createRisksSlice(ctx),
        // ── Vendor-bills slice (Phase 3g) ──
        ...createVendorBillsSlice(ctx),
        // ── Contractors slice (Phase 3h) — 12 contractor actions:
        //     addContractor, updateContractor, addContractorBid, updateContractorBid,
        //     selectContractorBid, settleContractor, createContractorRABill,
        //     requestContractorBillPayment, recordContractorPayment,
        //     approveContractorPayment, accrueCommission, payCommission ──
        ...createContractorsSlice(ctx),
        // ── Procurement slice (Phase 3i) — 16 procurement actions:
        //     addVendor, updateVendor, addStaff, updateStaff, createVendorRFQ,
        //     addVendorBid, selectVendorBid, createPOFromVendorBid, createPO,
        //     updatePO, approvePO, sendPO, fileGRN, verifyGRNReceipt,
        //     issueDispatch, acknowledgeDispatch ──
        ...createProcurementSlice(ctx),
        // ── Quotations slice (Phase 3j) — 12 quotations actions:
        //     updateQuotation, addQuotation, addQuotationItem, updateQuotationItem,
        //     removeQuotationItem, addQuotationMilestone, updateQuotationMilestone,
        //     removeQuotationMilestone, reviseQuotationWithHolds, reopenJobForBidding,
        //     acceptQuotationForBidding, updateJob ──
        ...createQuotationsSlice(ctx),
        // ── Execution slice (Phase 3k) — 19 execution actions:
        //     addDrawing, updateDrawing, removeDrawing, approveDrawing,
        //     uploadDrawingVersion, linkBOQItemToDrawing, addExecutionLog,
        //     updateExecutionLog, removeExecutionLog, verifyExecutionProgress,
        //     createVariationRequest, decideVariationRequest, confirmMaterialReceipt,
        //     createBOQ, updateBOQItem, addBOQItem, removeBOQItem, approveBOQ,
        //     addJobCostLine ──
        ...createExecutionSlice(ctx),
        // ── CRM slice (Phase 3n) — 14 CRM actions:
        //     addWorkRequired, updateWorkRequired, addCustomer,
        //     createCustomerWithFirstSite, updateCustomer, mergeCustomers,
        //     addSite, updateSite, archiveSite, addArea, updateArea,
        //     archiveArea, addMeasurementRevision, captureStructuredWorkRequired ──
        ...createCrmSlice(ctx),
        resetDatabase: async (confirmation) => {
            const actor = get().authUser;
            if (!actor || actor.role !== "Owner") {
                throw new Error("Only the signed-in Owner can reset the workspace.");
            }
            if (confirmation.trim() !== "RESET WORKSPACE") {
                throw new Error('Type "RESET WORKSPACE" exactly to confirm the reset.');
            }
            if (typeof window === "undefined") {
                throw new Error("Workspace reset can only be requested from an authenticated browser session.");
            }
            await beginWorkspaceOutboxResetBarrier();
            await serverSyncQueue.catch(() => undefined);
            syncEpoch += 1;
            setBase({ workspaceSyncStatus: "saving", workspaceSyncError: null });
            let response: Response;
            try {
                response = await fetch("/api/workspace/reset", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirmation: "RESET WORKSPACE" }),
                });
            }
            catch {
                cancelWorkspaceOutboxResetBarrier();
                restoreAcceptedWorkspace("Could not reach the server. The workspace was not reset.");
                throw new Error("Could not reach the server. The workspace was not reset.");
            }
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                revision?: number;
                data?: RDashDatabase;
            };
            if (!response.ok || !payload.data || typeof payload.revision !== "number") {
                cancelWorkspaceOutboxResetBarrier();
                restoreAcceptedWorkspace(payload.error || "The server rejected the workspace reset. The last confirmed workspace was restored.");
                throw new Error(payload.error || "The server rejected the workspace reset.");
            }
            const accepted = normalizeWorkspaceSession(payload.data);
            serverRevisionForQueue = payload.revision;
            lastAcceptedServerRevision = payload.revision;
            lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
            rowVersionsCache = null;
            workspaceRowVersionState.replace(undefined);
            workspaceFoundationRevisionState.replace(payload.revision);
            workspaceReadCache.clear();
            invalidateWorkspaceClientCaches();
            serverSyncQueue = Promise.resolve();
            setBase({
                db: accepted,
                serverRevision: payload.revision,
                workspaceSyncStatus: "saved",
                workspaceSyncError: null,
            });
            try {
                await resetWorkspaceOutboxAfterWorkspaceReset(accepted, payload.revision);
            } catch (error) {
                const message = "The workspace was reset on the server, but old local pending changes could not be cleared. This tab has paused background replay; keep it open and retry after closing other Urban Castle tabs.";
                console.error("[workspace-reset] Local cleanup failed after server reset.", error);
                setBase({ workspaceSyncStatus: "error", workspaceSyncError: message });
                throw new Error(message, { cause: error });
            }
            window.location.reload();
        },
        // ── mutateMaster moved to core slice (Phase 3o) ──
        // ── Files slice (Phase 3c) ──
        ...createFilesSlice(ctx),
        // ── vendor + staff actions (addVendor, updateVendor, addStaff, updateStaff) moved to procurement slice (Phase 3i) ──
        // ── addSite, updateSite, archiveSite moved to crm slice (Phase 3n) ──
        // ── addArea, updateArea, archiveArea moved to crm slice (Phase 3n) ──
        // ── dataIssues moved to core slice (Phase 3o) ──
        // ── addMeasurementRevision moved to crm slice (Phase 3n) ──
        // ── reviseQuotationWithHolds moved to quotations slice (Phase 3j) ──
        // ── contractor bid actions (addContractorBid, updateContractorBid, selectContractorBid) moved to contractors slice (Phase 3h) ──
        // ── reopenJobForBidding moved to quotations slice (Phase 3j) ──
        // ── settleContractor moved to contractors slice (Phase 3h) ──
        // ── Drawing + execution log + variation actions (addDrawing, updateDrawing,
        //     removeDrawing, approveDrawing, uploadDrawingVersion, linkBOQItemToDrawing,
        //     addExecutionLog, updateExecutionLog, removeExecutionLog, verifyExecutionProgress,
        //     createVariationRequest, decideVariationRequest, confirmMaterialReceipt)
        //     moved to execution slice (Phase 3k) ──
        // ── captureStructuredWorkRequired moved to crm slice (Phase 3n) ──
        // ── acceptQuotationForBidding + updateJob moved to quotations slice (Phase 3j) ──
        // ── BOQ + Job cost line actions (createBOQ, updateBOQItem, addBOQItem,
        //     removeBOQItem, approveBOQ, addJobCostLine) moved to execution slice (Phase 3k) ──
        // ── contractor RA-bill / payment / commission actions moved to contractors slice (Phase 3h) ──
        // ── Threads slice (Phase 3b) ──
        ...createThreadsSlice(ctx),
        // ── createBlocked / createRisk moved to risks slice (Phase 3a) ──
        // ── Masters slice: approval policies + automation rules (Phase 3d, part 1) ──
        ...((() => {
            const { addApprovalPolicy, updateApprovalPolicy, toggleApprovalPolicy, deleteApprovalPolicy, requiresApproval, toggleAutomationRule, updateAutomationRule, addAutomationRule, fireAutomation } = createMastersSlice(ctx);
            return { addApprovalPolicy, updateApprovalPolicy, toggleApprovalPolicy, deleteApprovalPolicy, requiresApproval, toggleAutomationRule, updateAutomationRule, addAutomationRule, fireAutomation };
        })()),
        // ── toggleRecurringTask, runRecurringTasks moved to tasks slice (Phase 3m) ──
        // ── automation rule actions moved to masters slice (Phase 3d) ──
        // ── logAudit moved to core slice (Phase 3o) ──
        // ── sendComm moved to threads slice (Phase 3b) ──
        // ── Masters slice: attendance actions (Phase 3d, part 2) ──
        ...((() => {
            const { updateAttendancePolicy, checkInAttendance, checkOutAttendance, runAttendanceReconciliation, regularizeAttendance, computeStaffSalary, createPayrollPeriod, addSalaryAdjustment, approvePayrollPeriod, payPayrollPeriod, reopenPayrollPeriod, addContractorRate, addCommissionRule, addSourcePartner } = createMastersSlice(ctx);
            return { updateAttendancePolicy, checkInAttendance, checkOutAttendance, runAttendanceReconciliation, regularizeAttendance, computeStaffSalary, createPayrollPeriod, addSalaryAdjustment, approvePayrollPeriod, payPayrollPeriod, reopenPayrollPeriod, addContractorRate, addCommissionRule, addSourcePartner };
        })()),
        // ── finance config actions (toggleCommercialTerm, toggleTaxConfig, toggleValidityConfig,
        //     setDefaultPaymentTermTemplate) moved to finance slice (Phase 3e) ──
    };
    type StateAction = (...args: any[]) => any;
    const actionState = state as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(actionState)) {
        if (typeof value !== "function")
            continue;
        const action = value as StateAction;
        actionState[name] = ((...args: any[]) => runWorkspaceTransaction(name, () => action(...args))) as StateAction;
    }
    return state;
});
// Re-export pure selectors from the store/ subfolder (Phase 1 split)
export { computeJobPnL, allJobPnLs, vendorBalance, customerBalance, siteFinancials, jobBids, contractorSettlements, contractorBids, contractorOutstanding, contractorOutstandingTotal, inventoryValuation, } from "./store/selectors";
