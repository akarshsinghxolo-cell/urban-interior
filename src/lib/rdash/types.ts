// ============================================================================
// Urban Castle — Shared Type Contract (the "DNA" of the living organism)
// ============================================================================
// This file is the single shared type contract imported by every layer:
// store slices, UI modules, server routes, business rules, and seed data.
//
// Organization (by domain):
//   1.  Primitives          — ID, CustomerSegment, EntityStatus
//   2.  Customer domain      — Customer, Site, Area, WorkRequired, Measurement
//   3.  Quotation domain     — Quotation, LineItem, AcceptedScope, PaymentTerm
//   4.  Execution domain     — WorkOrder, BOQ, Drawing, ExecutionLog, Variation
//   5.  Visit domain         — Visit, VisitRoutePoint, GPS types
//   6.  Task domain          — Task, Followup, RecurringTask
//   7.  Finance domain       — Payment, Invoice, CustomerReceipt, Commission
//   8.  Procurement domain   — VendorRFQ, VendorBid, PurchaseOrder, GRN, Dispatch
//   9.  Inventory domain     — Inventory, StockMovement
//  10.  Contractor domain    — ContractorBid, ContractorBill, ContractorSettlement
//  11.  Vendor domain        — VendorBill, VendorPayment, VendorRate
//  12.  Risk domain          — BlockedItem, RiskItem, ApprovalAction
//  13.  Thread domain        — Thread, ThreadMessage, ThreadKind, ThreadMessageAttachment
//  14.  Attendance domain    — AttendanceRecord, AttendancePolicy
//  15.  File/Media domain    — FileAsset, EntityFileAttachment, Catalogue, Pinterest
//  16.  Master data          — Master (units, categories, articles, vendors, contractors, staff)
//  17.  Root database        — RDashDatabase (the top-level workspace shape)
//
// To add a new entity type: add the interface here, add it to RDashDatabase,
// update business-rules.ts (validateBusinessData), and add an entry to
// entity-thread-map.ts if the entity should have a conversation thread.
// ============================================================================

// --- 1. Primitives ---
export type ID = string;
export type CustomerSegment = "walk_in" | "service_customer" | "product_buyer" | "repeat_customer" | "trade_customer";
export type EntityStatus = "active" | "inactive" | "blocked";
export interface Customer {
    id: ID;
    name: string;
    phone: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    customer_segments: CustomerSegment[];
    status: EntityStatus;
    interest_category_ids?: ID[];
    interest_work_subcategory_ids?: ID[];
    source_partner_id?: ID;
    source_partner_name?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}
export type FileAttachmentReference = {
    attachment_id: ID;
    caption?: string;
    captured_at?: string;
    type?: string;
};
export type SiteStage = "enquiry" | "planning" | "quoted" | "awarded" | "execution" | "on_hold" | "completed" | "cancelled";
export interface Site {
    id: ID;
    customer_id: ID;
    name: string;
    building_name?: string;
    site_type: "apartment" | "office" | "villa" | "shop" | "showroom" | "other";
// --- 2. Customer domain ---
    stage: SiteStage;
    address?: string;
    city?: string;
    locality?: string;
    latitude?: number;
    longitude?: number;
    map_url?: string;
    photo_attachment_ids?: ID[];
    source_partner_id?: ID;
    source_partner_name?: string;
    notes?: string;
    is_archived?: boolean;
    archived_at?: string;
    archived_by?: string;
    archive_reason?: string;
    created_at: string;
    updated_at: string;
}
export type AreaType = "bedroom" | "guest_room" | "living_room" | "kitchen" | "bathroom" | "balcony" | "staircase" | "rooftop" | "office_cabin" | "reception" | "meeting_room" | "pantry" | "facade" | "common_area" | "other";
export type AreaStage = "unmeasured" | "measured" | "quoted" | "active" | "completed";
export interface Area {
    id: ID;
    site_id: ID;
    name: string;
    area_type: AreaType;
    stage: AreaStage;
    length?: number;
    width?: number;
    height?: number;
    unit?: "ft" | "m";
    floor_area?: number;
    perimeter?: number;
    notes?: string;
    is_archived?: boolean;
    archived_at?: string;
    archived_by?: string;
    archive_reason?: string;
    replaced_by_area_id?: ID;
    created_at: string;
    updated_at: string;
}
export type WorkRequiredStatus = "new" | "contacted" | "visit_scheduled" | "measurement_done" | "quotation_in_progress" | "quotation_sent" | "negotiation" | "accepted" | "contractor_bidding" | "awarded" | "in_progress" | "on_hold" | "lost" | "completed";
export interface WorkRequired {
    id: ID;
    customer_id: ID;
    site_id: ID;
    title: string;
    work_category_id?: ID;
    work_subcategory_id?: ID;
    system_name?: string;
    specification?: string;
    area_ids: ID[];
    description?: string;
    structured_items?: LineItem[];
    status: WorkRequiredStatus;
    source?: string;
    priority: Priority;
    budget?: number;
    created_at: string;
    updated_at: string;
}
export interface MeasurementRevision {
    id: ID;
    site_id: ID;
    area_id: ID;
    work_required_id?: ID;
    visit_id?: ID;
    revision_no: number;
    length?: number;
    width?: number;
    height?: number;
    unit: "ft" | "m";
    calculated_area?: number;
    calculated_perimeter?: number;
    notes?: string;
    captured_by?: string;
    captured_at: string;
    photo_count: number;
    drawing_id?: ID;
    status: "draft" | "verified" | "superseded";
}
export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";
export interface PaymentTerm {
    id: ID;
    label: string;
    percentage: number;
    due_event: string;
}
export interface LineItem {
    id: ID;
    title: string;
    description?: string;
    article_id?: ID;
    category_id?: ID;
    work_required_id?: ID;
    work_required_article_id?: ID;
    variant_id?: ID;
    site_id?: ID;
    area_id?: ID;
    site_name?: string;
    area_name?: string;
    drawing_id?: ID;
    drawing_no?: string;
    quantity: number;
    unit_id?: string;
    unit_name?: string;
    rate: number;
    rate_change_reason?: string;  // STAGE-6-FIX: used by BOQModule
    rate_last_changed_by?: string;
    rate_last_changed_at?: string;
    rate_basis?: "budget" | "vendor_bid" | "po" | "actual";
    amount: number;
    tax_rate?: number;
    status?: string;
    held?: boolean;
    hold_reason?: string;
    source_item_id?: ID;
    source_kind?: "quotation" | "boq" | "po" | "grn" | "inventory";
    ordered_qty?: number;
    received_qty?: number;
    issued_qty?: number;
    consumed_qty?: number;
    supply_responsibility?: "company" | "contractor" | "customer";
}
export type QuotationItem = LineItem;
export interface QuotationCoverage {
    id: ID;
    work_required_id: ID;
    area_ids: ID[];
    measurement_revision_ids: ID[];
    coverage_label: string;
    status: "proposed" | "accepted" | "superseded" | "declined";
}
export interface Quotation {
    id: ID;
    quotation_no: string;
    customer_id: ID;
    readonly customer_name?: string;
    site_id: ID;
    title: string;
    status: QuotationStatus;
    revision_no: number;
    parent_quotation_id?: ID;
    accepted_at?: string;
    accepted_by?: string;
    cancelled_at?: string;
    cancelled_by?: string;
    cancellation_reason?: string;
    superseded_by_quotation_id?: ID;
    valid_until: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    payment_terms: PaymentTerm[];
    commercial_terms?: {
        gst_inclusive?: boolean;
        warranty?: string;
        delivery_days?: number;
    };
    coverage: QuotationCoverage[];
    scope_lines: QuotationItem[];
    items?: QuotationItem[];
    thread_id?: ID;
// --- 3. Quotation domain ---
    work_order_ids: ID[];
    /** "original" | "renegotiation" | "variation" — tracks how this revision came to be.
     *  "renegotiation" = customer renegotiated post-acceptance (price/material/scope change).
     *  "variation" = formal change order after Work Order creation. */
    revision_kind?: "original" | "renegotiation" | "variation";
    /** Reason recorded when this revision was created as an exception
     *  (renegotiation after acceptance, or variation after Work Order). */
    revision_reason?: string;
    /** Who approved the renegotiation/variation exception. */
    revision_approved_by?: string;
    /** True when any coverage measurement is still in "draft" status (provisional). */
    has_provisional_measurements?: boolean;
    /** Discount % applied to this quotation (0-100). Triggers approval when it
     *  crosses the `quotation_discount` policy threshold. */
    discount_pct?: number;
    /** True when this quotation is blocked pending an owner discount-approval
     *  decision. Cleared by `approveQuotationDiscount`. */
    pending_approval?: boolean;
    /** Reason / context recorded when the discount-approval hold was triggered. */
    approval_reason?: string;
    /** Snapshot of the active commercial-terms text applied at creation time. */
    terms_and_conditions?: string;
    /** Snapshot of the active tax-config applied at creation time. */
    tax_config?: { name: string; rate: number; type: TaxConfig["type"] };
    /** Validity days applied (from the active ValidityConfig). */
    validity_days?: number;
    created_at: string;
    updated_at: string;
}
export interface AcceptedScope {
    id: ID;
    quotation_id: ID;
    customer_id: ID;
    site_id: ID;
    work_required_id: ID;
    area_ids: ID[];
    measurement_revision_ids: ID[];
    label: string;
    accepted_value: number;
    status: "accepted" | "contractor_bidding" | "awarded" | "in_work_order" | "completed" | "cancelled";
    contractor_bid_id?: ID;
    work_order_id?: ID;
    /** How the contractor was chosen for this scope. "bid" = formal bidding; "direct_award" = skip bidding. */
    contractor_selection_method?: ContractorSelectionMethod;
    accepted_at: string;

    created_at?: string;  // STAGE-6-FIX: used by WorkOrderTimelineModule
    title?: string;
    notes?: string;
}
export type WorkOrderStatus = "scheduled" | "in_progress" | "on_hold" | "completed" | "cancelled" | "abandoned";
/** How a contractor was chosen for a WorkOrder.
 *  - "bid" = formal ContractorBid round was run and a bid was selected (reward the rigid path)
 *  - "direct_award" = manager skipped bidding and assigned directly to a trusted contractor (audited exception)
 *  - "repeat" = repeat award to the same contractor from a prior job */
export type ContractorSelectionMethod = "bid" | "direct_award" | "repeat";
export interface WorkOrder {
    id: ID;
    work_order_no: string;
    customer_id: ID;
    readonly customer_name?: string;
    accepted_scope_ids: ID[];
    work_required_ids: ID[];
    quotation_ids: ID[];
    site_id: ID;
    area_ids: ID[];
    title: string;
    status: WorkOrderStatus;
    contractor_id?: ID;
    contractor_name?: string;
    with_material?: boolean;
    material_responsibility?: "company" | "contractor" | "customer";
    contractor_award_amount?: number;
    /** How the contractor was chosen. "bid" = formal bidding; "direct_award" = skip bidding (reason required). */
    contractor_selection_method?: ContractorSelectionMethod;
    /** Reason recorded when contractor was direct-awarded without a formal bid round. */
    contractor_award_reason?: string;
    /** Who approved the direct-award exception. */
    contractor_award_approved_by?: string;
    start_date: string;
    expected_end?: string;
    actual_end?: string;
    value: number;
    progress: number;
    site_address?: string;
    abandoned_at?: string;
// --- 4. Execution domain ---
    abandoned_reason?: string;
    abandoned_contractor_id?: ID;
    abandoned_contractor_name?: string;
    replacement_for_work_order_id?: ID;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type VisitStatus = "scheduled" | "en_route" | "checked_in" | "report_pending" | "completed" | "missed" | "cancelled";
export type VisitType = "measurement" | "site_visit" | "delivery" | "collection" | "inspection" | "handover";
export type VisitProof = FileAttachmentReference;
export type VisitRoutePointKind = "planned" | "en_route" | "check_in" | "tracking" | "check_out";
export interface VisitRoutePoint {
    id: ID;
    kind: VisitRoutePointKind;
    latitude: number;
    longitude: number;
    captured_at: string;
    source?: "planned_site" | "device_gps" | "manual" | "fallback";
    accuracy_m?: number;
    note?: string;
}
export type GeoActionSource = "manual" | "auto_geofence";
export type VisitLocationTarget = "site" | "vendor";
export interface Visit {
    id: ID;
    customer_id: ID;
    work_required_id?: ID;
    work_order_id?: ID;
    site_id?: ID;
    location_target_type?: VisitLocationTarget;
    vendor_id?: ID;
    vendor_name?: string;
    assignee_type?: "staff" | "contractor";
    staff_id: ID;
    staff_name: string;
    contractor_id?: ID;
    contractor_name?: string;
    visit_type: VisitType;
    location_name: string;
    status: VisitStatus;
    scheduled_at: string;
    scheduled_duration_minutes?: number;
    check_in_window_before_minutes?: number;
    check_in_window_after_minutes?: number;
    missed_at?: string;
    missed_reason?: string;
    recovery_followup_id?: ID;
    cancelled_at?: string;
    cancelled_by?: string;
    cancelled_reason?: string;
    rescheduled_at?: string;
    rescheduled_by?: string;
    report_due_at?: string;
// --- 5. Visit domain ---
    check_in_at?: string;
    check_out_at?: string;
    check_in_accuracy_m?: number;
    check_out_accuracy_m?: number;
    /** Total distance traveled (meters) between check-in and check-out,
     *  computed from route_points via haversine sum. Set on check-out. */
    distance_traveled_m?: number;
    check_in_distance_m?: number;
    check_out_distance_m?: number;
    check_in_verified?: boolean;
    check_out_verified?: boolean;
    check_in_source?: GeoActionSource;
    check_out_source?: GeoActionSource;
    auto_check_in_at?: string;
    auto_check_out_at?: string;
    planned_latitude?: number;
    planned_longitude?: number;
    latitude?: number;
    longitude?: number;
    route_points?: VisitRoutePoint[];
    notes?: string;
    proof_attachment_ids: ID[];
    thread_id?: ID;
    report_filed?: boolean;
    report_task_id?: ID;
    checkout_thread_message_id?: ID;
    report_thread_message_id?: ID;
    dwell_minutes?: number;
    created_at: string;
    updated_at: string;
}
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "completed" | "cancelled";
export type TaskScope = "general" | "site" | "client" | "office";
export interface Task {
    id: ID;
    customer_id?: ID;
    work_required_id?: ID;
    work_order_id?: ID;
    quotation_id?: ID;
    po_id?: ID;
    visit_id?: ID;
    site_id?: ID;
    title: string;
    description?: string;
    status: TaskStatus;
    priority: Priority;
    assignee_id?: ID;
    assignee_name?: string;
    assigned_to?: string;
    assigned_role?: string;
    due_date: string;
    task_scope: TaskScope;
    task_type?: string;
    comments: unknown[];
    checklist: unknown[];
    proofs: unknown[];
    thread_id?: ID;
    payment_id?: ID;  // STAGE-6-FIX: used by PaymentRecoveryModule
    auto_generated?: boolean;
    completed_at?: string;
    completed_by?: string;
    completion_note?: string;
    completion_proof_attachment_ids?: ID[];
    reopened_at?: string;
// --- 6. Task domain ---
    reopened_by?: string;
    reopen_reason?: string;
    blocked_item_id?: ID;
    created_at: string;
    updated_at: string;
}
export type FollowupStatus = "pending" | "scheduled" | "completed" | "missed" | "closed";
export type FollowupType = "call" | "quotation" | "payment" | "general" | "note";
export type FollowupOutcome = "contacted" | "not_reached" | "callback_scheduled" | "promise_received" | "converted" | "lost" | "not_applicable";
export interface Followup {
    id: ID;
    customer_id?: ID;
    work_required_id?: ID;
    quotation_id?: ID;
    payment_id?: ID;
    visit_id?: ID;
    title: string;
    notes?: string;
    status: FollowupStatus;
    priority: Priority;
    due_at: string;
    due_date: string;
    assigned_to?: string;
    assigned_role?: string;
    followup_type?: FollowupType;
    promise_date?: string;
    outcome?: FollowupOutcome;
    outcome_note?: string;
    completed_at?: string;
    completed_by?: string;
    missed_at?: string;
    escalation_level?: number;
    next_followup_id?: ID;
    notes_history: unknown[];
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type FinancialContext = "service" | "retail";
export type PaymentMode = "bank_transfer" | "upi" | "cash" | "cheque" | "card" | "other";
export interface FinanceContextLink {
    finance_context: FinancialContext;
    site_id?: ID;
    area_ids?: ID[];
    work_required_id?: ID;
    quotation_id?: ID;
    work_order_id?: ID;
}
export type PaymentStatus = "pending" | "partial" | "received" | "overdue" | "cancelled";
export type InvoiceStatus = "draft" | "issued" | "partial" | "paid" | "overdue" | "cancelled";
export type PaymentScheduleState = "scheduled" | "awaiting_event" | "triggered";
export interface Payment extends FinanceContextLink {
    id: ID;
    customer_id: ID;
    readonly customer_name?: string;
    amount: number;
    received_amount?: number;
    status: PaymentStatus;
    mode?: PaymentMode | string;
    due_date: string;
    milestone_term_id?: ID;
    due_event?: string;
    schedule_state?: PaymentScheduleState;
    due_triggered_at?: string;
    received_date?: string;
    reference?: string;
    milestone_label?: string;
    invoice_id?: ID;
    is_advance?: boolean;
    promise_date?: string;
    /** True when this payment was created against provisional (unverified) BOQ/measurements.
     *  Flipped to false once the underlying data is reconciled. Allows billing to proceed
     *  without waiting for final lock, while keeping the provisional state visible. */
    provisional?: boolean;
    /** When the provisional flag was cleared (reconciled). */
    reconciled_at?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface CustomerReceipt extends FinanceContextLink {
// --- 7. Finance domain ---
    id: ID;
    receipt_no: string;
    customer_id: ID;
    invoice_id: ID;
    payment_id?: ID;
    amount: number;
    mode: PaymentMode | string;
    reference: string;
    received_at: string;
    created_by?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface CustomerInvoice extends FinanceContextLink {
    id: ID;
    invoice_no: string;
    customer_id: ID;
    readonly customer_name?: string;
    payment_id?: ID;
    title: string;
    status: InvoiceStatus;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
    issued_at?: string;
    due_date: string;
    paid_at?: string;
    notes?: string;
    /** True when this invoice was issued against provisional (unverified) BOQ/measurements.
     *  Allows billing to proceed before final lock; gets reconciled later. */
    provisional?: boolean;
    reconciled_at?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface ApprovalAction {
    id: ID;
    title: string;
    type: string;
    status: "pending" | "approved" | "rejected";
    customer_id?: ID;
    readonly customer_name?: string;
    amount?: number;
    requested_by?: string;
    due_date?: string;
    linked_record_id?: ID;
    linked_record_type?: "quotation" | "po" | "payment" | "contractor_payment";
    created_at: string;
}
export interface RiskItem {
    id: ID;
    title: string;
    type: "cash" | "margin" | "vendor" | "collection";
    severity: Priority;
    customer_id?: ID;
    readonly customer_name?: string;
    amount?: number;
    reason: string;
    created_at: string;
}
export interface BlockedItem {
    id: ID;
    title: string;
    reason: string;
    customer_id?: ID;
    readonly customer_name?: string;
    linked_task_id?: ID;
    linked_work_order_id?: ID;
    linked_po_id?: ID;
    linked_grn_id?: ID;
    // FIX-ANALYSIS-003 E.4.10: Quotation link so a quotation can be marked
    // as "blocked" pending customer decision.
    linked_quotation_id?: ID;
    thread_id?: ID;
    resolved?: boolean;
    created_at: string;
}
export interface WorkOrderBOQ {
    id: ID;
    work_order_id: ID;
    accepted_scope_ids: ID[];
    readonly customer_name?: string;
    work_order_no: string;
    site_id?: ID;
    title: string;
    status: "draft" | "approved" | "in_progress" | "closed";
    items: LineItem[];
    total_amount: number;
    approved_at?: string;
    approved_by?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
// --- 12. Risk domain ---
}
export type POStatus = "draft" | "pending_approval" | "approved" | "sent" | "partially_received" | "received" | "cancelled";
export interface PurchaseOrder {
    id: ID;
    po_no: string;
    rfq_id?: ID;
    work_order_id?: ID;
    readonly customer_name?: string;
    work_order_no?: string;
    site_id?: ID;
    vendor_id: ID;
    vendor_name: string;
    status: POStatus;
    items: LineItem[];
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    expected_delivery: string;
    actual_delivery?: string;
    approved_by?: string;
    approved_at?: string;
    thread_id?: ID;
    grn_ids: ID[];
    bill_ids: ID[];
    /** Direct award: true when this PO was created without a formal RFQ/bid round. */
    direct_award?: boolean;
    /** Reason/justification recorded when a direct award exception was used. */
    award_reason?: string;
    /** Who approved the direct award exception (role-checked). */
    award_approved_by?: string;
    /** "competitive" (formal RFQ+bid path) | "direct" (skip bidding) | "repeat" (repeat PO to same vendor). */
    award_basis?: "competitive" | "direct" | "repeat";
    created_at: string;
    updated_at: string;
}
export type GRNStatus = "draft" | "pending_receipt_verification" | "received_pending_invoice_match" | "matched" | "mismatched" | "closed";
export type OperationalProof = FileAttachmentReference;
export interface GRN {
    id: ID;
    grn_no: string;
    po_id: ID;
    po_no: string;
    vendor_id: ID;
    vendor_name: string;
    site_id?: ID;
    work_order_id?: ID;
    work_order_no?: string;
    status: GRNStatus;
    items: LineItem[];
    received_at: string;
    received_by?: string;
    received_by_staff_id?: ID;
    receipt_verified_by?: string;
    receipt_verified_at?: string;
    receiving_proof_attachment_ids?: ID[];
    delivery_challan_no?: string;
    delivery_challan_attachment_id?: ID;
    inspection_status?: "accepted" | "accepted_with_observation" | "rejected";
    inspection_notes?: string;
    damage_shortage_notes?: string;
    batch_serial_details?: string;
    mismatch_notes?: string;
    obstacle_id?: ID;
    bill_id?: ID;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface InventoryItem {
    id: ID;
    article_id?: ID;
    work_required_article_id?: ID;
    name: string;
    unit_id?: string;
    unit_name?: string;
    quantity: number;
    reserved_qty?: number;
    issued_qty?: number;
    received_qty?: number;
    rate?: number;
    work_order_id?: ID;
    work_order_no?: string;
    grn_id?: ID;
    location?: string;
    min_qty?: number;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type StockMovementType = "receipt" | "issue" | "return" | "adjustment" | "wastage";
export interface StockMovement {
    id: ID;
    inventory_id: ID;
    article_id?: ID;
    work_required_article_id?: ID;
    name: string;
    type: StockMovementType;
    quantity: number;
    unit_id?: ID;
    unit_name?: string;
    rate?: number;
    work_order_id?: ID;
    work_order_no?: string;
    po_id?: ID;
    grn_id?: ID;
    dispatch_id?: ID;
    notes?: string;
    created_at: string;
}
export type DispatchStatus = "draft" | "issued" | "acknowledged" | "returned";
export interface SiteDispatch {
    id: ID;
    dispatch_no: string;
    work_order_id: ID;
    readonly customer_name?: string;
    work_order_no: string;
    site_id?: ID;
    site_address?: string;
    status: DispatchStatus;
    items: LineItem[];
    issued_at: string;
    issued_by?: string;
    acknowledged_at?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type VendorBillStatus = "draft" | "pending_approval" | "pending" | "approved" | "partly_paid" | "paid" | "disputed";
export interface VendorBillMatch {
    po_amount: number;
    grn_amount: number;
    invoice_amount: number;
    invoice_vs_po: number;
    invoice_vs_grn: number;
    grn_vs_po: number;
    fully_matched: boolean;
    line_diffs: Array<{
        article_id?: ID;
        title: string;
        po_qty?: number;
        grn_qty?: number;
        invoice_qty?: number;
        po_rate?: number;
        invoice_rate?: number;
        diff: number;
        issue?: "short_delivery" | "over_delivery" | "rate_mismatch" | "missing_in_invoice" | "extra_in_invoice";
    }>;
    resolution?: "accept_as_is" | "partial_accept" | "return_to_vendor" | "price_adjustment" | "settlement" | "hold_payment";
    resolution_notes?: string;
    obstacle_id?: ID;
    matched_at?: string;
    matched_by?: string;
}
export interface VendorRFQ {
    id: ID;
    rfq_no: string;
    site_id: ID;
    work_order_id: ID;
    boq_id: ID;
    item_ids: ID[];
    vendor_ids: ID[];
    status: "draft" | "sent" | "responses_received" | "awarded" | "closed";
    created_at: string;
    updated_at: string;
}
export interface VendorBidLine {
    boq_item_id: ID;
    article_id?: ID;
    title: string;
    quantity: number;
    unit_id?: ID;
    unit_name?: string;
    rate: number;
    amount: number;
    tax_rate?: number;
}
export interface VendorBid {
    id: ID;
    rfq_id: ID;
    vendor_id: ID;
    vendor_name: string;
    lines: VendorBidLine[];
    quoted_amount: number;
// --- 8. Procurement domain ---
    delivery_days?: number;
    status: "received" | "shortlisted" | "selected" | "declined";
    created_at: string;
    updated_at: string;
}
export interface VendorInvoiceLine {
    po_item_id?: ID;
    article_id?: ID;
    work_required_article_id?: ID;
    variant_id?: ID;
    unit_id?: ID;
    title: string;
    quantity?: number;
    rate?: number;
    amount: number;
    tax_rate?: number;
}
export interface VendorBill {
    id: ID;
    bill_no: string;
    vendor_id: ID;
    vendor_name: string;
    site_id?: ID;
    work_order_id?: ID;
    po_id: ID;
    po_no: string;
    grn_id: ID;
    grn_no: string;
    amount: number;
    tax_amount?: number;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
    status: VendorBillStatus;
    due_date: string;
    paid_date?: string;
    matched?: boolean;
    mismatch_amount?: number;
    three_way_match?: VendorBillMatch;
    vendor_invoice_no?: string;
    vendor_invoice_date?: string;
    invoice_lines?: VendorInvoiceLine[];
    posted_to_cost_at?: string;
    /** D: Owner who approved the bill (either policy approval or financial approval). */
    approved_at?: string;
    /** D: Owner who approved the bill. */
    approved_by?: string;
    /** D: Recorded when a pending-approval bill is rejected by the Owner. */
    rejected_at?: string;
    rejected_by?: string;
    rejection_reason?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
// --- 11. Vendor domain ---
export interface VendorPayment {
    id: ID;
    payment_no: string;
    vendor_bill_id: ID;
    vendor_id: ID;
    vendor_name: string;
    site_id: ID;
    work_order_id: ID;
    amount: number;
    mode: PaymentMode | string;
    reference: string;
    status: "pending" | "approved" | "paid" | "cancelled";
    paid_at?: string;
    created_by?: string;
    approved_by?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface ContractorBill {
    id: ID;
    bill_no: string;
    ra_no?: string;
    description?: string;
    customer_id: ID;
    site_id: ID;
    work_order_id: ID;
    work_required_id?: ID;
    area_ids?: ID[];
    contractor_id: ID;
    contractor_name: string;
    amount: number;
    paid_amount: number;
    balance_amount: number;
    // FIX-CONTRACTOR-BATCH2 / F.7: "disputed" is now a first-class status —
    // the ContractorPaymentsModule "Dispute bill" / "Resolve dispute" actions
    // flip it on/off, and recomputeContractorPerformance (contractors.ts) uses
    // it to penalize the contractor's reliability score. "draft"/"submitted"/
    // "approved"/"held" are reserved for future use — no store action sets
    // them today, but they remain in the union so the type reflects the
    // intended lifecycle (draft → submitted → verified → approved →
    // partly_paid → paid, with "held"/"disputed" as orthogonal holds).
    status: "draft" | "submitted" | "verified" | "approved" | "partly_paid" | "paid" | "held" | "disputed";
    progress_pct: number;
    due_date?: string;
    verified_at?: string;
    verified_by?: string;
    disputed_at?: string;
    disputed_by?: string;
    dispute_reason?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface ContractorPayment {
    id: ID;
    payment_no: string;
    contractor_bill_id: ID;
    work_order_id: ID;
    site_id: ID;
    contractor_id: ID;
    contractor_name?: string;
    amount: number;
    mode: PaymentMode | string;
    reference: string;
    // FIX-CONTRACTOR-BATCH2 / F.8: "held" and "cancelled" are now reachable
    // via the ContractorPaymentsModule "Hold" / "Cancel payment" actions
    // (contractors.ts holdContractorPayment / cancelContractorPayment).
    // "disputed" is reserved for future use (no UI yet) — kept in the union
    // so the type matches the equivalent ContractorBill status.
    status: "pending" | "approved" | "paid" | "held" | "cancelled" | "disputed";
    paid_at?: string;
    approved_at?: string;
    approved_by?: string;
    held_at?: string;
    held_by?: string;
    hold_reason?: string;
    cancelled_at?: string;
    cancelled_by?: string;
    cancel_reason?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
// FIX-CONTRACTOR-BATCH2 / F.11: "payable" and "cancelled" are reserved for
// future use — accrueCommission creates "accrued" rows and payCommission
// transitions them to "paid". The intermediate "payable" status and the
// "cancelled" status are kept in the union so the type reflects the
// intended lifecycle (accrued → payable → paid, with "cancelled" as the
// void path). They will be wired up when a manual "mark as payable" /
// "cancel commission" UI is added.
export type CommissionStatus = "accrued" | "payable" | "paid" | "cancelled";
export interface Commission {
    id: ID;
    commission_no: string;
    source_partner_id: ID;
    source_partner_name: string;
    customer_id?: ID;
    readonly customer_name?: string;
    site_id?: ID;
    work_order_id?: ID;
    work_order_no?: string;
    quotation_id?: ID;
    base_amount: number;
    rate_pct: number;
    amount: number;
    status: CommissionStatus;
    accrued_at: string;
    paid_date?: string;
    notes?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type WorkOrderCostType = "material" | "labour" | "contractor" | "subcontract" | "overhead" | "tax" | "settlement";
export interface VariationRequest {
    id: ID;
    variation_no: string;
    work_order_id: ID;
    work_order_no: string;
    customer_id: ID;
    site_id: ID;
    execution_log_id?: ID;
    // FIX-ANALYSIS-003 E.4.11: BOQ item links so a variation can be
    // automatically applied to specific BOQ lines.
    affected_boq_item_ids?: ID[];
    title: string;
    description: string;
    requested_amount: number;
    status: "pending_customer_approval" | "approved" | "rejected" | "cancelled";
    requested_by?: string;
    requested_at: string;
    decided_by?: string;
    decided_at?: string;
    decision_note?: string;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface WorkOrderCostLine {
    id: ID;
    work_order_id: ID;
    type: WorkOrderCostType;
    description: string;
    amount: number;
    date: string;
    source_kind?: "po" | "grn" | "dispatch" | "contractor_payment" | "manual" | "bill" | "settlement" | "variation";
    source_id?: ID;
    // FIX-CONTRACTOR-BATCH1 / F.3: `vendor_id` / `vendor_name` is the
    // canonical field for ANY counterparty on a cost line — vendor (material
    // PO) OR contractor (RA bill / settlement / payment). Runtime code in
    // contractors.ts (createContractorRABill line ~756, settleContractor
    // line ~573) and the ContractorDetailModule filter
    // (`cl.vendor_id === c.id`, line 70) both read vendor_id. The legacy
    // `contractor_id` / `contractor_name` pair is kept as an optional alias
    // for backward compatibility with old seed data and any external
    // integration that still writes contractor_id — but new code MUST write
    // vendor_id (and SHOULD also mirror to contractor_id when the
    // counterparty is a contractor, for defense-in-depth).
    vendor_id?: ID;
    vendor_name?: string;
    /** @deprecated Use `vendor_id` instead — kept for backward compatibility with old seed data. */
    contractor_id?: ID;
    /** @deprecated Use `vendor_name` instead — kept for backward compatibility with old seed data. */
    contractor_name?: string;
    created_at: string;
}
// FIX-CONTRACTOR-BATCH2 / F.9: "open" is reserved for future use — bids
// are currently created with status="submitted" by addContractorBid. The
// "withdrawn" status IS reachable from the UI via the EditContractorBidDialog
// (FIX-CONTRACTOR-BATCH1 / F.5). "open" is kept so the type reflects the
// intended lifecycle (open → submitted → selected | rejected | withdrawn).
export type ContractorBidStatus = "open" | "submitted" | "selected" | "rejected" | "withdrawn";
export interface ContractorBid {
    id: ID;
    bid_no: string;
    accepted_scope_id?: ID;
    work_order_id?: ID;
    readonly customer_name?: string;
    work_order_no: string;
    site_id?: ID;
    contractor_id: ID;
    contractor_name: string;
    scope: string;
    quote_amount?: number;
    rate_basis?: {
        rate: number;
        unit_id?: string;
        estimated_qty?: number;
    };
    estimated_days?: number;
    with_material?: boolean;
    reliability_score?: number;
    on_time_pct?: number;
    past_jobs_count?: number;
    rating?: number;
    evaluation_notes?: string;
    status: ContractorBidStatus;
    submitted_at: string;
    selected_at?: string;
    rejected_at?: string;
    thread_id?: ID;
    created_at: string;
// --- 10. Contractor domain ---
    updated_at: string;
}
// FIX-CONTRACTOR-BATCH2 / F.10: "mutual_termination", "partial_completion"
// and "final_close" are reserved for future use — the DetailPanel
// settlement dialog currently hardcodes type="abandonment" and the store
// action settles with that default. They remain in the union so the type
// reflects the intended settlement lifecycle. setContractorSettlementType
// can be wired up later to expose the type selector in the UI.
export type SettlementType = "abandonment" | "mutual_termination" | "partial_completion" | "final_close";
export interface ContractorSettlement {
    id: ID;
    settlement_no: string;
    work_order_id: ID;
    readonly customer_name?: string;
    work_order_no: string;
    site_id?: ID;
    contractor_id: ID;
    contractor_name: string;
    type: SettlementType;
    completed_pct: number;
    contract_value: number;
    advances_paid: number;
    materials_issued_value: number;
    recoveries: number;
    payable_amount: number;
    reason: string;
    settled_at: string;
    replacement_work_order_id?: ID;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export type DrawingKind = "2D" | "3D" | "sketch" | "render" | "blueprint";
export type DrawingStatus = "draft" | "in_review" | "approved" | "superseded";
export interface Drawing {
    id: ID;
    drawing_no: string;
    title: string;
    kind: DrawingKind;
    site_id?: ID;
    site_name?: string;
    area_id?: ID;
    area_name?: string;
    work_order_id?: ID;
    work_order_no?: string;
    primary_file_attachment_id?: ID;
    version: number;
    parent_drawing_id?: ID;
    status: DrawingStatus;
    uploaded_by?: string;
    uploaded_at: string;
    approved_by?: string;
    approved_at?: string;
    notes?: string;
    derived_boq_item_ids?: ID[];
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface DailyExecutionLog {
    id: ID;
    log_no: string;
    work_order_id: ID;
    work_order_no: string;
    site_id?: ID;
    site_name?: string;
    date: string;
    progress_pct: number;
    progress_delta?: number;
    materials_used: Array<{
        description: string;
        article_id?: ID;
        qty?: number;
        unit?: string;
        amount?: number;
    }>;
    extra_work_notes?: string;
    extra_work_amount?: number;
    extra_work_variation_id?: ID;
    progress_verification_status?: "not_required" | "pending_review" | "verified" | "returned";
    progress_verified_by?: string;
    progress_verified_at?: string;
    progress_review_note?: string;
    photo_reminder_acknowledged?: boolean;
    completion_notes?: string;
    site_condition?: string;
    photo_attachment_ids: ID[];
    filed_by?: string;
    filed_by_staff_id?: ID;
    contractor_material_confirmed?: boolean;
    contractor_confirmation_attachment_id?: ID;
    thread_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface WorkOrderPnL {
    work_order_id: ID;
    readonly customer_name?: string;
    work_order_no: string;
    site_id: ID;
    contracted_revenue: number;
    invoiced: number;
    collected: number;
    receivable: number;
    material_cost: number;
    labour_cost: number;
    contractor_cost: number;
    overhead_cost: number;
    total_cost: number;
    gross_margin: number;
    margin_pct: number;
}
export type ThreadKind = "quotation" | "workOrder" | "task" | "followup" | "visit" | "payment" | "invoice" | "vendor_bill" | "inventory" | "po" | "grn" | "dispatch" | "blocked" | "approval" | "commission" | "bid" | "settlement" | "site" | "drawing" | "execution_log" | "workRequired" | "generic";
export interface ThreadMessageAttachment {
    id: ID;
    file_asset_id?: ID;
    entity_file_attachment_id?: ID;
    name: string;
    kind: "image" | "pdf" | "video" | "file";
    mime?: string;
    size?: number;
    thumbnail_url?: string;
    preview_url?: string;
    caption?: string;
}
export interface ThreadMessageMention {
    entity_type: string;
    entity_id: ID;
    label: string;
    start: number;
    end: number;
}
export interface ThreadMessage {
    id: ID;
    thread_id: ID;
    parent_message_id?: ID;
    related_thread_id?: ID;
    author_id?: ID;
    author_name: string;
    author_role?: string;
    body: string;
    kind: "comment" | "system" | "proof" | "decision" | "alert";
    proof_attachment_id?: ID;
    /** Links this message to the AuditLogEntry that generated it (for system/alert messages). */
    related_audit_id?: ID;
    /** General attachments (images, PDFs, videos) on this message. */
    attachments?: ThreadMessageAttachment[];
    /** Mentions parsed from the body (entity references). */
    mentions?: ThreadMessageMention[];
    created_at: string;
}
export interface Thread {
    id: ID;
    kind: ThreadKind;
    title: string;
    record_id: ID;
    record_type: ThreadKind;
    messages: ThreadMessage[];
    participants: string[];
    open: boolean;
    created_at: string;
    updated_at: string;
}
export type AttendanceMode = "office" | "field_visit" | "manual_adjustment" | "auto_absent";
export type GpsVerificationStatus = "verified" | "outside_geofence" | "low_accuracy" | "manual_review";
export interface AttendancePolicy {
    office_name: string;
    office_latitude?: number;
    office_longitude?: number;
    geofence_radius_m: number;
    visit_geofence_radius_m: number;
    max_gps_accuracy_m: number;
    standard_check_in_time: string;
    minimum_half_day_minutes: number;
    auto_present_from_gps: boolean;
    auto_geofence_enabled: boolean;
    auto_check_in_enabled: boolean;
    auto_check_out_enabled: boolean;
    auto_entry_dwell_seconds: number;
    auto_exit_dwell_seconds: number;
    auto_exit_buffer_m: number;
// --- 13. Thread domain (Universal Conversation Graph) ---
    auto_absent_enabled: boolean;
    auto_absent_after: string;
    late_grace_minutes: number;
    absent_deduction_enabled: boolean;
    absent_deduction_days: number;
}
export interface AttendanceRecord {
    id: ID;
    staff_id: ID;
    staff_name: string;
    date: string;
    attendance_mode: AttendanceMode;
    visit_id?: ID;
    // FIX-ANALYSIS-003 E.4.2: Work Order link for job-costing labour-hours.
    // Previously attendance could only reach a work order via visit.work_order_id,
    // which missed staff who did execution-log work without a visit.
    work_order_id?: ID;
    check_in?: string;
    check_out?: string;
    check_in_latitude?: number;
    check_in_longitude?: number;
    check_in_accuracy_m?: number;
    check_in_distance_m?: number;
    check_in_verification?: GpsVerificationStatus;
    check_in_source?: GeoActionSource;
    check_out_latitude?: number;
    check_out_longitude?: number;
    check_out_accuracy_m?: number;
    check_out_distance_m?: number;
    check_out_verification?: GpsVerificationStatus;
    check_out_source?: GeoActionSource;
    late_minutes?: number;
    late?: boolean;
    status: "present" | "absent" | "half_day" | "leave" | "holiday";
    work_minutes?: number;
    location?: string;
    auto_generated?: boolean;
    review_required?: boolean;
    review_note?: string;
    created_at: string;
// --- 14. Attendance domain ---
    updated_at?: string;
}
export interface StaffLocationPingRecord {
    id: ID;
    staff_id: ID;
    latitude: number;
    longitude: number;
    accuracy_m?: number;
    speed?: number;
    battery?: number;
    captured_at: string;
    source: "device" | "manual" | "pwa" | "native";
}
export interface StaffRolePermission {
    id: ID;
    role_key: StaffRoleKey;
    module_key: string;
    module_label: string;
    can_view: boolean;
    can_create: boolean;
    can_update: boolean;
    can_approve: boolean;
    can_delete: boolean;
    updated_at: string;
}
export interface StaffAuthUser {
    id: ID;
    staff_id: ID;
    email: string;
    role_key: StaffRoleKey;
    is_active: boolean;
    force_password_change?: boolean;
    last_login_at?: string;
    created_at: string;
    updated_at: string;
}
export interface LeaveRequest {
    id: ID;
    staff_id: ID;
    start_date: string;
    end_date: string;
    leave_type: "paid" | "unpaid" | "sick" | "casual";
    status: "requested" | "approved" | "rejected" | "cancelled";
    reason?: string;
    approved_by_staff_id?: ID;
}
export interface PayrollPeriod {
    id: ID;
    month: number;
    year: number;
    status: "draft" | "generated" | "approved" | "paid" | "cancelled";
    generated_at: string;
    approved_at?: string;
    approved_by_staff_id?: ID;
    paid_at?: string;
    paid_by_staff_id?: ID;
    cancelled_at?: string;
    cancellation_reason?: string;
}
export interface PayrollLine {
    id: ID;
    payroll_period_id: ID;
    staff_id: ID;
    base_salary: number;
    present_days: number;
    absent_days: number;
    paid_leave_days: number;
    overtime_amount: number;
    advance_deduction: number;
    other_deductions: number;
    gross_pay: number;
    net_payable: number;
    payment_status: "pending" | "approved" | "paid" | "held";
    deduction_explanation?: string;
    calendar_reason_map?: Array<{ date: string; reason: string; amount: number }>;
}
export interface SalaryAdjustment {
    id: ID;
    staff_id: ID;
    payroll_period_id?: ID;
    adjustment_date: string;
    type: "overtime" | "advance" | "deduction" | "bonus" | "hold";
    amount: number;
    reason: string;
    status: "draft" | "approved" | "rejected";
    approved_by_staff_id?: ID;
    // FIX-ANALYSIS-003 E.4.4: Work Order link for job-specific bonuses/deductions
    // (e.g., "completion bonus for finishing WO-123 ahead of schedule").
    work_order_id?: ID;
}
export interface StaffDocument {
    id: ID;
    staff_id: ID;
    document_type: "photo" | "aadhaar" | "pan" | "id_proof" | "address_proof" | "bank" | "other";
    document_no?: string;
    file_asset_id?: ID;
    status: "pending" | "verified" | "expired" | "rejected";
    created_at: string;
}
export type ApprovalTrigger = "po_amount" | "quotation_discount" | "contractor_payment" | "vendor_bill" | "expense";
export interface ApprovalPolicy {
    id: ID;
    name: string;
    trigger: ApprovalTrigger;
    threshold: number;
    operator: ">" | ">=" | "=";
    approver_role: string;
    approver_id?: ID;
    approver_name?: string;
    auto_escalate_hours?: number;
    escalate_to?: string;
    enabled: boolean;
    description?: string;
    created_at: string;
    updated_at: string;
}
export type AutomationTrigger = "quotation_created" | "quotation_accepted" | "quotation_sent" | "po_created" | "po_approved" | "grn_filed" | "grn_mismatch" | "visit_checkout" | "payment_promise" | "payment_overdue" | "obstacle_created" | "job_milestone" | "dispatch_issued" | "approval_decided";
export type AutomationActionType = "create_task" | "create_approval" | "create_obstacle" | "create_payment" | "create_job" | "create_boq" | "create_commission" | "send_alert" | "update_status";
export interface AutomationAction {
    type: AutomationActionType;
    label: string;
    payload?: string;
}
export interface RecurringTaskDefinition {
    id: ID;
    title: string;
    frequency: "daily" | "weekly" | "monthly";
    assignee_id?: ID;
    assignee_name?: string;
    scope: TaskScope;
    priority: Priority;
    next_run: string;
    last_run?: string;
    runs_count: number;
    enabled: boolean;
    // FIX-ANALYSIS-003 E.4.6: Business context links so generated tasks inherit
    // customer/site/workOrder context instead of being orphaned.
    customer_id?: ID;
    site_id?: ID;
    work_order_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface AutomationRule {
    id: ID;
    name: string;
    trigger: AutomationTrigger;
    trigger_label: string;
    actions: AutomationAction[];
    enabled: boolean;
    fires_count: number;
    last_fired_at?: string;
    /** Optional condition (JSON path → expected value) evaluated against the
     *  fireAutomation `context` payload. Empty = always fires. Example:
     *  `{ "context.amount": 50000 }` matches when context.amount === 50000. */
    condition?: Record<string, unknown>;
    description?: string;
    created_at: string;
    updated_at: string;
}
export interface AuditLogEntry {
    id: ID;
    timestamp: string;
    actor: string;
    actor_role?: string;
    action: string;
    entity_type: string;
    entity_id?: ID;
    entity_label?: string;
    kind: "create" | "update" | "approve" | "send" | "receive" | "comment" | "decision" | "alert" | "system" | "delete";
    thread_id?: ID;
    source_module?: string;
    reason?: string;
    // FIX-ANALYSIS-003 E.4.7: Denormalized customer_id for efficient querying.
    // Previously finding all audit events for a customer required a full table
    // scan with polymorphic resolution per row. Populated at log time by
    // resolveCustomerIdFromLinks.
    customer_id?: ID;
    before?: unknown;
    after?: unknown;
    changes?: Array<{ id?: ID; field_path?: string; field?: string; before?: unknown; after?: unknown }>;
}
export type CommChannel = "whatsapp" | "pinterest" | "catalogue" | "material" | "reference" | "email";
export interface CommSend {
    id: ID;
    channel: CommChannel;
    customer_id: ID;
    readonly customer_name?: string;
    staff_name: string;
    subject: string;
    body?: string;
    attachment_ids?: ID[];
    status: "prepared" | "sent" | "delivered" | "read" | "failed";
    sent_at: string;
    thread_id?: ID;
    /** Optional follow-up this communication is linked to (e.g. a payment chase
     *  call logged against a specific follow-up). */
    followup_id?: ID;
    /** Optional task this communication is linked to. */
    task_id?: ID;
    /** Optional work order this communication is about. */
    work_order_id?: ID;
    /** Optional quotation this communication is about. */
    quotation_id?: ID;
    /** When set, the send action also creates a new follow-up with the given
     *  due date and purpose — closing the operations loop. */
    schedules_next_followup?: { due_date: string; purpose: string };
}
export interface CommercialTerm {
    id: ID;
    label: string;
    text: string;
    enabled: boolean;
    category: "warranty" | "delivery" | "payment" | "scope" | "other";
}
export interface PaymentTermTemplate {
    id: ID;
    name: string;
    terms: {
        id: ID;
        label: string;
        percentage: number;
        due_event: string;
    }[];
    is_default?: boolean;
}
export interface TaxConfig {
    id: ID;
    name: string;
    rate: number;
    type: "gst" | "cgst" | "sgst" | "igst";
    enabled: boolean;
}
export interface ValidityConfig {
    id: ID;
    name: string;
    default_days: number;
    expiry_action: "alert" | "auto_revoke" | "extend";
    enabled: boolean;
}
export interface MasterUnit {
    id: ID;
    name: string;
    symbol: string;
    family?: "area" | "length" | "count" | "weight" | "volume" | "package" | "other";
}
export interface WorkCategory {
    id: ID;
    name: string;
    description?: string;
    sort_order?: number;
    created_at?: string;
    updated_at?: string;
}
export interface WorkSubcategory {
    id: ID;
    category_id: ID;
    name: string;
    unit_id?: ID;
    material_rate?: number;
    labour_rate?: number;
    notes?: string;
    work_required_article_ids?: ID[];
    created_at?: string;
    updated_at?: string;
}
export interface Article {
    id: ID;
    name: string;
    normalized_name?: string;
    category_id?: ID;
    unit_id?: ID;
    default_unit_id?: ID;
    base_rate?: number;
    variant_ids?: ID[];
    created_at?: string;
    updated_at?: string;
}
export interface WorkRequiredArticle {
    id: ID;
    work_required_id: ID;
    article_id: ID;
    unit_id: ID;
    reference_rate: number;
    variation_note?: string;
    product_note?: string;
    created_at?: string;
    updated_at?: string;
}
export interface ArticleVariant {
    id: ID;
    article_id: ID;
    work_required_article_id?: ID;
    name: string;
    sku?: string;
    unit_id?: ID;
    brand?: string;
    grade?: string;
    pack_size?: string;
    thickness?: string;
    size?: string;
    finish?: string;
    color?: string;
    series?: string;
    enabled?: boolean;
    created_at?: string;
    updated_at?: string;
}
export interface Vendor {
    id: ID;
    name: string;
    phone?: string;
    city?: string;
    locality?: string;
    address?: string;
    category?: string;
    outstanding?: number;
    reliability_score?: number;
    on_time_pct?: number;
    latitude?: number;
    longitude?: number;
    business_card_attachment_id?: ID;
    shop_attachment_id?: ID;
    reliability_rating?: "good" | "very_good" | "average" | "bad";
    delivery_time_rating?: "good" | "very_good" | "average" | "bad";
    return_policy?: "available" | "not_available";
    notes?: string;
    source_partner_id?: ID;
    source_partner_name?: string;
}
export interface Contractor {
    id: ID;
    name: string;
    phone?: string;
    city?: string;
    locality?: string;
    address?: string;
    trade?: string;
    rating?: number;
    active_jobs?: number;
    outstanding?: number;
    reliability_score?: number;
    on_time_pct?: number;
    past_jobs_count?: number;
    specializations?: string[];
    latitude?: number;
    longitude?: number;
    photo_attachment_id?: ID;
    business_card_attachment_id?: ID;
    reliability_rating?: "good" | "average" | "poor";
    politeness_rating?: "very" | "moderate" | "less";
    worker_count_range?: "1-3" | "4-8" | "9-15" | "16-40";
    deadline_commitment?: "strict" | "usual" | "lazy" | "very_lazy";
    source_partner_id?: ID;
    source_partner_name?: string;
    work_capabilities?: Array<{
        subcategory_id: ID;
        subcategory_name?: string;
        labour_rate?: number;
        with_material_rate?: number;
    }>;
    // FIX-CONTRACTOR-BATCH2 / F.6: Business / tax / banking fields, previously
    // declared-but-never-populated dead fields. Now captured in the
    // EntityFormDialog contractor branch and persisted on the master record.
    business_gst?: string;
    pan?: string;
    bank_account?: string;
    ifsc?: string;
    /** Free-form work-category tags (resolved from the master.workCategories
     * list at create/edit time). Mirrors the customer interest_category_ids
     * pattern but kept as names for human readability on the contractor card. */
    categories?: string[];
    // FIX-CONTRACTOR-BATCH2 / F.13: Soft-delete / archive support. A
    // contractor can be deactivated (status="inactive") or reactivated
    // (status="active") from the ContractorDetailModule. Inactive contractors
    // remain in the master for historical lookup but are filtered out of
    // bid-invitation and direct-award dropdowns.
    status?: "active" | "inactive" | "blacklisted";
    // FIX-CONTRACTOR-BATCH2 / F.16: Timestamp of the last
    // recomputeContractorPerformance call. Persisted so the
    // ContractorPerformanceModule can show "last recomputed" alongside the
    // score.
    performance_recomputed_at?: string;
}
export type StaffRoleKey = "OWNER" | "OPERATIONS_MANAGER" | "FIELD_STAFF" | "SALES_TELECALLER" | "PROCUREMENT_STAFF" | "FINANCE" | "ACCOUNTS_ADMIN";
export type StaffSalaryType = "monthly" | "daily_wage" | "contract";
export interface Staff {
    id: ID;
    code?: string;
    name: string;
    phone?: string;
    email?: string;
    role: string;
    role_key?: StaffRoleKey;
    department?: string;
    designation?: string;
    reporting_manager_id?: ID;
    city?: string;
    address?: string;
    emergency_contact?: string;
    joining_date?: string;
    exit_date?: string;
    status?: EntityStatus | "blacklisted" | "exited";
    salary_type?: StaffSalaryType;
    monthly_salary?: number;
    daily_wage?: number;
    bank_details?: Record<string, unknown>;
    gps_tracking_enabled?: boolean;
    login_enabled?: boolean;
    login_email?: string;
    temporary_password?: string;
    force_password_change?: boolean;
    document_ids?: ID[];
    attendance_policy: AttendancePolicy;
}
export interface SourcePartner {
    id: ID;
    name: string;
    type?: string;
    phone?: string;
    email?: string;
    commission_pct?: number;
}
export interface CommissionRule {
    id: ID;
    source_partner_id: ID;
    source_partner_name: string;
    rate_pct: number;
    applies_to: "all" | "category" | "workOrder";
    category_id?: ID;
}
export type VendorRateSourceType = "PO" | "VENDOR_BILL" | "MANUAL" | "SEED";
export type VendorRateHistoryStatus = "active" | "superseded" | "rejected";
export interface VendorRate {
    id: ID;
    vendor_id: ID;
    article_id: ID;
    article_name: string;
    work_required_article_id?: ID;
    variant_id?: ID;
    rate: number;
    unit_id?: string;
    delivery_days?: number;
    moq?: number;
    gst_inclusive?: boolean;
    preferred?: boolean;
    brand?: string;
    grade?: string;
    notes?: string;
    valid_from?: string;
    updated_at?: string;
    current_source_type?: VendorRateSourceType;
    current_source_id?: ID;
    current_source_no?: string;
}
export interface VendorRateHistory {
    id: ID;
    vendor_rate_id?: ID;
    vendor_id: ID;
    article_id: ID;
    article_name: string;
    work_required_article_id: ID;
    variant_id?: ID;
    unit_id: ID;
    old_rate?: number;
    new_rate: number;
    source_type: VendorRateSourceType;
    source_id?: ID;
    source_no?: string;
    status: VendorRateHistoryStatus;
    effective_from: string;
    effective_to?: string;
    changed_by?: string;
    notes?: string;
    created_at: string;
}
export interface ContractorRate {
    id: ID;
    contractor_id: ID;
    trade: string;
    rate: number;
    unit_id?: string;
    // FIX-CONTRACTOR-BATCH2 / F.12: Optional subcategory + labour/material
    // split — populated by the new "Add Contractor Rate" dialog in
    // MastersSalesOpsModule. The legacy `trade`/`rate` pair is kept for
    // backward compatibility with seed rows that don't have a subcategory.
    work_subcategory_id?: ID;
    work_subcategory_name?: string;
    labour_rate?: number;
    with_material_rate?: number;
}
export type FileAssetKind = "document" | "media" | "catalogue" | "drawing" | "site_proof" | "other";
export type FileAssetStorageMode = "managed" | "external_reference";
export type FileAssetSyncStatus = "uploaded" | "uploading" | "failed";
export type StorageAccountStatus = "connected" | "reconnect_required" | "paused" | "disabled";
export interface StorageAccount {
    id: ID;
    label: string;
    email?: string;
    oauth_connection_id?: string;
    status: StorageAccountStatus;
    write_enabled: boolean;
    priority_order: number;
    quota_used_bytes?: number;
    quota_limit_bytes?: number;
    switch_threshold_percent: number;
    root_folder_id?: string;
    root_folder_name?: string;
    web_view_link?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}
export type StorageFolderPurpose = "catalogue" | "reference_media" | "customer_document" | "site_proof" | "measurement" | "quotation" | "job_document" | "purchase_order" | "grn" | "vendor_bill" | "invoice" | "vendor_document" | "contractor_document" | "general";
export interface StorageFolderTemplate {
    id: ID;
    purpose: StorageFolderPurpose;
    label: string;
    path_template: string;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
}
export interface StorageFolderInstance {
    id: ID;
    storage_account_id: ID;
    template_id: ID;
    google_folder_id?: string;
    folder_path: string;
    web_view_link?: string;
    // FIX-ANALYSIS-001 #9: Typed customer/site links — previously finding a
    // customer's folders required brittle string-matching on folder_path.
    // These optional fields are populated by resolveStorageFolder so folder
    // lookups can use a typed index instead of path parsing.
    customer_id?: ID;
    site_id?: ID;
    work_order_id?: ID;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
}
export interface FileAsset {
    id: ID;
    storage_account_id?: ID;
    storage_folder_instance_id?: ID;
    google_file_id?: string;
    file_name: string;
    mime_type?: string;
    kind: FileAssetKind;
    web_view_link: string;
    thumbnail_url?: string;
    file_size_bytes?: number;
    storage_provider: "google_drive" | "local";
    storage_mode: FileAssetStorageMode;
    sync_status: FileAssetSyncStatus;
    tags?: string[];
    status: "active" | "archived";
    // FIX-ANALYSIS-003 E.4.9: Typed customer/site links for file lookup.
    // Previously finding all files for a customer required walking
    // entityFileAttachments (which only includes attached files) or
    // string-matching folder_path. These typed fields enable direct queries.
    customer_id?: ID;
    site_id?: ID;
    created_at: string;
    updated_at: string;
}
export interface StorageFolderInstanceDraft {
    id: ID;
    storage_account_id: ID;
    template_id: ID;
    google_folder_id?: string;
    folder_path: string;
    web_view_link?: string;
}
export type FileAssetCreateInput = Partial<FileAsset> & {
    file_name: string;
    web_view_link: string;
// --- 15. File/Media domain ---
    storage_folder_instance?: StorageFolderInstanceDraft;
};
export interface CatalogueAsset {
    id: ID;
    title: string;
    drive_asset_id?: ID;
    catalog_url?: string;
    thumbnail_url?: string;
    catalog_type?: "product_catalog" | "technical_sheet" | "price_list" | "installation_guide" | "other";
    sendable_to_customer?: boolean;
    tags?: string[];
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
}
export interface CatalogueArticleVendorLink {
    id: ID;
    catalogue_id: ID;
    article_id: ID;
    vendor_id?: ID;
    variant_id?: ID;
    notes?: string;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
}
export interface PinterestBoard {
    id: ID;
    title: string;
    board_url: string;
    thumbnail_url?: string;
    category_id?: ID;
    subcategory_id?: ID;
    article_id?: ID;
    variant_id?: ID;
    tags?: string[];
    sendable_to_customer?: boolean;
    status: "active" | "archived";
    sort_order?: number;
    created_at: string;
    updated_at: string;
}
export interface ReferenceMediaAsset {
    id: ID;
    title: string;
    drive_asset_id?: ID;
    media_url?: string;
    thumbnail_url?: string;
    category_id?: ID;
    subcategory_id?: ID;
    article_id?: ID;
    variant_id?: ID;
    tags?: string[];
    sendable_to_customer?: boolean;
    status: "active" | "archived";
    sort_order?: number;
    created_at: string;
    updated_at: string;
}
export type FileAttachmentEntityType = "customer" | "site" | "room" | "workRequired" | "quotation" | "quotation_item" | "workOrder" | "boq" | "boq_item" | "purchase_order" | "grn" | "vendor_bill" | "dispatch" | "inventory" | "drawing" | "execution_log" | "visit" | "task" | "followup" | "payment" | "invoice" | "vendor" | "vendor_rate" | "contractor" | "contractor_bid" | "contractor_settlement" | "commission" | "blocked" | "thread_message" | "communication" | "general";
export type FileAttachmentRole = "document" | "photo" | "video" | "drawing" | "catalogue" | "invoice" | "proof" | "approval" | "measurement" | "delivery" | "bill" | "other";
export interface EntityFileAttachment {
    id: ID;
    file_asset_id: ID;
    entity_type: FileAttachmentEntityType;
    entity_id: ID;
    entity_label?: string;
    role: FileAttachmentRole;
    caption?: string;
    customer_shareable?: boolean;
    visibility: "internal" | "customer" | "vendor" | "contractor";
    created_by?: string;
    created_at: string;
    updated_at: string;
}
export type ReferenceResourceType = "catalogue" | "pinterest_board" | "reference_media";
export interface EntityReferenceAssignment {
    id: ID;
    resource_type: ReferenceResourceType;
    resource_id: ID;
    entity_type: FileAttachmentEntityType;
    entity_id: ID;
    entity_label?: string;
    customer_id?: ID;
    work_required_id?: ID;
    quotation_id?: ID;
    work_order_id?: ID;
    site_id?: ID;
    area_id?: ID;
    article_id?: ID;
    variant_id?: ID;
    vendor_id?: ID;
    purpose: "design_reference" | "material_option" | "catalogue" | "approval" | "execution_reference" | "other";
    note?: string;
    status: "active" | "archived";
    created_by?: string;
    created_at: string;
    updated_at: string;
}
export interface Master {
    catalog_version?: string;
    units: MasterUnit[];
    workCategories: WorkCategory[];
    workSubcategories: WorkSubcategory[];
    articles: Article[];
    articleVariants: ArticleVariant[];
    subcategoryArticleMap: WorkRequiredArticle[];
    workOptionGroups: unknown[];
    workOptionValues: unknown[];
    vendors: Vendor[];
    contractors: Contractor[];
    staff: Staff[];
    sourcePartners: SourcePartner[];
    commissionRules: CommissionRule[];
    vendorRates: VendorRate[];
    vendorRateHistories: VendorRateHistory[];
    contractorRates: ContractorRate[];
    customerRateSuggestions: unknown[];
    storageAccounts: StorageAccount[];
    storageFolderTemplates: StorageFolderTemplate[];
    storageFolderInstances: StorageFolderInstance[];
    fileAssets: FileAsset[];
    catalogues: CatalogueAsset[];
    catalogueArticleVendorLinks: CatalogueArticleVendorLink[];
    pinterestBoards: PinterestBoard[];
    referenceMedia: ReferenceMediaAsset[];
}
export interface RDashDatabase {
    customers: Customer[];
// --- 16. Master data ---
    sites: Site[];
    areas: Area[];
    workRequired: WorkRequired[];
    measurementRevisions: MeasurementRevision[];
    quotations: Quotation[];
    acceptedScopes: AcceptedScope[];
    workOrders: WorkOrder[];
    boqs: WorkOrderBOQ[];
    vendorRfqs: VendorRFQ[];
    vendorBids: VendorBid[];
    purchaseOrders: PurchaseOrder[];
    grns: GRN[];
    inventory: InventoryItem[];
    stockMovements: StockMovement[];
    dispatches: SiteDispatch[];
    vendorBills: VendorBill[];
    vendorPayments: VendorPayment[];
    contractorBills: ContractorBill[];
    contractorPayments: ContractorPayment[];
    commissions: Commission[];
    workOrderCostLines: WorkOrderCostLine[];
    contractorBids: ContractorBid[];
    contractorSettlements: ContractorSettlement[];
    drawings: Drawing[];
    executionLogs: DailyExecutionLog[];
    variationRequests: VariationRequest[];
    visits: Visit[];
    tasks: Task[];
// --- 17. Root database ---
    followups: Followup[];
    actions: ApprovalAction[];
    payments: Payment[];
    invoices: CustomerInvoice[];
    customerReceipts: CustomerReceipt[];
    blocked: BlockedItem[];
    risks: RiskItem[];
    threads: Thread[];
    attendance: AttendanceRecord[];
    staffLocationPings?: StaffLocationPingRecord[];
    staffRolePermissions?: StaffRolePermission[];
    staffAuthUsers?: StaffAuthUser[];
    leaveRequests?: LeaveRequest[];
    payrollPeriods?: PayrollPeriod[];
    payrollLines?: PayrollLine[];
    salaryAdjustments?: SalaryAdjustment[];
    staffDocuments?: StaffDocument[];
    approvalPolicies: ApprovalPolicy[];
    automationRules: AutomationRule[];
    recurringTasks: RecurringTaskDefinition[];
    auditLog: AuditLogEntry[];
    commSends: CommSend[];
    entityFileAttachments: EntityFileAttachment[];
    entityReferenceAssignments: EntityReferenceAssignment[];
    commercialTerms: CommercialTerm[];
    paymentTermTemplates: PaymentTermTemplate[];
    taxConfigs: TaxConfig[];
    validityConfigs: ValidityConfig[];
    master: Master;
    _workspace_mode: string;
    _data_source: string;
}

// ============================================================================
// 18. Integrity domain — types used by the integrity layer
//     (src/lib/rdash/integrity/*). Exported as individual interfaces (not a
//     namespace) per the ESLint prefer-module rule. Callers import these
//     directly: `import type { IntegrityReport } from "./types"`.
// ============================================================================

/** Declarative description of one foreign-key reference. */
export interface ForeignKeyRule {
    collection: string;
    field: string;
    targetCollection: string;
    onDelete: "cascade" | "restrict" | "nullify" | "ignore";
    nullable: boolean;
    label: string;
    isArray?: boolean;
    note?: string;
}

/** One integrity problem detected by the checker. */
export interface IntegrityIssue {
    id: string;
    severity: "critical" | "warning" | "info";
    collection: string;
    recordId: string;
    field: string;
    targetCollection: string;
    targetId: string;
    message: string;
    rule: ForeignKeyRule;
    autoFixable: boolean;
}

/** A duplicate-ID conflict within a single collection. */
export interface DuplicateIdConflict {
    collection: string;
    ids: string[];
}

/** Snapshot of workspace integrity at a point in time. */
export interface IntegrityReport {
    generatedAt: string;
    totalRecords: number;
    totalReferences: number;
    issues: IntegrityIssue[];
    bySeverity: { critical: number; warning: number; info: number };
    byCollection: Record<string, number>;
    healthScore: number;
    duplicateIds: DuplicateIdConflict[];
    /** Diagnostic: elapsed milliseconds (only set when >50ms). */
    _elapsedMs?: number;
}

/** The result of a cascade-delete operation. */
export interface CascadeResult {
    success: boolean;
    deleted: Array<{ collection: string; id: string; label?: string }>;
    blocked: Array<{ collection: string; id: string; reason: string; rule: ForeignKeyRule }>;
    softDeleted: Array<{ collection: string; id: string }>;
    nullified: Array<{ collection: string; id: string; field: string }>;
}

/** The result of an integrity-repair operation. */
export interface RepairResult {
    repaired: number;
    details: Array<{ collection: string; id: string; action: string }>;
    skipped: number;
    skippedDetails: Array<{ collection: string; id: string; reason: string }>;
}
