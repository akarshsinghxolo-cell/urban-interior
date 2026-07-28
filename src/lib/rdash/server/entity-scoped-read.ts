import type { RDashDatabase } from "../types";
import { workspaceRouteAccessDecision } from "../workspace-route-access";
import {
  rowScopedEntityForTarget,
  type RowScopedWorkspaceEntityKind,
  type WorkspaceReadTarget,
} from "../workspace-read-scope";
import type { AuthenticatedUser } from "./auth";
import {
  getRestWorkspaceBySelectors,
  type EntityScopedReadPlan,
} from "./entity-scoped-rest";
import {
  getWorkspaceBootstrap,
  mergeWorkspaceSubsets,
} from "./module-scoped-read";
import type { WorkspaceSubset } from "./workspace";

export const ENTITY_SCOPED_READS_ENABLED = process.env.UC_ENTITY_SCOPED_READS !== "0";
const MAX_ENTITY_IDS = 500;

export const ENTITY_REFERENCE_COLLECTIONS = Object.freeze([
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
  "master.units",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.subcategoryArticleMap",
  "master.workOptionGroups",
  "master.workOptionValues",
] as const);

export const CUSTOMER_RELATION_COLLECTIONS = Object.freeze([
  "sites",
  "workRequired",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "visits",
  "tasks",
  "followups",
  "actions",
  "payments",
  "invoices",
  "customerReceipts",
  "blocked",
  "risks",
  "commSends",
  "vendorBills",
  "contractorBills",
  "commissions",
] as const);

export const SITE_RELATION_COLLECTIONS = Object.freeze([
  "areas",
  "workRequired",
  "measurementRevisions",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "vendorRfqs",
  "purchaseOrders",
  "dispatches",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorBids",
  "visits",
  "tasks",
  "followups",
  "actions",
  "payments",
  "invoices",
  "customerReceipts",
  "blocked",
  "risks",
  "commSends",
  "commissions",
] as const);

export interface EntityScopedWorkspace extends WorkspaceSubset {
  scope: "customer" | "site";
  mode: "customer-row" | "site-row";
  entityKind: RowScopedWorkspaceEntityKind;
  entityId: string;
  collectionCount: number;
  rowCount: number;
  loadMs: number;
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

function unique(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, MAX_ENTITY_IDS);
}

function idsFor(database: RDashDatabase, collection: string): string[] {
  return unique(rowsFor(database, collection).map((row) => row.id));
}

function fieldValues(database: RDashDatabase, fields: string[]): string[] {
  const values: unknown[] = [];
  for (const collection of Object.keys(database as unknown as Record<string, unknown>)) {
    if (collection === "master") continue;
    for (const row of rowsFor(database, collection)) {
      for (const field of fields) {
        const value = row[field];
        if (Array.isArray(value)) values.push(...value);
        else values.push(value);
      }
    }
  }
  for (const collection of Object.keys(database.master as unknown as Record<string, unknown>)) {
    for (const row of rowsFor(database, `master.${collection}`)) {
      for (const field of fields) {
        const value = row[field];
        if (Array.isArray(value)) values.push(...value);
        else values.push(value);
      }
    }
  }
  return unique(values);
}

function allLoadedEntityIds(database: RDashDatabase): string[] {
  const values: unknown[] = [];
  for (const [collection, rows] of Object.entries(database as unknown as Record<string, unknown>)) {
    if (collection === "master" || !Array.isArray(rows)) continue;
    for (const row of rows as Array<Record<string, unknown>>) values.push(row.id);
  }
  return unique(values);
}

function addJsonValues(
  plan: EntityScopedReadPlan,
  collection: string,
  field: string,
  values: string[],
): void {
  if (!values.length) return;
  plan.jsonFieldValuesByCollection ||= {};
  plan.jsonFieldValuesByCollection[collection] ||= {};
  const current = plan.jsonFieldValuesByCollection[collection][field] || [];
  plan.jsonFieldValuesByCollection[collection][field] = unique([...current, ...values]);
}

function addRows(plan: EntityScopedReadPlan, collection: string, values: string[]): void {
  if (!values.length) return;
  plan.rowsByCollection ||= {};
  plan.rowsByCollection[collection] = unique([...(plan.rowsByCollection[collection] || []), ...values]);
}

function requestedCollections(plan: EntityScopedReadPlan): string[] {
  return unique([
    ...(plan.fullCollections || []),
    ...Object.keys(plan.rowsByCollection || {}),
    ...Object.keys(plan.jsonFieldValuesByCollection || {}),
  ]);
}

function relationPlan(
  kind: RowScopedWorkspaceEntityKind,
  id: string,
): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {
    fullCollections: [...ENTITY_REFERENCE_COLLECTIONS],
    rowsByCollection: kind === "customer" ? { customers: [id] } : { sites: [id] },
    jsonFieldValuesByCollection: {},
  };
  const collections = kind === "customer" ? CUSTOMER_RELATION_COLLECTIONS : SITE_RELATION_COLLECTIONS;
  const field = kind === "customer" ? "customer_id" : "site_id";
  for (const collection of collections) addJsonValues(plan, collection, field, [id]);
  addJsonValues(plan, "threads", "record_id", [id, `${kind}-conversation:${id}`]);
  addJsonValues(plan, "auditLog", kind === "customer" ? "customer_id" : "entity_id", [id]);
  addJsonValues(plan, "master.fileAssets", `${kind}_id`, [id]);
  addJsonValues(plan, "master.storageFolderInstances", `${kind}_id`, [id]);
  addJsonValues(plan, "entityReferenceAssignments", `${kind}_id`, [id]);
  return plan;
}

function downstreamPlan(
  kind: RowScopedWorkspaceEntityKind,
  database: RDashDatabase,
): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const siteIds = idsFor(database, "sites");
  if (kind === "customer") {
    for (const collection of SITE_RELATION_COLLECTIONS) addJsonValues(plan, collection, "site_id", siteIds);
  } else {
    const customerIds = fieldValues(database, ["customer_id"]);
    addRows(plan, "customers", customerIds);
  }

  const workOrderIds = idsFor(database, "workOrders");
  const quotationIds = idsFor(database, "quotations");
  const rfqIds = idsFor(database, "vendorRfqs");
  const poIds = idsFor(database, "purchaseOrders");
  const contractorBillIds = idsFor(database, "contractorBills");
  const vendorBillIds = idsFor(database, "vendorBills");
  const visitIds = idsFor(database, "visits");

  for (const collection of [
    "boqs", "vendorRfqs", "purchaseOrders", "grns", "dispatches", "vendorBills",
    "vendorPayments", "contractorBills", "contractorPayments", "contractorBids",
    "contractorSettlements", "workOrderCostLines", "drawings", "executionLogs",
    "variationRequests", "tasks", "followups", "commSends", "commissions",
    "stockMovements", "attendance",
  ]) {
    addJsonValues(plan, collection, "work_order_id", workOrderIds);
  }
  for (const collection of ["acceptedScopes", "workOrders", "tasks", "followups", "commSends", "commissions"]) {
    addJsonValues(plan, collection, "quotation_id", quotationIds);
  }
  addJsonValues(plan, "vendorBids", "rfq_id", rfqIds);
  for (const collection of ["grns", "vendorBills"]) addJsonValues(plan, collection, "po_id", poIds);
  addJsonValues(plan, "contractorPayments", "contractor_bill_id", contractorBillIds);
  addJsonValues(plan, "vendorPayments", "vendor_bill_id", vendorBillIds);
  addJsonValues(plan, "tasks", "visit_id", visitIds);
  return plan;
}

function contextPlan(database: RDashDatabase, kind: RowScopedWorkspaceEntityKind, id: string): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const entityIds = allLoadedEntityIds(database);
  const attachmentIds = fieldValues(database, [
    "attachment_id", "attachment_ids", "photo_attachment_ids", "proof_attachment_id",
    "business_card_attachment_id", "shop_attachment_id", "photo_attachment_id",
  ]);
  const threadIds = fieldValues(database, ["thread_id"]);

  addRows(plan, "threads", threadIds);
  addRows(plan, "entityFileAttachments", attachmentIds);
  addJsonValues(plan, "threads", "record_id", unique([...entityIds, id, `${kind}-conversation:${id}`]));
  addJsonValues(plan, "auditLog", "entity_id", entityIds);
  addJsonValues(plan, "entityFileAttachments", "entity_id", entityIds);
  addJsonValues(plan, "entityReferenceAssignments", "entity_id", entityIds);

  addRows(plan, "master.vendors", fieldValues(database, ["vendor_id"]));
  addRows(plan, "master.contractors", fieldValues(database, ["contractor_id", "abandoned_contractor_id"]));
  addRows(plan, "master.staff", fieldValues(database, ["staff_id", "assignee_id", "assigned_to_staff_id"]));
  addRows(plan, "master.sourcePartners", fieldValues(database, ["source_partner_id"]));
  addJsonValues(plan, "master.vendorRates", "vendor_id", fieldValues(database, ["vendor_id"]));
  addJsonValues(plan, "master.contractorRates", "contractor_id", fieldValues(database, ["contractor_id"]));
  return plan;
}

function filePlan(database: RDashDatabase): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  addRows(plan, "master.fileAssets", fieldValues(database, ["file_asset_id", "drive_asset_id"]));

  const catalogueIds: string[] = [];
  const pinterestIds: string[] = [];
  const referenceIds: string[] = [];
  for (const row of rowsFor(database, "entityReferenceAssignments")) {
    const id = String(row.resource_id || "").trim();
    if (!id) continue;
    if (row.resource_type === "catalogue") catalogueIds.push(id);
    else if (row.resource_type === "pinterest_board") pinterestIds.push(id);
    else if (row.resource_type === "reference_media") referenceIds.push(id);
  }
  addRows(plan, "master.catalogues", unique(catalogueIds));
  addRows(plan, "master.pinterestBoards", unique(pinterestIds));
  addRows(plan, "master.referenceMedia", unique(referenceIds));
  return plan;
}

function countRows(database: RDashDatabase): number {
  let count = 0;
  for (const value of Object.values(database as unknown as Record<string, unknown>)) {
    if (Array.isArray(value)) count += value.length;
  }
  for (const value of Object.values(database.master as unknown as Record<string, unknown>)) {
    if (Array.isArray(value)) count += value.length;
  }
  return count;
}

async function readEntityScope(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<EntityScopedWorkspace> {
  const entity = rowScopedEntityForTarget(target);
  if (!entity) throw new Error("INVALID:This route does not support an entity-scoped read.");
  const startedAt = performance.now();
  const touchedCollections = new Set<string>();

  let merged = await getWorkspaceBootstrap(user);
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    merged.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
  if (access.status !== "allowed") {
    throw new Error(`FORBIDDEN:Your role cannot open ${access.moduleLabel}.`);
  }

  for (const plan of [
    relationPlan(entity.kind, entity.id),
  ]) {
    requestedCollections(plan).forEach((collection) => touchedCollections.add(collection));
    merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(plan));
  }

  const second = downstreamPlan(entity.kind, merged.data);
  requestedCollections(second).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(second));

  const third = contextPlan(merged.data, entity.kind, entity.id);
  requestedCollections(third).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(third));

  const fourth = filePlan(merged.data);
  requestedCollections(fourth).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(fourth));

  const mode = `${entity.kind}-row` as const;
  const metadata = merged.data as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = target.scope;
  metadata._workspace_read_mode = mode;
  metadata._workspace_read_entity = { kind: entity.kind, id: entity.id };
  metadata._workspace_read_collections = [...touchedCollections];

  return {
    ...merged,
    scope: target.scope as "customer" | "site",
    mode,
    entityKind: entity.kind,
    entityId: entity.id,
    collectionCount: touchedCollections.size,
    rowCount: countRows(merged.data),
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

/**
 * Produces one coherent Customer/Site graph. Every bounded round reads the
 * workspace revision; any concurrent write restarts the entire graph once.
 */
export async function getEntityScopedWorkspace(
  user: AuthenticatedUser,
  target: WorkspaceReadTarget,
): Promise<EntityScopedWorkspace> {
  try {
    return await readEntityScope(user, target);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "READ_CONFLICT") throw error;
    return readEntityScope(user, target);
  }
}
