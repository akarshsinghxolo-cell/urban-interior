"use client";
import { create } from "zustand";
import type { RDashDatabase, Customer, Task, Followup, Visit, Quotation, QuotationItem, Payment, CustomerInvoice, CustomerReceipt, ApprovalAction, WorkOrder, WorkOrderBOQ, WorkOrderBOQ as WorkOrderBOQT, PurchaseOrder, GRN, InventoryItem, StockMovement, SiteDispatch, VendorBill, VendorPayment, ContractorBill, ContractorPayment, Commission, WorkOrderCostLine, ContractorBid, ContractorSettlement, Drawing, DailyExecutionLog, VisitRoutePoint, Site, Area, Thread, ThreadMessage, ThreadKind, LineItem, BlockedItem, RiskItem, Master, FileAsset, FileAssetCreateInput, EntityFileAttachment, EntityReferenceAssignment, AttendancePolicy, AttendanceRecord, VariationRequest, RecurringTaskDefinition, VisitType, } from "./types";
import { buildSeedDatabase } from "./seed";
// mergeStaffLocationPings, StaffLocationPing moved to slices/core.ts (Phase 3o)
import { formatINR } from "./format";
import { prepareWorkspaceData } from "./work-category-master";
import { applyVendorRateAverages } from "./vendor-rate-average";
import { attachCustomerLabels, customerName, customerNameForJob, } from "./customer";
import { assertUniqueCustomerIdentity, normalizeCustomerSegments } from "./customer-identity";
import { dateFromIso, isAtOrAfterTime, minutesLate, verifyOfficeExitGps, verifyOfficeGps, verifyVisitExitGps, verifyVisitGps, type GpsCapture, } from "./gps";
import { areaDependencySummary, BusinessRuleError, assertAreaBelongsToSite, assertCustomerExists, assertAreasBelongToSite, assertWorkCategoryId, assertWorkSubcategoryId, assertFinanceContext, assertMeasurementRevisionRelations, assertQuotationRelations, assertSiteBelongsToCustomer, assertSiteExists, assertWorkOrderRelations, assertWorkRequiredMatchesContext, threadParentExists, replaceAreaId, validateBusinessData, } from "./business-rules";
import { resolveCustomerIdFromLinks } from "./customer-relations";
import { diffWorkspaceOperations } from "./workspace-operations";
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
function loadStoredWorkspaceDatabase(): RDashDatabase | null {
    return null;
}
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
function createSystemThread(kind: ThreadKind, recordId: string, title: string, participants: string[] = ["Owner"]) {
    const id = genId("thr");
    const now = nowIso();
    return {
        id,
        kind,
        title,
        record_id: recordId,
        record_type: kind,
        messages: [
            {
                id: genId("msg"),
                thread_id: id,
                author_name: "System",
                body: `Thread opened for ${title}`,
                kind: "system" as const,
                created_at: now,
            },
        ],
        participants,
        open: true,
        created_at: now,
        updated_at: now,
    } satisfies Thread;
}
function ensureThreadId(threads: Thread[], record: {
    id: string;
    thread_id?: string;
}, kind: ThreadKind, title: string, participants: string[] = ["Owner"]) {
    if (record.thread_id &&
        threads.some((thread) => thread.id === record.thread_id))
        return record.thread_id;
    const existing = threads.find((thread) => thread.kind === kind && thread.record_id === record.id);
    if (existing)
        return existing.id;
    const thread = createSystemThread(kind, record.id, title, participants.filter(Boolean));
    threads.push(thread);
    return thread.id;
}
// findOpenLinkedFollowup moved to finance-helpers (Phase 3f)
function prepareWorkspaceDatabase(input: RDashDatabase): RDashDatabase {
    const base = attachCustomerLabels(prepareWorkspaceData({ ...input }));
    const threads = base.threads.filter((thread) => thread.record_type === thread.kind &&
        threadParentExists(base, thread.kind, thread.record_id));
    const tasks = base.tasks.map((task) => ({
        ...task,
        thread_id: ensureThreadId(threads, task, "task", task.title, [
            task.assignee_name || task.assigned_to || "Owner",
        ]),
    }));
    const followups = base.followups.map((followup) => ({
        ...followup,
        thread_id: ensureThreadId(threads, followup, "followup", followup.title, [
            followup.assigned_to || "Owner",
        ]),
    }));
    const quotations = base.quotations.map((quotation) => ({
        ...quotation,
        thread_id: ensureThreadId(threads, quotation, "quotation", `${quotation.quotation_no} · ${quotation.title}`, [quotation.customer_name || "Customer", "Owner"]),
    }));
    const visits = base.visits.map((visit) => ({
        ...visit,
        thread_id: ensureThreadId(threads, visit, "visit", `${visit.visit_type} · ${visit.location_name}`, [visit.staff_name, "Owner"]),
    }));
    const payments = base.payments.map((payment) => ({
        ...payment,
        finance_context: payment.finance_context || "service",
        thread_id: ensureThreadId(threads, payment, "payment", `Payment · ${payment.milestone_label || formatINR(payment.amount || 0)} · ${payment.customer_name || ""}`, [payment.customer_name || "Customer", "Owner"]),
    }));
    let invoices = (base.invoices || []).map((invoice) => ({
        ...invoice,
        finance_context: invoice.finance_context || "service",
        status: invoice.status || "issued",
        subtotal: invoice.subtotal ?? invoice.total_amount ?? 0,
        tax_amount: invoice.tax_amount ?? 0,
        total_amount: invoice.total_amount ?? invoice.subtotal ?? 0,
        paid_amount: invoice.paid_amount ?? 0,
        balance_amount: invoice.balance_amount ??
            Math.max(0, (invoice.total_amount ?? invoice.subtotal ?? 0) -
                (invoice.paid_amount ?? 0)),
        thread_id: ensureThreadId(threads, invoice, "invoice", `${invoice.invoice_no || "Invoice"} · ${invoice.customer_name || ""}`, [invoice.customer_name || "Customer", "Accounts"]),
    }));
    const workOrders = base.workOrders.map((workOrder) => ({
        ...workOrder,
        thread_id: ensureThreadId(threads, workOrder, "workOrder", `${workOrder.work_order_no} · ${workOrder.title}`, [workOrder.customer_name || "Customer", "Owner"]),
    }));
    const boqs = base.boqs.map((boq) => ({
        ...boq,
        thread_id: ensureThreadId(threads, boq, "generic", `BOQ · ${boq.title}`, [
            boq.customer_name || "Customer",
            "Owner",
        ]),
    }));
    const purchaseOrders = base.purchaseOrders.map((po) => ({
        ...po,
        thread_id: ensureThreadId(threads, po, "po", `${po.po_no} · ${po.vendor_name}`, [po.vendor_name, "Owner"]),
    }));
    const grns = base.grns.map((grn) => ({
        ...grn,
        thread_id: ensureThreadId(threads, grn, "grn", `${grn.grn_no} · ${grn.vendor_name}`, [grn.vendor_name, "Owner"]),
    }));
    const vendorBills = base.vendorBills.map((bill) => ({
        ...bill,
        paid_amount: bill.paid_amount ?? 0,
        balance_amount: bill.balance_amount ??
            Math.max(0, bill.total_amount - (bill.paid_amount ?? 0)),
        thread_id: ensureThreadId(threads, bill, "vendor_bill", `${bill.bill_no} · ${bill.vendor_name}`, [bill.vendor_name, "Owner"]),
    }));
    const inventory = base.inventory.map((item) => ({
        ...item,
        thread_id: ensureThreadId(threads, item, "inventory", `Inventory · ${item.name}`, [item.location || "Store", "Owner"]),
    }));
    const commissions = base.commissions.map((commission) => ({
        ...commission,
        thread_id: ensureThreadId(threads, commission, "commission", `${commission.commission_no} · ${commission.source_partner_name}`, [commission.source_partner_name, "Owner"]),
    }));
    const dispatches = base.dispatches.map((dispatch) => ({
        ...dispatch,
        thread_id: ensureThreadId(threads, dispatch, "dispatch", `${dispatch.dispatch_no} · ${dispatch.customer_name || "Customer"}`, [dispatch.customer_name || "Customer", "Owner"]),
    }));
    const blocked = base.blocked.map((item) => ({
        ...item,
        thread_id: ensureThreadId(threads, item, "blocked", item.title, [
            item.customer_name || "Owner",
        ]),
    }));
    const normalized: RDashDatabase = {
        ...base,
        tasks,
        followups,
        quotations,
        visits,
        payments,
        invoices,
        workOrders,
        boqs,
        purchaseOrders,
        grns,
        vendorBills,
        inventory,
        commissions,
        dispatches,
        blocked,
        threads,
    };
    payments.forEach((payment) => {
        if (!isPaymentChaseNeeded(payment))
            return;
        const existing = findOpenLinkedFollowup(normalized, {
            payment_id: payment.id,
            customer_id: payment.customer_id,
            work_required_id: payment.work_required_id,
            followup_type: "payment",
        });
        if (existing)
            return;
        const id = genId("follow");
        const dueDate = payment.promise_date || dateOnlyFrom(payment.due_date);
        const threadId = ensureThreadId(threads, { id }, "followup", paymentFollowupTitle(payment), ["Accounts", payment.customer_name || "Customer"]);
        normalized.followups = [
            {
                id,
                customer_id: payment.customer_id,
                work_required_id: payment.work_required_id,
                payment_id: payment.id,
                title: paymentFollowupTitle(payment),
                notes: `Auto-created because payment is ${payment.status === "overdue" ? "overdue" : "due"}.`,
                status: "pending",
                priority: payment.status === "overdue" ? "urgent" : "high",
                due_at: new Date(`${dueDate}T09:00:00`).toISOString(),
                due_date: dueDate,
                assigned_to: "Accounts",
                assigned_role: "Finance",
                followup_type: "payment",
                promise_date: payment.promise_date,
                notes_history: [],
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            },
            ...normalized.followups,
        ];
    });
    visits.forEach((visit) => {
        if (visit.status !== "missed")
            return;
        const existing = findOpenLinkedFollowup(normalized, {
            visit_id: visit.id,
            customer_id: visit.customer_id,
            work_required_id: visit.work_required_id,
            followup_type: "call",
        });
        if (existing)
            return;
        const id = genId("follow");
        const dueDate = today();
        const title = `Reschedule missed visit · ${visit.location_name || visit.customer_id}`;
        const threadId = ensureThreadId(threads, { id }, "followup", title, [
            visit.staff_name || "Owner",
        ]);
        normalized.followups = [
            {
                id,
                customer_id: visit.customer_id,
                work_required_id: visit.work_required_id,
                visit_id: visit.id,
                title,
                notes: `Auto-created because visit ${visit.id} was missed.`,
                status: "pending",
                priority: "high",
                due_at: new Date(`${dueDate}T09:00:00`).toISOString(),
                due_date: dueDate,
                assigned_to: visit.staff_name || "Owner",
                assigned_role: "Field Staff",
                followup_type: "call",
                notes_history: [],
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            },
            ...normalized.followups,
        ];
    });
    const dataIssues = validateBusinessData(normalized);
    if (dataIssues.length) {
        // Log warnings but don't block workspace loading — a single broken
        // reference shouldn't prevent the entire app from starting.
        // The server-side commit endpoint still validates and can reject bad data.
        console.warn("[prepareWorkspaceDatabase] Data integrity warnings:", dataIssues.slice(0, 5));
    }
    return normalized;
}
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
    // Per-aggregate revision cache (relational mode only). In blob mode this
    // stays null and expectedRevisions is omitted from commit requests.
    let aggregateRevisionsCache: Record<string, number> | null = null;
    // Per-row version cache (relational mode only). Tracks the `version` column
    // for high-contention rows (tasks, visits, followups) so commits can send
    // expectedRowVersions for true per-row CAS. In blob mode this stays null.
    let rowVersionsCache: Record<string, number> | null = null;
    // Per-aggregate revisions are no longer fetched separately (the REST
    // data layer uses per-row CAS via the `revision` column, not per-aggregate).
    // This stub is kept for backward-compat with the store's commit body builder.
    const refreshAggregateRevisions = async () => {
        if (typeof window === "undefined") return;
        // No-op — per-row CAS (rowVersionsCache) is the primary conflict detector.
    };
    interface WorkspaceTransaction {
        name: string;
        depth: number;
        baselineDb: RDashDatabase | null;
        dirty: boolean;
    }
    let activeWorkspaceTransaction: WorkspaceTransaction | null = null;
    const restoreAcceptedWorkspace = (error: string, payload?: {
        revision?: number;
        data?: RDashDatabase;
    }) => {
        const hasAuthoritativePayload = Boolean(payload?.data) && typeof payload?.revision === "number";
        const revision = hasAuthoritativePayload
            ? payload!.revision!
            : lastAcceptedServerRevision;
        const source = hasAuthoritativePayload
            ? payload!.data!
            : lastAcceptedServerDb;
        if (source) {
            const restored = attachCustomerLabels(prepareWorkspaceDatabase(structuredClone(source) as RDashDatabase));
            lastAcceptedServerDb = structuredClone(restored) as RDashDatabase;
            lastAcceptedServerRevision = revision;
            serverRevisionForQueue = revision;
            setBase({
                db: restored,
                serverRevision: revision,
                workspaceSyncStatus: "error",
                workspaceSyncError: error,
            });
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
            if (saveEpoch !== syncEpoch || !get().authUser)
                return;
            setBase({ workspaceSyncStatus: "saving", workspaceSyncError: null });
            const baseline = lastAcceptedServerDb || snapshot;
            const operations = diffWorkspaceOperations(baseline, snapshot);
            if (!operations.length) {
                setBase({ workspaceSyncStatus: "saved", workspaceSyncError: null });
                return;
            }
            let response: Response;
            try {
                // Build the commit body. If per-aggregate revisions are cached
                // (relational mode), include expectedRevisions for fine-grained
                // CAS conflict detection. If per-row versions are cached, include
                // expectedRowVersions for per-row CAS. In blob mode both caches
                // are null and the commit falls back to whole-workspace revision.
                const commitBody: Record<string, unknown> = { revision: serverRevisionForQueue, operations };
                if (aggregateRevisionsCache && Object.keys(aggregateRevisionsCache).length > 0) {
                    commitBody.expectedRevisions = aggregateRevisionsCache;
                }
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
            catch {
                setBase({
                    workspaceSyncStatus: "error",
                    workspaceSyncError: "Could not reach the PostgreSQL operation server. Your last confirmed workspace is still safe; retry the change after connectivity is restored.",
                });
                return;
            }
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                revision?: number;
                data?: RDashDatabase;
                rowVersions?: Record<string, number>;
                bumpedAggregateRevisions?: Record<string, number>;
            };
            if (!response.ok) {
                syncEpoch += 1;
                restoreAcceptedWorkspace(payload.error || "The server rejected this change. The last confirmed workspace was restored.", payload);
                if (response.status === 401)
                    window.location.assign("/signin");
                return;
            }
            if (payload.data && typeof payload.revision === "number") {
                // FIX-PERF-001: Don't replace the entire db on successful commit.
                // The client already applied the change locally via commitState.
                // Replacing db with the server response creates a new reference
                // that triggers re-renders in all 154 components subscribed to
                // s.db — causing the "entire workspace refreshes" UX issue.
                // Instead, only update metadata (revision, sync status) and keep
                // the local db reference. The server response is still stored as
                // lastAcceptedServerDb for conflict recovery.
                const accepted = attachCustomerLabels(prepareWorkspaceDatabase(payload.data));
                serverRevisionForQueue = payload.revision;
                lastAcceptedServerRevision = payload.revision;
                lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
                setBase({
                    serverRevision: payload.revision,
                    workspaceSyncStatus: "saved",
                    workspaceSyncError: null,
                });
                // Refresh per-aggregate revisions after a successful commit so
                // the next commit's expectedRevisions reflects the bumped values.
                // (No-op in blob mode; in relational mode the server bumped the
                // touched aggregates' revisions during commit.)
                void refreshAggregateRevisions();
                // Update per-row version cache from the response (relational mode).
                // The server returns the post-commit versions so the next commit's
                // expectedRowVersions reflects the bumped values.
                if (payload.rowVersions && Object.keys(payload.rowVersions).length > 0) {
                    rowVersionsCache = { ...(rowVersionsCache || {}), ...payload.rowVersions };
                }
                // Update per-aggregate revision cache from the bumped values
                // (relational mode). This avoids a separate /api/workspace/
                // aggregate-revisions fetch after every commit.
                if (payload.bumpedAggregateRevisions && Object.keys(payload.bumpedAggregateRevisions).length > 0) {
                    aggregateRevisionsCache = { ...(aggregateRevisionsCache || {}), ...payload.bumpedAggregateRevisions };
                }
            }
        });
    };
    const commitState = (partial: StateUpdate) => {
        if (activeWorkspaceTransaction) {
            setBase((state) => {
                const next = typeof partial === "function" ? partial(state) : partial;
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
    const state: RDashState = {
        db: loadStoredWorkspaceDatabase() || attachCustomerLabels(prepareWorkspaceDatabase(buildSeedDatabase())),
        activeModuleId: "workdesk",
        moduleHistory: [
            { id: "nav-today", moduleId: "workdesk", label: "Today", icon: "🗂️" },
        ],
        moduleHistoryIndex: 0,
        moduleSearch: "",
        workspaceSearch: "",
        tabs: [
            { id: "tab-today", moduleId: "workdesk", label: "🗂️ Today", icon: "🗂️" },
        ],
        activeTabId: "tab-today",
        selectedCustomerId: "cust-das",
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
        hydrateSecureWorkspace: ({ db, revision, user, aggregateRevisions, rowVersions }) => {
            const accepted = attachCustomerLabels(prepareWorkspaceDatabase(db));
            serverRevisionForQueue = revision;
            lastAcceptedServerRevision = revision;
            lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
            const selectedCustomerId = get().selectedCustomerId;
            const resolvedCustomerId = accepted.customers.some((customer) => customer.id === selectedCustomerId)
                ? selectedCustomerId
                : accepted.customers[0]?.id || null;
            setBase({ db: accepted, selectedCustomerId: resolvedCustomerId, serverRevision: revision, authUser: user, workspaceSyncStatus: "saved", workspaceSyncError: null });
            // If the workspace response included aggregateRevisions (relational
            // mode), populate the cache directly — no separate fetch needed.
            if (aggregateRevisions && Object.keys(aggregateRevisions).length > 0) {
                aggregateRevisionsCache = aggregateRevisions;
            } else {
                // Blob mode (no aggregateRevisions in response) — try a separate
                // fetch as a fallback (will 400 in blob mode, gracefully no-op).
                void refreshAggregateRevisions();
            }
            // Populate per-row version cache (relational mode only). Used to
            // send expectedRowVersions in commits for per-row CAS.
            rowVersionsCache = rowVersions && Object.keys(rowVersions).length > 0 ? rowVersions : null;
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
                restoreAcceptedWorkspace("Could not reach the server. The workspace was not reset.");
                throw new Error("Could not reach the server. The workspace was not reset.");
            }
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                revision?: number;
                data?: RDashDatabase;
            };
            if (!response.ok || !payload.data || typeof payload.revision !== "number") {
                restoreAcceptedWorkspace(payload.error || "The server rejected the workspace reset. The last confirmed workspace was restored.", payload);
                throw new Error(payload.error || "The server rejected the workspace reset.");
            }
            const accepted = attachCustomerLabels(prepareWorkspaceDatabase(payload.data));
            serverRevisionForQueue = payload.revision;
            lastAcceptedServerRevision = payload.revision;
            lastAcceptedServerDb = structuredClone(accepted) as RDashDatabase;
            setBase({
                db: accepted,
                serverRevision: payload.revision,
                workspaceSyncStatus: "saved",
                workspaceSyncError: null,
            });
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
