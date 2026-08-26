import type {
  RDashDatabase, Customer, Task, Followup, Visit, Quotation, QuotationItem,
  Payment, CustomerInvoice, PurchaseOrder, GRN, SiteDispatch, VendorBill,
  WorkOrderCostLine, WorkOrder, LineItem, BlockedItem, RiskItem, Master,
  FileAsset, FileAssetCreateInput, EntityFileAttachment, EntityReferenceAssignment,
  AttendancePolicy, Site, Area, Thread, ThreadMessage, ThreadKind, StaffRolePermission, StaffDocument,
  IntegrityReport, RepairResult, CascadeResult,
} from "../types";
import type { SaveCustomerWithSitesInput } from "../customer-sites-save";
import type { GpsCapture } from "../gps";
import type { StaffLocationPing } from "../staff-location";
import type {
  WorkspaceTab, DetailPanelKind, DetailPanelState, ContextCustomerTab, ContextDetailTab,
  ContextHistoryEntry, CreateDialogRequest, SavedView, AuthenticatedWorkspaceUser,
  CurrentUserContext, GuardResult, WorkspaceSyncStatus, ActionDialogState, ActionDialogType,
  EditDialogRequest, WorkspaceNavigationSnapshot,
} from "./ui-types";

// ─────────────────────────────────────────────────────────────────────────
// CORE — db, auth, hydration, sync, staff location pings
// ─────────────────────────────────────────────────────────────────────────
export interface CoreState {
  db: RDashDatabase;
  authUser: AuthenticatedWorkspaceUser | null;
  serverRevision: number;
  workspaceSyncStatus: WorkspaceSyncStatus;
  workspaceSyncError: string | null;
  // FIX-E2E-001: Await the server commit queue. Call this before starting
  // operations that depend on entities being persisted server-side (e.g.
  // file uploads after createCustomerWithFirstSite).
  awaitServerSync: () => Promise<void>;
  staffLocationPings: StaffLocationPing[];
  replaceStaffLocationPings: (points: StaffLocationPing[]) => void;
  upsertStaffLocationPing: (point: StaffLocationPing) => void;
  hydrateSecureWorkspace: (input: {
    db: RDashDatabase;
    revision: number;
    user: AuthenticatedWorkspaceUser;
    rowVersions?: Record<string, number>;
    deletedRowVersionKeys?: string[];
  }) => boolean;
  acceptWorkspaceServerRevision: (input: {
    revision: number;
    rowVersions?: Record<string, number>;
    deletedRowVersionKeys?: string[];
  }) => void;
  currentUser: () => CurrentUserContext;
  updateAuthUser: (patch: { name?: string }) => void;
  canReleaseContractorPayment: (workOrderId: string) => GuardResult;
  resetDatabase: (confirmation: string) => Promise<void>;
  mutateMaster: (updater: (master: Master) => Master) => void;
  upsertStaffRolePermission: (row: StaffRolePermission) => void;
  updateStaffRolePermission: (id: string, patch: Partial<Omit<StaffRolePermission, "id" | "role_key" | "module_key">>) => void;
  removeStaffRolePermission: (id: string) => void;
  registerStaffDocument: (input: { staffId: string; documentType: StaffDocument["document_type"]; documentNo?: string; fileName: string; fileUrl?: string; mimeType?: string; fileSizeBytes?: number }) => void;
  updateStaffDocument: (id: string, patch: Partial<Omit<StaffDocument, "id" | "staff_id" | "created_at">>) => void;
  removeStaffDocument: (id: string) => void;
  logAudit: (entry: {
    actor: string;
    actor_role?: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_label?: string;
    kind: import("../types").AuditLogEntry["kind"];
    /** Reason for the action (e.g., direct-award justification). */
    reason?: string;
    /** Before/after values for field-level audit diffing. */
    before?: unknown;
    after?: unknown;
    changes?: Array<{ id?: string; field_path?: string; field?: string; before?: unknown; after?: unknown; }>;
    /** Source module that triggered this event. */
    source_module?: string;
    /** Cross-post targets: additional entity types/IDs that should receive
     *  this event in their threads. The primary entity_type/entity_id always
     *  gets the event; cross_posts extend it to related entities. */
    cross_post?: Array<{ entity_type: string; entity_id: string; entity_label?: string; }>;
  }) => void;
  dataIssues: () => string[];
  /**
   * Run all reconciliation helpers (attendance, follow-ups, visits, recurring
   * tasks) in one shot. Safe to call multiple times — each helper is
   * idempotent. Returns a summary of how many records each one touched.
   * Hooked into the workspace-load flow so reconciliations fire even if no
   * manager ever opens Attendance / Visits / Tasks modules.
   */
  reconcileWorkspace: () => {
    attendance: number;
    followups: number;
    visits: number;
    recurringTasks: number;
    total: number;
  };
  // ── Integrity layer (Phase 4) ──────────────────────────────────────
  /** The most recent integrity report, or null if not yet checked. */
  integrityReport: IntegrityReport | null;
  /** Run the integrity checker against the current db and store the report.
   *  Safe to call from any module — read-only, no commit. */
  runIntegrityCheck: () => IntegrityReport;
  /** Run the integrity repair engine, commit the repaired db via the
   *  workspace transaction pipeline, re-run the checker, and return the
   *  RepairResult. Throws if the repair would violate business rules. */
  repairIntegrityNow: () => RepairResult;
  /** Cascade-delete a record (and apply cascade/restrict/nullify rules to
   *  every child collection). Commits the result via the workspace
   *  transaction pipeline. Returns the CascadeResult. */
  cascadeDeleteRecord: (
    collection: string,
    id: string,
    options?: { softDelete?: boolean; maxDepth?: number },
  ) => CascadeResult;
}

// ─────────────────────────────────────────────────────────────────────────
// UI — tabs, modules, detail panel, dialogs, saved views, navigation
// ─────────────────────────────────────────────────────────────────────────
export interface UIState {
  activeModuleId: string;
  moduleHistory: WorkspaceTab[];
  moduleHistoryIndex: number;
  moduleSearch: string;
  workspaceSearch: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  selectedCustomerId: string | null;
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  moreMenuOpen: boolean;
  quickAddOpen: boolean;
  keyboardShortcutsOpen: boolean;
  taskPriorityOrder: string[];
  recentCreated: { id: string; kind: string; label: string; ts: number }[];
  createDialog: CreateDialogRequest | null;
  detailPanel: DetailPanelState;
  contextHistory: ContextHistoryEntry[];
  contextHistoryIndex: number;
  actionDialog: ActionDialogState;
  commandPaletteOpen: boolean;
  savedViews: SavedView[];
  quotationAcceptanceDialog: { quotationId: string } | null;
  editDialog: EditDialogRequest | null;
  openCreateDialog: (request: CreateDialogRequest) => void;
  closeCreateDialog: () => void;
  openContextCustomer: (customerId: string, customerTab?: ContextCustomerTab, sourceModule?: string) => void;
  openContextDetail: (kind: Exclude<DetailPanelKind, null>, recordId: string, customerId?: string, sourceModule?: string) => void;
  setContextCustomerTab: (tab: ContextCustomerTab) => void;
  setContextDetailTab: (tab: ContextDetailTab) => void;
  navigateContextHistory: (direction: -1 | 1) => void;
  clearContextHistory: () => void;
  openActionDialog: (type: ActionDialogType, customerId?: string) => void;
  closeActionDialog: () => void;
  setCommandPaletteOpen: (v: boolean) => void;
  addSavedView: (view: Omit<SavedView, "id" | "createdAt">) => void;
  deleteSavedView: (id: string) => void;
  renameSavedView: (id: string, label: string) => void;
  openQuotationAcceptanceDialog: (quotationId: string) => void;
  closeQuotationAcceptanceDialog: () => void;
  openEditDialog: (request: EditDialogRequest) => void;
  closeEditDialog: () => void;
  quotationAcceptanceWarnings: (quotationId: string, coverageIds?: string[]) => string[];
  setActiveModule: (id: string) => void;
  navigateModuleHistory: (direction: -1 | 1) => void;
  setModuleSearch: (q: string) => void;
  setWorkspaceSearch: (q: string) => void;
  openTab: (tab: WorkspaceTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  selectCustomer: (id: string | null) => void;
  setMobileNavOpen: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setMoreMenuOpen: (v: boolean) => void;
  setQuickAddOpen: (v: boolean) => void;
  setKeyboardShortcutsOpen: (v: boolean) => void;
  setTaskPriorityOrder: (ids: string[]) => void;
  addRecentCreated: (entry: { id: string; kind: string; label: string }) => void;
  openDetail: (kind: DetailPanelKind, recordId: string, fromModule?: string) => void;
  closeDetail: () => void;
  restoreNavigationSnapshot: (snapshot: WorkspaceNavigationSnapshot) => void;
  /**
   * I: Deep-link filter for the Reports module. Set by any module that wants
   * to deep-link into a specific report (e.g., CustomerDesk → "Customer
   * report" → salesReport filtered to that customer). Cleared by
   * clearReportFilter. ReportsModule reads this on mount and applies it.
   */
  reportFilter: { reportId?: string; customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string } | null;
  setReportFilter: (filter: { reportId?: string; customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string }) => void;
  clearReportFilter: () => void;
}

// ─────────────────────────────────────────────────────────────────────────
// CRM — customers, sites, areas, work required, measurements
// ─────────────────────────────────────────────────────────────────────────
export interface CrmState {
  saveCustomerWithSites: (input: SaveCustomerWithSitesInput) => { customerId: string; siteIds: string[]; areaIds: string[]; changed: boolean };
  mergeCustomers: (survivingCustomerId: string, duplicateCustomerId: string) => void;
  archiveSite: (id: string, options: { reason: string; cancelled?: boolean }) => void;
  addArea: (r: Partial<Area>) => string;
  updateArea: (id: string, patch: Partial<Area>) => void;
  archiveArea: (id: string, options: { reason: string; replacementAreaId?: string }) => void;
  addWorkRequired: (work: Partial<import("../types").WorkRequired>) => string;
  updateWorkRequired: (id: string, patch: Partial<import("../types").WorkRequired>) => void;
  transitionWorkRequiredStatus: (id: string, status: import("../types").WorkRequiredStatus, options?: { reason?: string; source?: "drag" | "keyboard" | "system" }) => void;
  addMeasurementRevision: (revision: Partial<import("../types").MeasurementRevision> & { site_id: string; area_id: string }) => string;
  captureStructuredWorkRequired: (workRequiredId: string, lines: Array<{
    site_id: string; area_id?: string; area_name?: string; create_area?: boolean;
    area_type?: import("../types").AreaType; category_id: string; subcategory_id: string;
    article_id: string; variant_id?: string; quantity: number; unit_id: string; notes?: string;
  }>) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// TASKS — tasks, followups, recurring
// ─────────────────────────────────────────────────────────────────────────
export interface TasksState {
  addTask: (t: Partial<Task>) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  completeTask: (id: string, input?: { note?: string; proofUrls?: string[] }) => void;
  blockTask: (id: string, reason: string) => string;
  reopenTask: (id: string, reason: string) => void;
  addFollowup: (f: Partial<Followup>) => string;
  updateFollowup: (id: string, patch: Partial<Followup>) => void;
  completeFollowup: (id: string, input: { outcome: import("../types").FollowupOutcome; note: string; promiseDate?: string; nextDueAt?: string }) => void;
  rescheduleFollowup: (id: string, dueAt: string, note?: string) => void;
  runFollowupReconciliation: (at?: string) => number;
  toggleRecurringTask: (id: string) => void;
  runRecurringTasks: (at?: string) => number;
}

// ─────────────────────────────────────────────────────────────────────────
// VISITS — visits, GPS, reconciliation, reports
// ─────────────────────────────────────────────────────────────────────────
export interface VisitsState {
  addVisit: (v: Partial<Visit>) => string;
  markVisitEnRoute: (id: string) => void;
  recordVisitTrackingPoint: (id: string, capture: GpsCapture) => void;
  startContractorVisit: (id: string) => void;
  completeContractorVisit: (id: string) => void;
  cancelVisit: (id: string, reason: string) => void;
  reassignVisit: (id: string, assignee: { type: "staff" | "contractor"; id: string }) => void;
  rescheduleVisit: (id: string, scheduledAt: string) => void;
  runVisitReconciliation: (at?: string) => number;
  checkInVisit: (id: string, capture: GpsCapture) => void;
  checkOutVisit: (id: string, capture: GpsCapture) => void;
  fileVisitReport: (id: string, notes: string, proofs?: { type: string; file_name: string; attachment_id: string }[]) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// QUOTATIONS — quotations, items, milestones, acceptance, bidding
// ─────────────────────────────────────────────────────────────────────────
export interface QuotationsState {
  addQuotation: (q: Partial<Quotation>) => string;
  updateQuotation: (id: string, patch: Partial<Quotation>) => void;
  addQuotationItem: (quotationId: string, item: Partial<QuotationItem>) => void;
  updateQuotationItem: (quotationId: string, itemId: string, patch: Partial<QuotationItem>) => void;
  removeQuotationItem: (quotationId: string, itemId: string) => void;
  addQuotationMilestone: (quotationId: string, milestone: Partial<import("../types").PaymentTerm>) => void;
  updateQuotationMilestone: (quotationId: string, milestoneId: string, patch: Partial<import("../types").PaymentTerm>) => void;
  removeQuotationMilestone: (quotationId: string, milestoneId: string) => void;
  reviseQuotationWithHolds: (originalQuotationId: string, heldItemIds: string[], holdReason?: string) => string;
  /** Renegotiate a quotation after it has been sent or accepted — even after a
   *  Work Order exists. Creates a new revision with `revision_kind="renegotiation"`
   *  or `"variation"` (when a Work Order is already linked). The original is
   *  NOT cancelled — it stays as historical record. Requires a reason and
   *  records an audit-trail entry. This is the "soft, audited exception path"
   *  that replaces the old hard block. */
  renegotiateQuotation: (originalQuotationId: string, reason: string, options?: { heldItemIds?: string[]; note?: string }) => string;
  acceptQuotationForBidding: (quotationId: string, options?: { coverageIds?: string[]; acceptWithWarnings?: boolean; note?: string }) => string;
  reopenJobForBidding: (workOrderId: string) => void;
  updateJob: (id: string, patch: Partial<WorkOrder>) => void;
  /** C: Approve a quotation discount that was held for owner approval. Clears
   *  pending_approval and approval_reason on the quotation and logs an audit
   *  decision. Owner-only. */
  approveQuotationDiscount: (quotationId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// EXECUTION — work orders, BOQ, drawings, execution logs, variations
// ─────────────────────────────────────────────────────────────────────────
export interface ExecutionState {
  createBOQ: (workOrderId: string) => string;
  updateBOQItem: (boqId: string, itemId: string, patch: Partial<LineItem>) => void;
  /** A-2: Update a single BOQ line's rate (rate negotiation). Logs an audit
   *  entry with the negotiation reason. */
  updateBOQItemRate: (boqId: string, itemId: string, newRate: number, reason?: string) => void;
  /** A-4: Re-pull rates from the linked quotation's scope_lines into the BOQ. */
  syncBOQFromQuotation: (boqId: string) => void;
  addBOQItem: (boqId: string, item: Partial<LineItem>) => void;
  removeBOQItem: (boqId: string, itemId: string) => void;
  approveBOQ: (boqId: string) => void;
  addDrawing: (d: Partial<import("../types").Drawing>) => string;
  updateDrawing: (id: string, patch: Partial<import("../types").Drawing>) => void;
  removeDrawing: (id: string) => void;
  approveDrawing: (id: string, approver?: string) => void;
  uploadDrawingVersion: (parentDrawingId: string, file: { id?: string; primary_file_attachment_id?: string; notes?: string }) => string;
  linkBOQItemToDrawing: (boqId: string, itemId: string, drawingId: string) => void;
  addExecutionLog: (log: Partial<import("../types").DailyExecutionLog> & {
    uploaded_photos?: Array<{ file_name: string; attachment_id: string; mime_type?: string; caption?: string; captured_at?: string }>;
  }) => string;
  updateExecutionLog: (id: string, patch: Partial<import("../types").DailyExecutionLog>) => void;
  removeExecutionLog: (id: string) => void;
  verifyExecutionProgress: (logId: string, decision: "verified" | "returned", note?: string) => void;
  createVariationRequest: (input: { work_order_id: string; execution_log_id?: string; title?: string; description: string; requested_amount: number }) => string;
  decideVariationRequest: (id: string, decision: "approved" | "rejected", note?: string) => void;
  confirmMaterialReceipt: (logId: string, photoAttachmentId?: string) => void;
  addJobCostLine: (c: Partial<WorkOrderCostLine>) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// PROCUREMENT — vendors, RFQs, bids, POs, GRN, inventory, dispatch
// ─────────────────────────────────────────────────────────────────────────
export interface ProcurementState {
  addVendor: (v: Partial<import("../types").Vendor>) => string;
  updateVendor: (id: string, patch: Partial<import("../types").Vendor>) => void;
  addStaff: (s: Partial<import("../types").Staff>) => string;
  updateStaff: (id: string, patch: Partial<import("../types").Staff>) => void;
  createVendorRFQ: (workOrderId: string, vendorIds?: string[]) => string;
  addVendorBid: (input: { rfq_id: string; vendor_id: string; lines: import("../types").VendorBidLine[]; delivery_days?: number }) => string;
  selectVendorBid: (bidId: string) => void;
  createPOFromVendorBid: (bidId: string) => string;
  /** E-3: Auto-select the lowest-quoted bid on an RFQ and create a PO from it.
   *  Throws if no received bids exist. */
  createPOFromLowestBid: (rfqId: string) => string;
  createPO: (po: Partial<PurchaseOrder>) => string;
  /** Direct award — create a PO straight to a trusted vendor WITHOUT running a
   *  formal RFQ/bid round. Requires a justification reason (audit trail).
   *  The resulting PO carries `direct_award=true`, `award_basis="direct"`,
   *  `award_reason`, and `award_approved_by`. This is the "soft, audited
   *  exception path" that replaces the old implicit "you must have an RFQ"
   *  expectation. */
  createDirectAwardPO: (input: {
    work_order_id?: string;
    site_id?: string;
    vendor_id: string;
    vendor_name: string;
    items: import("../types").LineItem[];
    expected_delivery?: string;
    award_reason: string;
    note?: string;
  }) => string;
  updatePO: (id: string, patch: Partial<PurchaseOrder>) => void;
  approvePO: (id: string) => void;
  sendPO: (id: string) => void;
  fileGRN: (grn: Partial<GRN> & {
    receiving_files?: Array<{ file_name: string; attachment_id: string; mime_type?: string; caption?: string }>;
    delivery_challan_file?: { file_name: string; attachment_id: string; mime_type?: string; caption?: string };
  }) => string;
  verifyGRNReceipt: (id: string) => void;
  issueDispatch: (d: Partial<SiteDispatch>) => string;
  acknowledgeDispatch: (id: string) => void;
  /** J: Recompute a vendor's reliability_score, on_time_pct, and rating from
   *  actual GRN + bill performance. Writes the recomputed fields back to the
   *  vendor master. */
  recomputeVendorPerformance: (vendorId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// VENDOR BILLS — bills, payments, matching
// ─────────────────────────────────────────────────────────────────────────
export interface VendorBillsState {
  addVendorBill: (b: Partial<VendorBill>) => string;
  approveVendorBill: (id: string) => void;
  /** D: Reject a pending_approval vendor bill. Reverts status to "draft"
   *  and clears the pending approval action. Reason is required for audit. */
  rejectVendorBill: (id: string, reason: string) => void;
  recordVendorPayment: (billId: string, amount: number, mode: import("../types").PaymentMode | string, reference: string) => string;
  matchVendorBill: (billId: string, params: {
    vendorInvoiceNo?: string; vendorInvoiceDate?: string; invoiceAmount: number;
    invoiceLines?: import("../types").VendorInvoiceLine[]; matchedBy?: string;
  }) => { matched: boolean; obstacleId?: string };
  resolveVendorBillMismatch: (billId: string, resolution: "accept_as_is" | "partial_accept" | "return_to_vendor" | "price_adjustment" | "settlement" | "hold_payment", notes: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// CONTRACTORS — contractors, bids, settlements, RA bills, commissions
// ─────────────────────────────────────────────────────────────────────────
export interface ContractorsState {
  addContractor: (c: Partial<import("../types").Contractor>) => string;
  updateContractor: (id: string, patch: Partial<import("../types").Contractor>) => void;
  addContractorBid: (b: Partial<import("../types").ContractorBid>) => string;
  updateContractorBid: (id: string, patch: Partial<import("../types").ContractorBid>) => void;
  selectContractorBid: (bidId: string) => void;
  /** Direct-award a contractor to an AcceptedScope WITHOUT running a formal
   *  ContractorBid round. Requires a reason (audit trail). Tags the resulting
   *  WorkOrder with contractor_selection_method="direct_award". */
  directAwardContractor: (input: {
    accepted_scope_id: string;
    contractor_id: string;
    award_amount?: number;
    with_material?: boolean;
    estimated_days?: number;
    award_reason: string;
    note?: string;
  }) => string;
  settleContractor: (params: {
    workOrderId: string; completedPct: number; reason: string;
    advancesPaid?: number; materialsIssuedValue?: number; recoveries?: number;
    type?: import("../types").SettlementType; createReplacementJob?: boolean;
  }) => { settlementId: string; replacementJobId?: string };
  createContractorRABill: (workOrderId: string, contractorId: string, amount: number, description: string, progressPct?: number) => string;
  requestContractorBillPayment: (billId: string, amount: number) => string;
  approveContractorPayment: (approvalId: string) => void;
  recordContractorPayment: (paymentId: string, mode: import("../types").PaymentMode | string, reference: string) => void;
  accrueCommission: (workOrderId: string, quotationId: string, sourcePartnerId: string) => void;
  payCommission: (id: string) => void;
  /** J: Recompute a contractor's reliability_score, on_time_pct, and rating
   *  from actual RA-bill + payment performance. Writes the recomputed fields
   *  back to the contractor master. */
  recomputeContractorPerformance: (contractorId: string) => void;
  // FIX-CONTRACTOR-BATCH2 / F.7: Mark a contractor bill as "disputed" so
  // recomputeContractorPerformance can penalize the contractor's reliability
  // score and the ContractorPaymentsModule can surface the dispute state. The
  // inverse action (resolveContractorBillDispute) flips the status back to
  // "verified" so the bill can re-enter the normal payment release flow.
  disputeContractorBill: (billId: string, reason: string) => void;
  resolveContractorBillDispute: (billId: string) => void;
  // FIX-CONTRACTOR-BATCH2 / F.8: Hold / cancel a contractor payment. "held"
  // freezes a pending/approved payment pending investigation; "cancelled"
  // voids it entirely. Both write an audit trail + thread reply so the
  // decision is traceable.
  holdContractorPayment: (paymentId: string, reason: string) => void;
  cancelContractorPayment: (paymentId: string, reason: string) => void;
  // FIX-CONTRACTOR-BATCH2 / F.13: Soft-delete / archive a contractor.
  // deactivateContractor sets status="inactive" (kept in master for
  // historical lookup, filtered out of bid/direct-award dropdowns).
  // activateContractor reverses it. No hard delete — preserves referential
  // integrity with contractorBids / contractorBills / contractorPayments /
  // contractorSettlements / workOrders.
  deactivateContractor: (contractorId: string, reason?: string) => void;
  activateContractor: (contractorId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// FINANCE — payments, invoices, receipts, commercial terms, tax
// ─────────────────────────────────────────────────────────────────────────
export interface FinanceState {
  addPayment: (p: Partial<Payment>) => string;
  triggerPaymentMilestone: (id: string, options?: { dueDate?: string; reason?: string }) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;
  recordPaymentReceived: (id: string, mode: string, reference: string, amount?: number) => void;
  recordCustomerReceipt: (invoiceId: string, amount: number, mode: import("../types").PaymentMode | string, reference: string, paymentId?: string) => string;
  recordPaymentPromise: (id: string, promiseDate: string) => void;
  /** Reconcile a provisional payment — clears the provisional flag and sets reconciled_at. */
  reconcilePayment: (id: string) => void;
  addInvoice: (invoice: Partial<CustomerInvoice>) => string;
  updateInvoice: (id: string, patch: Partial<CustomerInvoice>) => void;
  /** Reconcile a provisional invoice — clears the provisional flag and sets reconciled_at. */
  reconcileInvoice: (id: string) => void;
  issueInvoiceForPayment: (paymentId: string) => string;
  resolveApproval: (id: string, decision: "approved" | "rejected") => void;
  toggleCommercialTerm: (id: string) => void;
  toggleTaxConfig: (id: string) => void;
  toggleValidityConfig: (id: string) => void;
  setDefaultPaymentTermTemplate: (id: string) => void;
  /** B-2: Scan all invoices + payments; mark past-due open balances as
   *  "overdue". Idempotent — only flips statuses that aren't already overdue. */
  refreshOverdueStatuses: () => void;
  /** B-2: Workspace-load finance reconciliation. Runs refreshOverdueStatuses
   *  and (in future) recomputes aging buckets. Safe to call repeatedly. */
  reconcileFinance: () => void;
}

// ─────────────────────────────────────────────────────────────────────────
// THREADS — threads, comm sends
// ─────────────────────────────────────────────────────────────────────────
export interface ThreadsState {
  openThreadFor: (kind: ThreadKind, recordId: string, title: string, participants?: string[]) => string;
  addThreadReply: (threadId: string, msg: {
    author: string; role?: string; body: string;
    kind?: ThreadMessage["kind"]; proof_attachment_id?: string;
    parent_message_id?: string; related_thread_id?: string;
    /** General attachments (images, PDFs, videos) on this message. */
    attachments?: import("../types").ThreadMessageAttachment[];
    /**
     * Optional pre-parsed mentions. If omitted, the slice auto-parses the
     * body via `parseMentions` and stores the result on the message.
     */
    mentions?: import("../types").ThreadMessageMention[];
  }) => string;
  sendComm: (s: {
    channel: import("../types").CommChannel; customer_id: string; staff_name: string;
    subject: string; body?: string; source_attachment_ids?: string[];
    status?: import("../types").CommSend["status"];
    /** Optional follow-up this comm is logged against. */
    followup_id?: string;
    /** Optional task this comm is logged against. */
    task_id?: string;
    /** Optional work order context. */
    work_order_id?: string;
    /** Optional quotation context. */
    quotation_id?: string;
    /** When set, a new follow-up is auto-created after sending. */
    schedules_next_followup?: { due_date: string; purpose: string };
  }) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// MASTERS — staff, approval policies, automation, attendance
// ─────────────────────────────────────────────────────────────────────────
export interface MastersState {
  addApprovalPolicy: (p: Partial<import("../types").ApprovalPolicy>) => void;
  updateApprovalPolicy: (id: string, patch: Partial<import("../types").ApprovalPolicy>) => void;
  toggleApprovalPolicy: (id: string) => void;
  deleteApprovalPolicy: (id: string) => void;
  requiresApproval: (trigger: import("../types").ApprovalTrigger, amount: number) => import("../types").ApprovalPolicy | null;
  toggleAutomationRule: (id: string) => void;
  updateAutomationRule: (id: string, patch: Partial<import("../types").AutomationRule>) => void;
  addAutomationRule: (r: Partial<import("../types").AutomationRule>) => void;
  /** E: Control Brain execution engine. Finds every enabled AutomationRule
   *  whose trigger matches, evaluates the optional `condition` against the
   *  context payload, and for each match: increments fires_count, sets
   *  last_fired_at, logs an audit entry, and dispatches the rule's actions
   *  (create_task / send_alert / update_status). Safe to call from any slice. */
  fireAutomation: (trigger: import("../types").AutomationTrigger | string, context: Record<string, unknown>) => void;
  updateAttendancePolicy: (staffId: string, patch: Partial<AttendancePolicy>) => void;
  checkInAttendance: (input: GpsCapture & { visit_id?: string; staff_id?: string }) => string;
  checkOutAttendance: (input: GpsCapture & { staff_id?: string }) => void;
  runAttendanceReconciliation: (at?: string) => number;
  /** G: Regularize a wrongly auto-marked absence. A manager can reverse an
   *  auto_absent record (bad signal, dead phone, off-geofence site visit) by
   *  setting status to "present"/"half_day"/"leave" + a regularization_reason.
   *  The original auto_absent record is preserved (auto_generated stays true)
   *  so the correction trail is visible. Requires the actor to be Owner/Manager. */
  regularizeAttendance: (recordId: string, input: {
    status: "present" | "half_day" | "leave";
    reason: string;
    check_in?: string;
    check_out?: string;
  }) => void;
  /** K1: Compute salary deductions for a staff member for a given month.
   *  Returns the full salary, total deductions, net salary, and a day-by-day
   *  breakdown of each violation (late, absent, half-day) with the rule that
   *  was violated, the date, and the deduction amount. */
  computeStaffSalary: (staffId: string, yearMonth: string) => {
    staff_id: string;
    staff_name: string;
    year_month: string;
    base_salary: number;
    per_day_rate: number;
    present_days: number;
    absent_days: number;
    half_days: number;
    late_days: number;
    late_deduction_total: number;
    absence_deduction_total: number;
    total_deductions: number;
    net_salary: number;
    violations: Array<{
      date: string;
      type: "late" | "absent" | "half_day";
      late_minutes?: number;
      rule: string;
      deduction: number;
    }>;
  };
  /** F: Create a payroll period for the given month/year and auto-generate
   *  payroll lines for every active staff member using computeStaffSalary.
   *  Returns the new period id. Status starts as "open" (mapped to the
   *  PayrollPeriod.status="generated" semantic — ready for approval). */
  createPayrollPeriod: (month: number, year: number) => string;
  /** F: Add a salary adjustment (overtime / advance / deduction / bonus / hold)
   *  for a staff member. Adjustments of type "deduction"/"advance"/"hold"
   *  reduce net pay; "overtime"/"bonus" increase it. Status starts as "draft". */
  addSalaryAdjustment: (staffId: string, type: import("../types").SalaryAdjustment["type"], amount: number, reason: string) => string;
  /** F: Approve a payroll period (Owner only). Locks the period and marks every
   *  line as ready for payment. */
  approvePayrollPeriod: (id: string) => void;
  /** F: Mark a payroll period as paid. Sets paid_at and every line's payment_status="paid". */
  payPayrollPeriod: (id: string) => void;
  /** F: Reopen a paid/approved payroll period (Owner only, audit-trail required
   *  implicitly via the logAudit call). Sets status back to "open". */
  reopenPayrollPeriod: (id: string) => void;
  // FIX-CONTRACTOR-BATCH2 / F.12: CRUD for the contractor-rate / commission-
  // rule / source-partner master tables. Previously these were read-only in
  // the UI — only seed/import could create rows — so the findCommissionRule
  // lookup was operationally unreachable on production (0 rows in all 3
  // tables). The MastersSalesOpsModule now exposes "Add" dialogs that drive
  // these actions.
  addContractorRate: (r: Partial<import("../types").ContractorRate>) => string;
  addCommissionRule: (r: Partial<import("../types").CommissionRule>) => string;
  addSourcePartner: (p: Partial<import("../types").SourcePartner>) => string;
}

// ─────────────────────────────────────────────────────────────────────────
// FILES — file assets, attachments, reference assignments
// ─────────────────────────────────────────────────────────────────────────
export interface FilesState {
  createFileAssetAndAttach: (file: FileAssetCreateInput, link: Partial<EntityFileAttachment> & {
    entity_type: EntityFileAttachment["entity_type"]; entity_id: string;
  }) => string;
  /** Adds a FileAsset + Attachment to local state WITHOUT server save (server already has them). */
  addServerFileAsset: (fileAsset: FileAsset, attachment: EntityFileAttachment) => void;
  attachFileAsset: (link: Partial<EntityFileAttachment> & {
    file_asset_id: string; entity_type: EntityFileAttachment["entity_type"]; entity_id: string;
  }) => string;
  updateEntityFileAttachment: (id: string, patch: Partial<EntityFileAttachment>) => void;
  detachEntityFileAttachment: (id: string) => void;
  assignReferenceResource: (assignment: Partial<EntityReferenceAssignment> & {
    resource_type: EntityReferenceAssignment["resource_type"]; resource_id: string;
    entity_type: EntityReferenceAssignment["entity_type"]; entity_id: string;
  }) => string;
  archiveReferenceAssignment: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// RISKS — blocked items, risks
// ─────────────────────────────────────────────────────────────────────────
export interface RisksState {
  createBlocked: (b: Partial<BlockedItem>) => void;
  createRisk: (r: Partial<RiskItem>) => void;
  resolveRisk: (id: string) => void;
  resolveBlocked: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// COMPOSED STATE — structurally identical to the original RDashState
// ─────────────────────────────────────────────────────────────────────────
export interface RDashState extends
  CoreState, UIState, CrmState, TasksState, VisitsState,
  QuotationsState, ExecutionState, ProcurementState, VendorBillsState,
  ContractorsState, FinanceState, ThreadsState, MastersState, FilesState,
  RisksState {}
