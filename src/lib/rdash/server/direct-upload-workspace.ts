import { resolveEntityContext } from "../entity-context";
import type {
  FileAttachmentEntityType,
  RDashDatabase,
} from "../types";
import type { UploadPurpose } from "@/lib/uploads/upload-types";
import {
  getWorkspace,
  getWorkspaceSubset,
  type WorkspaceSubset,
} from "./workspace";

const MAX_DEPENDENCY_ROUNDS = 5;
const COMPATIBILITY_NESTED_TARGETS = new Set<FileAttachmentEntityType>([
  "quotation_item",
  "boq_item",
  "thread_message",
]);

const TARGET_COLLECTION: Partial<Record<FileAttachmentEntityType, string>> = {
  customer: "customers",
  site: "sites",
  room: "areas",
  workRequired: "workRequired",
  measurement_revision: "measurementRevisions",
  quotation: "quotations",
  accepted_scope: "acceptedScopes",
  workOrder: "workOrders",
  boq: "boqs",
  variation_request: "variationRequests",
  vendor_rfq: "vendorRfqs",
  vendor_bid: "vendorBids",
  purchase_order: "purchaseOrders",
  grn: "grns",
  stock_movement: "stockMovements",
  vendor_bill: "vendorBills",
  vendor_payment: "vendorPayments",
  dispatch: "dispatches",
  inventory: "inventory",
  drawing: "drawings",
  execution_log: "executionLogs",
  visit: "visits",
  task: "tasks",
  followup: "followups",
  payment: "payments",
  invoice: "invoices",
  customer_receipt: "customerReceipts",
  vendor: "master.vendors",
  vendor_rate: "master.vendorRates",
  contractor: "master.contractors",
  contractor_bid: "contractorBids",
  contractor_bill: "contractorBills",
  contractor_payment: "contractorPayments",
  contractor_settlement: "contractorSettlements",
  commission: "commissions",
  blocked: "blocked",
  communication: "commSends",
};

const FIELD_TO_COLLECTION: Readonly<Record<string, string>> = Object.freeze({
  customer_id: "customers",
  site_id: "sites",
  area_id: "areas",
  work_required_id: "workRequired",
  quotation_id: "quotations",
  accepted_scope_id: "acceptedScopes",
  work_order_id: "workOrders",
  linked_work_order_id: "workOrders",
  po_id: "purchaseOrders",
  purchase_order_id: "purchaseOrders",
  linked_po_id: "purchaseOrders",
  grn_id: "grns",
  linked_grn_id: "grns",
  rfq_id: "vendorRfqs",
  vendor_id: "master.vendors",
  contractor_id: "master.contractors",
  abandoned_contractor_id: "master.contractors",
  contractor_bill_id: "contractorBills",
  vendor_bill_id: "vendorBills",
  payment_id: "payments",
  invoice_id: "invoices",
  visit_id: "visits",
  task_id: "tasks",
  linked_task_id: "tasks",
  inventory_id: "inventory",
  source_partner_id: "master.sourcePartners",
  staff_id: "master.staff",
  assignee_id: "master.staff",
  assigned_to_staff_id: "master.staff",
  article_id: "master.articles",
  variant_id: "master.articleVariants",
});

const ARRAY_FIELD_TO_COLLECTION: Readonly<Record<string, string>> = Object.freeze({
  area_ids: "areas",
  work_required_ids: "workRequired",
  quotation_ids: "quotations",
  accepted_scope_ids: "acceptedScopes",
});

const THREAD_KIND_TO_COLLECTION: Readonly<Record<string, string>> = Object.freeze({
  quotation: "quotations",
  workOrder: "workOrders",
  workRequired: "workRequired",
  task: "tasks",
  followup: "followups",
  visit: "visits",
  payment: "payments",
  invoice: "invoices",
  vendor_bill: "vendorBills",
  inventory: "inventory",
  po: "purchaseOrders",
  grn: "grns",
  dispatch: "dispatches",
  blocked: "blocked",
  commission: "commissions",
  settlement: "contractorSettlements",
  site: "sites",
  drawing: "drawings",
  execution_log: "executionLogs",
});

type IdPlan = Map<string, Set<string>>;

function rowId(row: Record<string, unknown>): string {
  return String(row.id || "").trim();
}

function rowsFor(database: RDashDatabase, collection: string): Array<Record<string, unknown>> {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    const value = (database.master as unknown as Record<string, unknown>)[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function addId(plan: IdPlan, collection: string, value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return;
  const ids = plan.get(collection) || new Set<string>();
  ids.add(id);
  plan.set(collection, ids);
}

function collectDependencies(database: RDashDatabase): IdPlan {
  const plan: IdPlan = new Map();
  const scan = (collection: string, row: Record<string, unknown>) => {
    for (const [field, dependencyCollection] of Object.entries(FIELD_TO_COLLECTION)) {
      addId(plan, dependencyCollection, row[field]);
    }
    for (const [field, dependencyCollection] of Object.entries(ARRAY_FIELD_TO_COLLECTION)) {
      const values = row[field];
      if (!Array.isArray(values)) continue;
      for (const value of values) addId(plan, dependencyCollection, value);
    }

    if (collection === "threads") {
      const kind = String(row.kind || row.record_type || "");
      const recordId = String(row.record_id || "").trim();
      const parentCollection = THREAD_KIND_TO_COLLECTION[kind];
      if (parentCollection && recordId) addId(plan, parentCollection, recordId);
      if (kind === "generic" && recordId.startsWith("customer-conversation:")) {
        addId(plan, "customers", recordId.slice("customer-conversation:".length));
      } else if (kind === "generic" && recordId.startsWith("cust-")) {
        addId(plan, "customers", recordId);
      }
    }

    if (collection === "vendorBids") addId(plan, "vendorRfqs", row.rfq_id);
    if (collection === "vendorPayments") addId(plan, "vendorBills", row.vendor_bill_id);
    if (collection === "contractorPayments") addId(plan, "contractorBills", row.contractor_bill_id);
    if (collection === "grns") addId(plan, "purchaseOrders", row.po_id);
    if (collection === "master.vendorRates") {
      addId(plan, "master.vendors", row.vendor_id);
      addId(plan, "master.articles", row.article_id);
    }
  };

  for (const [collection, value] of Object.entries(database as unknown as Record<string, unknown>)) {
    if (collection === "master" || !Array.isArray(value)) continue;
    for (const row of value as Array<Record<string, unknown>>) scan(collection, row);
  }
  for (const [key, value] of Object.entries(database.master as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const row of value as Array<Record<string, unknown>>) scan(`master.${key}`, row);
  }
  return plan;
}

function loadedIds(database: RDashDatabase): IdPlan {
  const result: IdPlan = new Map();
  for (const collection of Object.values(TARGET_COLLECTION)) {
    if (!collection) continue;
    const ids = new Set(rowsFor(database, collection).map(rowId).filter(Boolean));
    if (ids.size) result.set(collection, ids);
  }
  // Parent/dependency collections not directly represented in TARGET_COLLECTION.
  for (const collection of new Set([
    ...Object.values(FIELD_TO_COLLECTION),
    ...Object.values(ARRAY_FIELD_TO_COLLECTION),
    "threads",
    "master.storageAccounts",
    "master.storageFolderTemplates",
  ])) {
    const ids = new Set(rowsFor(database, collection).map(rowId).filter(Boolean));
    if (ids.size) result.set(collection, ids);
  }
  return result;
}

function removeLoaded(plan: IdPlan, database: RDashDatabase) {
  const present = loadedIds(database);
  for (const [collection, ids] of plan) {
    const loaded = present.get(collection);
    if (loaded) {
      for (const id of loaded) ids.delete(id);
    }
    if (!ids.size) plan.delete(collection);
  }
}

function mergeRows(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map(current.map((row) => [rowId(row), row]));
  for (const row of incoming) {
    const id = rowId(row);
    if (id) merged.set(id, row);
  }
  return [...merged.values()];
}

function mergeSubsets(target: WorkspaceSubset, source: WorkspaceSubset): WorkspaceSubset {
  if (target.revision !== source.revision) throw new Error("READ_CONFLICT");
  const data = structuredClone(target.data) as RDashDatabase;
  for (const [key, value] of Object.entries(source.data as unknown as Record<string, unknown>)) {
    if (key === "master" || !Array.isArray(value) || !value.length) continue;
    (data as unknown as Record<string, unknown>)[key] = mergeRows(
      rowsFor(data, key),
      value as Array<Record<string, unknown>>,
    );
  }
  for (const [key, value] of Object.entries(source.data.master as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.length) continue;
    const collection = `master.${key}`;
    (data.master as unknown as Record<string, unknown>)[key] = mergeRows(
      rowsFor(data, collection),
      value as Array<Record<string, unknown>>,
    );
  }
  return {
    ...target,
    updatedAt: source.updatedAt || target.updatedAt,
    data,
    rowVersions: { ...(target.rowVersions || {}), ...(source.rowVersions || {}) },
    queryCount: target.queryCount + source.queryCount,
  };
}

function toRowsByCollection(plan: IdPlan): Record<string, string[]> {
  return Object.fromEntries([...plan.entries()].map(([collection, ids]) => [collection, [...ids]]));
}

function initialPlan(
  targetEntityType: FileAttachmentEntityType,
  targetEntityId: string,
  purpose: UploadPurpose,
) {
  const rowsByCollection: Record<string, string[]> = {};
  const collection = TARGET_COLLECTION[targetEntityType];
  if (collection) rowsByCollection[collection] = [targetEntityId];
  if (targetEntityType === "general" && purpose === "staff_document") {
    rowsByCollection["master.staff"] = [targetEntityId];
  }
  return {
    fullCollections: ["master.storageAccounts", "master.storageFolderTemplates"],
    rowsByCollection,
  };
}

/**
 * Reads only the upload target, its parent chain and the small Drive account /
 * folder-template configuration required to start/finalize an upload. Nested
 * line/message targets keep a compatibility full read for now because their
 * identity lives inside JSON arrays rather than a table row; every ordinary
 * entity upload avoids the old whole-workspace read.
 */
export async function getDirectUploadWorkspace(
  targetEntityType: FileAttachmentEntityType,
  targetEntityId: string,
  purpose: UploadPurpose,
): Promise<WorkspaceSubset> {
  if (COMPATIBILITY_NESTED_TARGETS.has(targetEntityType)) {
    const full = await getWorkspace(true);
    return { ...full, queryCount: Number.MAX_SAFE_INTEGER };
  }

  let workspace = await getWorkspaceSubset(initialPlan(targetEntityType, targetEntityId, purpose));
  for (let round = 0; round < MAX_DEPENDENCY_ROUNDS; round += 1) {
    const dependencies = collectDependencies(workspace.data);
    removeLoaded(dependencies, workspace.data);
    if (!dependencies.size) break;
    const next = await getWorkspaceSubset({ rowsByCollection: toRowsByCollection(dependencies) });
    workspace = mergeSubsets(workspace, next);
  }

  if (targetEntityType !== "general") {
    try {
      resolveEntityContext(workspace.data, targetEntityType, targetEntityId, "Upload target");
    } catch (error) {
      // Preserve correctness for an unusual relationship shape while making
      // ordinary uploads cheap. The warning makes any remaining compatibility
      // case observable so it can be converted later instead of staying hidden.
      console.warn("[upload-context] targeted context incomplete; using compatibility full read", {
        targetEntityType,
        targetEntityId,
        message: error instanceof Error ? error.message : String(error),
      });
      const full = await getWorkspace(true);
      return { ...full, queryCount: Number.MAX_SAFE_INTEGER };
    }
  }

  return workspace;
}
