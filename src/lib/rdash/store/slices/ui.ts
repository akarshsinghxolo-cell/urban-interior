/**
 * UI slice — tabs, modules, detail panel, dialogs, saved views, navigation.
 *
 * Phase 3o moved the 31 UI/workspace/navigation actions out of store.ts.
 * The actions split into 5 contiguous groups:
 *   Group 1: openCreateDialog, closeCreateDialog, openActionDialog,
 *            closeActionDialog, setCommandPaletteOpen
 *   Group 2: addSavedView, deleteSavedView, renameSavedView,
 *            openQuotationAcceptanceDialog, closeQuotationAcceptanceDialog,
 *            quotationAcceptanceWarnings
 *   Group 3: setActiveModule, navigateModuleHistory, setModuleSearch,
 *            setWorkspaceSearch, openTab, closeTab, setActiveTab
 *   Group 4: selectCustomer, setMobileNavOpen, setMoreMenuOpen,
 *            setTaskPriorityOrder, addRecentCreated, openContextCustomer,
 *            openContextDetail, setContextCustomerTab, setContextDetailTab,
 *            navigateContextHistory, clearContextHistory
 *   Group 5: openDetail, closeDetail
 *
 * 3 module-scope helpers were moved with the slice because they are only
 * used by UI actions: `detailRecordExists`, `detailRecordCustomerId`,
 * `contextDetailPanel`. The pure helper `quotationAcceptanceWarnings` (the
 * function form that operates on a quotation + db) was already in
 * `../quotations-helpers`; the action of the same name is a thin wrapper
 * that resolves the quotation then delegates to the helper. To avoid the
 * name collision inside the slice, the helper is imported under the alias
 * `computeQuotationAcceptanceWarnings`.
 *
 * State fields (activeModuleId, tabs, detailPanel, savedViews, etc.) and
 * their initial values stay in store.ts — slices only return actions.
 */
import type { RDashDatabase } from "../../types";
import type { UIState } from "../types";
import type { StoreContext } from "../context";
import type {
    ContextHistoryEntry, DetailPanelKind, DetailPanelState,
} from "../ui-types";
import { canonicalModuleId, resolveRenderer } from "../../modules";
import { quotationAcceptanceWarnings as computeQuotationAcceptanceWarnings } from "../quotations-helpers";

/** State fields that stay inline in store.ts; the slice returns only actions. */
type UIActions = Omit<UIState,
    | "activeModuleId" | "moduleHistory" | "moduleHistoryIndex"
    | "moduleSearch" | "workspaceSearch" | "tabs" | "activeTabId"
    | "selectedCustomerId" | "mobileNavOpen" | "sidebarCollapsed" | "moreMenuOpen"
    | "taskPriorityOrder" | "recentCreated" | "createDialog"
    | "detailPanel" | "contextHistory" | "contextHistoryIndex"
    | "actionDialog" | "commandPaletteOpen" | "savedViews"
    | "quotationAcceptanceDialog"
    | "reportFilter">;

function detailRecordExists(db: RDashDatabase, kind: Exclude<DetailPanelKind, null>, id: string) {
    const records: Record<Exclude<DetailPanelKind, null>, Array<{
        id: string;
    }>> = {
        quotation: db.quotations,
        workOrder: db.workOrders,
        task: db.tasks,
        followup: db.followups,
        visit: db.visits,
        payment: db.payments,
        invoice: db.invoices,
        po: db.purchaseOrders,
        grn: db.grns,
        dispatch: db.dispatches,
        boq: db.boqs,
        vendorBill: db.vendorBills,
        commission: db.commissions,
        blocked: db.blocked,
        customer: db.customers,
        site: db.sites,
        area: db.areas,
        workRequired: db.workRequired,
        inventory: db.inventory,
        vendor: db.master.vendors,
        vendorRate: db.master.vendorRates,
        contractor: db.master.contractors,
        contractorBill: db.contractorBills,
        contractorPayment: db.contractorPayments,
        staff: db.master.staff,
        audit: db.auditLog,
        media: db.master.fileAssets,
    };
    return records[kind].some((record) => record.id === id);
}

function detailRecordCustomerId(db: RDashDatabase, kind: Exclude<DetailPanelKind, null>, recordId: string): string | undefined {
    if (kind === "customer")
        return db.customers.some((row) => row.id === recordId) ? recordId : undefined;
    if (kind === "site")
        return db.sites.find((row) => row.id === recordId)?.customer_id;
    if (kind === "area") {
        const area = db.areas.find((row) => row.id === recordId);
        return area ? db.sites.find((site) => site.id === area.site_id)?.customer_id : undefined;
    }
    if (kind === "workRequired")
        return db.workRequired.find((row) => row.id === recordId)?.customer_id;
    if (kind === "quotation")
        return db.quotations.find((row) => row.id === recordId)?.customer_id;
    if (kind === "workOrder")
        return db.workOrders.find((row) => row.id === recordId)?.customer_id;
    if (kind === "task")
        return db.tasks.find((row) => row.id === recordId)?.customer_id;
    if (kind === "followup")
        return db.followups.find((row) => row.id === recordId)?.customer_id;
    if (kind === "visit")
        return db.visits.find((row) => row.id === recordId)?.customer_id;
    if (kind === "payment")
        return db.payments.find((row) => row.id === recordId)?.customer_id;
    if (kind === "invoice")
        return db.invoices.find((row) => row.id === recordId)?.customer_id;
    if (kind === "po") {
        const po = db.purchaseOrders.find((row) => row.id === recordId);
        return po ? db.workOrders.find((row) => row.id === po.work_order_id)?.customer_id : undefined;
    }
    if (kind === "grn") {
        const grn = db.grns.find((row) => row.id === recordId);
        return grn ? db.workOrders.find((row) => row.id === grn.work_order_id)?.customer_id : undefined;
    }
    if (kind === "dispatch") {
        const dispatch = db.dispatches.find((row) => row.id === recordId);
        return dispatch ? db.workOrders.find((row) => row.id === dispatch.work_order_id)?.customer_id : undefined;
    }
    if (kind === "boq") {
        const boq = db.boqs.find((row) => row.id === recordId);
        return boq ? db.workOrders.find((row) => row.id === boq.work_order_id)?.customer_id : undefined;
    }
    if (kind === "vendorBill") {
        const bill = db.vendorBills.find((row) => row.id === recordId);
        return bill ? db.workOrders.find((row) => row.id === bill.work_order_id)?.customer_id : undefined;
    }
    if (kind === "blocked")
        return db.blocked.find((row) => row.id === recordId)?.customer_id;
    if (kind === "commission")
        return db.commissions.find((row) => row.id === recordId)?.customer_id;
    // FIX-CONTRACTOR-BATCH2 / F.15: contractor bills / payments resolve
    // through their work_order_id → workOrder.customer_id chain so the
    // customer-context navigation header shows the correct root customer.
    if (kind === "contractorBill") {
        const bill = db.contractorBills.find((row) => row.id === recordId);
        return bill ? db.workOrders.find((row) => row.id === bill.work_order_id)?.customer_id : undefined;
    }
    if (kind === "contractorPayment") {
        const payment = db.contractorPayments.find((row) => row.id === recordId);
        return payment ? db.workOrders.find((row) => row.id === payment.work_order_id)?.customer_id : undefined;
    }
    if (kind === "inventory") {
        const inventory = db.inventory.find((row) => row.id === recordId);
        return inventory?.work_order_id ? db.workOrders.find((row) => row.id === inventory.work_order_id)?.customer_id : undefined;
    }
    // Entity-master records are intentionally not customer-rooted. They open the
    // same right-side panel as an entity inspector and can still link onward to
    // customer-rooted operational records from their overview tabs.
    if (kind === "vendor" || kind === "vendorRate" || kind === "contractor" || kind === "staff" || kind === "audit" || kind === "media")
        return undefined;
    return undefined;
}

function contextDetailPanel(entry: ContextHistoryEntry): DetailPanelState {
    return { kind: entry.kind, recordId: entry.recordId, fromModule: "context", panelTab: entry.detailTab || "overview" };
}
function isEntityInspectorKind(kind: Exclude<DetailPanelKind, null>) {
    return kind === "vendor" || kind === "vendorRate" || kind === "contractor" || kind === "staff" || kind === "audit" || kind === "media";
}

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
        addSavedView: (view) => commitState((s: any) => ({
            savedViews: [
                ...s.savedViews,
                {
                    ...view,
                    id: `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    createdAt: Date.now(),
                },
            ],
        })),
        deleteSavedView: (id) => commitState((s: any) => ({
            savedViews: s.savedViews.filter((v: any) => v.id !== id),
        })),
        renameSavedView: (id, label) => commitState((s: any) => ({
            savedViews: s.savedViews.map((v: any) => v.id === id ? { ...v, label } : v),
        })),
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
            const resolved = resolveRenderer(moduleId);
            const tabId = `tab-${moduleId}`;
            const exists = state.tabs.some((tab: any) => tab.moduleId === moduleId);
            const tabs = exists
                ? state.tabs.map((tab: any) => tab.moduleId === moduleId
                    ? { ...tab, label: resolved.label, icon: resolved.icon }
                    : tab)
                : [
                    ...state.tabs,
                    { id: tabId, moduleId, label: resolved.label, icon: resolved.icon },
                ];
            const entry = {
                id: `nav-${moduleId}-${Date.now()}`,
                moduleId,
                label: resolved.label,
                icon: resolved.icon,
            };
            const current = state.moduleHistory[state.moduleHistoryIndex];
            const candidateHistory = current?.moduleId === moduleId
                ? state.moduleHistory
                : [
                    ...state.moduleHistory.slice(0, state.moduleHistoryIndex + 1),
                    entry,
                ];
            const history = candidateHistory.slice(-100);
            commitState({
                activeModuleId: moduleId,
                activeTabId: exists
                    ? state.tabs.find((tab: any) => tab.moduleId === moduleId)!.id
                    : tabId,
                tabs,
                moduleHistory: history,
                moduleHistoryIndex: history.length - 1,
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
            if (!target)
                return;
            const moduleId = canonicalModuleId(target.moduleId);
            const tab = state.tabs.find((row: any) => row.moduleId === moduleId);
            commitState({
                activeModuleId: moduleId,
                activeTabId: tab?.id || state.activeTabId,
                moduleHistoryIndex: targetIndex,
                mobileNavOpen: false,
                detailPanel: { kind: null, recordId: null },
                contextHistory: [],
                contextHistoryIndex: -1,
            });
        },
        setModuleSearch: (q) => commitState({ moduleSearch: q }),
        setWorkspaceSearch: (q) => commitState({ workspaceSearch: q }),
        openTab: (tab) => commitState((state: any) => {
            const moduleId = canonicalModuleId(tab.moduleId);
            const existing = state.tabs.find((entry: any) => entry.moduleId === moduleId);
            if (existing)
                return { activeModuleId: moduleId, activeTabId: existing.id };
            const resolved = resolveRenderer(moduleId);
            const normalizedTab = {
                ...tab,
                id: `tab-${moduleId}`,
                moduleId,
                label: resolved.label,
                icon: resolved.icon,
            };
            return {
                tabs: [...state.tabs, normalizedTab],
                activeModuleId: moduleId,
                activeTabId: normalizedTab.id,
            };
        }),
        closeTab: (id) => commitState((s: any) => {
            const idx = s.tabs.findIndex((t: any) => t.id === id);
            const tabs = s.tabs.filter((t: any) => t.id !== id);
            let activeTabId = s.activeTabId;
            let activeModuleId = s.activeModuleId;
            if (s.activeTabId === id) {
                const next = tabs[Math.min(idx, tabs.length - 1)] || tabs[0];
                activeTabId = next?.id ?? null;
                activeModuleId = next?.moduleId ?? "workdesk";
            }
            return { tabs, activeTabId, activeModuleId };
        }),
        setActiveTab: (id) => {
            const state = get();
            const tab = state.tabs.find((entry: any) => entry.id === id);
            const moduleId = canonicalModuleId(tab?.moduleId || "workdesk");
            const fallbackTab = state.tabs.find((entry: any) => entry.moduleId === moduleId);
            commitState({
                activeTabId: fallbackTab?.id || state.activeTabId,
                activeModuleId: moduleId,
            });
        },
        selectCustomer: (id) => commitState({ selectedCustomerId: id }),
        setMobileNavOpen: (v) => commitState({ mobileNavOpen: v }),
        setSidebarCollapsed: (v) => commitState({ sidebarCollapsed: v }),
        toggleSidebar: () => commitState((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        setMoreMenuOpen: (v) => commitState({ moreMenuOpen: v }),
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
