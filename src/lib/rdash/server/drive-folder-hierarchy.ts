import type { UploadPurpose } from "@/lib/uploads/upload-types";
import { resolveEntityContext } from "../entity-context";
import type { FileAttachmentEntityType, RDashDatabase } from "../types";
import {
  practicalFolderName,
  type FolderSegment as CoreFolderSegment,
} from "./direct-upload-storage-core";
import { currentDriveFolderRouting } from "./drive-folder-routing-context";

export type CanonicalFolderSegment = CoreFolderSegment & {
  legacyKeys?: string[];
};

function targetNotReady(message: string): never {
  throw new Error(`TARGET_NOT_READY:${message}`);
}

/**
 * Visible Google Drive names must come from labels people actually use in the app.
 * Stable entity IDs stay only in the hidden canonical key/appProperties registry.
 */
function entityFolder(
  label: string | undefined,
  detail: string | undefined,
  fallback: string,
  key: string,
): CanonicalFolderSegment {
  return {
    name: practicalFolderName(label, detail, fallback),
    key,
  };
}

function leaf(name: string, key: string, legacyKeys?: string[]): CanonicalFolderSegment {
  return { name, key, ...(legacyKeys?.length ? { legacyKeys } : {}) };
}

function routingText(): string {
  const routing = currentDriveFolderRouting();
  return [
    routing?.sourceFlow,
    routing?.attachmentField,
    routing?.attachmentFieldMode,
    routing?.role,
    routing?.kind,
    routing?.caption,
  ].filter(Boolean).join(" ").toLowerCase();
}

function routingContains(...tokens: string[]): boolean {
  const text = routingText();
  return tokens.some((token) => text.includes(token.toLowerCase()));
}

export function destinationSegments(
  db: RDashDatabase,
  purpose: UploadPurpose,
  entityType: FileAttachmentEntityType,
  entityId: string,
): CanonicalFolderSegment[] {
  if (purpose === "catalogue") {
    return [leaf("Library", "root:library"), leaf("Catalogues", "library:catalogues")];
  }
  if (purpose === "reference_media") {
    return [leaf("Library", "root:library"), leaf("Reference Media", "library:reference")];
  }
  if (purpose === "import_source") {
    return [leaf("System", "root:system"), leaf("Imports", "system:imports")];
  }
  if (purpose === "diagnostic") {
    return [leaf("System", "root:system"), leaf("Diagnostics", "system:diagnostics")];
  }
  if (purpose === "general_document") {
    return [leaf("System", "root:system"), leaf("General", "system:general")];
  }

  const context = resolveEntityContext(db, entityType, entityId, "Canonical Drive destination");
  const workOrder = db.workOrders.find((row) => row.id === context.workOrderId || (entityType === "workOrder" && row.id === entityId));
  const grn = db.grns.find((row) => row.id === context.grnId || (entityType === "grn" && row.id === entityId));
  const bill = db.vendorBills.find((row) => row.id === (entityType === "vendor_bill" ? entityId : undefined))
    || (entityType === "vendor_payment"
      ? db.vendorBills.find((row) => row.id === db.vendorPayments.find((payment) => payment.id === entityId)?.vendor_bill_id)
      : undefined);
  const purchaseOrderId = context.purchaseOrderId || grn?.po_id || bill?.po_id || (entityType === "purchase_order" ? entityId : undefined);
  const purchaseOrder = db.purchaseOrders.find((row) => row.id === purchaseOrderId);
  const siteId = context.siteId || workOrder?.site_id || purchaseOrder?.site_id || bill?.site_id || (entityType === "site" ? entityId : undefined);
  const site = db.sites.find((row) => row.id === siteId);
  const customerId = context.customerId || site?.customer_id || workOrder?.customer_id;
  const customer = db.customers.find((row) => row.id === customerId || (entityType === "customer" && row.id === entityId));
  const vendor = db.master.vendors.find((row) => row.id === context.vendorId || (entityType === "vendor" && row.id === entityId));
  const contractor = db.master.contractors.find((row) => row.id === context.contractorId || (entityType === "contractor" && row.id === entityId));
  const rfq = entityType === "vendor_rfq"
    ? db.vendorRfqs.find((row) => row.id === entityId)
    : entityType === "vendor_bid"
      ? db.vendorRfqs.find((row) => row.id === db.vendorBids.find((bid) => bid.id === entityId)?.rfq_id)
      : undefined;
  const vendorBid = entityType === "vendor_bid" ? db.vendorBids.find((row) => row.id === entityId) : undefined;
  const dispatch = entityType === "dispatch" ? db.dispatches.find((row) => row.id === entityId) : undefined;
  const workRequired = entityType === "workRequired" ? db.workRequired.find((row) => row.id === entityId) : undefined;
  const acceptedScope = entityType === "accepted_scope" ? db.acceptedScopes.find((row) => row.id === entityId) : undefined;
  const stockMovement = entityType === "stock_movement" ? db.stockMovements.find((row) => row.id === entityId) : undefined;
  const inventory = entityType === "inventory"
    ? db.inventory.find((row) => row.id === entityId)
    : stockMovement
      ? db.inventory.find((row) => row.id === stockMovement.inventory_id)
      : undefined;

  const customerRoot = (): CanonicalFolderSegment[] => {
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [
      leaf("Customers", "root:customers"),
      entityFolder(customer.name, undefined, "Customer", `customer:${customer.id}`),
    ];
  };

  const siteRoot = (): CanonicalFolderSegment[] => {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [
      ...customerRoot(),
      entityFolder(site.name, site.locality || site.city, "Site", `site:${site.id}`),
    ];
  };

  const workOrderRoot = (): CanonicalFolderSegment[] => {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [
      ...siteRoot(),
      entityFolder(workOrder.title, workOrder.work_order_no, "Work Order", `work_order:${workOrder.id}`),
    ];
  };

  const purchaseOrderRoot = (): CanonicalFolderSegment[] => {
    if (!purchaseOrder) targetNotReady("The related Purchase Order is not synchronized yet.");
    return [
      leaf("Procurement", "root:procurement"),
      entityFolder(purchaseOrder.po_no, purchaseOrder.vendor_name, "Purchase Order", `purchase_order:${purchaseOrder.id}`),
    ];
  };

  const procurementWorkOrderRoot = (): CanonicalFolderSegment[] => {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [
      leaf("Procurement", "root:procurement"),
      entityFolder(workOrder.work_order_no, workOrder.title, "Work Order", `procurement:work_order:${workOrder.id}`),
    ];
  };

  const commercialRoot = (): CanonicalFolderSegment[] => {
    if (site) {
      return [
        ...siteRoot(),
        leaf("Commercial", `site:${site.id}:commercial`, customer ? [`customer:${customer.id}:commercial`] : undefined),
      ];
    }
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [...customerRoot(), leaf("Commercial", `customer:${customer.id}:commercial`)];
  };

  const vendorRoot = (): CanonicalFolderSegment[] => {
    if (!vendor) targetNotReady("The related Vendor is not synchronized yet.");
    return [
      leaf("Vendors", "root:vendors"),
      entityFolder(vendor.name, vendor.locality || vendor.city, "Vendor", `vendor:${vendor.id}`),
    ];
  };

  const contractorRoot = (): CanonicalFolderSegment[] => {
    if (!contractor) targetNotReady("The related Contractor is not synchronized yet.");
    return [
      leaf("Contractors", "root:contractors"),
      entityFolder(
        contractor.name,
        contractor.categories?.[0] || contractor.locality || contractor.city,
        "Contractor",
        `contractor:${contractor.id}`,
      ),
    ];
  };

  const inventoryRoot = (): CanonicalFolderSegment[] => {
    if (!inventory) targetNotReady("The related Inventory item is not synchronized yet.");
    return [
      leaf("Inventory", "root:inventory"),
      entityFolder(inventory.name, inventory.location, "Inventory Item", `inventory:${inventory.id}`),
    ];
  };

  if (purpose === "customer_document") {
    if (routingContains("approval") && site) {
      return [...commercialRoot(), leaf("Approvals", `${site ? `site:${site.id}` : `customer:${customer?.id}`}:commercial:approvals`)];
    }
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    const category = routingContains("kyc", "aadhaar", "aadhar", "pan", "gst", "identity")
      ? leaf("KYC", `customer:${customer.id}:documents:kyc`)
      : leaf("General", `customer:${customer.id}:documents:general`);
    return [...customerRoot(), leaf("Customer Documents", `customer:${customer.id}:documents`), category];
  }
  if (purpose === "communication_attachment") {
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [...customerRoot(), leaf("Communications", `customer:${customer.id}:communications`)];
  }
  if (purpose === "thread_attachment") {
    if (workOrder) return [...workOrderRoot(), leaf("Thread Attachments", `work_order:${workOrder.id}:threads`)];
    if (site) return [...siteRoot(), leaf("Thread Attachments", `site:${site.id}:threads`)];
    if (customer) return [...customerRoot(), leaf("Thread Attachments", `customer:${customer.id}:threads`)];
    if (vendor) return [...vendorRoot(), leaf("Thread Attachments", `vendor:${vendor.id}:threads`)];
    if (contractor) return [...contractorRoot(), leaf("Thread Attachments", `contractor:${contractor.id}:threads`)];
    targetNotReady("The Thread Message has no routable business context.");
  }
  if (purpose === "site_evidence") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [...siteRoot(), leaf("Site Evidence", `site:${site.id}:evidence`)];
  }
  if (purpose === "visit_evidence") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [...siteRoot(), leaf("Visits", `site:${site.id}:visits`)];
  }
  if (purpose === "measurement") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [...siteRoot(), leaf("Measurements", `site:${site.id}:measurements`)];
  }
  if (purpose === "work_required_document") {
    if (!site || !workRequired) targetNotReady("The related Work Required record is not synchronized yet.");
    return [
      ...siteRoot(),
      leaf("Work Required", `site:${site.id}:work-required`),
      entityFolder(workRequired.title, undefined, "Work Required", `work_required:${workRequired.id}`),
    ];
  }
  if (purpose === "drawing") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    const drawingState = routingContains("superseded", "archive")
      ? leaf("Superseded", `site:${site.id}:drawings:superseded`)
      : leaf("Current", `site:${site.id}:drawings:current`);
    return [...siteRoot(), leaf("Drawings", `site:${site.id}:drawings`), drawingState];
  }
  if (purpose === "quotation_document") {
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [...commercialRoot(), leaf("Quotations", `${site ? `site:${site.id}` : `customer:${customer.id}`}:commercial:quotations`)];
  }
  if (purpose === "accepted_scope_document") {
    if (!acceptedScope) targetNotReady("The related Accepted Scope is not synchronized yet.");
    return [
      ...commercialRoot(),
      leaf("Approvals", `${site ? `site:${site.id}` : `customer:${customer?.id}`}:commercial:approvals`),
      entityFolder(acceptedScope.label, undefined, "Accepted Scope", `accepted_scope:${acceptedScope.id}`),
    ];
  }
  if (purpose === "customer_payment") {
    return [...commercialRoot(), leaf("Payment Documents", `${site ? `site:${site.id}` : `customer:${customer?.id}`}:commercial:payments`)];
  }
  if (purpose === "customer_invoice") {
    return [...commercialRoot(), leaf("Customer Invoices", `${site ? `site:${site.id}` : `customer:${customer?.id}`}:commercial:customer-invoices`)];
  }
  if (purpose === "customer_receipt") {
    return [...commercialRoot(), leaf("Customer Receipts", `${site ? `site:${site.id}` : `customer:${customer?.id}`}:commercial:customer-receipts`)];
  }
  if (purpose === "work_order_document") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    const category = routingContains("completion", "handover", "closeout")
      ? leaf("Completion", `work_order:${workOrder.id}:completion`)
      : leaf("Documents", `work_order:${workOrder.id}:documents`);
    return [...workOrderRoot(), category];
  }
  if (purpose === "variation_document") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Variations", `work_order:${workOrder.id}:variations`)];
  }
  if (purpose === "execution_evidence") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    const category = routingContains("contractor_material_receipt", "contractor_confirmation_attachment_id", "material receipt")
      ? leaf("Material Receipts", `work_order:${workOrder.id}:material-receipts`)
      : routingContains("variation", "change order", "extra work")
        ? leaf("Variations", `work_order:${workOrder.id}:variations`)
        : routingContains("completion", "handover", "closeout")
          ? leaf("Completion", `work_order:${workOrder.id}:completion`)
          : leaf("Execution", `work_order:${workOrder.id}:execution`);
    return [...workOrderRoot(), category];
  }
  if (purpose === "vendor_rfq") {
    if (!rfq) targetNotReady("The related Vendor RFQ is not synchronized yet.");
    return [...procurementWorkOrderRoot(), leaf("RFQs", `procurement:work_order:${rfq.work_order_id}:rfqs`), entityFolder(rfq.rfq_no, undefined, "RFQ", `vendor_rfq:${rfq.id}`)];
  }
  if (purpose === "vendor_bid") {
    if (!rfq || !vendorBid || !vendor) targetNotReady("The related Vendor Bid is not synchronized yet.");
    return [
      ...procurementWorkOrderRoot(),
      leaf("RFQs", `procurement:work_order:${rfq.work_order_id}:rfqs`),
      entityFolder(rfq.rfq_no, undefined, "RFQ", `vendor_rfq:${rfq.id}`),
      leaf("Vendor Bids", `vendor_rfq:${rfq.id}:bids`),
      entityFolder(vendor.name, undefined, vendorBid.vendor_name || "Vendor", `vendor_bid:${vendorBid.id}`),
    ];
  }
  if (purpose === "purchase_order") {
    if (!purchaseOrder) targetNotReady("The related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("Purchase Order", `purchase_order:${purchaseOrder.id}:documents`)];
  }
  if (purpose === "grn_evidence") {
    if (!purchaseOrder) targetNotReady("The GRN's related Purchase Order is not synchronized yet.");
    const category = routingContains("delivery_challan_attachment_id", "delivery challan", "challan")
      ? leaf("Delivery Challans", `purchase_order:${purchaseOrder.id}:delivery-challans`)
      : routingContains("receiving_proof_attachment_ids", "receiving proof", "receiving evidence")
        ? leaf("Receiving Evidence", `purchase_order:${purchaseOrder.id}:receiving-evidence`)
        : leaf("GRNs", `purchase_order:${purchaseOrder.id}:grns`);
    return [...purchaseOrderRoot(), category];
  }
  if (purpose === "vendor_bill") {
    if (!purchaseOrder) targetNotReady("The Vendor Bill's related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("Vendor Bills", `purchase_order:${purchaseOrder.id}:vendor-bills`)];
  }
  if (purpose === "vendor_payment") {
    if (!purchaseOrder) targetNotReady("The Vendor Payment's related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("Vendor Payments", `purchase_order:${purchaseOrder.id}:vendor-payments`)];
  }
  if (purpose === "inventory_evidence") {
    if (workOrder) return [...workOrderRoot(), leaf("Inventory", `work_order:${workOrder.id}:inventory`)];
    if (!inventory) targetNotReady("The related Inventory item is not synchronized yet.");
    return [...inventoryRoot(), leaf("Evidence", `inventory:${inventory.id}:evidence`)];
  }
  if (purpose === "stock_movement_evidence") {
    if (workOrder) return [...workOrderRoot(), leaf("Inventory", `work_order:${workOrder.id}:inventory`), leaf("Stock Movements", `work_order:${workOrder.id}:stock-movements`)];
    if (!inventory) targetNotReady("The related Inventory item is not synchronized yet.");
    return [...inventoryRoot(), leaf("Stock Movements", `inventory:${inventory.id}:stock-movements`)];
  }
  if (purpose === "dispatch_evidence") {
    if (!workOrder || !dispatch) targetNotReady("The related Dispatch is not synchronized yet.");
    return [
      ...workOrderRoot(),
      leaf("Dispatches", `work_order:${workOrder.id}:dispatches`),
      entityFolder(dispatch.dispatch_no, undefined, "Dispatch", `dispatch:${dispatch.id}`),
    ];
  }
  if (purpose === "vendor_document") {
    const category = routingContains("catalogue", "catalog")
      ? leaf("Catalogues", `vendor:${vendor?.id}:catalogues`)
      : leaf("Business Documents", `vendor:${vendor?.id}:business-documents`);
    return [...vendorRoot(), category];
  }
  if (purpose === "vendor_rate_document") {
    return [...vendorRoot(), leaf("Rate Sheets", `vendor:${vendor?.id}:rate-sheets`)];
  }
  if (purpose === "contractor_document") {
    const category = routingContains("photo_attachment_id", "contractor photo", "profile") && !routingContains("business_card_attachment_id", "business card")
      ? leaf("Profile", `contractor:${contractor?.id}:profile`)
      : leaf("Business Documents", `contractor:${contractor?.id}:business-documents`);
    return [...contractorRoot(), category];
  }
  if (purpose === "contractor_bid") {
    if (workOrder) return [...workOrderRoot(), leaf("Contractors", `work_order:${workOrder.id}:contractors`), leaf("Bids", `work_order:${workOrder.id}:contractor-bids`)];
    return [...contractorRoot(), leaf("Bids", `contractor:${contractor?.id}:bids`)];
  }
  if (purpose === "contractor_bill") {
    if (!workOrder) targetNotReady("The Contractor Bill's related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Contractors", `work_order:${workOrder.id}:contractors`), leaf("Bills", `work_order:${workOrder.id}:contractor-bills`)];
  }
  if (purpose === "contractor_payment") {
    if (!workOrder) targetNotReady("The Contractor Payment's related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Contractors", `work_order:${workOrder.id}:contractors`), leaf("Payments", `work_order:${workOrder.id}:contractor-payments`)];
  }
  if (purpose === "contractor_settlement") {
    if (!workOrder) targetNotReady("The Contractor Settlement's related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Contractors", `work_order:${workOrder.id}:contractors`), leaf("Settlement", `work_order:${workOrder.id}:contractor-settlement`)];
  }
  if (purpose === "task_evidence") {
    if (workOrder) return [...workOrderRoot(), leaf("Tasks", `work_order:${workOrder.id}:tasks`)];
    if (site) return [...siteRoot(), leaf("Tasks", `site:${site.id}:tasks`)];
    if (customer) return [...customerRoot(), leaf("Tasks", `customer:${customer.id}:tasks`)];
    if (purchaseOrder) return [...purchaseOrderRoot(), leaf("Tasks", `purchase_order:${purchaseOrder.id}:tasks`)];
    targetNotReady("The Task has no routable Customer, Site, Work Order, or Purchase Order.");
  }
  if (purpose === "followup_attachment") {
    if (!customer) targetNotReady("The Follow-up has no related Customer.");
    return [...customerRoot(), leaf("Follow-ups", `customer:${customer.id}:followups`)];
  }
  if (purpose === "commission_document") {
    if (workOrder) return [...workOrderRoot(), leaf("Commissions", `work_order:${workOrder.id}:commissions`)];
    if (site) return [...commercialRoot(), leaf("Commissions", `site:${site.id}:commercial:commissions`)];
    if (customer) return [...commercialRoot(), leaf("Commissions", `customer:${customer.id}:commercial:commissions`)];
    targetNotReady("The Commission has no routable Customer, Site, or Work Order.");
  }
  if (purpose === "blocked_evidence") {
    if (workOrder) return [...workOrderRoot(), leaf("Obstacles", `work_order:${workOrder.id}:obstacles`)];
    if (site) return [...siteRoot(), leaf("Obstacles", `site:${site.id}:obstacles`)];
    if (customer) return [...customerRoot(), leaf("Obstacles", `customer:${customer.id}:obstacles`)];
    if (purchaseOrder) return [...purchaseOrderRoot(), leaf("Obstacles", `purchase_order:${purchaseOrder.id}:obstacles`)];
    targetNotReady("The Obstacle has no routable Customer, Site, Work Order, or Purchase Order.");
  }
  if (purpose === "staff_document") {
    const staff = db.master.staff.find((row) => row.id === entityId);
    if (!staff) targetNotReady("The related Staff record is not synchronized yet.");
    return [
      leaf("Staff", "root:staff"),
      entityFolder(staff.name, undefined, "Staff", `staff:${staff.id}`),
      leaf("Documents", `staff:${staff.id}:documents`),
    ];
  }

  throw new Error(`No Drive destination is configured for upload purpose ${purpose}.`);
}
