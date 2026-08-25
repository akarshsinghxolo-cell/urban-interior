import type { RDashDatabase } from "./types";
import type { AuthenticatedWorkspaceUser } from "./store/ui-types";
import {
  STAFF_MODULES,
  type StaffPermissionRecord,
} from "./staff-operations";
import { fieldStaffVisibleDatabase } from "./field-staff-visibility";

type Viewer = Pick<AuthenticatedWorkspaceUser, "name" | "role" | "staffId">;
type AnyRow = Record<string, unknown>;

const presentationCache = new WeakMap<RDashDatabase, Map<string, RDashDatabase>>();
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const FIELD_STAFF_ALLOWED_MODULES = new Set([
  "workspace",
  "customers",
  "sites",
  "work",
  "workOrders",
  "tasks",
  "visits",
  "attendance",
  "gps",
  "vendors",
  "contractors",
  "procurement",
  "purchaseOrders",
  "grns",
  "inventory",
  "media",
]);

const FIELD_STAFF_CREATE_MODULES = new Set([
  "customers",
  "sites",
  "work",
  "tasks",
  "visits",
  "attendance",
  "gps",
  "vendors",
  "contractors",
  "procurement",
  "grns",
  "media",
]);

const FIELD_STAFF_UPDATE_MODULES = new Set([
  "customers",
  "sites",
  "work",
  "tasks",
  "visits",
  "attendance",
  "vendors",
  "contractors",
  "grns",
]);

const FIELD_STAFF_HIDDEN_ROUTES = new Set([
  "approvals",
  "blockedRisks",
  "boqControlCentre",
  "contractorRates",
  "driveManager",
  "profitability",
  "rateFinder",
  "vendorRates",
  "articleVariants",
  "salesAnalytics",
  "collectionAnalytics",
  "operationsAnalytics",
  "financialAnalytics",
  "userApprovals",
  "controlBrainWorkflows",
  "approvalPolicies",
  "auditLog",
  "dataImport",
  "dataExport",
  "integrity",
]);

/**
 * UI-only route policy for Field Staff. The backend remains unchanged, but
 * sensitive screens cannot be shown by the Sidebar or opened through a direct
 * workspace URL even when an old custom permission row accidentally enabled
 * them.
 */
export function fieldStaffCanViewRoute(
  routeId: string | undefined,
  permissionModule: string,
): boolean {
  if (routeId && FIELD_STAFF_HIDDEN_ROUTES.has(routeId)) return false;
  return FIELD_STAFF_ALLOWED_MODULES.has(permissionModule);
}

function fieldStaffUiPermissions(): StaffPermissionRecord[] {
  const updatedAt = new Date(0).toISOString();
  return STAFF_MODULES.map(([moduleKey, moduleLabel]) => ({
    id: `field-ui-${moduleKey}`,
    role_key: "FIELD_STAFF" as const,
    module_key: moduleKey,
    module_label: moduleLabel,
    can_view: FIELD_STAFF_ALLOWED_MODULES.has(moduleKey),
    can_create: FIELD_STAFF_CREATE_MODULES.has(moduleKey),
    can_update: FIELD_STAFF_UPDATE_MODULES.has(moduleKey),
    can_approve: false,
    can_delete: false,
    updated_at: updatedAt,
  }));
}

function viewerKey(viewer: Viewer): string {
  return `${normalize(viewer.role)}:${viewer.staffId || ""}:${normalize(viewer.name)}`;
}

function belongsToViewer(
  row: AnyRow,
  viewer: Viewer,
  idFields: string[],
  nameFields: string[],
): boolean {
  if (viewer.staffId && idFields.some((field) => String(row[field] || "") === viewer.staffId)) {
    return true;
  }
  return nameFields.some((field) =>
    normalize(row[field]) !== "" && normalize(row[field]) === normalize(viewer.name));
}

function maskMoneyFields<T>(row: T): T {
  const masked = { ...(row as AnyRow) };
  for (const key of [
    "rate",
    "amount",
    "tax_rate",
    "tax_amount",
    "subtotal",
    "total",
    "total_amount",
    "discount_pct",
    "discount_amount",
    "freight_amount",
    "loading_unloading_amount",
    "other_charges",
    "reference_rate",
    "landed_rate",
  ]) {
    if (key in masked) masked[key] = 0;
  }
  return masked as T;
}

function sanitizedThreads(db: RDashDatabase, viewer: Viewer): RDashDatabase["threads"] {
  return db.threads.map((thread) => ({
    ...thread,
    messages: thread.messages.filter((message) =>
      message.kind !== "system" || normalize(message.author_name) === normalize(viewer.name)),
  }));
}

function collectVisibleFileAssetIds(
  db: RDashDatabase,
  threads: RDashDatabase["threads"],
): Set<string> {
  const ids = new Set<string>();
  for (const attachment of db.entityFileAttachments) ids.add(attachment.file_asset_id);
  for (const document of db.staffDocuments || []) {
    if (document.file_asset_id) ids.add(document.file_asset_id);
  }
  for (const thread of threads) {
    for (const message of thread.messages) {
      for (const attachment of message.attachments || []) {
        if (attachment.file_asset_id) ids.add(attachment.file_asset_id);
      }
    }
  }
  return ids;
}

/**
 * Applies the second UI-only layer for Field Staff:
 *
 * 1. The existing visibility layer limits records to created/assigned context.
 * 2. This layer removes financial/admin collections and masks sensitive fields
 *    on the operational records that remain visible.
 *
 * The complete database continues to live in the underlying Zustand store, so
 * hidden presentation rows never become delete operations during a save.
 */
export function fieldStaffPresentationDatabase(
  db: RDashDatabase,
  viewer: Viewer | null | undefined,
): RDashDatabase {
  if (!viewer || normalize(viewer.role) !== "field staff") return db;

  const key = viewerKey(viewer);
  const cached = presentationCache.get(db)?.get(key);
  if (cached) return cached;

  const visible = fieldStaffVisibleDatabase(db, viewer);
  const visibleWorkOrderIds = new Set(visible.workOrders.map((row) => row.id));
  const visibleInventory = visible.inventory
    .filter((row) => Boolean(row.work_order_id && visibleWorkOrderIds.has(row.work_order_id)))
    .map((row) => ({ ...row, rate: undefined }));
  const visibleInventoryIds = new Set(visibleInventory.map((row) => row.id));
  const visibleTaskIds = new Set(visible.tasks.map((row) => row.id));
  const visibleFollowupIds = new Set(visible.followups.map((row) => row.id));

  const ownAttendance = (visible.attendance || []).filter((row) =>
    belongsToViewer(row as unknown as AnyRow, viewer, ["staff_id"], ["staff_name"]));
  const ownLocationPings = (visible.staffLocationPings || []).filter((row) =>
    belongsToViewer(row as unknown as AnyRow, viewer, ["staff_id"], []));
  const ownLeaveRequests = (visible.leaveRequests || []).filter((row) =>
    belongsToViewer(row as unknown as AnyRow, viewer, ["staff_id"], []));
  const ownStaffDocuments = (visible.staffDocuments || []).filter((row) =>
    belongsToViewer(row as unknown as AnyRow, viewer, ["staff_id"], []));
  const ownRecurringTasks = (visible.recurringTasks || []).filter((row) =>
    belongsToViewer(
      row as unknown as AnyRow,
      viewer,
      ["assignee_id"],
      ["assignee_name"],
    ));

  const threads = sanitizedThreads(visible, viewer);
  const visibleFileAssetIds = collectVisibleFileAssetIds(
    { ...visible, staffDocuments: ownStaffDocuments },
    threads,
  );
  const resourceIds = {
    catalogue: new Set<string>(),
    pinterest_board: new Set<string>(),
    reference_media: new Set<string>(),
  };
  for (const assignment of visible.entityReferenceAssignments) {
    resourceIds[assignment.resource_type].add(assignment.resource_id);
  }

  const presented: RDashDatabase = {
    ...visible,
    workRequired: visible.workRequired.map((row) => ({ ...row, budget: undefined })),
    quotations: visible.quotations.map((row) => ({
      ...row,
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      discount_pct: undefined,
      payment_terms: [],
      terms_and_conditions: undefined,
      tax_config: undefined,
      scope_lines: row.scope_lines.map(maskMoneyFields),
      items: row.items?.map(maskMoneyFields),
    })),
    acceptedScopes: visible.acceptedScopes.map((row) => ({ ...row, accepted_value: 0 })),
    workOrders: visible.workOrders.map((row) => ({
      ...row,
      value: 0,
      contractor_award_amount: undefined,
      contractor_award_reason: undefined,
      contractor_award_approved_by: undefined,
    })),
    boqs: visible.boqs.map((row) => ({
      ...row,
      total_amount: 0,
      items: row.items.map(maskMoneyFields),
    })),
    vendorBids: visible.vendorBids.map((row) => ({
      ...row,
      quoted_amount: 0,
      lines: row.lines.map(maskMoneyFields),
    })),
    purchaseOrders: visible.purchaseOrders.map((row) => ({
      ...row,
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      approved_by: undefined,
      award_reason: undefined,
      award_approved_by: undefined,
      items: row.items.map(maskMoneyFields),
    })),
    grns: visible.grns.map((row) => ({ ...row, items: row.items.map(maskMoneyFields) })),
    inventory: visibleInventory,
    stockMovements: visible.stockMovements
      .filter((row) =>
        visibleInventoryIds.has(row.inventory_id) ||
        Boolean(row.work_order_id && visibleWorkOrderIds.has(row.work_order_id)))
      .map((row) => ({ ...row, rate: undefined })),
    dispatches: visible.dispatches.map((row) => ({
      ...row,
      items: row.items.map(maskMoneyFields),
    })),
    vendorBills: [],
    vendorPayments: [],
    contractorBills: [],
    contractorPayments: [],
    commissions: [],
    workOrderCostLines: [],
    contractorBids: visible.contractorBids.map((row) => ({
      ...row,
      quote_amount: undefined,
      rate_basis: undefined,
      reliability_score: undefined,
      on_time_pct: undefined,
      past_jobs_count: undefined,
      rating: undefined,
      evaluation_notes: undefined,
    })),
    contractorSettlements: [],
    variationRequests: visible.variationRequests.map((row) => ({
      ...row,
      requested_amount: 0,
      decision_note: undefined,
    })),
    actions: [],
    payments: [],
    invoices: [],
    customerReceipts: [],
    risks: [],
    commSends: visible.commSends.filter((row) =>
      normalize(row.staff_name) === normalize(viewer.name) ||
      Boolean(row.task_id && visibleTaskIds.has(row.task_id)) ||
      Boolean(row.followup_id && visibleFollowupIds.has(row.followup_id))),
    threads,
    attendance: ownAttendance,
    staffLocationPings: ownLocationPings,
    staffRolePermissions: fieldStaffUiPermissions(),
    staffAuthUsers: [],
    leaveRequests: ownLeaveRequests,
    payrollPeriods: [],
    payrollLines: [],
    salaryAdjustments: [],
    staffDocuments: ownStaffDocuments,
    approvalPolicies: [],
    automationRules: [],
    recurringTasks: ownRecurringTasks,
    auditLog: visible.auditLog.map((entry) => ({
      ...entry,
      reason: undefined,
      before: undefined,
      after: undefined,
      changes: undefined,
    })),
    master: {
      ...visible.master,
      vendors: visible.master.vendors.map((row) => ({
        ...row,
        outstanding: undefined,
        reliability_score: undefined,
        on_time_pct: undefined,
        notes: undefined,
        source_partner_id: undefined,
        source_partner_name: undefined,
      })),
      contractors: visible.master.contractors.map((row) => ({
        ...row,
        rating: undefined,
        active_jobs: undefined,
        outstanding: undefined,
        reliability_score: undefined,
        on_time_pct: undefined,
        past_jobs_count: undefined,
        source_partner_id: undefined,
        source_partner_name: undefined,
        work_capabilities: row.work_capabilities?.map((capability) => ({
          ...capability,
          work_type_rates: undefined,
        })),
      })),
      staff: visible.master.staff
        .filter((row) => belongsToViewer(
          row as unknown as AnyRow,
          viewer,
          ["id"],
          ["name"],
        ))
        .map((row) => ({
          ...row,
          monthly_salary: undefined,
          daily_wage: undefined,
          bank_details: undefined,
          emergency_contact: undefined,
          temporary_password: undefined,
        })),
      sourcePartners: [],
      commissionRules: [],
      vendorRates: [],
      vendorRateHistories: [],
      contractorRates: [],
      customerRateSuggestions: [],
      storageAccounts: [],
      storageFolderTemplates: [],
      storageFolderInstances: [],
      fileAssets: visible.master.fileAssets.filter((row) => visibleFileAssetIds.has(row.id)),
      catalogues: visible.master.catalogues.filter((row) => resourceIds.catalogue.has(row.id)),
      pinterestBoards: visible.master.pinterestBoards.filter((row) => resourceIds.pinterest_board.has(row.id)),
      referenceMedia: visible.master.referenceMedia.filter((row) => resourceIds.reference_media.has(row.id)),
      catalogueArticleVendorLinks: visible.master.catalogueArticleVendorLinks.filter((row) => {
        const record = row as unknown as AnyRow;
        return resourceIds.catalogue.has(String(record.catalogue_id || "")) &&
          (!record.vendor_id || visible.master.vendors.some((vendor) => vendor.id === record.vendor_id));
      }),
    },
  };

  const byViewer = presentationCache.get(db) || new Map<string, RDashDatabase>();
  byViewer.set(key, presented);
  presentationCache.set(db, byViewer);
  return presented;
}
