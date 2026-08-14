import type { FileAttachmentEntityType } from "@/lib/rdash/types";
import type { UploadPurpose } from "./upload-types";

/** The one default Drive purpose for each business file owner. */
export function uploadPurposeForEntity(entityType: FileAttachmentEntityType): UploadPurpose {
  switch (entityType) {
    case "customer": return "customer_document";
    case "site":
    case "room": return "site_evidence";
    case "workRequired": return "work_required_document";
    case "measurement_revision": return "measurement";
    case "quotation":
    case "quotation_item": return "quotation_document";
    case "accepted_scope": return "accepted_scope_document";
    case "workOrder":
    case "boq":
    case "boq_item": return "work_order_document";
    case "variation_request": return "variation_document";
    case "vendor_rfq": return "vendor_rfq";
    case "vendor_bid": return "vendor_bid";
    case "purchase_order": return "purchase_order";
    case "grn": return "grn_evidence";
    case "inventory": return "inventory_evidence";
    case "stock_movement": return "stock_movement_evidence";
    case "dispatch": return "dispatch_evidence";
    case "vendor_bill": return "vendor_bill";
    case "vendor_payment": return "vendor_payment";
    case "execution_log": return "execution_evidence";
    case "visit": return "visit_evidence";
    case "drawing": return "drawing";
    case "task": return "task_evidence";
    case "followup": return "followup_attachment";
    case "payment": return "customer_payment";
    case "invoice": return "customer_invoice";
    case "customer_receipt": return "customer_receipt";
    case "vendor": return "vendor_document";
    case "vendor_rate": return "vendor_rate_document";
    case "contractor": return "contractor_document";
    case "contractor_bid": return "contractor_bid";
    case "contractor_bill": return "contractor_bill";
    case "contractor_payment": return "contractor_payment";
    case "contractor_settlement": return "contractor_settlement";
    case "commission": return "commission_document";
    case "blocked": return "blocked_evidence";
    case "communication": return "communication_attachment";
    case "thread_message": return "thread_attachment";
    case "general": return "general_document";
  }
}

export function uploadPurposeAllowedForEntity(
  entityType: FileAttachmentEntityType,
  purpose: UploadPurpose,
): boolean {
  if (entityType === "general") {
    return ["general_document", "staff_document", "import_source", "catalogue", "reference_media", "diagnostic"].includes(purpose);
  }
  // Communication compose queues the file against the Customer first; after
  // send, the same FileAsset is also linked to the Communication record.
  if (entityType === "customer" && purpose === "communication_attachment") return true;
  // Measurement capture is currently initiated from a Visit before the
  // Measurement Revision is saved; keep the file in the Site Measurements folder.
  if (entityType === "visit" && purpose === "measurement") return true;
  return uploadPurposeForEntity(entityType) === purpose;
}
