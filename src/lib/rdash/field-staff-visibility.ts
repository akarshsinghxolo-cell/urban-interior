import type { RDashDatabase } from "./types";
import type { AuthenticatedWorkspaceUser } from "./store/ui-types";

type Viewer = Pick<AuthenticatedWorkspaceUser, "name" | "role" | "staffId">;
type AnyRow = Record<string, unknown>;
type Visible = {
  customers: Set<string>;
  sites: Set<string>;
  workRequired: Set<string>;
  workOrders: Set<string>;
  quotations: Set<string>;
  visits: Set<string>;
  payments: Set<string>;
  purchaseOrders: Set<string>;
  vendorRfqs: Set<string>;
  vendors: Set<string>;
  contractors: Set<string>;
};

const cache = new WeakMap<RDashDatabase, Map<string, RDashDatabase>>();

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

function addId(target: Set<string>, value: unknown): boolean {
  const id = String(value || "").trim();
  if (!id || target.has(id)) return false;
  target.add(id);
  return true;
}

function filterRows<T>(rows: T[], predicate: (row: T) => boolean): T[] {
  const filtered = rows.filter(predicate);
  return filtered.length === rows.length ? rows : filtered;
}

function assignedToViewer(row: AnyRow, viewer: Viewer): boolean {
  if (viewer.staffId) {
    for (const field of ["staff_id", "assignee_id", "assigned_staff_id"]) {
      if (String(row[field] || "") === viewer.staffId) return true;
    }
  }
  for (const field of ["staff_name", "assignee_name", "assigned_to"]) {
    if (normalize(row[field]) && normalize(row[field]) === normalize(viewer.name)) return true;
  }
  return normalize(row.assigned_role) === normalize(viewer.role);
}

function createdByViewer(db: RDashDatabase, viewer: Viewer): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const entry of db.auditLog || []) {
    if (entry.kind !== "create" || !entry.entity_id) continue;
    if (normalize(entry.actor) !== normalize(viewer.name)) continue;
    const type = normalize(entry.entity_type);
    const ids = result.get(type) || new Set<string>();
    ids.add(entry.entity_id);
    result.set(type, ids);
  }
  return result;
}

function includeCreated(
  target: Set<string>,
  created: Map<string, Set<string>>,
  aliases: string[],
): void {
  for (const alias of aliases) {
    for (const id of created.get(normalize(alias)) || []) target.add(id);
  }
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function contextVisible(row: unknown, visible: Visible): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row)) return true;
  const record = row as AnyRow;
  const checks: Array<[string, Set<string>]> = [
    ["customer_id", visible.customers],
    ["site_id", visible.sites],
    ["work_required_id", visible.workRequired],
    ["work_order_id", visible.workOrders],
    ["quotation_id", visible.quotations],
    ["visit_id", visible.visits],
    ["payment_id", visible.payments],
    ["po_id", visible.purchaseOrders],
    ["purchase_order_id", visible.purchaseOrders],
    ["rfq_id", visible.vendorRfqs],
    ["vendor_rfq_id", visible.vendorRfqs],
    ["vendor_id", visible.vendors],
    ["contractor_id", visible.contractors],
  ];
  for (const [field, allowed] of checks) {
    const id = String(record[field] || "").trim();
    if (id && !allowed.has(id)) return false;
  }
  return true;
}

function viewerCacheKey(viewer: Viewer): string {
  return `${normalize(viewer.role)}:${viewer.staffId || ""}:${normalize(viewer.name)}`;
}

/**
 * Returns a presentation-only database for Field Staff. The complete database
 * remains in the underlying store, so hiding rows cannot turn them into delete
 * operations when the field user saves an allowed record.
 */
export function fieldStaffVisibleDatabase(
  db: RDashDatabase,
  viewer: Viewer | null | undefined,
): RDashDatabase {
  if (!viewer || normalize(viewer.role) !== "field staff") return db;

  const key = viewerCacheKey(viewer);
  const cached = cache.get(db)?.get(key);
  if (cached) return cached;

  const created = createdByViewer(db, viewer);
  const visible: Visible = {
    customers: new Set(),
    sites: new Set(),
    workRequired: new Set(),
    workOrders: new Set(),
    quotations: new Set(),
    visits: new Set(),
    payments: new Set(),
    purchaseOrders: new Set(),
    vendorRfqs: new Set(),
    vendors: new Set(),
    contractors: new Set(),
  };

  includeCreated(visible.customers, created, ["customer"]);
  includeCreated(visible.sites, created, ["site"]);
  includeCreated(visible.workRequired, created, ["workRequired", "work_required"]);
  includeCreated(visible.workOrders, created, ["workOrder", "work_order"]);
  includeCreated(visible.vendors, created, ["vendor"]);
  includeCreated(visible.contractors, created, ["contractor"]);

  const assignedTasks = filterRows(db.tasks || [], (row) =>
    assignedToViewer(row as unknown as AnyRow, viewer));
  const assignedFollowups = filterRows(db.followups || [], (row) =>
    assignedToViewer(row as unknown as AnyRow, viewer));
  const assignedVisits = filterRows(db.visits || [], (row) =>
    assignedToViewer(row as unknown as AnyRow, viewer));

  for (const task of assignedTasks) {
    addId(visible.customers, task.customer_id);
    addId(visible.sites, task.site_id);
    addId(visible.workRequired, task.work_required_id);
    addId(visible.workOrders, task.work_order_id);
    addId(visible.quotations, task.quotation_id);
    addId(visible.visits, task.visit_id);
    addId(visible.payments, task.payment_id);
    addId(visible.purchaseOrders, task.po_id);
  }
  for (const followup of assignedFollowups) {
    addId(visible.customers, followup.customer_id);
    addId(visible.workRequired, followup.work_required_id);
    addId(visible.quotations, followup.quotation_id);
    addId(visible.visits, followup.visit_id);
    addId(visible.payments, followup.payment_id);
  }
  for (const visit of assignedVisits) visible.visits.add(visit.id);

  const sites = byId(db.sites);
  const requiredWork = byId(db.workRequired);
  const orders = byId(db.workOrders);
  const quotes = byId(db.quotations);
  const visits = byId(db.visits);
  const payments = byId(db.payments);
  const purchaseOrders = byId(db.purchaseOrders);

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const id of visible.sites) {
      const site = sites.get(id);
      if (site) expanded = addId(visible.customers, site.customer_id) || expanded;
    }
    for (const id of visible.workRequired) {
      const work = requiredWork.get(id);
      if (!work) continue;
      expanded = addId(visible.customers, work.customer_id) || expanded;
      expanded = addId(visible.sites, work.site_id) || expanded;
    }
    for (const id of visible.workOrders) {
      const order = orders.get(id);
      if (!order) continue;
      expanded = addId(visible.customers, order.customer_id) || expanded;
      expanded = addId(visible.sites, order.site_id) || expanded;
      expanded = addId(visible.contractors, order.contractor_id) || expanded;
      for (const workId of order.work_required_ids || []) {
        expanded = addId(visible.workRequired, workId) || expanded;
      }
      for (const quoteId of order.quotation_ids || []) {
        expanded = addId(visible.quotations, quoteId) || expanded;
      }
    }
    for (const id of visible.visits) {
      const visit = visits.get(id);
      if (!visit) continue;
      expanded = addId(visible.customers, visit.customer_id) || expanded;
      expanded = addId(visible.sites, visit.site_id) || expanded;
      expanded = addId(visible.workRequired, visit.work_required_id) || expanded;
      expanded = addId(visible.workOrders, visit.work_order_id) || expanded;
      expanded = addId(visible.vendors, visit.vendor_id) || expanded;
      expanded = addId(visible.contractors, visit.contractor_id) || expanded;
    }
    for (const id of visible.quotations) {
      const quote = quotes.get(id);
      if (!quote) continue;
      expanded = addId(visible.customers, quote.customer_id) || expanded;
      expanded = addId(visible.sites, quote.site_id) || expanded;
      for (const coverage of quote.coverage || []) {
        expanded = addId(visible.workRequired, coverage.work_required_id) || expanded;
      }
    }
    for (const id of visible.payments) {
      const payment = payments.get(id);
      if (!payment) continue;
      expanded = addId(visible.customers, payment.customer_id) || expanded;
      expanded = addId(visible.sites, payment.site_id) || expanded;
      expanded = addId(visible.workRequired, payment.work_required_id) || expanded;
      expanded = addId(visible.workOrders, payment.work_order_id) || expanded;
      expanded = addId(visible.quotations, payment.quotation_id) || expanded;
    }
    for (const id of visible.purchaseOrders) {
      const order = purchaseOrders.get(id);
      if (!order) continue;
      expanded = addId(visible.sites, order.site_id) || expanded;
      expanded = addId(visible.workOrders, order.work_order_id) || expanded;
      expanded = addId(visible.vendors, order.vendor_id) || expanded;
    }
    for (const rfq of db.vendorRfqs || []) {
      if (visible.sites.has(rfq.site_id) || visible.workOrders.has(rfq.work_order_id)) {
        expanded = addId(visible.vendorRfqs, rfq.id) || expanded;
      }
    }
    for (const bid of db.vendorBids || []) {
      if (visible.vendorRfqs.has(bid.rfq_id)) {
        expanded = addId(visible.vendors, bid.vendor_id) || expanded;
      }
    }
    for (const order of db.purchaseOrders || []) {
      if (visible.purchaseOrders.has(order.id) ||
          Boolean(order.site_id && visible.sites.has(order.site_id)) ||
          Boolean(order.work_order_id && visible.workOrders.has(order.work_order_id))) {
        expanded = addId(visible.purchaseOrders, order.id) || expanded;
        expanded = addId(visible.vendors, order.vendor_id) || expanded;
      }
    }
    for (const bid of db.contractorBids || []) {
      if (Boolean(bid.work_order_id && visible.workOrders.has(bid.work_order_id)) ||
          Boolean(bid.site_id && visible.sites.has(bid.site_id))) {
        expanded = addId(visible.contractors, bid.contractor_id) || expanded;
      }
    }
  }

  const linked = <T,>(rows: T[]) => filterRows(rows, (row) => contextVisible(row, visible));
  const filtered: RDashDatabase = {
    ...db,
    customers: filterRows(db.customers, (row) => visible.customers.has(row.id)),
    sites: filterRows(db.sites, (row) => visible.sites.has(row.id)),
    areas: filterRows(db.areas, (row) => visible.sites.has(row.site_id)),
    workRequired: filterRows(db.workRequired, (row) => visible.workRequired.has(row.id)),
    measurementRevisions: linked(db.measurementRevisions),
    quotations: linked(db.quotations),
    acceptedScopes: linked(db.acceptedScopes),
    workOrders: filterRows(db.workOrders, (row) => visible.workOrders.has(row.id)),
    boqs: linked(db.boqs),
    vendorRfqs: filterRows(db.vendorRfqs, (row) =>
      visible.vendorRfqs.has(row.id) && contextVisible(row, visible)),
    vendorBids: linked(db.vendorBids),
    purchaseOrders: filterRows(db.purchaseOrders, (row) =>
      visible.purchaseOrders.has(row.id) && contextVisible(row, visible)),
    grns: linked(db.grns),
    stockMovements: linked(db.stockMovements),
    dispatches: linked(db.dispatches),
    vendorBills: linked(db.vendorBills),
    vendorPayments: linked(db.vendorPayments),
    contractorBills: linked(db.contractorBills),
    contractorPayments: linked(db.contractorPayments),
    commissions: linked(db.commissions),
    workOrderCostLines: linked(db.workOrderCostLines),
    contractorBids: linked(db.contractorBids),
    contractorSettlements: linked(db.contractorSettlements),
    drawings: linked(db.drawings),
    executionLogs: linked(db.executionLogs),
    variationRequests: linked(db.variationRequests),
    visits: filterRows(assignedVisits, (row) => visible.visits.has(row.id)),
    tasks: assignedTasks,
    followups: assignedFollowups,
    actions: linked(db.actions),
    payments: linked(db.payments),
    invoices: linked(db.invoices),
    customerReceipts: linked(db.customerReceipts),
    blocked: linked(db.blocked),
    risks: linked(db.risks),
    commSends: linked(db.commSends),
    master: {
      ...db.master,
      vendors: filterRows(db.master.vendors, (row) => visible.vendors.has(row.id)),
      contractors: filterRows(db.master.contractors, (row) => visible.contractors.has(row.id)),
      vendorRates: filterRows(db.master.vendorRates, (row) => visible.vendors.has(row.vendor_id)),
      vendorRateHistories: filterRows(db.master.vendorRateHistories, (row) => visible.vendors.has(row.vendor_id)),
      contractorRates: filterRows(db.master.contractorRates, (row) => visible.contractors.has(row.contractor_id)),
      catalogueArticleVendorLinks: filterRows(db.master.catalogueArticleVendorLinks, (row) =>
        !row.vendor_id || visible.vendors.has(row.vendor_id)),
    },
  };

  const visibleRecordIds = new Set<string>();
  const remember = (rows: unknown[]) => rows.forEach((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      addId(visibleRecordIds, (row as AnyRow).id);
    }
  });
  for (const rows of [
    filtered.customers, filtered.sites, filtered.areas, filtered.workRequired,
    filtered.measurementRevisions, filtered.quotations, filtered.acceptedScopes,
    filtered.workOrders, filtered.boqs, filtered.vendorRfqs, filtered.vendorBids,
    filtered.purchaseOrders, filtered.grns, filtered.dispatches, filtered.vendorBills,
    filtered.vendorPayments, filtered.contractorBills, filtered.contractorPayments,
    filtered.contractorBids, filtered.contractorSettlements, filtered.drawings,
    filtered.executionLogs, filtered.variationRequests, filtered.visits, filtered.tasks,
    filtered.followups, filtered.actions, filtered.payments, filtered.invoices,
    filtered.customerReceipts, filtered.blocked, filtered.risks, filtered.commSends,
    filtered.master.vendors, filtered.master.contractors,
  ]) remember(rows as unknown[]);

  filtered.threads = filterRows(db.threads, (thread) =>
    visibleRecordIds.has(thread.record_id) ||
    (thread.record_id.startsWith("customer-conversation:") &&
      visible.customers.has(thread.record_id.slice("customer-conversation:".length))) ||
    thread.participants.some((participant) => normalize(participant) === normalize(viewer.name)));
  filtered.auditLog = filterRows(db.auditLog, (entry) =>
    normalize(entry.actor) === normalize(viewer.name) ||
    Boolean(entry.entity_id && visibleRecordIds.has(entry.entity_id)) ||
    Boolean(entry.customer_id && visible.customers.has(entry.customer_id)));
  filtered.entityFileAttachments = filterRows(db.entityFileAttachments, (attachment) =>
    visibleRecordIds.has(attachment.entity_id));
  filtered.entityReferenceAssignments = filterRows(db.entityReferenceAssignments, (assignment) =>
    contextVisible(assignment, visible) &&
    (visibleRecordIds.has(assignment.entity_id) ||
      Boolean(assignment.customer_id && visible.customers.has(assignment.customer_id))));

  const byViewer = cache.get(db) || new Map<string, RDashDatabase>();
  byViewer.set(key, filtered);
  cache.set(db, byViewer);
  return filtered;
}
