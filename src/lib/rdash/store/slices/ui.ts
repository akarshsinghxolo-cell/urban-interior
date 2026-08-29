/**
 * UI slice — tabs, modules, detail panels, typed overlays, saved views, and
 * browser-restorable navigation snapshots. Pure record/navigation helpers
 * live in `detail-navigation.ts`; this slice validates and commits state.
 */
import type { UIState } from "../types";
import type { StoreContext } from "../context";
import type {
    ActionDialogState, ContextHistoryEntry, CreateDialogRequest, DetailPanelState,
    EditDialogRequest, WorkspaceNavigationSnapshot, WorkspaceTab,
} from "../ui-types";
import { canonicalModuleId, resolveRenderer } from "../../modules";
import { quotationAcceptanceWarnings as computeQuotationAcceptanceWarnings } from "../quotations-helpers";
import { persistSavedViews } from "../../saved-views-storage";
import { contextDetailPanel, detailRecordCustomerId, detailRecordExists, isEntityInspectorKind, workspaceOverlayIsValid } from "../../detail-navigation";

const MAX_MODULE_HISTORY_ENTRIES = 100;

function ensureModuleTab(state: { tabs: WorkspaceTab[] }, moduleId: string) {
    const resolved = resolveRenderer(moduleId);
    const existing = state.tabs.find((tab) => tab.moduleId === moduleId);
    const tab: WorkspaceTab = existing || {
        id: `tab-${moduleId}`,
        moduleId,
        label: resolved.label,
        icon: resolved.icon,
    };
    const tabs = existing
        ? state.tabs.map((entry) => entry.id === existing.id ? { ...entry, label: resolved.label, icon: resolved.icon } : entry)
        : [...state.tabs, tab];
    return { tab, tabs, resolved };
}

function appendModuleHistory(state: any, moduleId: string, label: string, icon?: string) {
    const current = state.moduleHistory[state.moduleHistoryIndex];
    if (current?.moduleId === moduleId) {
        return { moduleHistory: state.moduleHistory, moduleHistoryIndex: state.moduleHistoryIndex };
    }
    const entry = { id: `nav-${moduleId}-${Date.now()}`, moduleId, label, icon };
    const candidate = [...state.moduleHistory.slice(0, state.moduleHistoryIndex + 1), entry];
    const moduleHistory = candidate.slice(-MAX_MODULE_HISTORY_ENTRIES);
    return { moduleHistory, moduleHistoryIndex: moduleHistory.length - 1 };
}

/** State fields that stay inline in store.ts; the slice returns only actions. */
type UIActions = Omit<UIState,
    | "activeModuleId" | "moduleHistory" | "moduleHistoryIndex"
    | "moduleSearch" | "workspaceSearch" | "tabs" | "activeTabId"
    | "selectedCustomerId" | "mobileNavOpen" | "sidebarCollapsed" | "moreMenuOpen"
    | "quickAddOpen" | "keyboardShortcutsOpen"
    | "taskPriorityOrder" | "recentCreated" | "createDialog"
    | "detailPanel" | "contextHistory" | "contextHistoryIndex"
    | "actionDialog" | "commandPaletteOpen" | "savedViews"
    | "quotationAcceptanceDialog"
    | "reportFilter">;

export function createUISlice(ctx: StoreContext): UIActions {
    const { commitState, get } = ctx;

    return {
        editDialog: null,
        openCreateDialog: (request) => commitState({
            createDialog: {
                kind: request.kind,
                customerId: request.customerId,
                siteId: request.siteId,
                workRequiredId: request.workRequiredId,
                visitType: request.visitType,
            },
        }),
        closeCreateDialog: () => commitState({ createDialog: null }),
        openActionDialog: (type, customerId) => commitState({ actionDialog: { type, customerId } }),
        closeActionDialog: () => commitState({ actionDialog: { type: null, customerId: undefined } }),
        setCommandPaletteOpen: (v) => commitState({ commandPaletteOpen: v }),
        addSavedView: (view) => commitState((s: any) => {
            const savedViews = [
                ...s.savedViews,
                {
                    ...view,
                    id: `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    createdAt: Date.now(),
                },
            ].slice(-100);
            persistSavedViews(savedViews);
            return { savedViews };
        }),
        deleteSavedView: (id) => commitState((s: any) => {
            const savedViews = s.savedViews.filter((v: any) => v.id !== id);
            persistSavedViews(savedViews);
            return { savedViews };
        }),
        renameSavedView: (id, label) => commitState((s: any) => {
            const savedViews = s.savedViews.map((v: any) => v.id === id ? { ...v, label } : v);
            persistSavedViews(savedViews);
            return { savedViews };
        }),
        openQuotationAcceptanceDialog: (quotationId) => commitState({ quotationAcceptanceDialog: { quotationId } }),
        openEditDialog: (request) => commitState({ editDialog: request }),
        closeEditDialog: () => commitState({ editDialog: null }),
        closeQuotationAcceptanceDialog: () => commitState({ quotationAcceptanceDialog: null }),
        quotationAcceptanceWarnings: (quotationId, coverageIds) => {
            const quotation = get().db.quotations.find((row: any) => row.id === quotationId);
            if (!quotation)
                return ["Quotation was not found."];
            return computeQuotationAcceptanceWarnings(get().db, quotation, coverageIds);
        },
        setActiveModule: (id) => {
            const state = get();
            const moduleId = canonicalModuleId(id);
            const { tab, tabs, resolved } = ensureModuleTab(state, moduleId);
            const history = appendModuleHistory(state, moduleId, resolved.label, resolved.icon);
            commitState({
                activeModuleId: moduleId,
                activeTabId: tab.id,
                tabs,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        navigateModuleHistory: (direction) => {
            const state = get();
            const targetIndex = state.moduleHistoryIndex + direction;
            const target = state.moduleHistory[targetIndex];
            if (!target) return;
            const moduleId = canonicalModuleId(target.moduleId);
            const { tab, tabs } = ensureModuleTab(state, moduleId);
            commitState({
                activeModuleId: moduleId,
                activeTabId: tab.id,
                tabs,
                moduleHistoryIndex: targetIndex,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        setModuleSearch: (q) => commitState({ moduleSearch: q }),
        setWorkspaceSearch: (q) => commitState({ workspaceSearch: q }),
        openTab: (tab) => {
            const state = get();
            const moduleId = canonicalModuleId(tab.moduleId);
            const ensured = ensureModuleTab(state, moduleId);
            const history = appendModuleHistory(state, moduleId, ensured.resolved.label, ensured.resolved.icon);
            commitState({
                tabs: ensured.tabs,
                activeModuleId: moduleId,
                activeTabId: ensured.tab.id,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        closeTab: (id) => commitState((state: any) => {
            if (state.tabs.length <= 1) return {};
            const index = state.tabs.findIndex((tab: WorkspaceTab) => tab.id === id);
            if (index < 0) return {};
            const tabs = state.tabs.filter((tab: WorkspaceTab) => tab.id !== id);
            if (state.activeTabId !== id) return { tabs };
            const next = tabs[Math.min(index, tabs.length - 1)] || tabs[0];
            if (!next) return {};
            const moduleId = canonicalModuleId(next.moduleId);
            const resolved = resolveRenderer(moduleId);
            const history = appendModuleHistory(state, moduleId, resolved.label, resolved.icon);
            return {
                tabs,
                activeTabId: next.id,
                activeModuleId: moduleId,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            };
        }),
        closeOtherTabs: (id) => commitState((state: any) => {
            const keep = state.tabs.find((tab: WorkspaceTab) => tab.id === id);
            if (!keep || state.tabs.length <= 1) return {};
            const moduleId = canonicalModuleId(keep.moduleId);
            const resolved = resolveRenderer(moduleId);
            const history = appendModuleHistory(state, moduleId, resolved.label, resolved.icon);
            return {
                tabs: [keep],
                activeTabId: keep.id,
                activeModuleId: moduleId,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            };
        }),
        restoreTabs: (tabs, activeTabId) => commitState((state: any) => {
            // Undo target for closeTab/closeOtherTabs: reinstates the exact
            // pre-close snapshot. Unknown or empty snapshots are ignored.
            if (!Array.isArray(tabs) || tabs.length === 0) return {};
            const next = tabs.find((tab: WorkspaceTab) => tab.id === activeTabId) || tabs[0];
            const moduleId = canonicalModuleId(next.moduleId);
            const resolved = resolveRenderer(moduleId);
            const history = appendModuleHistory(state, moduleId, resolved.label, resolved.icon);
            return {
                tabs,
                activeTabId: next.id,
                activeModuleId: moduleId,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            };
        }),
        setActiveTab: (id) => {
            const state = get();
            const tab = state.tabs.find((entry: WorkspaceTab) => entry.id === id);
            if (!tab) return;
            const moduleId = canonicalModuleId(tab.moduleId);
            const resolved = resolveRenderer(moduleId);
            const history = appendModuleHistory(state, moduleId, resolved.label, resolved.icon);
            commitState({
                activeTabId: tab.id,
                activeModuleId: moduleId,
                ...history,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        selectCustomer: (id) => commitState({ selectedCustomerId: id }),
        setMobileNavOpen: (v) => commitState({ mobileNavOpen: v }),
        setSidebarCollapsed: (v) => commitState({ sidebarCollapsed: v }),
        toggleSidebar: () => commitState((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        setMoreMenuOpen: (v) => commitState({ moreMenuOpen: v }),
        setQuickAddOpen: (v) => commitState({ quickAddOpen: v }),
        setKeyboardShortcutsOpen: (v) => commitState({ keyboardShortcutsOpen: v }),
        setTaskPriorityOrder: (ids) => commitState({ taskPriorityOrder: ids }),
        addRecentCreated: (entry) => commitState((s: any) => ({
            recentCreated: [
                {
                    id: entry.id,
                    kind: entry.kind,
                    label: entry.label,
                    ts: Date.now(),
                },
                ...s.recentCreated.filter((r: any) => !(r.id === entry.id && r.kind === entry.kind)),
            ].slice(0, 8),
        })),
        openContextCustomer: (customerId, customerTab = "overview", sourceModule) => {
            const state = get();
            const db = state.db;
            if (!db.customers.some((row: any) => row.id === customerId))
                return;
            const entry: ContextHistoryEntry = { kind: "customer", recordId: customerId, customerId, sourceModule: sourceModule || state.activeModuleId, customerTab, detailTab: "overview" };
            const currentTrail = state.contextHistoryIndex >= 0 ? state.contextHistory.slice(0, state.contextHistoryIndex + 1) : [];
            const entityTrail = currentTrail.length && !currentTrail.some((item: any) => item.customerId)
                ? currentTrail
                : [];
            const previous = entityTrail[entityTrail.length - 1];
            const history = previous?.kind === entry.kind && previous.recordId === entry.recordId ? entityTrail : [...entityTrail, entry];
            const index = history.length - 1;
            commitState({
                selectedCustomerId: customerId,
                contextHistory: history,
                contextHistoryIndex: index,
                detailPanel: contextDetailPanel(history[index]),
            });
        },
        openContextDetail: (kind, recordId, customerId, sourceModule) => {
            const state = get();
            const resolvedCustomerId = customerId || detailRecordCustomerId(state.db, kind, recordId);
            if (!resolvedCustomerId || !detailRecordExists(state.db, kind, recordId))
                return;
            const root: ContextHistoryEntry = { kind: "customer", recordId: resolvedCustomerId, customerId: resolvedCustomerId, sourceModule: sourceModule || state.activeModuleId, customerTab: "overview", detailTab: "overview" };
            const current = state.contextHistory[state.contextHistoryIndex];
            const currentTrail = state.contextHistoryIndex >= 0 ? state.contextHistory.slice(0, state.contextHistoryIndex + 1) : [];
            const entityOriginTrail = currentTrail.length && !currentTrail.some((item: any) => item.customerId)
                ? currentTrail
                : [];
            const base = current?.customerId === resolvedCustomerId
                ? currentTrail
                : entityOriginTrail.length
                    ? [...entityOriginTrail, root]
                    : [root];
            const entry: ContextHistoryEntry = { kind, recordId, customerId: resolvedCustomerId, sourceModule: sourceModule || state.activeModuleId, detailTab: "overview" };
            const previous = base[base.length - 1];
            const history = previous?.kind === entry.kind && previous.recordId === entry.recordId ? base : [...base, entry];
            const index = history.length - 1;
            commitState({
                selectedCustomerId: resolvedCustomerId,
                contextHistory: history,
                contextHistoryIndex: index,
                detailPanel: contextDetailPanel(history[index]),
            });
        },
        setContextCustomerTab: (tab) => {
            const state = get();
            if (state.detailPanel.fromModule !== "context" || state.contextHistoryIndex < 0)
                return;
            const history = state.contextHistory.map((entry: any, index: number) => index === state.contextHistoryIndex && entry.kind === "customer"
                ? { ...entry, customerTab: tab }
                : entry);
            commitState({ contextHistory: history });
        },
        setContextDetailTab: (tab) => {
            const state = get();
            if (state.detailPanel.fromModule !== "context" || state.contextHistoryIndex < 0)
                return;
            const history = state.contextHistory.map((entry: any, index: number) => index === state.contextHistoryIndex ? { ...entry, detailTab: tab } : entry);
            commitState({ contextHistory: history, detailPanel: { ...state.detailPanel, panelTab: tab } });
        },
        navigateContextHistory: (direction) => {
            const state = get();
            const targetIndex = state.contextHistoryIndex + direction;
            const target = state.contextHistory[targetIndex];
            if (!target)
                return;
            commitState({
                selectedCustomerId: target.customerId || null,
                contextHistoryIndex: targetIndex,
                detailPanel: contextDetailPanel(target),
            });
        },
        clearContextHistory: () => commitState({ contextHistory: [], contextHistoryIndex: -1 }),
        openDetail: (kind, recordId, fromModule) => {
            if (!kind || !recordId || !detailRecordExists(get().db, kind, recordId))
                return;
            const state = get();
            if (kind === "customer") {
                state.openContextCustomer(recordId, "overview", fromModule || state.activeModuleId);
                return;
            }
            const customerId = detailRecordCustomerId(state.db, kind, recordId);
            if (customerId) {
                state.openContextDetail(kind, recordId, customerId, fromModule || state.activeModuleId);
                return;
            }
            if (isEntityInspectorKind(kind)) {
                const current = state.contextHistory[state.contextHistoryIndex];
                const base = current && !current.customerId
                    ? state.contextHistory.slice(0, state.contextHistoryIndex + 1)
                    : [];
                const entry: ContextHistoryEntry = { kind, recordId, sourceModule: fromModule || state.activeModuleId, detailTab: "overview" };
                const previous = base[base.length - 1];
                const history = previous?.kind === entry.kind && previous.recordId === entry.recordId ? base : [...base, entry];
                const index = history.length - 1;
                commitState({
                    selectedCustomerId: null,
                    contextHistory: history,
                    contextHistoryIndex: index,
                    detailPanel: contextDetailPanel(history[index]),
                });
                return;
            }
            commitState({
                detailPanel: { kind, recordId, fromModule },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        closeDetail: () => commitState({ detailPanel: { kind: null, recordId: null }, contextHistory: [], contextHistoryIndex: -1 }),
        restoreNavigationSnapshot: (snapshot: WorkspaceNavigationSnapshot) => {
            const state = get();
            const moduleId = canonicalModuleId(snapshot.moduleId || "workdesk");
            const resolved = resolveRenderer(moduleId);
            const existingTab = state.tabs.find((tab: any) => tab.moduleId === moduleId);
            const activeTab = existingTab || {
                id: `tab-${moduleId}`,
                moduleId,
                label: resolved.label,
                icon: resolved.icon,
            };
            const tabs = existingTab
                ? state.tabs.map((tab: WorkspaceTab) => tab.id === existingTab.id ? { ...tab, label: resolved.label, icon: resolved.icon } : tab)
                : [...state.tabs, activeTab];
            const validContextHistory = snapshot.contextHistory.filter((entry) =>
                detailRecordExists(state.db, entry.kind, entry.recordId) &&
                (!entry.customerId || state.db.customers.some((customer) => customer.id === entry.customerId)),
            );
            const validOverlays = (snapshot.overlays || []).filter((overlay) => workspaceOverlayIsValid(state.db, overlay));
            const requestedContext = snapshot.contextHistoryIndex >= 0
                ? snapshot.contextHistory[snapshot.contextHistoryIndex]
                : undefined;
            const contextHistoryIndex = requestedContext
                ? validContextHistory.findIndex((entry) =>
                    entry.kind === requestedContext.kind && entry.recordId === requestedContext.recordId)
                : -1;
            const requestedDetail = snapshot.detailPanel;
            const validDetail = requestedDetail.kind && requestedDetail.recordId && detailRecordExists(state.db, requestedDetail.kind, requestedDetail.recordId)
                ? { ...requestedDetail }
                : { kind: null, recordId: null } as DetailPanelState;
            const currentContext = contextHistoryIndex >= 0 ? validContextHistory[contextHistoryIndex] : undefined;
            const detailPanel = validDetail.kind && validDetail.fromModule === "context"
                ? currentContext
                    ? { ...contextDetailPanel(currentContext), panelTab: validDetail.panelTab || currentContext.detailTab || "overview" }
                    : { kind: null, recordId: null } as DetailPanelState
                : validDetail;
            const detailCustomerId = detailPanel.kind && detailPanel.recordId
                ? detailRecordCustomerId(state.db, detailPanel.kind, detailPanel.recordId)
                : undefined;
            const requestedModuleHistoryIndex = snapshot.moduleHistoryIndex;
            const matchingHistoryIndex = state.moduleHistory.reduce((match: number, entry: WorkspaceTab, index: number) =>
                canonicalModuleId(entry.moduleId) === moduleId ? index : match, -1);
            const requestedHistoryMatches =
                Number.isInteger(requestedModuleHistoryIndex) &&
                requestedModuleHistoryIndex >= 0 &&
                requestedModuleHistoryIndex < state.moduleHistory.length &&
                canonicalModuleId(state.moduleHistory[requestedModuleHistoryIndex].moduleId) === moduleId;
            const restoredHistory = requestedHistoryMatches || matchingHistoryIndex >= 0
                ? {
                    moduleHistory: state.moduleHistory,
                    moduleHistoryIndex: requestedHistoryMatches ? requestedModuleHistoryIndex : matchingHistoryIndex,
                }
                : appendModuleHistory(
                    { ...state, moduleHistoryIndex: state.moduleHistory.length - 1 },
                    moduleId,
                    resolved.label,
                    resolved.icon,
                );
            let commandPaletteOpen = false;
            let actionDialog: ActionDialogState = { type: null, customerId: undefined };
            let createDialog: CreateDialogRequest | null = null;
            let quotationAcceptanceDialog: { quotationId: string } | null = null;
            let editDialog: EditDialogRequest | null = null;
            let mobileNavOpen = false;
            let moreMenuOpen = false;
            let quickAddOpen = false;
            let keyboardShortcutsOpen = false;
            for (const overlay of validOverlays) {
                if (overlay.type === "commandPalette") commandPaletteOpen = true;
                else if (overlay.type === "actionDialog" && overlay.value.type) actionDialog = overlay.value;
                else if (overlay.type === "createDialog") createDialog = overlay.value;
                else if (overlay.type === "quotationAcceptance") quotationAcceptanceDialog = { quotationId: overlay.quotationId };
                else if (overlay.type === "editDialog") editDialog = overlay.value;
                else if (overlay.type === "mobileNav") mobileNavOpen = true;
                else if (overlay.type === "moreMenu") moreMenuOpen = true;
                else if (overlay.type === "quickAdd") quickAddOpen = true;
                else if (overlay.type === "keyboardShortcuts") keyboardShortcutsOpen = true;
            }
            commitState({
                activeModuleId: moduleId,
                activeTabId: activeTab.id,
                tabs,
                moduleHistory: restoredHistory.moduleHistory,
                moduleHistoryIndex: restoredHistory.moduleHistoryIndex,
                selectedCustomerId: currentContext?.customerId || detailCustomerId || (
                    !detailPanel.kind && snapshot.selectedCustomerId && state.db.customers.some((customer) => customer.id === snapshot.selectedCustomerId)
                        ? snapshot.selectedCustomerId
                        : null
                ),
                detailPanel,
                contextHistory: validContextHistory,
                contextHistoryIndex,
                commandPaletteOpen,
                actionDialog,
                createDialog,
                quotationAcceptanceDialog,
                editDialog,
                mobileNavOpen,
                moreMenuOpen,
                quickAddOpen,
                keyboardShortcutsOpen,
            });
        },
        /**
         * I: Set a deep-link filter for the Reports module. Any module can call
         * this + setActiveModule("salesReport" | "jobPnlReport" | ...) to deep-
         * link into a specific report with a pre-applied customer/work-order/
         * vendor filter. ReportsModule reads `reportFilter` and applies it.
         */
        setReportFilter: (filter) => commitState({ reportFilter: filter }),
        clearReportFilter: () => commitState({ reportFilter: null }),
    };
}
