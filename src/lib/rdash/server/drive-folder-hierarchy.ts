import type { UploadPurpose } from "@/lib/uploads/upload-types";
import { resolveEntityContext } from "../entity-context";
import type { FileAttachmentEntityType, RDashDatabase } from "../types";
import {
  practicalFolderName,
  safeSegment,
  type FolderSegment as CoreFolderSegment,
} from "./direct-upload-storage-core";

export type CanonicalFolderSegment = CoreFolderSegment & {
  legacyKeys?: string[];
};

function targetNotReady(message: string): never {
  throw new Error(`TARGET_NOT_READY:${message}`);
}

function shortId(value: string | undefined): string {
  return safeSegment((value || "unknown").replace(/[^a-zA-Z0-9]/g, "").slice(-8), "unknown");
}

function entityFolder(
  prefix: "CUST" | "SITE" | "VEND" | "CONT" | "STAFF",
  id: string,
  label: string | undefined,
  detail: string | undefined,
  fallback: string,
  key: string,
): CanonicalFolderSegment {
  const display = practicalFolderName(label, detail, fallback);
  return {
    name: `${prefix}-${shortId(id)} - ${display}`,
    key,
  };
}

function leaf(name: string, key: string, legacyKeys?: string[]): CanonicalFolderSegment {
  return { name, key, ...(legacyKeys?.length ? { legacyKeys } : {}) };
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
    return [leaf("_System", "root:system"), leaf("Imports", "system:imports")];
  }
  if (purpose === "diagnostic") {
    return [leaf("_System", "root:system"), leaf("Diagnostics", "system:diagnostics")];
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
      entityFolder("CUST", customer.id, customer.name, undefined, "Customer", `customer:${customer.id}`),
    ];
  };

  const siteRoot = (): CanonicalFolderSegment[] => {
    if (!site) targetNotReady("The related Site is not synchronized yet.");
    return [
      ...customerRoot(),
      entityFolder("SITE", site.id, site.name, site.locality || site.city, "Site", `site:${site.id}`),
    ];
  };

  const workOrderRoot = (): CanonicalFolderSegment[] => {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [
      ...siteRoot(),
      leaf(safeSegment(workOrder.work_order_no, `WO-${shortId(workOrder.id)}`), `work_order:${workOrder.id}`),
    ];
  };

  const purchaseOrderRoot = (): CanonicalFolderSegment[] => {
    if (!purchaseOrder) targetNotReady("The related Purchase Order is not synchronized yet.");
    return [
      leaf("Procurement", "root:procurement"),
      leaf(safeSegment(purchaseOrder.po_no, `PO-${shortId(purchaseOrder.id)}`), `purchase_order:${purchaseOrder.id}`),
    ];
  };

  if (purpose === "customer_document") {
    if (!customer) targetNotReady("The related Customer is not synchronized yet.");
    return [
      ...customerRoot(),
      leaf("Customer Documents", `customer:${customer.id}:documents`),
      leaf("General", `customer:${customer.id}:documents:general`),
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
    return [
      ...siteRoot(),
      leaf("Drawings", `site:${site.id}:drawings`),
      leaf("Current", `site:${site.id}:drawings:current`),
    ];
  }
  if (purpose === "quotation_document") {
    if (!site || !customer) targetNotReady("The related Site is not synchronized yet.");
    return [
      ...siteRoot(),
      leaf("Commercial", `site:${site.id}:commercial`, [`customer:${customer.id}:commercial`]),
      leaf("Quotations", `site:${site.id}:commercial:quotations`),
    ];
  }
  if (purpose === "customer_invoice") {
    if (!site || !customer) targetNotReady("The related Site is not synchronized yet.");
    return [
      ...siteRoot(),
      leaf("Commercial", `site:${site.id}:commercial`, [`customer:${customer.id}:commercial`]),
      leaf("Customer Invoices", `site:${site.id}:commercial:customer-invoices`),
    ];
  }
  if (purpose === "work_order_document") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Documents", `work_order:${workOrder.id}:documents`)];
  }
  if (purpose === "execution_evidence") {
    if (!workOrder) targetNotReady("The related Work Order is not synchronized yet.");
    return [...workOrderRoot(), leaf("Execution", `work_order:${workOrder.id}:execution`)];
  }
  if (purpose === "purchase_order") {
    if (!purchaseOrder) targetNotReady("The related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("Purchase Order", `purchase_order:${purchaseOrder.id}:documents`)];
  }
  if (purpose === "grn_evidence") {
    if (!purchaseOrder) targetNotReady("The GRN's related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("GRNs", `purchase_order:${purchaseOrder.id}:grns`)];
  }
  if (purpose === "vendor_bill") {
    if (!purchaseOrder) targetNotReady("The Vendor Bill's related Purchase Order is not synchronized yet.");
    return [...purchaseOrderRoot(), leaf("Vendor Bills", `purchase_order:${purchaseOrder.id}:vendor-bills`)];
  }
  if (purpose === "vendor_document") {
    if (!vendor) targetNotReady("The related Vendor is not synchronized yet.");
    return [
      leaf("Vendors", "root:vendors"),
      entityFolder("VEND", vendor.id, vendor.name, vendor.locality || vendor.city, "Vendor", `vendor:${vendor.id}`),
      leaf("Business Documents", `vendor:${vendor.id}:business-documents`),
    ];
  }
  if (purpose === "contractor_document") {
    if (!contractor) targetNotReady("The related Contractor is not synchronized yet.");
    return [
      leaf("Contractors", "root:contractors"),
      entityFolder(
        "CONT",
        contractor.id,
        contractor.name,
        contractor.categories?.[0] || contractor.locality || contractor.city,
        "Contractor",
        `contractor:${contractor.id}`,
      ),
      leaf("Business Documents", `contractor:${contractor.id}:business-documents`),
    ];
  }
  if (purpose === "staff_document") {
    const staff = db.master.staff.find((row) => row.id === entityId);
    if (!staff) targetNotReady("The related Staff record is not synchronized yet.");
    return [
      leaf("Staff", "root:staff"),
      entityFolder("STAFF", staff.id, staff.name, undefined, "Staff", `staff:${staff.id}`),
      leaf("Documents", `staff:${staff.id}:documents`),
    ];
  }

  throw new Error(`No Drive destination is configured for upload purpose ${purpose}.`);
}
