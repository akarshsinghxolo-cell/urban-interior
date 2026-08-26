// ============================================================================
// Foreign-Key Registry — declarative single-source-of-truth for every
// cross-collection reference in the Urban Castle data model.
// ============================================================================
// Each `ForeignKeyRule` describes one FK:
//   - which collection owns the field (the "child")
//   - which field holds the reference
//   - which collection the field points to (the "parent")
//   - the onDelete policy: cascade | restrict | nullify | ignore
//   - whether the field is allowed to be empty (nullable)
//
// The registry is consumed by:
//   - checker.ts (orphan detection)
//   - cascade.ts (cascade-delete planning)
//   - repair.ts (auto-fix of orphans)
//   - the Integrity UI (FK registry browser)
//
// POLICIES (chosen to mirror real-world construction accounting):
//   - cascade   : child is meaningless without parent → delete with parent
//   - restrict  : parent cannot be deleted while children exist (block)
//   - nullify   : child can survive losing the parent → set field to undefined
//   - ignore    : polymorphic reference (parent collection varies) — handled
//                 elsewhere (e.g. validateBusinessData's assertThreadParentExists)
//
// Polymorphic fields:
//   - tasks/followups/actions: `linked_record_id` + `linked_record_type` — the
//     parent collection depends on the type. Marked "ignore" here because the
//     generic checker cannot resolve the target collection. validateBusinessData
//     covers these via `assertCustomerRelation`.
//   - threads: `kind` + `record_id` — same pattern, covered by
//     `assertThreadParentExists`.
//   - recurringTasks: polymorphic `linked_entity` — ignored.
//   - entityFileAttachments / entityReferenceAssignments: polymorphic
//     `entity_type` + `entity_id` — ignored.
//
// IMPORTANT: this registry COMPLEMENTS validateBusinessData() — it does NOT
// replace it. The business-rules engine still runs on every commit. This
// registry drives the integrity dashboard, cascade-delete planner, and
// on-demand repair.
// ============================================================================

import type { ForeignKeyRule } from "../types";

export type { ForeignKeyRule };
export type OnDeletePolicy = ForeignKeyRule["onDelete"];

// ─────────────────────────────────────────────────────────────────────────
// Customer-domain FKs
// ─────────────────────────────────────────────────────────────────────────
const customerDomainFks: ForeignKeyRule[] = [
    { collection: "sites", field: "customer_id", targetCollection: "customers", onDelete: "cascade", nullable: false, label: "Site → Customer" },
    { collection: "areas", field: "site_id", targetCollection: "sites", onDelete: "cascade", nullable: false, label: "Area → Site" },
    // WorkRequired may start at Customer level; Site and Areas become required together when physical scope is attached.
    { collection: "workRequired", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Work Required → Customer" },
    { collection: "workRequired", field: "site_id", targetCollection: "sites", onDelete: "restrict", nullable: true, label: "Work Required → Site" },
    { collection: "workRequired", field: "area_ids", targetCollection: "areas", onDelete: "restrict", nullable: true, isArray: true, label: "Work Required → Areas" },
    // MeasurementRevision: site/area required; work_required_id and drawing_id optional
    { collection: "measurementRevisions", field: "site_id", targetCollection: "sites", onDelete: "restrict", nullable: false, label: "Measurement → Site" },
    { collection: "measurementRevisions", field: "area_id", targetCollection: "areas", onDelete: "restrict", nullable: false, label: "Measurement → Area" },
    { collection: "measurementRevisions", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Measurement → Work Required" },
    { collection: "measurementRevisions", field: "drawing_id", targetCollection: "drawings", onDelete: "nullify", nullable: true, label: "Measurement → Drawing" },
];

// ─────────────────────────────────────────────────────────────────────────
// Quotation & Work-Order FKs
// ─────────────────────────────────────────────────────────────────────────
const quotationDomainFks: ForeignKeyRule[] = [
    // Quotations: cannot delete a customer/site that has quotes (restrict)
    { collection: "quotations", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Quotation → Customer" },
    { collection: "quotations", field: "site_id", targetCollection: "sites", onDelete: "restrict", nullable: false, label: "Quotation → Site" },
    // AcceptedScope: customer/site/work_required/quotation all required
    { collection: "acceptedScopes", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Accepted Scope → Customer" },
    { collection: "acceptedScopes", field: "site_id", targetCollection: "sites", onDelete: "restrict", nullable: false, label: "Accepted Scope → Site" },
    { collection: "acceptedScopes", field: "work_required_id", targetCollection: "workRequired", onDelete: "restrict", nullable: false, label: "Accepted Scope → Work Required" },
    { collection: "acceptedScopes", field: "quotation_id", targetCollection: "quotations", onDelete: "restrict", nullable: false, label: "Accepted Scope → Quotation" },
    { collection: "acceptedScopes", field: "area_ids", targetCollection: "areas", onDelete: "restrict", nullable: false, isArray: true, label: "Accepted Scope → Areas" },
    { collection: "acceptedScopes", field: "measurement_revision_ids", targetCollection: "measurementRevisions", onDelete: "restrict", nullable: false, isArray: true, label: "Accepted Scope → Measurement Revisions" },
    { collection: "acceptedScopes", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Accepted Scope → Work Order" },
    // WorkOrders: all parent links required (restrict); arrays of quotation/scope/work_required ids
    { collection: "workOrders", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Work Order → Customer" },
    { collection: "workOrders", field: "site_id", targetCollection: "sites", onDelete: "restrict", nullable: false, label: "Work Order → Site" },
    { collection: "workOrders", field: "quotation_ids", targetCollection: "quotations", onDelete: "restrict", nullable: false, isArray: true, label: "Work Order → Quotations" },
    { collection: "workOrders", field: "accepted_scope_ids", targetCollection: "acceptedScopes", onDelete: "restrict", nullable: false, isArray: true, label: "Work Order → Accepted Scopes" },
    { collection: "workOrders", field: "work_required_ids", targetCollection: "workRequired", onDelete: "restrict", nullable: false, isArray: true, label: "Work Order → Work Required" },
    { collection: "workOrders", field: "area_ids", targetCollection: "areas", onDelete: "nullify", nullable: true, isArray: true, label: "Work Order → Areas" },
    // BOQ: meaningless without work order → cascade
    { collection: "boqs", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "BOQ → Work Order" },
];

// ─────────────────────────────────────────────────────────────────────────
// Procurement FKs (vendorRfqs, vendorBids, purchaseOrders, grns, dispatches)
// ─────────────────────────────────────────────────────────────────────────
const procurementFks: ForeignKeyRule[] = [
    { collection: "vendorRfqs", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "Vendor RFQ → Work Order" },
    { collection: "vendorRfqs", field: "boq_id", targetCollection: "boqs", onDelete: "restrict", nullable: false, label: "Vendor RFQ → BOQ" },
    { collection: "vendorRfqs", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Vendor RFQ → Site" },
    // VendorBid: meaningless without its RFQ → cascade
    { collection: "vendorBids", field: "rfq_id", targetCollection: "vendorRfqs", onDelete: "cascade", nullable: false, label: "Vendor Bid → RFQ" },
    { collection: "vendorBids", field: "vendor_id", targetCollection: "master.vendors", onDelete: "restrict", nullable: false, label: "Vendor Bid → Vendor" },
    // PurchaseOrder: vendor + work_order required (restrict); rfq optional
    { collection: "purchaseOrders", field: "rfq_id", targetCollection: "vendorRfqs", onDelete: "nullify", nullable: true, label: "Purchase Order → Vendor RFQ" },
    { collection: "purchaseOrders", field: "work_order_id", targetCollection: "workOrders", onDelete: "restrict", nullable: true, label: "Purchase Order → Work Order" },
    { collection: "purchaseOrders", field: "vendor_id", targetCollection: "master.vendors", onDelete: "restrict", nullable: false, label: "Purchase Order → Vendor" },
    { collection: "purchaseOrders", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Purchase Order → Site" },
    // GRN: meaningless without PO → cascade
    { collection: "grns", field: "po_id", targetCollection: "purchaseOrders", onDelete: "cascade", nullable: false, label: "GRN → Purchase Order" },
    { collection: "grns", field: "vendor_id", targetCollection: "master.vendors", onDelete: "restrict", nullable: false, label: "GRN → Vendor" },
    { collection: "grns", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "GRN → Work Order" },
    { collection: "grns", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "GRN → Site" },
    // Dispatch: work_order required at creation but historically nullable → nullify
    { collection: "dispatches", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Dispatch → Work Order" },
    { collection: "dispatches", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Dispatch → Site" },
];

// ─────────────────────────────────────────────────────────────────────────
// Inventory & Stock-Movement FKs
// ─────────────────────────────────────────────────────────────────────────
const inventoryFks: ForeignKeyRule[] = [
    { collection: "inventory", field: "grn_id", targetCollection: "grns", onDelete: "nullify", nullable: true, label: "Inventory → GRN" },
    { collection: "inventory", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Inventory → Work Order" },
    { collection: "inventory", field: "article_id", targetCollection: "master.articles", onDelete: "restrict", nullable: true, label: "Inventory → Article" },
    { collection: "inventory", field: "work_required_article_id", targetCollection: "master.subcategoryArticleMap", onDelete: "restrict", nullable: true, label: "Inventory → Scoped Material" },
    // StockMovement: meaningless without inventory → cascade
    { collection: "stockMovements", field: "inventory_id", targetCollection: "inventory", onDelete: "cascade", nullable: false, label: "Stock Movement → Inventory" },
    { collection: "stockMovements", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Stock Movement → Work Order" },
    { collection: "stockMovements", field: "po_id", targetCollection: "purchaseOrders", onDelete: "nullify", nullable: true, label: "Stock Movement → PO" },
    { collection: "stockMovements", field: "grn_id", targetCollection: "grns", onDelete: "nullify", nullable: true, label: "Stock Movement → GRN" },
    { collection: "stockMovements", field: "dispatch_id", targetCollection: "dispatches", onDelete: "nullify", nullable: true, label: "Stock Movement → Dispatch" },
];

// ─────────────────────────────────────────────────────────────────────────
// Vendor-bill & Vendor-payment FKs
// ─────────────────────────────────────────────────────────────────────────
const vendorBillFks: ForeignKeyRule[] = [
    { collection: "vendorBills", field: "po_id", targetCollection: "purchaseOrders", onDelete: "restrict", nullable: false, label: "Vendor Bill → PO" },
    { collection: "vendorBills", field: "grn_id", targetCollection: "grns", onDelete: "restrict", nullable: false, label: "Vendor Bill → GRN" },
    { collection: "vendorBills", field: "vendor_id", targetCollection: "master.vendors", onDelete: "restrict", nullable: false, label: "Vendor Bill → Vendor" },
    { collection: "vendorBills", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Vendor Bill → Work Order" },
    { collection: "vendorBills", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Vendor Bill → Site" },
    // VendorPayment: meaningless without its bill → cascade
    { collection: "vendorPayments", field: "vendor_bill_id", targetCollection: "vendorBills", onDelete: "cascade", nullable: false, label: "Vendor Payment → Vendor Bill" },
    { collection: "vendorPayments", field: "vendor_id", targetCollection: "master.vendors", onDelete: "restrict", nullable: false, label: "Vendor Payment → Vendor" },
    { collection: "vendorPayments", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Vendor Payment → Work Order" },
    { collection: "vendorPayments", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Vendor Payment → Site" },
];

// ─────────────────────────────────────────────────────────────────────────
// Contractor-domain FKs (bills, payments, bids, settlements, commissions)
// ─────────────────────────────────────────────────────────────────────────
const contractorFks: ForeignKeyRule[] = [
    // ContractorBill: work_order + contractor required → restrict
    { collection: "contractorBills", field: "work_order_id", targetCollection: "workOrders", onDelete: "restrict", nullable: false, label: "Contractor Bill → Work Order" },
    { collection: "contractorBills", field: "contractor_id", targetCollection: "master.contractors", onDelete: "restrict", nullable: false, label: "Contractor Bill → Contractor" },
    { collection: "contractorBills", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Contractor Bill → Customer" },
    { collection: "contractorBills", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Contractor Bill → Site" },
    { collection: "contractorBills", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Contractor Bill → Work Required" },
    // ContractorPayment: meaningless without its bill → cascade
    { collection: "contractorPayments", field: "contractor_bill_id", targetCollection: "contractorBills", onDelete: "cascade", nullable: false, label: "Contractor Payment → Contractor Bill" },
    { collection: "contractorPayments", field: "work_order_id", targetCollection: "workOrders", onDelete: "restrict", nullable: false, label: "Contractor Payment → Work Order" },
    { collection: "contractorPayments", field: "contractor_id", targetCollection: "master.contractors", onDelete: "restrict", nullable: false, label: "Contractor Payment → Contractor" },
    // Commission: work_order + source_partner required → restrict
    { collection: "commissions", field: "work_order_id", targetCollection: "workOrders", onDelete: "restrict", nullable: true, label: "Commission → Work Order" },
    { collection: "commissions", field: "source_partner_id", targetCollection: "master.sourcePartners", onDelete: "restrict", nullable: false, label: "Commission → Source Partner" },
    { collection: "commissions", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "Commission → Customer" },
    { collection: "commissions", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Commission → Quotation" },
    // WorkOrderCostLine: meaningless without work order → cascade
    { collection: "workOrderCostLines", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "Cost Line → Work Order" },
    // ContractorBid: cascade when work order deleted (bids have no value without the job)
    { collection: "contractorBids", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: true, label: "Contractor Bid → Work Order" },
    { collection: "contractorBids", field: "contractor_id", targetCollection: "master.contractors", onDelete: "restrict", nullable: false, label: "Contractor Bid → Contractor" },
    { collection: "contractorBids", field: "accepted_scope_id", targetCollection: "acceptedScopes", onDelete: "nullify", nullable: true, label: "Contractor Bid → Accepted Scope" },
    // ContractorSettlement: cascade
    { collection: "contractorSettlements", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "Settlement → Work Order" },
    { collection: "contractorSettlements", field: "contractor_id", targetCollection: "master.contractors", onDelete: "restrict", nullable: false, label: "Settlement → Contractor" },
];

// ─────────────────────────────────────────────────────────────────────────
// Execution-domain FKs (drawings, logs, variations)
// ─────────────────────────────────────────────────────────────────────────
const executionFks: ForeignKeyRule[] = [
    { collection: "drawings", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Drawing → Site" },
    { collection: "drawings", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Drawing → Work Order" },
    { collection: "drawings", field: "area_id", targetCollection: "areas", onDelete: "nullify", nullable: true, label: "Drawing → Area" },
    // ExecutionLog: cascade when work order deleted (logs belong to the job)
    { collection: "executionLogs", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "Execution Log → Work Order" },
    { collection: "executionLogs", field: "filed_by_staff_id", targetCollection: "master.staff", onDelete: "nullify", nullable: true, label: "Execution Log → Filed By Staff" },
    { collection: "executionLogs", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Execution Log → Site" },
    // VariationRequest: cascade when work order deleted
    { collection: "variationRequests", field: "work_order_id", targetCollection: "workOrders", onDelete: "cascade", nullable: false, label: "Variation → Work Order" },
    { collection: "variationRequests", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Variation → Customer" },
    { collection: "variationRequests", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Variation → Site" },
];

// ─────────────────────────────────────────────────────────────────────────
// Visit FKs — visits can survive losing optional work_order/work_required
// ─────────────────────────────────────────────────────────────────────────
const visitFks: ForeignKeyRule[] = [
    { collection: "visits", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Visit → Customer" },
    { collection: "visits", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Visit → Site" },
    { collection: "visits", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Visit → Work Required" },
    { collection: "visits", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Visit → Work Order" },
    { collection: "visits", field: "staff_id", targetCollection: "master.staff", onDelete: "nullify", nullable: true, label: "Visit → Staff (when assigned to staff)" },
    { collection: "visits", field: "contractor_id", targetCollection: "master.contractors", onDelete: "nullify", nullable: true, label: "Visit → Contractor" },
    { collection: "visits", field: "vendor_id", targetCollection: "master.vendors", onDelete: "nullify", nullable: true, label: "Visit → Vendor" },
];

// ─────────────────────────────────────────────────────────────────────────
// Tasks / Followups / Actions — polymorphic linked_record handled by
// validateBusinessData; only customer_id checked here
// ─────────────────────────────────────────────────────────────────────────
const taskDomainFks: ForeignKeyRule[] = [
    { collection: "tasks", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: true, label: "Task → Customer" },
    { collection: "tasks", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Task → Work Order" },
    { collection: "tasks", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Task → Quotation" },
    { collection: "tasks", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Task → Site" },
    { collection: "tasks", field: "visit_id", targetCollection: "visits", onDelete: "nullify", nullable: true, label: "Task → Visit" },
    { collection: "tasks", field: "po_id", targetCollection: "purchaseOrders", onDelete: "nullify", nullable: true, label: "Task → Purchase Order" },
    { collection: "tasks", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Task → Work Required" },
    // Polymorphic linked_record_id+linked_record_type — ignored (validateBusinessData covers it)
    { collection: "tasks", field: "linked_record_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: true, label: "Task → Linked Record (polymorphic)", note: "Parent collection depends on linked_record_type. Covered by assertCustomerRelation in validateBusinessData." },
    { collection: "followups", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: true, label: "Follow-up → Customer" },
    { collection: "followups", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Follow-up → Quotation" },
    { collection: "followups", field: "payment_id", targetCollection: "payments", onDelete: "nullify", nullable: true, label: "Follow-up → Payment" },
    { collection: "followups", field: "visit_id", targetCollection: "visits", onDelete: "nullify", nullable: true, label: "Follow-up → Visit" },
    { collection: "followups", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Follow-up → Work Required" },
    { collection: "actions", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: true, label: "Approval → Customer" },
    { collection: "actions", field: "linked_record_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: true, label: "Approval → Linked Record (polymorphic)", note: "Parent collection depends on linked_record_type (quotation|po|payment|contractor_payment). Covered by assertCustomerRelation." },
];

// ─────────────────────────────────────────────────────────────────────────
// Finance FKs (payments, invoices, customerReceipts)
// ─────────────────────────────────────────────────────────────────────────
const financeFks: ForeignKeyRule[] = [
    // Payment: customer required (restrict); other context optional (nullify)
    { collection: "payments", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Payment → Customer" },
    { collection: "payments", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Payment → Site" },
    { collection: "payments", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Payment → Work Order" },
    { collection: "payments", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Payment → Quotation" },
    { collection: "payments", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Payment → Work Required" },
    { collection: "payments", field: "invoice_id", targetCollection: "invoices", onDelete: "nullify", nullable: true, label: "Payment → Invoice" },
    // Invoice: customer required; other context optional
    { collection: "invoices", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Invoice → Customer" },
    { collection: "invoices", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Invoice → Site" },
    { collection: "invoices", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Invoice → Work Order" },
    { collection: "invoices", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Invoice → Quotation" },
    { collection: "invoices", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Invoice → Work Required" },
    { collection: "invoices", field: "payment_id", targetCollection: "payments", onDelete: "nullify", nullable: true, label: "Invoice → Payment" },
    // CustomerReceipt: customer + invoice required; payment optional
    { collection: "customerReceipts", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Receipt → Customer" },
    { collection: "customerReceipts", field: "invoice_id", targetCollection: "invoices", onDelete: "cascade", nullable: false, label: "Receipt → Invoice" },
    { collection: "customerReceipts", field: "payment_id", targetCollection: "payments", onDelete: "nullify", nullable: true, label: "Receipt → Payment" },
    { collection: "customerReceipts", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Receipt → Work Order" },
    { collection: "customerReceipts", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Receipt → Site" },
    { collection: "customerReceipts", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Receipt → Quotation" },
    { collection: "customerReceipts", field: "work_required_id", targetCollection: "workRequired", onDelete: "nullify", nullable: true, label: "Receipt → Work Required" },
    { collection: "customerReceipts", field: "area_ids", targetCollection: "areas", onDelete: "nullify", nullable: true, isArray: true, label: "Receipt → Areas" },
];

// ─────────────────────────────────────────────────────────────────────────
// Risk / Blocked FKs
// ─────────────────────────────────────────────────────────────────────────
const riskFks: ForeignKeyRule[] = [
    { collection: "blocked", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: true, label: "Obstacle → Customer" },
    { collection: "blocked", field: "linked_work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Obstacle → Work Order" },
    { collection: "blocked", field: "linked_po_id", targetCollection: "purchaseOrders", onDelete: "nullify", nullable: true, label: "Obstacle → PO" },
    { collection: "blocked", field: "linked_grn_id", targetCollection: "grns", onDelete: "nullify", nullable: true, label: "Obstacle → GRN" },
    { collection: "blocked", field: "linked_task_id", targetCollection: "tasks", onDelete: "nullify", nullable: true, label: "Obstacle → Task" },
    { collection: "risks", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: true, label: "Risk → Customer" },
];

// ─────────────────────────────────────────────────────────────────────────
// Threads — polymorphic kind+record_id (ignored, validateBusinessData covers)
// ─────────────────────────────────────────────────────────────────────────
const threadFks: ForeignKeyRule[] = [
    { collection: "threads", field: "record_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: false, label: "Thread → Record (polymorphic)", note: "Parent collection depends on `kind`. Covered by assertThreadParentExists in validateBusinessData." },
];

// ─────────────────────────────────────────────────────────────────────────
// CommSends — customer required; followup/task optional (nullify)
// ─────────────────────────────────────────────────────────────────────────
const commFks: ForeignKeyRule[] = [
    { collection: "commSends", field: "customer_id", targetCollection: "customers", onDelete: "restrict", nullable: false, label: "Communication → Customer" },
    { collection: "commSends", field: "followup_id", targetCollection: "followups", onDelete: "nullify", nullable: true, label: "Communication → Follow-up" },
    { collection: "commSends", field: "task_id", targetCollection: "tasks", onDelete: "nullify", nullable: true, label: "Communication → Task" },
    { collection: "commSends", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Communication → Work Order" },
    { collection: "commSends", field: "quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Communication → Quotation" },
];

// ─────────────────────────────────────────────────────────────────────────
// Attendance / Leave / Payroll / Salary / Staff-Documents FKs
// ─────────────────────────────────────────────────────────────────────────
const hrFks: ForeignKeyRule[] = [
    { collection: "attendance", field: "staff_id", targetCollection: "master.staff", onDelete: "restrict", nullable: false, label: "Attendance → Staff" },
    { collection: "attendance", field: "visit_id", targetCollection: "visits", onDelete: "nullify", nullable: true, label: "Attendance → Visit" },
    { collection: "staffLocationPings", field: "staff_id", targetCollection: "master.staff", onDelete: "restrict", nullable: false, label: "Location Ping → Staff" },
    { collection: "leaveRequests", field: "staff_id", targetCollection: "master.staff", onDelete: "cascade", nullable: false, label: "Leave Request → Staff" },
    // PayrollPeriod: parent — no FK
    { collection: "payrollLines", field: "payroll_period_id", targetCollection: "payrollPeriods", onDelete: "cascade", nullable: false, label: "Payroll Line → Period" },
    { collection: "payrollLines", field: "staff_id", targetCollection: "master.staff", onDelete: "restrict", nullable: false, label: "Payroll Line → Staff" },
    { collection: "salaryAdjustments", field: "staff_id", targetCollection: "master.staff", onDelete: "restrict", nullable: false, label: "Salary Adjustment → Staff" },
    { collection: "salaryAdjustments", field: "payroll_period_id", targetCollection: "payrollPeriods", onDelete: "nullify", nullable: true, label: "Salary Adjustment → Period" },
    { collection: "staffDocuments", field: "staff_id", targetCollection: "master.staff", onDelete: "cascade", nullable: false, label: "Staff Document → Staff" },
    { collection: "staffDocuments", field: "file_asset_id", targetCollection: "master.fileAssets", onDelete: "nullify", nullable: true, label: "Staff Document → File Asset" },
];

// ─────────────────────────────────────────────────────────────────────────
// Recurring tasks — polymorphic linked entity (ignored)
// ─────────────────────────────────────────────────────────────────────────
const recurringFks: ForeignKeyRule[] = [
    { collection: "recurringTasks", field: "assignee_id", targetCollection: "master.staff", onDelete: "nullify", nullable: true, label: "Recurring Task → Assignee" },
];

// ─────────────────────────────────────────────────────────────────────────
// EntityFileAttachments / EntityReferenceAssignments — polymorphic entity,
// but file_asset_id IS a hard FK to master.fileAssets
// ─────────────────────────────────────────────────────────────────────────
const fileAttachmentFks: ForeignKeyRule[] = [
    { collection: "entityFileAttachments", field: "file_asset_id", targetCollection: "master.fileAssets", onDelete: "cascade", nullable: false, label: "File Attachment → File Asset" },
    { collection: "entityFileAttachments", field: "entity_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: false, label: "File Attachment → Entity (polymorphic)", note: "Parent collection depends on entity_type. Parent deletion cleanup is handled by the cascade walker's polymorphic-entity sweep." },
    // FIX-ANALYSIS-001 #7: Removed dead FK rule — entityFileAttachments.customer_id
    // The EntityFileAttachment TypeScript interface has NO customer_id field
    // (only entity_type + entity_id, which are polymorphic). This rule never
    // fired and was dead code. Customer linkage is resolved at runtime via
    // resolveEntityContext(entity_type, entity_id) → customerId.
    { collection: "entityReferenceAssignments", field: "resource_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: false, label: "Reference Assignment → Resource (polymorphic)", note: "Parent collection depends on resource_type (catalogue|pinterest_board|reference_media)." },
    { collection: "entityReferenceAssignments", field: "entity_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: false, label: "Reference Assignment → Entity (polymorphic)", note: "Parent collection depends on entity_type." },
    { collection: "entityReferenceAssignments", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "Reference Assignment → Customer" },
];

// ─────────────────────────────────────────────────────────────────────────
// Master-collection FKs (rates, variants, storage, catalogues)
// ─────────────────────────────────────────────────────────────────────────
const masterFks: ForeignKeyRule[] = [
    // VendorRate: cascade when vendor deleted (rates have no value without vendor)
    { collection: "master.vendorRates", field: "vendor_id", targetCollection: "master.vendors", onDelete: "cascade", nullable: false, label: "Vendor Rate → Vendor" },
    { collection: "master.vendorRates", field: "work_required_article_id", targetCollection: "master.subcategoryArticleMap", onDelete: "cascade", nullable: true, label: "Vendor Rate → Scoped Material" },
    { collection: "master.vendorRates", field: "article_id", targetCollection: "master.articles", onDelete: "restrict", nullable: false, label: "Vendor Rate → Article" },
    // VendorRateHistory: cascade when its rate deleted
    { collection: "master.vendorRateHistories", field: "vendor_rate_id", targetCollection: "master.vendorRates", onDelete: "cascade", nullable: true, label: "Rate History → Vendor Rate" },
    { collection: "master.vendorRateHistories", field: "vendor_id", targetCollection: "master.vendors", onDelete: "cascade", nullable: false, label: "Rate History → Vendor" },
    { collection: "master.vendorRateHistories", field: "article_id", targetCollection: "master.articles", onDelete: "restrict", nullable: false, label: "Rate History → Article" },
    { collection: "master.vendorRateHistories", field: "work_required_article_id", targetCollection: "master.subcategoryArticleMap", onDelete: "cascade", nullable: false, label: "Rate History → Scoped Material" },
    // ContractorRate: cascade when contractor deleted
    { collection: "master.contractorRates", field: "contractor_id", targetCollection: "master.contractors", onDelete: "cascade", nullable: false, label: "Contractor Rate → Contractor" },
    // ArticleVariant: cascade when article deleted
    { collection: "master.articleVariants", field: "article_id", targetCollection: "master.articles", onDelete: "cascade", nullable: false, label: "Article Variant → Article" },
    { collection: "master.articleVariants", field: "work_required_article_id", targetCollection: "master.subcategoryArticleMap", onDelete: "nullify", nullable: true, label: "Article Variant → Scoped Material" },
    // SubcategoryArticleMap (WorkRequiredArticle): cascade
    { collection: "master.subcategoryArticleMap", field: "article_id", targetCollection: "master.articles", onDelete: "cascade", nullable: false, label: "Scoped Material → Article" },
    { collection: "master.subcategoryArticleMap", field: "work_required_id", targetCollection: "master.workSubcategories", onDelete: "cascade", nullable: false, label: "Scoped Material → Work Subcategory" },
    // StorageFolderInstance: storage account + template required (restrict)
    { collection: "master.storageFolderInstances", field: "storage_account_id", targetCollection: "master.storageAccounts", onDelete: "restrict", nullable: false, label: "Storage Folder → Storage Account" },
    { collection: "master.storageFolderInstances", field: "template_id", targetCollection: "master.storageFolderTemplates", onDelete: "restrict", nullable: false, label: "Storage Folder → Template" },
    // FileAsset: storage account/folder optional (nullify)
    { collection: "master.fileAssets", field: "storage_account_id", targetCollection: "master.storageAccounts", onDelete: "nullify", nullable: true, label: "File Asset → Storage Account" },
    { collection: "master.fileAssets", field: "storage_folder_instance_id", targetCollection: "master.storageFolderInstances", onDelete: "nullify", nullable: true, label: "File Asset → Storage Folder" },
    // CatalogueArticleVendorLink: cascade on catalogue/article/vendor delete
    { collection: "master.catalogueArticleVendorLinks", field: "catalogue_id", targetCollection: "master.catalogues", onDelete: "cascade", nullable: false, label: "Catalogue Link → Catalogue" },
    { collection: "master.catalogueArticleVendorLinks", field: "article_id", targetCollection: "master.articles", onDelete: "cascade", nullable: false, label: "Catalogue Link → Article" },
    { collection: "master.catalogueArticleVendorLinks", field: "vendor_id", targetCollection: "master.vendors", onDelete: "cascade", nullable: true, label: "Catalogue Link → Vendor" },
    // CommissionRule: source partner nullable
    { collection: "master.commissionRules", field: "source_partner_id", targetCollection: "master.sourcePartners", onDelete: "nullify", nullable: false, label: "Commission Rule → Source Partner" },
    { collection: "master.commissionRules", field: "category_id", targetCollection: "master.workCategories", onDelete: "nullify", nullable: true, label: "Commission Rule → Category" },
    // PinterestBoard: optional category/subcategory/article
    { collection: "master.pinterestBoards", field: "category_id", targetCollection: "master.workCategories", onDelete: "nullify", nullable: true, label: "Pinterest Board → Category" },
    { collection: "master.pinterestBoards", field: "subcategory_id", targetCollection: "master.workSubcategories", onDelete: "nullify", nullable: true, label: "Pinterest Board → Subcategory" },
    { collection: "master.pinterestBoards", field: "article_id", targetCollection: "master.articles", onDelete: "nullify", nullable: true, label: "Pinterest Board → Article" },
    // ReferenceMedia: optional category/subcategory/article
    { collection: "master.referenceMedia", field: "category_id", targetCollection: "master.workCategories", onDelete: "nullify", nullable: true, label: "Reference Media → Category" },
    { collection: "master.referenceMedia", field: "subcategory_id", targetCollection: "master.workSubcategories", onDelete: "nullify", nullable: true, label: "Reference Media → Subcategory" },
    { collection: "master.referenceMedia", field: "article_id", targetCollection: "master.articles", onDelete: "nullify", nullable: true, label: "Reference Media → Article" },
    // CatalogueAsset: optional drive asset
    { collection: "master.catalogues", field: "drive_asset_id", targetCollection: "master.fileAssets", onDelete: "nullify", nullable: true, label: "Catalogue → Drive Asset" },
];

// ─────────────────────────────────────────────────────────────────────────
// Master / Config — no FKs (parent rows):
//   approvalPolicies, automationRules, payrollPeriods,
//   master.units, master.workCategories, master.workSubcategories,
//   master.articles, master.vendors, master.contractors, master.staff,
//   master.sourcePartners, master.storageAccounts,
//   master.storageFolderTemplates
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// FIX-ANALYSIS-003: Previously-unenforced relationship fields.
// ANALYSIS-001 Section E.2 found ~30 declared relationship fields in
// types.ts that were persisted but never enforced by any runtime
// validation. These are now declared here so the integrity checker,
// cascade-delete planner, and repair engine can enforce them.
// ─────────────────────────────────────────────────────────────────────────
const unenforcedFks: ForeignKeyRule[] = [
    // Visit — recovery followup, report task, thread message links
    { collection: "visits", field: "recovery_followup_id", targetCollection: "followups", onDelete: "nullify", nullable: true, label: "Visit → Recovery Follow-up" },
    { collection: "visits", field: "report_task_id", targetCollection: "tasks", onDelete: "nullify", nullable: true, label: "Visit → Report Task" },
    { collection: "visits", field: "checkout_thread_message_id", targetCollection: "threadMessages", onDelete: "nullify", nullable: true, label: "Visit → Checkout Thread Message" },
    { collection: "visits", field: "report_thread_message_id", targetCollection: "threadMessages", onDelete: "nullify", nullable: true, label: "Visit → Report Thread Message" },
    // Task — blocked item link
    { collection: "tasks", field: "blocked_item_id", targetCollection: "blocked", onDelete: "nullify", nullable: true, label: "Task → Blocked Item" },
    // Followup — next followup chain
    { collection: "followups", field: "next_followup_id", targetCollection: "followups", onDelete: "nullify", nullable: true, label: "Follow-up → Next Follow-up" },
    // Payment — milestone term link
    { collection: "payments", field: "milestone_term_id", targetCollection: "paymentTermTemplates", onDelete: "nullify", nullable: true, label: "Payment → Milestone Term" },
    // WorkOrder — replacement / abandoned contractor
    { collection: "workOrders", field: "replacement_for_work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Work Order → Replacement For" },
    { collection: "workOrders", field: "abandoned_contractor_id", targetCollection: "master.contractors", onDelete: "nullify", nullable: true, label: "Work Order → Abandoned Contractor" },
    // Drawing — parent drawing + derived BOQ items
    { collection: "drawings", field: "parent_drawing_id", targetCollection: "drawings", onDelete: "nullify", nullable: true, label: "Drawing → Parent Drawing" },
    { collection: "drawings", field: "derived_boq_item_ids", targetCollection: "boqs", onDelete: "nullify", nullable: true, isArray: true, label: "Drawing → Derived BOQ Items" },
    // GRN — obstacle + bill links
    { collection: "grns", field: "obstacle_id", targetCollection: "blocked", onDelete: "nullify", nullable: true, label: "GRN → Obstacle" },
    { collection: "grns", field: "bill_id", targetCollection: "vendorBills", onDelete: "nullify", nullable: true, label: "GRN → Vendor Bill" },
    // VendorBill — three-way match obstacle
    { collection: "vendorBills", field: "three_way_match.obstacle_id", targetCollection: "blocked", onDelete: "nullify", nullable: true, label: "Vendor Bill → 3WM Obstacle" },
    // VariationRequest — execution log link
    { collection: "variationRequests", field: "execution_log_id", targetCollection: "executionLogs", onDelete: "nullify", nullable: true, label: "Variation → Execution Log" },
    // WorkOrderCostLine — polymorphic source (ignored, like other polymorphic fields)
    { collection: "workOrderCostLines", field: "source_id", targetCollection: "polymorphic", onDelete: "ignore", nullable: true, label: "Cost Line → Source (polymorphic)", note: "Parent depends on source_kind (po|grn|dispatch|contractor_payment|manual|bill|settlement|variation)." },
    // ThreadMessage — parent message + related thread/audit
    { collection: "threadMessages", field: "parent_message_id", targetCollection: "threadMessages", onDelete: "nullify", nullable: true, label: "Thread Message → Parent Message" },
    { collection: "threadMessages", field: "related_thread_id", targetCollection: "threads", onDelete: "nullify", nullable: true, label: "Thread Message → Related Thread" },
    { collection: "threadMessages", field: "related_audit_id", targetCollection: "auditLog", onDelete: "nullify", nullable: true, label: "Thread Message → Related Audit" },
    // ThreadMessageAttachment — file attachment link
    { collection: "threadMessageAttachments", field: "entity_file_attachment_id", targetCollection: "entityFileAttachments", onDelete: "nullify", nullable: true, label: "Thread Message Attachment → File Attachment" },
    // CommSend — attachment IDs (polymorphic, ignored)
    { collection: "commSends", field: "attachment_ids", targetCollection: "polymorphic", onDelete: "ignore", nullable: true, isArray: true, label: "Communication → Attachments (polymorphic)", note: "Each ID references an entityFileAttachments row." },
    // Customer / Site — source partner
    { collection: "customers", field: "source_partner_id", targetCollection: "master.sourcePartners", onDelete: "nullify", nullable: true, label: "Customer → Source Partner" },
    { collection: "sites", field: "source_partner_id", targetCollection: "master.sourcePartners", onDelete: "nullify", nullable: true, label: "Site → Source Partner" },
    // Quotation — parent / superseded chain
    { collection: "quotations", field: "parent_quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Quotation → Parent Quotation" },
    { collection: "quotations", field: "superseded_by_quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Quotation → Superseded By" },
    // AcceptedScope — contractor bid
    { collection: "acceptedScopes", field: "contractor_bid_id", targetCollection: "contractorBids", onDelete: "nullify", nullable: true, label: "Accepted Scope → Contractor Bid" },
    // ContractorSettlement — replacement work order
    { collection: "contractorSettlements", field: "replacement_work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Settlement → Replacement Work Order" },
    // LeaveRequest — approved by staff
    { collection: "leaveRequests", field: "approved_by_staff_id", targetCollection: "master.staff", onDelete: "nullify", nullable: true, label: "Leave Request → Approved By Staff" },
    // FIX-ANALYSIS-003 Group B: New cross-module connection fields (E.4)
    // E.4.2: Staff Attendance → Work Order (job-costing)
    { collection: "attendance", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Attendance → Work Order" },
    // E.4.4: SalaryAdjustment → Work Order (job-specific bonuses)
    { collection: "salaryAdjustments", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Salary Adjustment → Work Order" },
    // E.4.6: RecurringTaskDefinition → Customer/Site/WorkOrder
    { collection: "recurringTasks", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "Recurring Task → Customer" },
    { collection: "recurringTasks", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Recurring Task → Site" },
    { collection: "recurringTasks", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Recurring Task → Work Order" },
    // E.4.10: Blocked → Quotation (mark quotation as blocked)
    { collection: "blocked", field: "linked_quotation_id", targetCollection: "quotations", onDelete: "nullify", nullable: true, label: "Obstacle → Quotation" },
    // E.4.11: VariationRequest → BOQ items
    { collection: "variationRequests", field: "affected_boq_item_ids", targetCollection: "boqs", onDelete: "nullify", nullable: true, isArray: true, label: "Variation → Affected BOQ Items" },
    // E.4.7: AuditLog → Customer (denormalized for efficient querying)
    { collection: "auditLog", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "Audit Log → Customer" },
    // E.4.9: FileAsset → Customer/Site (typed links for file lookup)
    { collection: "master.fileAssets", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "File Asset → Customer" },
    { collection: "master.fileAssets", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "File Asset → Site" },
    // E.4.8: StorageFolderInstance → Customer/Site (already added to type in FIX-ANALYSIS-002)
    { collection: "master.storageFolderInstances", field: "customer_id", targetCollection: "customers", onDelete: "nullify", nullable: true, label: "Storage Folder → Customer" },
    { collection: "master.storageFolderInstances", field: "site_id", targetCollection: "sites", onDelete: "nullify", nullable: true, label: "Storage Folder → Site" },
    { collection: "master.storageFolderInstances", field: "work_order_id", targetCollection: "workOrders", onDelete: "nullify", nullable: true, label: "Storage Folder → Work Order" },
];

/**
 * The complete registry of every foreign-key relationship in the workspace
 * data model. This is the single source of truth for the integrity checker,
 * cascade-delete planner, and repair engine.
 */
export const FOREIGN_KEYS: ForeignKeyRule[] = [
    ...customerDomainFks,
    ...quotationDomainFks,
    ...procurementFks,
    ...inventoryFks,
    ...vendorBillFks,
    ...contractorFks,
    ...executionFks,
    ...visitFks,
    ...taskDomainFks,
    ...financeFks,
    ...riskFks,
    ...threadFks,
    ...commFks,
    ...hrFks,
    ...recurringFks,
    ...fileAttachmentFks,
    ...masterFks,
    ...unenforcedFks,
];

/** Return every FK rule whose child collection is `collection`. */
export function fksForCollection(collection: string): ForeignKeyRule[] {
    return FOREIGN_KEYS.filter((rule) => rule.collection === collection);
}

/** Return every FK rule whose parent collection is `collection`
 *  (i.e. the rules that govern what happens when a row in `collection`
 *  is deleted). Used by the cascade-delete planner. */
export function fksTargetingCollection(collection: string): ForeignKeyRule[] {
    return FOREIGN_KEYS.filter((rule) => rule.targetCollection === collection);
}

/** Return the set of all parent collections referenced by at least one FK. */
export function parentCollections(): string[] {
    const set = new Set<string>();
    for (const rule of FOREIGN_KEYS) {
        if (rule.targetCollection !== "polymorphic") {
            set.add(rule.targetCollection);
        }
    }
    return Array.from(set);
}

/** Return the set of all child collections that own at least one FK. */
export function childCollections(): string[] {
    const set = new Set<string>();
    for (const rule of FOREIGN_KEYS) {
        set.add(rule.collection);
    }
    return Array.from(set);
}
