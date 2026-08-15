import {
  assertCustomerRelation,
  assertThreadParentExists,
  assertVisitRelations,
} from "../business-rules";
import type { RDashDatabase, Thread, ThreadKind } from "../types";
import { applyWorkspaceOperations, diffWorkspaceOperations, type WorkspaceOperation } from "../workspace-operations";
import { applyVendorRateAverages } from "../vendor-rate-average";
import { canonicalizeVendorRateMaster } from "../vendor-rate";
import type { AuthenticatedUser } from "./auth";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import {
  getWorkspaceSubset,
  type WorkspaceReadPlan,
  type WorkspaceSubset,
} from "./workspace";

const VENDOR_RATE_COLLECTIONS = new Set(["master.vendorRates", "master.vendorRateHistories"]);
const TARGETED_COLLECTIONS = new Set([
  "tasks", "followups", "visits", "threads", "auditLog",
  "master.units", "master.workCategories", "master.workSubcategories",
  "master.articles", "master.articleVariants", "master.subcategoryArticleMap",
  "master.workOptionGroups", "master.workOptionValues",
  ...VENDOR_RATE_COLLECTIONS,
]);
const TARGETED_THREAD_KINDS = new Set<ThreadKind>([
  "task",
  "followup",
  "visit",
  "generic",
  "site",
  "quotation",
]);
const MAX_TARGETED_ROWS = 50;
const MAX_DEPENDENCY_ROUNDS = 5;

type MutableReadPlan = {
  fullCollections: Set<string>;
  rowsByCollection: Map<string, Set<string>>;
};

type TargetedPreparation = {
  current: WorkspaceSubset;
  operations: WorkspaceOperation[];
  loadMs: number;
  authorizeAndValidateMs: number;
  queryCount: number;
};

type ThreadParentTarget = {
  collection: string;
  id: string;
};

function rowId(row: Record<string, unknown>): string {
  return String(row.id || "").trim();
}

function rowsFor(database: RDashDatabase, collection: string): Array<Record<string, unknown>> {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    const value = (database.master as unknown as Record<string, unknown>)?.[key];
    return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  }
  const value = (database as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function emptyPlan(): MutableReadPlan {
  return { fullCollections: new Set(), rowsByCollection: new Map() };
}

function addId(plan: MutableReadPlan, collection: string, value: unknown): void {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || plan.fullCollections.has(collection)) return;
  const ids = plan.rowsByCollection.get(collection) || new Set<string>();
  ids.add(id);
  plan.rowsByCollection.set(collection, ids);
}

function addIds(plan: MutableReadPlan, collection: string, values: unknown): void {
  if (!Array.isArray(values)) return;
  for (const value of values) addId(plan, collection, value);
}

function addFullCollection(plan: MutableReadPlan, collection: string): void {
  plan.fullCollections.add(collection);
  plan.rowsByCollection.delete(collection);
}

function genericCustomerId(recordId: string): string | undefined {
  if (!recordId.startsWith("customer-conversation:")) return undefined;
  return recordId.slice("customer-conversation:".length).trim() || undefined;
}

function threadParentTarget(row: Record<string, unknown>): ThreadParentTarget | undefined {
  const kind = String(row.kind || row.record_type || "") as ThreadKind;
  const recordId = String(row.record_id || "").trim();
  if (!recordId) return undefined;
  if (kind === "task") return { collection: "tasks", id: recordId };
  if (kind === "followup") return { collection: "followups", id: recordId };
  if (kind === "visit") return { collection: "visits", id: recordId };
  if (kind === "site") return { collection: "sites", id: recordId };
  if (kind === "quotation") return { collection: "quotations", id: recordId };
  if (kind === "generic") {
    const customerId = genericCustomerId(recordId);
    return customerId ? { collection: "customers", id: customerId } : undefined;
  }
  return undefined;
}

function collectDirectDependencies(
  plan: MutableReadPlan,
  collection: string,
  row: Record<string, unknown>,
): void {
  addId(plan, "customers", row.customer_id);
  addId(plan, "sites", row.site_id);
  addId(plan, "areas", row.area_id);
  addId(plan, "workRequired", row.work_required_id);
  addId(plan, "workOrders", row.work_order_id);
  addId(plan, "workOrders", row.linked_work_order_id);
  addId(plan, "quotations", row.quotation_id);
  addId(plan, "purchaseOrders", row.po_id);
  addId(plan, "purchaseOrders", row.linked_po_id);
  addId(plan, "grns", row.linked_grn_id);
  addId(plan, "visits", row.visit_id);
  addId(plan, "payments", row.payment_id);
  addId(plan, "invoices", row.invoice_id);
  addId(plan, "tasks", row.linked_task_id);

  if (row.linked_record_type === "contractor_payment") {
    addId(plan, "contractorPayments", row.linked_record_id);
  }

  if (collection === "visits") {
    addId(plan, "master.staff", row.staff_id);
    addId(plan, "master.vendors", row.vendor_id);
    addId(plan, "master.contractors", row.contractor_id);
  }

  if (collection === "master.workSubcategories") {
    addId(plan, "master.workCategories", row.category_id);
    addId(plan, "master.units", row.unit_id);
  } else if (collection === "master.articles") {
    addId(plan, "master.workCategories", row.category_id);
    addId(plan, "master.units", row.unit_id || row.default_unit_id);
  } else if (collection === "master.articleVariants") {
    addId(plan, "master.articles", row.article_id);
    addId(plan, "master.units", row.unit_id);
  } else if (collection === "master.subcategoryArticleMap") {
    addId(plan, "master.workSubcategories", row.work_required_id);
    addId(plan, "master.articles", row.article_id);
    addId(plan, "master.units", row.unit_id);
  } else if (collection === "master.workOptionGroups") {
    addId(plan, "master.workSubcategories", row.work_subcategory_id || row.work_required_id);
  } else if (collection === "master.workOptionValues") {
    addId(plan, "master.workOptionGroups", row.group_id || row.option_group_id);
  } else if (collection === "master.vendorRates" || collection === "master.vendorRateHistories") {
    addId(plan, "master.vendors", row.vendor_id);
    addId(plan, "master.articles", row.article_id);
    addId(plan, "master.articleVariants", row.variant_id);
  }

  if (collection === "threads") {
    const parent = threadParentTarget(row);
    if (parent) addId(plan, parent.collection, parent.id);
  }

  if (collection === "sites") {
    addId(plan, "customers", row.customer_id);
  } else if (collection === "areas") {
    addId(plan, "sites", row.site_id);
  } else if (collection === "workRequired") {
    addId(plan, "customers", row.customer_id);
    addId(plan, "sites", row.site_id);
    addIds(plan, "areas", row.area_ids);
  } else if (collection === "workOrders") {
    addId(plan, "customers", row.customer_id);
    addId(plan, "sites", row.site_id);
  } else if (collection === "quotations") {
    addId(plan, "customers", row.customer_id);
    addId(plan, "sites", row.site_id);
  } else if (collection === "purchaseOrders") {
    addId(plan, "workOrders", row.work_order_id);
    addId(plan, "sites", row.site_id);
  } else if (collection === "grns") {
    addId(plan, "purchaseOrders", row.po_id);
    addId(plan, "workOrders", row.work_order_id);
    addId(plan, "sites", row.site_id);
  } else if (collection === "contractorPayments") {
    addId(plan, "contractorBills", row.contractor_bill_id);
  } else if (collection === "contractorBills") {
    addId(plan, "customers", row.customer_id);
    addId(plan, "sites", row.site_id);
    addId(plan, "workOrders", row.work_order_id);
  }
}

function isTargetedThreadRow(row: Record<string, unknown>): boolean {
  const kind = String(row.kind || row.record_type || "") as ThreadKind;
  return TARGETED_THREAD_KINDS.has(kind) && Boolean(threadParentTarget(row));
}

export function canUseTargetedCommit(operations: WorkspaceOperation[]): boolean {
  if (!operations.length) return false;

  let rowCount = 0;
  let hasBusinessMutation = false;
  for (const operation of operations) {
    if (!TARGETED_COLLECTIONS.has(operation.collection)) return false;
    const deletes = operation.deleteIds || [];
    if (deletes.length && !VENDOR_RATE_COLLECTIONS.has(operation.collection)) return false;

    const upserts = operation.upsert || [];
    rowCount += upserts.length + deletes.length;
    if (operation.collection !== "auditLog" && (upserts.length || deletes.length)) {
      hasBusinessMutation = true;
    }

    for (const row of upserts) {
      if (!rowId(row)) return false;
      if (operation.collection === "threads" && !isTargetedThreadRow(row)) return false;
    }
  }

  return hasBusinessMutation && rowCount > 0 && rowCount <= MAX_TARGETED_ROWS;
}

function initialReadPlan(user: AuthenticatedUser, operations: WorkspaceOperation[]): MutableReadPlan {
  const plan = emptyPlan();
  if (user.role !== "Owner") addFullCollection(plan, "staffRolePermissions");
  if (user.staffId) addId(plan, "master.staff", user.staffId);

  const hasVendorRateMutation = operations.some((operation) => VENDOR_RATE_COLLECTIONS.has(operation.collection));
  if (hasVendorRateMutation) {
    for (const collection of [
      "master.vendorRates", "master.vendorRateHistories", "master.articles",
      "master.units", "master.articleVariants", "master.vendors",
    ]) addFullCollection(plan, collection);
  }

  for (const operation of operations) {
    for (const row of operation.upsert || []) {
      addId(plan, operation.collection, row.id);
      collectDirectDependencies(plan, operation.collection, row);
    }
    for (const id of operation.deleteIds || []) addId(plan, operation.collection, id);
  }
  return plan;
}

function dependenciesFromLoadedData(database: RDashDatabase, operations: WorkspaceOperation[]): MutableReadPlan {
  const plan = emptyPlan();
  for (const operation of operations) {
    for (const row of operation.upsert || []) {
      collectDirectDependencies(plan, operation.collection, row);
    }
  }

  const collections = [
    "tasks", "followups", "visits", "threads", "customers", "sites", "areas",
    "workRequired", "workOrders", "quotations", "purchaseOrders", "grns",
    "payments", "invoices", "contractorPayments", "contractorBills",
    "taxConfigs", "master.units", "master.workCategories", "master.workSubcategories", "master.articles",
    "master.articleVariants", "master.subcategoryArticleMap", "master.workOptionGroups", "master.workOptionValues",
    "master.vendors", "master.vendorRates", "master.vendorRateHistories",
  ];
  for (const collection of collections) {
    for (const row of rowsFor(database, collection)) {
      collectDirectDependencies(plan, collection, row);
    }
  }
  return plan;
}

function toWorkspaceReadPlan(plan: MutableReadPlan): WorkspaceReadPlan {
  return {
    fullCollections: [...plan.fullCollections],
    rowsByCollection: Object.fromEntries(
      [...plan.rowsByCollection.entries()].map(([collection, ids]) => [collection, [...ids]]),
    ),
    limitsByCollection: { "master.vendorRateHistories": 5000 },
  };
}

function planIsEmpty(plan: MutableReadPlan): boolean {
  return plan.fullCollections.size === 0
    && [...plan.rowsByCollection.values()].every((ids) => ids.size === 0);
}

function removeAttempted(
  plan: MutableReadPlan,
  attemptedRows: Map<string, Set<string>>,
  loadedFullCollections: Set<string>,
): void {
  for (const collection of [...plan.fullCollections]) {
    if (loadedFullCollections.has(collection)) plan.fullCollections.delete(collection);
  }
  for (const [collection, ids] of plan.rowsByCollection) {
    if (loadedFullCollections.has(collection)) {
      plan.rowsByCollection.delete(collection);
      continue;
    }
    const attempted = attemptedRows.get(collection);
    if (attempted) {
      for (const id of attempted) ids.delete(id);
    }
    if (!ids.size) plan.rowsByCollection.delete(collection);
  }
}

function markAttempted(
  plan: MutableReadPlan,
  attemptedRows: Map<string, Set<string>>,
  loadedFullCollections: Set<string>,
): void {
  for (const collection of plan.fullCollections) loadedFullCollections.add(collection);
  for (const [collection, ids] of plan.rowsByCollection) {
    const attempted = attemptedRows.get(collection) || new Set<string>();
    for (const id of ids) attempted.add(id);
    attemptedRows.set(collection, attempted);
  }
}

function mergeRows(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = new Map(current.map((row) => [rowId(row), row]));
  for (const row of incoming) merged.set(rowId(row), row);
  return [...merged.values()];
}

function mergeWorkspaceData(target: RDashDatabase, source: RDashDatabase): RDashDatabase {
  const result = structuredClone(target) as RDashDatabase;
  for (const [key, value] of Object.entries(source as unknown as Record<string, unknown>)) {
    if (key === "master" || !Array.isArray(value) || !value.length) continue;
    const current = rowsFor(result, key);
    (result as unknown as Record<string, unknown>)[key] = mergeRows(current, value as Array<Record<string, unknown>>);
  }
  for (const [key, value] of Object.entries(source.master as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.length) continue;
    const collection = `master.${key}`;
    (result.master as unknown as Record<string, unknown>)[key] = mergeRows(
      rowsFor(result, collection),
      value as Array<Record<string, unknown>>,
    );
  }
  return result;
}

function mergeSubset(target: WorkspaceSubset, source: WorkspaceSubset): WorkspaceSubset {
  return {
    revision: target.revision,
    updatedAt: source.updatedAt || target.updatedAt,
    data: mergeWorkspaceData(target.data, source.data),
    rowVersions: { ...(target.rowVersions || {}), ...(source.rowVersions || {}) },
    queryCount: target.queryCount + source.queryCount,
  };
}

function validateThread(thread: Thread, database: RDashDatabase): void {
  if (thread.record_type !== thread.kind) {
    throw new Error("Thread: record type must match its thread kind.");
  }
  assertThreadParentExists(database, thread.kind, thread.record_id, "Thread");

  const messageIds = new Set<string>();
  for (const message of thread.messages || []) {
    if (message.thread_id !== thread.id) {
      throw new Error("Thread: contains a message assigned to another thread.");
    }
    if (messageIds.has(message.id)) {
      throw new Error("Thread: contains duplicate message IDs.");
    }
    messageIds.add(message.id);
  }
  for (const message of thread.messages || []) {
    if (message.parent_message_id && !messageIds.has(message.parent_message_id)) {
      throw new Error("Thread: contains a nested reply whose parent message is missing.");
    }
  }
}

function validateTouchedRows(database: RDashDatabase, operations: WorkspaceOperation[]): void {
  try {
    for (const operation of operations) {
      const candidates = rowsFor(database, operation.collection);
      for (const input of operation.upsert || []) {
        const id = rowId(input);
        const row = candidates.find((candidate) => rowId(candidate) === id);
        if (!row) throw new Error(`${operation.collection} "${id}" was not present after applying the operation.`);

        if (operation.collection === "tasks") {
          assertCustomerRelation(database, row, "Task");
        } else if (operation.collection === "followups") {
          assertCustomerRelation(database, row, "Follow-up");
        } else if (operation.collection === "visits") {
          assertVisitRelations(database, row as Parameters<typeof assertVisitRelations>[1], "Visit", { allowArchived: true });
        } else if (operation.collection === "threads") {
          validateThread(row as unknown as Thread, database);
        } else if (operation.collection.startsWith("master.")) {
          const name = typeof row.name === "string" ? row.name.trim() : "";
          if (["master.units", "master.workCategories", "master.workSubcategories", "master.articles", "master.articleVariants", "master.workOptionGroups", "master.workOptionValues"].includes(operation.collection) && !name) {
            throw new Error(`${operation.collection}: name is required.`);
          }
          const exists = (collection: string, value: unknown) => !value || rowsFor(database, collection).some((candidate) => rowId(candidate) === String(value));
          if (operation.collection === "master.workSubcategories") {
            if (!exists("master.workCategories", row.category_id)) throw new Error("Work sub-category category does not exist.");
            if (!exists("master.units", row.unit_id)) throw new Error("Work sub-category unit does not exist.");
          } else if (operation.collection === "master.articles") {
            if (!exists("master.workCategories", row.category_id)) throw new Error("Article category does not exist.");
            if (!exists("master.units", row.unit_id || row.default_unit_id)) throw new Error("Article unit does not exist.");
          } else if (operation.collection === "master.articleVariants") {
            if (!exists("master.articles", row.article_id)) throw new Error("Variant article does not exist.");
            if (!exists("master.units", row.unit_id)) throw new Error("Variant unit does not exist.");
          } else if (operation.collection === "master.subcategoryArticleMap") {
            if (!exists("master.workSubcategories", row.work_required_id)) throw new Error("Scoped material sub-category does not exist.");
            if (!exists("master.articles", row.article_id)) throw new Error("Scoped material article does not exist.");
            if (!exists("master.units", row.unit_id)) throw new Error("Scoped material unit does not exist.");
          } else if (operation.collection === "master.vendorRates" || operation.collection === "master.vendorRateHistories") {
            if (!exists("master.vendors", row.vendor_id)) throw new Error("Vendor rate vendor does not exist.");
            if (!exists("master.articles", row.article_id)) throw new Error("Vendor rate article does not exist.");
            if (!exists("master.units", row.unit_id)) throw new Error("Vendor rate unit does not exist.");
            if (!exists("master.subcategoryArticleMap", row.work_required_article_id)) throw new Error("Vendor rate scoped material does not exist.");
            if (!exists("master.articleVariants", row.variant_id)) throw new Error("Vendor rate variant does not exist.");
            const amount = Number(operation.collection === "master.vendorRates" ? row.rate : row.new_rate);
            if (!Number.isFinite(amount) || amount < 0) throw new Error("Vendor rate amount must be a non-negative number.");
            if (row.default_units_per_rate_unit != null && (!Number.isFinite(Number(row.default_units_per_rate_unit)) || Number(row.default_units_per_rate_unit) <= 0)) {
              throw new Error("Vendor rate unit conversion factor must be greater than zero.");
            }
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Targeted business validation failed.";
    if (message.startsWith("INVALID:")) throw error;
    throw new Error(`INVALID:${message}`);
  }
}

export async function prepareTargetedCommit(
  user: AuthenticatedUser,
  expectedRevision: number,
  operations: WorkspaceOperation[],
): Promise<TargetedPreparation | null> {
  if (!canUseTargetedCommit(operations)) return null;

  const startedAt = Date.now();
  const attemptedRows = new Map<string, Set<string>>();
  const loadedFullCollections = new Set<string>();
  const firstPlan = initialReadPlan(user, operations);
  markAttempted(firstPlan, attemptedRows, loadedFullCollections);
  let current = await getWorkspaceSubset(toWorkspaceReadPlan(firstPlan));
  if (current.revision !== expectedRevision) throw new Error("CONFLICT");

  for (let round = 0; round < MAX_DEPENDENCY_ROUNDS; round += 1) {
    const nextPlan = dependenciesFromLoadedData(current.data, operations);
    removeAttempted(nextPlan, attemptedRows, loadedFullCollections);
    if (planIsEmpty(nextPlan)) break;
    if (round === MAX_DEPENDENCY_ROUNDS - 1) return null;

    markAttempted(nextPlan, attemptedRows, loadedFullCollections);
    const next = await getWorkspaceSubset(toWorkspaceReadPlan(nextPlan));
    if (next.revision !== expectedRevision) throw new Error("CONFLICT");
    current = mergeSubset(current, next);
  }
  const loadedAt = Date.now();

  assertWorkspaceMutationAllowed(user, operations, current.data);
  const rawCandidate = applyWorkspaceOperations(current.data, operations);
  const canonicalRates = { ...rawCandidate, master: canonicalizeVendorRateMaster(rawCandidate.master) };
  const canonicalCandidate = applyVendorRateAverages(current.data, canonicalRates);
  const preparedOperations = diffWorkspaceOperations(current.data, canonicalCandidate);
  validateTouchedRows(canonicalCandidate, preparedOperations);
  const validatedAt = Date.now();

  return {
    current,
    operations: preparedOperations,
    loadMs: loadedAt - startedAt,
    authorizeAndValidateMs: validatedAt - loadedAt,
    queryCount: current.queryCount,
  };
}
