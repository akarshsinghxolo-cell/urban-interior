import { canRole, normalizeStaffPermissions } from "../staff-operations";
import type { RDashDatabase } from "../types";
import { workspaceRouteAccessDecision } from "../workspace-route-access";
import {
  rowScopedEntityForTarget,
  type RowScopedWorkspaceEntityKind,
  type WorkspaceReadTarget,
} from "../workspace-read-scope";
import type { AuthenticatedUser } from "./auth";
import {
  CUSTOMER_CRM_DIRECT_RELATIONS,
  CUSTOMER_CRM_DOWNSTREAM_RELATIONS,
} from "./customer-read-plan";
import {
  getRestWorkspaceBySelectors,
  type EntityScopedReadPlan,
} from "./entity-scoped-rest";
import { mergeWorkspaceSubsets } from "./module-scoped-read";
import { getProjectedWorkspacePermissions } from "./projected-workspace-bootstrap";
import { getWorkspaceSubset, type WorkspaceSubset } from "./workspace";
import { rowsFor } from "./rows";

const MAX_ENTITY_IDS = 500;

export const ENTITY_REFERENCE_COLLECTIONS = Object.freeze([
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
] as const);

/** The always-safe Customer entity graph remains CRM-only. */
export const CUSTOMER_RELATION_COLLECTIONS = CUSTOMER_CRM_DIRECT_RELATIONS;

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

interface EntityScopedWorkspace extends WorkspaceSubset {
  scope: "customer" | "site";
  mode: "customer-row" | "site-row";
  entityKind: RowScopedWorkspaceEntityKind;
  entityId: string;
  collectionCount: number;
  rowCount: number;
  loadMs: number;
}

interface CustomerEntityPermissions {
  finance: boolean;
  procurement: boolean;
  media: boolean;
  vendors: boolean;
  contractors: boolean;
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

function canonicalThreadRecordIds(database: RDashDatabase, values: unknown[]): string[] {
  const customerIds = new Set(database.customers.map((customer) => customer.id));
  return unique(values.map((value) => {
    const id = String(value || "").trim();
    return customerIds.has(id) ? `customer-conversation:${id}` : id;
  }));
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

function addFullCollections(plan: EntityScopedReadPlan, collections: string[]): void {
  plan.fullCollections = unique([...(plan.fullCollections || []), ...collections]);
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
    fullCollections: kind === "customer"
      ? ["master.sourcePartners"]
      : [...ENTITY_REFERENCE_COLLECTIONS],
    rowsByCollection: kind === "customer" ? { customers: [id] } : { sites: [id] },
    jsonFieldValuesByCollection: {},
  };
  const collections = kind === "customer" ? CUSTOMER_RELATION_COLLECTIONS : SITE_RELATION_COLLECTIONS;
  const field = kind === "customer" ? "customer_id" : "site_id";
  for (const collection of collections) addJsonValues(plan, collection, field, [id]);
  addJsonValues(plan, "threads", "record_id", [kind === "customer" ? `customer-conversation:${id}` : id]);
  addJsonValues(plan, "auditLog", kind === "customer" ? "customer_id" : "entity_id", [id]);
  addJsonValues(plan, "master.fileAssets", `${kind}_id`, [id]);
  addJsonValues(plan, "master.storageFolderInstances", `${kind}_id`, [id]);
  if (kind === "site") addJsonValues(plan, "entityReferenceAssignments", "site_id", [id]);
  return plan;
}

function customerDownstreamPlan(database: RDashDatabase): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const siteIds = idsFor(database, "sites");
  const workRequiredIds = idsFor(database, "workRequired");
  const workOrderIds = idsFor(database, "workOrders");
  const quotationIds = idsFor(database, "quotations");
  const visitIds = idsFor(database, "visits");

  for (const collection of ["areas", "measurementRevisions", "visits", "tasks", "followups", "blocked", "risks", "commSends"]) {
    addJsonValues(plan, collection, "site_id", siteIds);
  }
  for (const collection of ["measurementRevisions", "quotations", "visits", "tasks", "followups"]) {
    addJsonValues(plan, collection, "work_required_id", workRequiredIds);
  }
  for (const collection of ["boqs", "drawings", "executionLogs", "variationRequests", "tasks", "followups", "commSends"]) {
    addJsonValues(plan, collection, "work_order_id", workOrderIds);
  }
  for (const collection of ["acceptedScopes", "workOrders", "tasks", "followups", "commSends"]) {
    addJsonValues(plan, collection, "quotation_id", quotationIds);
  }
  for (const collection of ["tasks", "followups"]) addJsonValues(plan, collection, "visit_id", visitIds);

  const canonical = new Set<string>([
    ...CUSTOMER_CRM_DIRECT_RELATIONS,
    ...CUSTOMER_CRM_DOWNSTREAM_RELATIONS,
  ]);
  for (const collection of requestedCollections(plan)) {
    if (!canonical.has(collection)) {
      throw new Error(`INVALID:Customer entity read escaped CRM graph via ${collection}.`);
    }
  }
  return plan;
}

function siteDownstreamPlan(database: RDashDatabase): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const customerIds = fieldValues(database, ["customer_id"]);
  addRows(plan, "customers", customerIds);

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

function downstreamPlan(
  kind: RowScopedWorkspaceEntityKind,
  database: RDashDatabase,
): EntityScopedReadPlan {
  return kind === "customer" ? customerDownstreamPlan(database) : siteDownstreamPlan(database);
}

function customerEntityPermissions(
  user: Pick<AuthenticatedUser, "role">,
  authorization: WorkspaceSubset,
): CustomerEntityPermissions {
  const permissions = normalizeStaffPermissions(
    authorization.data.staffRolePermissions as unknown[],
  );
  return {
    finance: canRole(permissions, user.role, "finance", "view"),
    procurement:
      canRole(permissions, user.role, "procurement", "view")
      || canRole(permissions, user.role, "purchaseOrders", "view")
      || canRole(permissions, user.role, "grns", "view"),
    media: canRole(permissions, user.role, "media", "view"),
    vendors: canRole(permissions, user.role, "vendors", "view"),
    contractors: canRole(permissions, user.role, "contractors", "view"),
  };
}

/**
 * Restore the rich Customer portfolio as a row-scoped graph. Cross-domain rows
 * are added only when the user's role can already view their owning module.
 */
function customerExtensionPlan(
  database: RDashDatabase,
  customerId: string,
  allowed: CustomerEntityPermissions,
): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const workOrderIds = idsFor(database, "workOrders");
  const entityIds = allLoadedEntityIds(database);

  if (allowed.media) {
    addJsonValues(plan, "entityReferenceAssignments", "customer_id", [customerId]);
    addJsonValues(plan, "entityReferenceAssignments", "entity_id", entityIds);
  }

  if (allowed.vendors) addFullCollections(plan, ["master.vendors"]);
  if (allowed.contractors) addFullCollections(plan, ["master.contractors", "master.contractorRates"]);

  if (allowed.finance) {
    for (const collection of [
      "payments", "invoices", "customerReceipts", "vendorBills", "vendorPayments",
      "contractorBills", "contractorPayments", "contractorSettlements", "workOrderCostLines", "actions",
    ]) {
      addJsonValues(plan, collection, "customer_id", [customerId]);
    }
    for (const collection of [
      "vendorBills", "vendorPayments", "contractorBills", "contractorPayments",
      "contractorSettlements", "workOrderCostLines", "actions",
    ]) {
      addJsonValues(plan, collection, "work_order_id", workOrderIds);
    }
    addJsonValues(plan, "actions", "linked_record_id", workOrderIds);
  }

  if (allowed.procurement) {
    for (const collection of ["purchaseOrders", "grns", "dispatches", "vendorRfqs", "vendorBids"]) {
      addJsonValues(plan, collection, "customer_id", [customerId]);
    }
    for (const collection of ["purchaseOrders", "grns", "dispatches", "vendorRfqs"]) {
      addJsonValues(plan, collection, "work_order_id", workOrderIds);
    }
  }

  return plan;
}

function customerExtensionDownstreamPlan(
  database: RDashDatabase,
  allowed: CustomerEntityPermissions,
): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};

  if (allowed.procurement) {
    const rfqIds = idsFor(database, "vendorRfqs");
    const poIds = idsFor(database, "purchaseOrders");
    addJsonValues(plan, "vendorBids", "rfq_id", rfqIds);
    addJsonValues(plan, "grns", "po_id", poIds);
    if (allowed.finance) addJsonValues(plan, "vendorBills", "po_id", poIds);
  }

  if (allowed.finance) {
    const vendorBillIds = idsFor(database, "vendorBills");
    const contractorBillIds = idsFor(database, "contractorBills");
    addJsonValues(plan, "vendorPayments", "vendor_bill_id", vendorBillIds);
    addJsonValues(plan, "contractorPayments", "contractor_bill_id", contractorBillIds);
    addJsonValues(plan, "actions", "linked_record_id", unique([
      ...idsFor(database, "payments"),
      ...idsFor(database, "invoices"),
      ...idsFor(database, "vendorBills"),
      ...idsFor(database, "vendorPayments"),
      ...idsFor(database, "contractorBills"),
      ...idsFor(database, "contractorPayments"),
    ]));
  }

  return plan;
}

function contextPlan(database: RDashDatabase, kind: RowScopedWorkspaceEntityKind, id: string): EntityScopedReadPlan {
  const plan: EntityScopedReadPlan = {};
  const entityIds = allLoadedEntityIds(database);
  const attachmentIds = fieldValues(database, [
    "attachment_id", "attachment_ids", "photo_attachment_ids", "proof_attachment_id", "proof_attachment_ids",
    "business_card_attachment_id", "shop_attachment_id", "photo_attachment_id",
  ]);
  const threadIds = fieldValues(database, ["thread_id"]);

  addRows(plan, "threads", threadIds);
  addRows(plan, "entityFileAttachments", attachmentIds);
  addJsonValues(plan, "threads", "record_id", canonicalThreadRecordIds(database, [...entityIds, id]));
  addJsonValues(plan, "auditLog", "entity_id", entityIds);
  addJsonValues(plan, "entityFileAttachments", "entity_id", entityIds);

  if (kind === "customer") return plan;

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

  // When a Customer role lacks Media permission there are no loaded assignment
  // rows, so this resolves nothing. Authorized Customer/Site reads resolve only
  // the referenced resources, not the whole media library.
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

  const authorization = await getProjectedWorkspacePermissions();
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    authorization.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
  if (access.status !== "allowed") {
    throw new Error(`FORBIDDEN:Your role cannot open ${access.moduleLabel}.`);
  }

  const first = relationPlan(entity.kind, entity.id);
  requestedCollections(first).forEach((collection) => touchedCollections.add(collection));
  let merged = await getRestWorkspaceBySelectors(first);
  if (merged.revision !== authorization.revision) throw new Error("READ_CONFLICT");

  const second = downstreamPlan(entity.kind, merged.data);
  requestedCollections(second).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(second));

  if (entity.kind === "customer") {
    const allowed = customerEntityPermissions(user, authorization);
    const extension = customerExtensionPlan(merged.data, entity.id, allowed);
    requestedCollections(extension).forEach((collection) => touchedCollections.add(collection));
    merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(extension));

    const extensionDownstream = customerExtensionDownstreamPlan(merged.data, allowed);
    requestedCollections(extensionDownstream).forEach((collection) => touchedCollections.add(collection));
    merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(extensionDownstream));
  }

  const context = contextPlan(merged.data, entity.kind, entity.id);
  requestedCollections(context).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(context));

  const files = filePlan(merged.data);
  requestedCollections(files).forEach((collection) => touchedCollections.add(collection));
  merged = mergeWorkspaceSubsets(merged, await getRestWorkspaceBySelectors(files));

  const revisionFence = await getWorkspaceSubset({});
  if (revisionFence.revision !== merged.revision) throw new Error("READ_CONFLICT");

  const mode = `${entity.kind}-row` as const;
  const metadata = merged.data as unknown as Record<string, unknown>;
  metadata._workspace_read_scope = target.scope;
  metadata._workspace_read_mode = mode;
  metadata._workspace_read_strategy = "row";
  metadata._workspace_read_entity = { kind: entity.kind, id: entity.id };
  metadata._workspace_read_collections = [...touchedCollections];
  metadata._workspace_foundation_embedded = false;

  return {
    ...merged,
    queryCount: merged.queryCount + authorization.queryCount + revisionFence.queryCount,
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
