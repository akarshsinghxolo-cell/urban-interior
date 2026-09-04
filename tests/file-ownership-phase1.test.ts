import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { resolveAttachmentEntityLabel, resolveEntityContext } from "../src/lib/rdash/entity-context";
import { cascadeDelete } from "../src/lib/rdash/integrity/cascade";
import { mapEntityTypeToThreadKind } from "../src/lib/rdash/entity-thread-map";
import { threadParentExists, validateBusinessData } from "../src/lib/rdash/business-rules";
import { destinationSegments } from "../src/lib/rdash/server/drive-folder-hierarchy";
import { uploadPurposeAllowedForEntity, uploadPurposeForEntity } from "../src/lib/uploads/upload-purpose";
import { inferStoragePurpose } from "../src/lib/rdash/storage";
import type { UploadPurpose } from "../src/lib/uploads/upload-types";
import type { RDashDatabase } from "../src/lib/rdash/types";

function dbFixture(): RDashDatabase {
  const now = "2026-08-14T00:00:00.000Z";
  return {
    _workspace_mode: "test",
    _data_source: "test",
    customers: [{ id: "c1", name: "Rajesh Sharma", phone: "", email: "", status: "active", source: "", created_at: now, updated_at: now }],
    sites: [{ id: "s1", customer_id: "c1", name: "Sharma Residence", address: "", locality: "", city: "", pincode: "", status: "active", created_at: now, updated_at: now }],
    areas: [{ id: "a1", site_id: "s1", name: "Kitchen", type: "room", status: "active", created_at: now, updated_at: now }],
    workRequired: [{ id: "wr1", customer_id: "c1", site_id: "s1", title: "False Ceiling", area_ids: ["a1"], status: "open", priority: "medium", created_at: now, updated_at: now }],
    measurementRevisions: [{ id: "m1", site_id: "s1", area_id: "a1", work_required_id: "wr1", revision_no: 3, unit: "ft", captured_at: now, photo_count: 2, status: "verified" }],
    quotations: [{ id: "q1", quotation_no: "QT-001", customer_id: "c1", site_id: "s1", status: "accepted", scope_lines: [], items: [], subtotal: 0, tax: 0, discount: 0, total: 0, created_at: now, updated_at: now } as any],
    acceptedScopes: [{ id: "as1", quotation_id: "q1", customer_id: "c1", site_id: "s1", work_required_id: "wr1", area_ids: ["a1"], measurement_revision_ids: ["m1"], label: "Ceiling scope", accepted_value: 1000, status: "accepted", accepted_at: now }],
    workOrders: [{ id: "wo1", work_order_no: "WO-001", customer_id: "c1", site_id: "s1", title: "Ceiling Work", status: "in_progress", created_at: now, updated_at: now } as any],
    boqs: [{ id: "boq1", work_order_id: "wo1", items: [], created_at: now, updated_at: now } as any],
    vendorRfqs: [{ id: "rfq1", rfq_no: "RFQ-001", site_id: "s1", work_order_id: "wo1", boq_id: "boq1", item_ids: [], vendor_ids: ["v1"], status: "sent", created_at: now, updated_at: now }],
    vendorBids: [{ id: "vbid1", rfq_id: "rfq1", vendor_id: "v1", vendor_name: "Build Mart", lines: [], quoted_amount: 100, status: "received", created_at: now, updated_at: now }],
    purchaseOrders: [{ id: "po1", po_no: "PO-001", vendor_id: "v1", vendor_name: "Build Mart", site_id: "s1", work_order_id: "wo1", items: [], subtotal: 0, tax: 0, total: 0, status: "issued", created_at: now, updated_at: now } as any],
    grns: [{ id: "g1", grn_no: "GRN-001", po_id: "po1", po_no: "PO-001", vendor_id: "v1", vendor_name: "Build Mart", site_id: "s1", work_order_id: "wo1", items: [], status: "received", received_at: now, created_at: now, updated_at: now } as any],
    inventory: [{ id: "i1", name: "Plywood", article_id: "art1", work_required_article_id: "wra1", unit_id: "u1", work_order_id: "wo1", quantity: 1, created_at: now, updated_at: now } as any],
    stockMovements: [{ id: "sm1", inventory_id: "i1", article_id: "art1", work_required_article_id: "wra1", unit_id: "u1", name: "Plywood receipt", type: "receipt", quantity: 1, work_order_id: "wo1", grn_id: "g1", created_at: now }],
    dispatches: [{ id: "d1", dispatch_no: "DSP-001", work_order_id: "wo1", work_order_no: "WO-001", site_id: "s1", status: "issued", items: [], issued_at: now, created_at: now, updated_at: now } as any],
    vendorBills: [{ id: "vb1", bill_no: "VB-001", vendor_id: "v1", vendor_name: "Build Mart", site_id: "s1", work_order_id: "wo1", po_id: "po1", po_no: "PO-001", grn_id: "g1", grn_no: "GRN-001", amount: 100, total_amount: 100, paid_amount: 0, balance_amount: 100, status: "pending", due_date: now, created_at: now, updated_at: now } as any],
    vendorPayments: [{ id: "vp1", payment_no: "VP-001", vendor_bill_id: "vb1", vendor_id: "v1", vendor_name: "Build Mart", site_id: "s1", work_order_id: "wo1", amount: 100, mode: "bank_transfer", reference: "UTR1", status: "paid", paid_at: now, created_at: now, updated_at: now }],
    contractorBills: [{ id: "cb1", bill_no: "CB-001", customer_id: "c1", site_id: "s1", work_order_id: "wo1", work_required_id: "wr1", contractor_id: "ct1", contractor_name: "Ceiling Works", amount: 100, paid_amount: 0, balance_amount: 100, status: "verified", progress_pct: 50, created_at: now, updated_at: now }],
    contractorPayments: [{ id: "cp1", payment_no: "CP-001", contractor_bill_id: "cb1", work_order_id: "wo1", site_id: "s1", contractor_id: "ct1", contractor_name: "Ceiling Works", amount: 50, mode: "bank_transfer", reference: "UTR2", status: "paid", paid_at: now, created_at: now, updated_at: now }],
    commissions: [{ id: "comm1", commission_no: "COM-001", source_partner_id: "p1", source_partner_name: "Partner", customer_id: "c1", site_id: "s1", work_order_id: "wo1", base_amount: 100, rate_pct: 5, amount: 5, status: "accrued", accrued_at: now, created_at: now, updated_at: now } as any], workOrderCostLines: [], contractorBids: [{ id: "ctbid1", bid_no: "CBID-001", work_order_id: "wo1", work_order_no: "WO-001", site_id: "s1", contractor_id: "ct1", contractor_name: "Ceiling Works", scope: "Ceiling", status: "submitted", submitted_at: now, created_at: now, updated_at: now } as any], contractorSettlements: [{ id: "cs1", settlement_no: "SET-001", contractor_id: "ct1", work_order_id: "wo1", status: "draft", created_at: now, updated_at: now } as any], drawings: [], executionLogs: [],
    variationRequests: [{ id: "var1", variation_no: "VAR-001", work_order_id: "wo1", work_order_no: "WO-001", customer_id: "c1", site_id: "s1", title: "Extra ceiling", description: "", requested_amount: 10, status: "approved", requested_at: now, created_at: now, updated_at: now }],
    visits: [], tasks: [{ id: "task1", customer_id: "c1", site_id: "s1", work_order_id: "wo1", title: "Verify ceiling", status: "todo", priority: "medium", due_date: "2026-08-15", task_scope: "site", comments: [], checklist: [], proofs: [], created_at: now, updated_at: now } as any], followups: [{ id: "fu1", customer_id: "c1", title: "Customer call", status: "pending", priority: "medium", due_at: now, due_date: "2026-08-15", created_at: now, updated_at: now } as any], actions: [], payments: [{ id: "pay1", customer_id: "c1", site_id: "s1", title: "Advance", status: "pending", amount: 100, due_date: "2026-08-15", created_at: now, updated_at: now } as any],
    invoices: [{ id: "inv1", invoice_no: "INV-001", customer_id: "c1", finance_context: "service", site_id: "s1", status: "issued", total: 100, created_at: now, updated_at: now } as any],
    customerReceipts: [{ id: "cr1", receipt_no: "RCPT-001", customer_id: "c1", invoice_id: "inv1", finance_context: "service", site_id: "s1", amount: 100, mode: "bank_transfer", reference: "UTR3", received_at: now, created_at: now, updated_at: now }],
    blocked: [{ id: "block1", title: "Access blocked", reason: "Gate closed", customer_id: "c1", linked_work_order_id: "wo1", created_at: now } as any], risks: [],
    threads: [{ id: "t1", kind: "vendor_bill", record_type: "vendor_bill", record_id: "vp1", title: "Vendor payment", messages: [{ id: "msg1", thread_id: "t1", author_name: "Owner", body: "Paid", kind: "proof", created_at: now }], participants: [], open: true, created_at: now, updated_at: now }],
    attendance: [], commSends: [{ id: "com1", channel: "email", customer_id: "c1", staff_name: "Owner", subject: "Quotation sent", quotation_id: "q1", attachment_ids: [], status: "sent", sent_at: now }],
    entityFileAttachments: [{ id: "efa-cb", file_asset_id: "fa1", entity_type: "contractor_bill", entity_id: "cb1", role: "bill", visibility: "internal", created_at: now, updated_at: now }],
    entityReferenceAssignments: [], commercialTerms: [], paymentTermTemplates: [], taxConfigs: [], validityConfigs: [], approvalPolicies: [], automationRules: [], recurringTasks: [], auditLog: [],
    master: { vendors: [{ id: "v1", name: "Build Mart" } as any], contractors: [{ id: "ct1", name: "Ceiling Works" } as any], vendorRates: [], staff: [], fileAssets: [{ id: "fa1", name: "bill.pdf", storage_provider: "google_drive", storage_mode: "managed", sync_status: "uploaded", created_at: now, updated_at: now } as any], storageAccounts: [], storageFolderTemplates: [], storageFolderInstances: [], units: [], workCategories: [], workSubcategories: [], articles: [], articleVariants: [], subcategoryArticleMap: [{ id: "wra1", subcategory_id: "sub1", article_id: "art1", unit_id: "u1" } as any], workOptionGroups: [], workOptionValues: [], referenceCategories: [], referenceSubcategories: [], referenceAssignments: [], catalogues: [], pinterestBoards: [], referenceMedia: [] } as any,
  } as unknown as RDashDatabase;
}

describe("Phase 1 file ownership", () => {
  test("resolves each new canonical owner to the correct business context", () => {
    const db = dbFixture();
    const owners = ["measurement_revision", "accepted_scope", "variation_request", "vendor_rfq", "vendor_bid", "stock_movement", "vendor_payment", "contractor_bill", "contractor_payment", "customer_receipt"] as const;
    for (const type of owners) {
      const id = ({ measurement_revision: "m1", accepted_scope: "as1", variation_request: "var1", vendor_rfq: "rfq1", vendor_bid: "vbid1", stock_movement: "sm1", vendor_payment: "vp1", contractor_bill: "cb1", contractor_payment: "cp1", customer_receipt: "cr1" } as const)[type];
      expect(resolveEntityContext(db, type, id).customerId).toBe("c1");
    }
    expect(resolveEntityContext(db, "vendor_bid", "vbid1").vendorId).toBe("v1");
    expect(resolveEntityContext(db, "contractor_bill", "cb1").contractorId).toBe("ct1");
  });

  test("produces useful labels for new and nested owners", () => {
    const db = dbFixture();
    expect(resolveAttachmentEntityLabel(db, "measurement_revision", "m1")).toBe("Measurement revision 3");
    expect(resolveAttachmentEntityLabel(db, "accepted_scope", "as1")).toBe("Ceiling scope");
    expect(resolveAttachmentEntityLabel(db, "vendor_rfq", "rfq1")).toBe("RFQ-001");
    expect(resolveAttachmentEntityLabel(db, "vendor_bid", "vbid1")).toBe("Build Mart · RFQ-001");
    expect(resolveAttachmentEntityLabel(db, "variation_request", "var1")).toBe("VAR-001");
    expect(resolveAttachmentEntityLabel(db, "vendor_payment", "vp1")).toBe("VP-001");
    expect(resolveAttachmentEntityLabel(db, "contractor_bill", "cb1")).toBe("CB-001");
    expect(resolveAttachmentEntityLabel(db, "contractor_payment", "cp1")).toBe("CP-001");
    expect(resolveAttachmentEntityLabel(db, "customer_receipt", "cr1")).toBe("RCPT-001");
  });


  test("new attachment owner names map to thread kinds without losing snake_case ownership", () => {
    const db = dbFixture();
    expect(mapEntityTypeToThreadKind("measurement_revision")).toBe("generic");
    expect(mapEntityTypeToThreadKind("accepted_scope")).toBe("generic");
    expect(mapEntityTypeToThreadKind("vendor_rfq")).toBe("po");
    expect(mapEntityTypeToThreadKind("vendor_bid")).toBe("po");
    expect(mapEntityTypeToThreadKind("vendor_payment")).toBe("vendor_bill");
    expect(mapEntityTypeToThreadKind("contractor_bill")).toBe("bid");
    expect(mapEntityTypeToThreadKind("contractor_payment")).toBe("bid");
    expect(mapEntityTypeToThreadKind("customer_receipt")).toBe("generic");
    expect(threadParentExists(db, "generic", "m1")).toBe(true);
    expect(threadParentExists(db, "generic", "as1")).toBe(true);
    expect(threadParentExists(db, "generic", "sm1")).toBe(true);
    expect(threadParentExists(db, "generic", "cr1")).toBe(true);
  });

  test("business validation rejects corrupted parent links for the new canonical owners", () => {
    const acceptedScopeDb = dbFixture();
    acceptedScopeDb.acceptedScopes[0] = { ...acceptedScopeDb.acceptedScopes[0], quotation_id: "missing-quotation" };
    expect(validateBusinessData(acceptedScopeDb).some((failure) => failure.includes("Accepted Scope") && failure.includes("Quotation"))).toBe(true);

    const rfqDb = dbFixture();
    rfqDb.vendorRfqs[0] = { ...rfqDb.vendorRfqs[0], site_id: "wrong-site" };
    expect(validateBusinessData(rfqDb).some((failure) => failure.includes("Vendor RFQ") && failure.includes("Site"))).toBe(true);

    const bidDb = dbFixture();
    bidDb.vendorBids[0] = { ...bidDb.vendorBids[0], vendor_id: "uninvited-vendor" };
    expect(validateBusinessData(bidDb).some((failure) => failure.includes("Vendor Bid") && failure.includes("Vendor"))).toBe(true);

    const movementDb = dbFixture();
    movementDb.stockMovements[0] = { ...movementDb.stockMovements[0], work_order_id: "missing-work-order" };
    expect(validateBusinessData(movementDb).some((failure) => failure.includes("Stock Movement") && failure.includes("Work Order"))).toBe(true);
  });

  test("communication and thread-message ownership resolve through their real business context", () => {
    const db = dbFixture();
    expect(resolveEntityContext(db, "communication", "com1").quotationId).toBe("q1");
    expect(resolveEntityContext(db, "thread_message", "msg1").vendorId).toBe("v1");
  });

  test("rejects conflicting parent links instead of assigning a file to the wrong business context", () => {
    const db = dbFixture();
    db.vendorPayments[0] = { ...db.vendorPayments[0], work_order_id: "wrong-wo" };
    expect(() => resolveEntityContext(db, "vendor_payment", "vp1")).toThrow();

    const db2 = dbFixture();
    db2.measurementRevisions[0] = { ...db2.measurementRevisions[0], site_id: "wrong-site" };
    expect(() => resolveEntityContext(db2, "measurement_revision", "m1")).toThrow();

    const db3 = dbFixture();
    db3.stockMovements[0] = { ...db3.stockMovements[0], work_order_id: undefined };
    db3.grns[0] = { ...db3.grns[0], work_order_id: "another-work-order" };
    expect(() => resolveEntityContext(db3, "stock_movement", "sm1")).toThrow();
  });

  test("deleting a canonical owner also removes its polymorphic file attachment", () => {
    const db = dbFixture();
    const result = cascadeDelete(db, "contractorBills", "cb1");
    expect(result.result.success).toBe(true);
    expect(result.db.entityFileAttachments.some((row) => row.id === "efa-cb")).toBe(false);
  });

  test("deleting a thread also removes attachments owned by nested thread messages", () => {
    const db = dbFixture();
    db.entityFileAttachments.push({ id: "efa-msg", file_asset_id: "fa1", entity_type: "thread_message", entity_id: "msg1", role: "proof", visibility: "internal", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" });
    const result = cascadeDelete(db, "threads", "t1");
    expect(result.result.success).toBe(true);
    expect(result.db.entityFileAttachments.some((row) => row.id === "efa-msg")).toBe(false);
  });
});


describe("Phase 2 Drive routing", () => {
  test("maps every file owner to an explicit upload purpose with no customer-document fallback", () => {
    const expected: Record<string, UploadPurpose> = {
      customer: "customer_document", site: "site_evidence", room: "site_evidence", workRequired: "work_required_document",
      measurement_revision: "measurement", quotation: "quotation_document", quotation_item: "quotation_document", accepted_scope: "accepted_scope_document",
      workOrder: "work_order_document", boq: "work_order_document", boq_item: "work_order_document", variation_request: "variation_document",
      vendor_rfq: "vendor_rfq", vendor_bid: "vendor_bid", purchase_order: "purchase_order", grn: "grn_evidence", stock_movement: "stock_movement_evidence",
      vendor_bill: "vendor_bill", vendor_payment: "vendor_payment", dispatch: "dispatch_evidence", inventory: "inventory_evidence", drawing: "drawing",
      execution_log: "execution_evidence", visit: "visit_evidence", task: "task_evidence", followup: "followup_attachment", payment: "customer_payment",
      invoice: "customer_invoice", customer_receipt: "customer_receipt", vendor: "vendor_document", vendor_rate: "vendor_rate_document",
      contractor: "contractor_document", contractor_bid: "contractor_bid", contractor_bill: "contractor_bill", contractor_payment: "contractor_payment",
      contractor_settlement: "contractor_settlement", commission: "commission_document", blocked: "blocked_evidence", thread_message: "thread_attachment",
      communication: "communication_attachment", general: "general_document",
    };
    for (const [entityType, purpose] of Object.entries(expected)) {
      expect(uploadPurposeForEntity(entityType as any)).toBe(purpose);
    }
    expect(Object.keys(expected)).toHaveLength(41);
  });

  test("rejects mismatched purposes but preserves the two intentional workflow overrides", () => {
    expect(uploadPurposeAllowedForEntity("vendor_payment", "customer_document")).toBe(false);
    expect(uploadPurposeAllowedForEntity("contractor_bill", "contractor_document")).toBe(false);
    expect(uploadPurposeAllowedForEntity("customer", "communication_attachment")).toBe(true);
    expect(uploadPurposeAllowedForEntity("visit", "measurement")).toBe(true);
    expect(uploadPurposeAllowedForEntity("general", "import_source")).toBe(true);
  });



  test("routes valid general stock procurement without inventing a Work Order", () => {
    const db = dbFixture();
    db.purchaseOrders.push({ id: "po-stock", po_no: "PO-STOCK", vendor_id: "v1", vendor_name: "Build Mart", items: [], subtotal: 0, tax: 0, total: 0, status: "issued", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.grns.push({ id: "g-stock", grn_no: "GRN-STOCK", po_id: "po-stock", po_no: "PO-STOCK", vendor_id: "v1", vendor_name: "Build Mart", items: [], status: "received", received_at: "2026-08-14T00:00:00.000Z", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.vendorBills.push({ id: "vb-stock", bill_no: "VB-STOCK", vendor_id: "v1", vendor_name: "Build Mart", po_id: "po-stock", po_no: "PO-STOCK", grn_id: "g-stock", grn_no: "GRN-STOCK", amount: 100, total_amount: 100, paid_amount: 0, balance_amount: 100, status: "pending", due_date: "2026-08-20", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.vendorPayments.push({ id: "vp-stock", payment_no: "VP-STOCK", vendor_bill_id: "vb-stock", vendor_id: "v1", vendor_name: "Build Mart", amount: 100, mode: "bank_transfer", reference: "UTR-STOCK", status: "paid", paid_at: "2026-08-14T00:00:00.000Z", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" });
    db.tasks.push({ id: "task-stock", title: "Check warehouse PO", po_id: "po-stock", status: "todo", priority: "medium", due_date: "2026-08-15", task_scope: "procurement", comments: [], checklist: [], proofs: [], created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.blocked.push({ id: "block-stock-po", title: "Stock PO held", reason: "Vendor confirmation pending", linked_po_id: "po-stock", created_at: "2026-08-14T00:00:00.000Z" } as any);
    db.blocked.push({ id: "block-stock-grn", title: "Stock GRN discrepancy", reason: "Quantity mismatch", linked_grn_id: "g-stock", created_at: "2026-08-14T00:00:00.000Z" } as any);

    const names = (purpose: UploadPurpose, type: any, id: string) => destinationSegments(db, purpose, type, id).map((segment) => segment.name);
    expect(resolveEntityContext(db, "purchase_order", "po-stock").workOrderId).toBeUndefined();
    expect(names("purchase_order", "purchase_order", "po-stock")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Purchase Order"]);
    expect(names("grn_evidence", "grn", "g-stock")).toEqual(["Procurement", "PO-STOCK - Build Mart", "GRNs"]);
    expect(names("vendor_bill", "vendor_bill", "vb-stock")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Vendor Bills"]);
    expect(names("vendor_payment", "vendor_payment", "vp-stock")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Vendor Payments"]);
    expect(names("task_evidence", "task", "task-stock")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Tasks"]);
    expect(names("blocked_evidence", "blocked", "block-stock-po")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Obstacles"]);
    expect(names("blocked_evidence", "blocked", "block-stock-grn")).toEqual(["Procurement", "PO-STOCK - Build Mart", "Obstacles"]);

    const mismatched = dbFixture();
    mismatched.purchaseOrders.push({ id: "po-stock", po_no: "PO-STOCK", vendor_id: "v1", vendor_name: "Build Mart", items: [], subtotal: 0, tax: 0, total: 0, status: "issued", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    mismatched.grns.push({ id: "g-stock", grn_no: "GRN-STOCK", po_id: "po-stock", po_no: "PO-STOCK", vendor_id: "v1", vendor_name: "Build Mart", site_id: "s1", items: [], status: "received", received_at: "2026-08-14T00:00:00.000Z", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    expect(() => resolveEntityContext(mismatched, "grn", "g-stock")).toThrow(/Site does not match/);
  });

  test("routes global inventory and stock movements under Inventory", () => {
    const db = dbFixture();
    db.inventory.push({ id: "i-stock", name: "Warehouse Plywood", location: "Warehouse", article_id: "art1", work_required_article_id: "wra1", unit_id: "u1", quantity: 12, created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.stockMovements.push({ id: "sm-stock", inventory_id: "i-stock", article_id: "art1", work_required_article_id: "wra1", unit_id: "u1", name: "Physical adjustment", type: "adjustment", quantity: -1, created_at: "2026-08-14T00:00:00.000Z" } as any);

    expect(destinationSegments(db, "inventory_evidence", "inventory", "i-stock").map((segment) => segment.name)).toEqual(["Inventory", "Warehouse Plywood", "Evidence"]);
    expect(destinationSegments(db, "stock_movement_evidence", "stock_movement", "sm-stock").map((segment) => segment.name)).toEqual(["Inventory", "Warehouse Plywood", "Stock Movements"]);
  });

  test("uses linked quotation/payment context for otherwise unlinked supporting records", () => {
    const db = dbFixture();
    db.blocked.push({ id: "block-q", title: "Awaiting quotation decision", reason: "Customer approval pending", linked_quotation_id: "q1", created_at: "2026-08-14T00:00:00.000Z" } as any);
    db.tasks.push({ id: "task-pay", title: "Verify advance", payment_id: "pay1", status: "todo", priority: "medium", due_date: "2026-08-15", task_scope: "finance", comments: [], checklist: [], proofs: [], created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);
    db.commissions.push({ id: "comm-q", commission_no: "COM-Q", source_partner_id: "p1", source_partner_name: "Partner", quotation_id: "q1", base_amount: 100, rate_pct: 5, amount: 5, status: "accrued", accrued_at: "2026-08-14T00:00:00.000Z", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z" } as any);

    expect(destinationSegments(db, "blocked_evidence", "blocked", "block-q").map((segment) => segment.name)).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Obstacles"]);
    expect(destinationSegments(db, "task_evidence", "task", "task-pay").map((segment) => segment.name)).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Tasks"]);
    expect(destinationSegments(db, "commission_document", "commission", "comm-q").map((segment) => segment.name)).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Commercial", "Commissions"]);
  });

  test("legacy storage-purpose inference delegates to the canonical owner mapper", () => {
    expect(inferStoragePurpose("vendor_payment")).toBe(uploadPurposeForEntity("vendor_payment"));
    expect(inferStoragePurpose("contractor_bill")).toBe(uploadPurposeForEntity("contractor_bill"));
    expect(inferStoragePurpose("visit", undefined, "measurement")).toBe("measurement");
    expect(inferStoragePurpose("general", "media")).toBe("reference_media");
  });

  test("keeps physical folder template metadata stable when multiple purposes share a folder", async () => {
    const source = await readFile("src/lib/rdash/server/direct-upload-finalize-core.ts", "utf8");
    expectTokens(source, ["existingFolderInstance?.template_id || `canonical-${serverPurpose}`"]);
    expectTokens(source, ["existingFolderInstance?.created_at || timestamp"]);
  });
  test("routes newly supported business owners into their own human-readable Drive locations", () => {
    const db = dbFixture();
    const names = (purpose: UploadPurpose, type: any, id: string) => destinationSegments(db, purpose, type, id).map((segment) => segment.name);

    expect(names("work_required_document", "workRequired", "wr1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Work Required", "False Ceiling"]);
    expect(names("accepted_scope_document", "accepted_scope", "as1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Commercial", "Approvals", "Ceiling scope"]);
    expect(names("variation_document", "variation_request", "var1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Variations"]);
    expect(names("vendor_rfq", "vendor_rfq", "rfq1")).toEqual(["Procurement", "WO-001 - Ceiling Work", "RFQs", "RFQ-001"]);
    expect(names("vendor_bid", "vendor_bid", "vbid1")).toEqual(["Procurement", "WO-001 - Ceiling Work", "RFQs", "RFQ-001", "Vendor Bids", "Build Mart"]);
    expect(names("vendor_payment", "vendor_payment", "vp1")).toEqual(["Procurement", "PO-001 - Build Mart", "Vendor Payments"]);
    expect(names("stock_movement_evidence", "stock_movement", "sm1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Inventory", "Stock Movements"]);
    expect(names("dispatch_evidence", "dispatch", "d1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Dispatches", "DSP-001"]);
    expect(names("contractor_bill", "contractor_bill", "cb1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Contractors", "Bills"]);
    expect(names("contractor_payment", "contractor_payment", "cp1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Contractors", "Payments"]);
    expect(names("customer_receipt", "customer_receipt", "cr1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Commercial", "Customer Receipts"]);
    expect(names("task_evidence", "task", "task1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Tasks"]);
    expect(names("followup_attachment", "followup", "fu1")).toEqual(["Customers", "Rajesh Sharma", "Follow-ups"]);
    expect(names("blocked_evidence", "blocked", "block1")).toEqual(["Customers", "Rajesh Sharma", "Sharma Residence", "Ceiling Work - WO-001", "Obstacles"]);
    expect(names("general_document", "general", "general")).toEqual(["System", "General"]);
  });
});
