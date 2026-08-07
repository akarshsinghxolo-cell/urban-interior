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

  let context: ReturnType<typeof resolveEntityContext> | undefined;
  try {
    context = resolveEntityContext(db, entityType, entityId, "Canonical Drive destination");
  } catch {
    context = undefined;
  }

  const workOrder = db.workOrders.find((row) =>
    row.id === context?.workOrderId || (entityType === "workOrder" ? row.id === entityId : false));
  const grn = db.grns.find((row) =>
    row.id === context?.grnId || (entityType === "grn" ? row.id === entityId : false));
  const bill = db.vendorBills.find((row) => entityType === "vendor_bill" && row.id === entityId);
  const purchaseOrderId = context?.purchaseOrderId || grn?.po_id || bill?.po_id ||
    (entityType === "purchase_order" ? entityId : undefined);
  const purchaseOrder = db.purchaseOrders.find((row) => row.id === purchaseOrderId);
  const siteId = context?.siteId || workOrder?.site_id || purchaseOrder?.site_id || bill?.site_id ||
    (entityType === "site" ? entityId : undefined);
  const site = db.sites.find((row) => row.id === siteId);
  const customerId = context?.customerId || site?.customer_id || workOrder?.customer_id;
  const customer = db.customers.find((row) => row.id === customerId ||
    (entityType === "customer" ? row.id === entityId : false));
  const vendor = db.master.vendors.find((row) =>
    row.id === context?.vendorId || (entityType === "vendor" ? row.id === entityId : false));
  const contractor = db.master.contractors.find((row) =>
    row.id === context?.contractorId || (entityType === "contractor" ? row.id === entityId : false));

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

  const siteCommercialRoot = (): CanonicalFolderSegment[] => {
    if (!site || !customer) targetNotReady("The related Site is not synchronized yet.");
    return [
      ...siteRoot(),
      leaf("Commercial", `site:${site.id}:commercial`, [`customer:${customer.id}:commercial`]),
    ];
  };

  if (purpose === "customer_document") {
    if (routingContains("approval") && site) {
      return [...siteCommercialRoot(), leaf("Approvals", `site:${site.id}:commercial:approvals`)];
    }
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    const category = routingContains("kyc", "aadhaar", "aadhar", "pan", "gst", "identity")
      ? leaf("KYC", `customer:${customer.id}:documents:kyc`)
      : leaf("General", `customer:${customer.id}:documents:general`);
    return [
      ...customerRoot(),
      leaf("Customer Documents", `customer:${customer.id}:documents`),
      category,
    ];
  }
  if (purpose === "communication_attachment") {
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [...customerRoot(), leaf("Communications", `customer:${customer.id}:communications`)];
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
  if (purpose === "drawing") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    const drawingState = routingContains("superseded", "archive")
      ? leaf("Superseded", `site:${site.id}:drawings:superseded`)
      : leaf("Current", `site:${site.id}:drawings:current`);
    return [...siteRoot(), leaf("Drawings", `site:${site.id}:drawings`), drawingState];
  }
  if (purpose === "quotation_document") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [...siteCommercialRoot(), leaf("Quotations", `site:${site.id}:commercial:quotations`)];
  }
  if (purpose === "customer_invoice") {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [...siteCommercialRoot(), leaf("Customer Invoices", `site:${site.id}:commercial:customer-invoices`)];
  }
  if (purpose === "work_order_document") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    const category = routingContains("variation", "change order", "extra work")
      ? leaf("Variations", `work_order:${workOrder.id}:variations`)
      : routingContains("completion", "handover", "closeout")
        ? leaf("Completion", `work_order:${workOrder.id}:completion`)
        : leaf("Documents", `work_order:${workOrder.id}:documents`);
    return [...workOrderRoot(), category];
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
  if (purpose === "vendor_document") {
    if (!vendor) targetNotReady("The related Vendor is not synchronized yet.");
    const category = routingContains("catalogue", "catalog")
      ? leaf("Catalogues", `vendor:${vendor.id}:catalogues`)
      : routingContains("bill", "invoice", "payment", "receipt")
        ? leaf("Bills", `vendor:${vendor.id}:bills`)
        : leaf("Business Documents", `vendor:${vendor.id}:business-documents`);
    return [
      leaf("Vendors", "root:vendors"),
      entityFolder(vendor.name, vendor.locality || vendor.city, "Vendor", `vendor:${vendor.id}`),
      category,
    ];
  }
  if (purpose === "contractor_document") {
    if (!contractor) targetNotReady("The related Contractor is not synchronized yet.");
    const category = routingContains("photo_attachment_id", "contractor photo", "profile") &&
      !routingContains("business_card_attachment_id", "business card")
      ? leaf("Profile", `contractor:${contractor.id}:profile`)
      : routingContains("payment", "settlement", "bill", "receipt")
        ? leaf("Payment Documents", `contractor:${contractor.id}:payment-documents`)
        : leaf("Business Documents", `contractor:${contractor.id}:business-documents`);
    return [
      leaf("Contractors", "root:contractors"),
      entityFolder(
        contractor.name,
        contractor.categories?.[0] || contractor.locality || contractor.city,
        "Contractor",
        `contractor:${contractor.id}`,
      ),
      category,
    ];
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
