import { formatINR, titleCase } from "./format";
import { resolveRenderer } from "./modules";
import type { RDashDatabase } from "./types";
import type {
  ContextHistoryEntry,
  DetailPanelKind,
  DetailPanelState,
} from "./store/ui-types";

export type PresentableDetailKind = Exclude<DetailPanelKind, null>;

export function workspaceRecordKindLabel(kind: PresentableDetailKind): string {
  const labels: Partial<Record<PresentableDetailKind, string>> = {
    workOrder: "Work Order",
    workRequired: "Work Required",
    vendorBill: "Vendor Bill",
    vendorPayment: "Vendor Payment",
    vendorRate: "Vendor Rate",
    contractorBill: "Contractor Bill",
    contractorPayment: "Contractor Payment",
    po: "Purchase Order",
    grn: "GRN",
    boq: "BOQ",
  };
  return labels[kind] || titleCase(kind);
}

export function workspaceRecordForPresentation(
  db: RDashDatabase,
  kind: PresentableDetailKind,
  id: string,
): any | undefined {
  switch (kind) {
    case "quotation": return db.quotations.find((row) => row.id === id);
    case "workOrder": return db.workOrders.find((row) => row.id === id);
    case "task": return db.tasks.find((row) => row.id === id);
    case "followup": return db.followups.find((row) => row.id === id);
    case "visit": return db.visits.find((row) => row.id === id);
    case "payment": return db.payments.find((row) => row.id === id);
    case "invoice": return db.invoices.find((row) => row.id === id);
    case "po": return db.purchaseOrders.find((row) => row.id === id);
    case "grn": return db.grns.find((row) => row.id === id);
    case "dispatch": return db.dispatches.find((row) => row.id === id);
    case "boq": return db.boqs.find((row) => row.id === id);
    case "vendorBill": return db.vendorBills.find((row) => row.id === id);
    case "vendorPayment": return db.vendorPayments.find((row) => row.id === id);
    case "commission": return db.commissions.find((row) => row.id === id);
    case "blocked": return db.blocked.find((row) => row.id === id);
    case "customer": return db.customers.find((row) => row.id === id);
    case "site": return db.sites.find((row) => row.id === id);
    case "area": return db.areas.find((row) => row.id === id);
    case "workRequired": return db.workRequired.find((row) => row.id === id);
    case "inventory": return db.inventory.find((row) => row.id === id);
    case "vendor": return db.master.vendors.find((row) => row.id === id);
    case "vendorRate": return db.master.vendorRates.find((row) => row.id === id);
    case "contractor": return db.master.contractors.find((row) => row.id === id);
    case "contractorBill": return db.contractorBills.find((row) => row.id === id);
    case "contractorPayment": return db.contractorPayments.find((row) => row.id === id);
    case "staff": return db.master.staff.find((row) => row.id === id);
    case "audit": return db.auditLog.find((row) => row.id === id);
    case "media": return db.master.fileAssets.find((row) => row.id === id);
  }
}

/**
 * Human-readable record title used by routed browser titles and shell
 * breadcrumbs. It intentionally mirrors the existing DetailPanel header naming
 * so route chrome and the record inspector describe the same entity.
 */
export function workspaceRecordTitle(
  db: RDashDatabase,
  kind: PresentableDetailKind,
  id: string,
): string {
  const record = workspaceRecordForPresentation(db, kind, id);
  if (!record) return workspaceRecordKindLabel(kind);

  switch (kind) {
    case "quotation": return [record.quotation_no, record.title].filter(Boolean).join(" · ");
    case "workOrder": return [record.work_order_no, record.title].filter(Boolean).join(" · ");
    case "task": return record.title || "Task";
    case "followup": return record.title || "Follow-up";
    case "visit": return [titleCase(record.visit_type || "visit"), record.location_name].filter(Boolean).join(" · ");
    case "payment": return [formatINR(record.amount || 0), record.customer_name || "Customer"].join(" · ");
    case "invoice": return [record.invoice_no || "Invoice", record.customer_name || "Customer"].join(" · ");
    case "po": return [record.po_no || "Purchase Order", record.vendor_name || "Vendor"].join(" · ");
    case "grn": return [record.grn_no || "GRN", record.vendor_name || "Vendor"].join(" · ");
    case "dispatch": return [record.dispatch_no || "Dispatch", record.customer_name || "Customer"].join(" · ");
    case "boq": return ["BOQ", record.title].filter(Boolean).join(" · ");
    case "vendorBill": return [record.bill_no || "Vendor Bill", record.vendor_name || "Vendor"].join(" · ");
    case "vendorPayment": return [record.payment_no || "Vendor Payment", record.vendor_name || "Vendor"].join(" · ");
    case "commission": return [record.commission_no || "Commission", record.source_partner_name || "Partner"].join(" · ");
    case "blocked": return record.title || "Blocked Item";
    case "customer": return record.name || "Customer";
    case "site": return record.name || "Site";
    case "area": {
      const site = db.sites.find((row) => row.id === record.site_id);
      return [site?.name || "Site", record.name || "Area"].join(" · ");
    }
    case "workRequired": return record.title || "Work Required";
    case "inventory": return [record.article_name || record.name || "Inventory", record.location_name || record.location || "Stock"].join(" · ");
    case "vendor": return record.name || "Vendor";
    case "vendorRate": return [record.article_name || "Vendor Rate", formatINR(record.rate || 0)].join(" · ");
    case "contractor": return record.name || "Contractor";
    case "contractorBill": return [record.bill_no || "Contractor Bill", record.contractor_name || "Contractor"].join(" · ");
    case "contractorPayment": return [record.payment_no || "Contractor Payment", record.contractor_name || "Contractor"].join(" · ");
    case "staff": return record.name || "Staff";
    case "audit": return [titleCase(record.kind || "event"), record.entity_label || record.entity_type || "Audit"].join(" · ");
    case "media": return record.file_name || "Media";
  }
}

export function workspaceViewLabel(
  detail: DetailPanelState,
  contextHistory: ContextHistoryEntry[],
  contextHistoryIndex: number,
): string | undefined {
  if (!detail.kind || !detail.recordId) return undefined;
  const current = contextHistoryIndex >= 0 ? contextHistory[contextHistoryIndex] : undefined;
  const view = detail.kind === "customer"
    ? current?.kind === "customer" ? current.customerTab || "overview" : "overview"
    : detail.panelTab || current?.detailTab || "overview";
  return view === "overview" ? undefined : titleCase(view);
}

export interface WorkspaceLocationPresentation {
  moduleLabel: string;
  kindLabel?: string;
  recordLabel?: string;
  customerContextLabel?: string;
  viewLabel?: string;
  documentTitle: string;
}

export function workspaceLocationPresentation(input: {
  db: RDashDatabase;
  moduleId: string;
  detail: DetailPanelState;
  contextHistory: ContextHistoryEntry[];
  contextHistoryIndex: number;
}): WorkspaceLocationPresentation {
  const { db, moduleId, detail, contextHistory, contextHistoryIndex } = input;
  let moduleLabel: string;
  try {
    moduleLabel = resolveRenderer(moduleId).label;
  } catch {
    moduleLabel = titleCase(moduleId || "workspace");
  }

  if (!detail.kind || !detail.recordId) {
    return {
      moduleLabel,
      documentTitle: `${moduleLabel} | Urban Castle`,
    };
  }

  const recordLabel = workspaceRecordTitle(db, detail.kind, detail.recordId);
  const root = contextHistory.find((entry) => entry.kind === "customer" && entry.customerId);
  const customerContextLabel = root?.customerId && detail.kind !== "customer"
    ? workspaceRecordTitle(db, "customer", root.customerId)
    : undefined;
  const viewLabel = workspaceViewLabel(detail, contextHistory, contextHistoryIndex);
  const titleParts = [recordLabel, viewLabel, moduleLabel].filter(Boolean);

  return {
    moduleLabel,
    kindLabel: workspaceRecordKindLabel(detail.kind),
    recordLabel,
    customerContextLabel,
    viewLabel,
    documentTitle: `${titleParts.join(" · ")} | Urban Castle`,
  };
}
