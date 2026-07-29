import { canonicalModuleId, resolveRenderer } from "./modules";
import { permissionModuleForRoute } from "./staff-operations";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  type WorkspaceEntityKind,
} from "./workspace-entity-routes";

export type WorkspaceReadScope =
  | "full"
  | "customer"
  | "site"
  | "workdesk"
  | "quotation"
  | "field"
  | "procurement"
  | "finance"
  | "media"
  | "hr"
  | "master"
  | "reports"
  | "system";
export type ModuleWorkspaceReadScope = Exclude<WorkspaceReadScope, "full">;
export type RowScopedWorkspaceEntityKind = Extract<
  WorkspaceEntityKind,
  "customer" | "site"
>;

function buildModuleScopeMap(): Map<string, ModuleWorkspaceReadScope> {
  const map = new Map<string, ModuleWorkspaceReadScope>();
  [
    "customerDesk",
    "customerTimeline",
    "customerRequests",
    "salesPipeline",
    "lostClosedReview",
  ].forEach((id) => map.set(id, "customer"));
  [
    "siteExecution",
    "drawings",
    "executionLogs",
    "woTimeline",
    "contractorDetail",
    "contractorRates",
  ].forEach((id) => map.set(id, "site"));
  [
    "workdesk",
    "unifiedThreadInbox",
    "tasks",
    "blockedRisks",
    "approvals",
    "calendarRecurring",
  ].forEach((id) => map.set(id, "workdesk"));
  ["quotationDesk", "quotationConfig"].forEach((id) =>
    map.set(id, "quotation"),
  );
  [
    "fieldOperations",
    "siteMeasurement",
    "visitProofs",
    "fieldMode",
    "gpsTracking",
  ].forEach((id) => map.set(id, "field"));
  [
    "procurementInventory",
    "boqControlCentre",
    "grn",
    "inventory",
    "dispatch",
    "vendors",
    "vendorRates",
    "rateFinder",
  ].forEach((id) => map.set(id, "procurement"));
  [
    "financeDesk",
    "payments",
    "invoices",
    "vendorBills",
    "contractorPayments",
    "profitability",
    "commissions",
    "gstReturns",
  ].forEach((id) => map.set(id, "finance"));
  ["mediaCommunication", "driveManager", "communicationCentre"].forEach(
    (id) => map.set(id, "media"),
  );
  ["hrStaff", "attendancePayroll", "staffSalary"].forEach((id) =>
    map.set(id, "hr"),
  );
  ["masterSetup", "articleVariants"].forEach((id) =>
    map.set(id, "master"),
  );
  [
    "reportsDesk",
    "salesAnalytics",
    "collectionAnalytics",
    "operationsAnalytics",
    "financialAnalytics",
  ].forEach((id) => map.set(id, "reports"));
  [
    "systemSettings",
    "userApprovals",
    "controlBrainWorkflows",
    "approvalPolicies",
    "auditLog",
    "dataImport",
    "dataExport",
    "integrity",
  ].forEach((id) => map.set(id, "system"));
  return map;
}

const MODULE_SCOPE_BY_ID = buildModuleScopeMap();

const KNOWN_SCOPES = new Set<WorkspaceReadScope>([
  "full",
  "customer",
  "site",
  "workdesk",
  "quotation",
  "field",
  "procurement",
  "finance",
  "media",
  "hr",
  "master",
  "reports",
  "system",
]);

export interface WorkspaceReadTarget {
  scope: WorkspaceReadScope;
  moduleId: string;
  permissionModule: string;
  entity?: {
    kind: WorkspaceEntityKind;
    id: string;
  };
}

export interface WorkspaceReadCoverage {
  scope: WorkspaceReadScope;
  mode: string;
  entityKind?: RowScopedWorkspaceEntityKind;
  entityId?: string;
}

export function workspaceReadScopeForModule(
  moduleId: string | null | undefined,
): WorkspaceReadScope {
  const id = canonicalModuleId(String(moduleId || "").trim());
  return MODULE_SCOPE_BY_ID.get(id) || "full";
}

export function workspaceReadScopeFromMode(
  mode: string | null | undefined,
): WorkspaceReadScope {
  const normalized = String(mode || "")
    .trim()
    .replace(/-row$/, "") as WorkspaceReadScope;
  return KNOWN_SCOPES.has(normalized) ? normalized : "full";
}

export function workspaceReadScopeFromDatabase(
  database: unknown,
): WorkspaceReadScope {
  const value =
    database && typeof database === "object"
      ? String(
          (database as Record<string, unknown>)._workspace_read_scope || "",
        )
      : "";
  return workspaceReadScopeFromMode(value);
}

export function workspaceReadTargetForModule(
  moduleId: string,
): WorkspaceReadTarget {
  const route = resolveRenderer(moduleId);
  return {
    scope: workspaceReadScopeForModule(route.id),
    moduleId: route.id,
    permissionModule: permissionModuleForRoute(route),
  };
}

/**
 * Resolves the authenticated page location into the smallest supported server
 * read target. Customer and Site entity URLs retain their concrete record ID so
 * the server can load one dependency graph instead of every row in the module.
 */
export function workspaceReadTargetForPath(
  input: string,
): WorkspaceReadTarget {
  const location = resolveWorkspaceLocation(input);
  if (!location) return workspaceReadTargetForModule("workdesk");
  const route = resolveRenderer(location.moduleId);
  return {
    scope: workspaceReadScopeForModule(route.id),
    moduleId: route.id,
    permissionModule: isWorkspaceEntityLocation(location)
      ? location.entity.permissionModule
      : permissionModuleForRoute(route),
    ...(isWorkspaceEntityLocation(location)
      ? { entity: { kind: location.entity.kind, id: location.entity.id } }
      : {}),
  };
}

export function rowScopedEntityForTarget(
  target: WorkspaceReadTarget,
): { kind: RowScopedWorkspaceEntityKind; id: string } | undefined {
  if (
    target.entity?.kind === "customer" &&
    target.scope === "customer" &&
    target.entity.id
  ) {
    return { kind: "customer", id: target.entity.id };
  }
  if (
    target.entity?.kind === "site" &&
    target.scope === "site" &&
    target.entity.id
  ) {
    return { kind: "site", id: target.entity.id };
  }
  return undefined;
}

/**
 * A full snapshot covers every destination. Collection-scoped snapshots cover
 * every module and entity URL assigned to the same scope. Customer/Site row
 * snapshots remain compatible only with the exact same canonical record.
 */
export function workspaceReadCoverageIsCompatible(
  current: WorkspaceReadCoverage,
  requested: WorkspaceReadTarget,
): boolean {
  if (current.scope === "full") return true;
  if (current.scope !== requested.scope) return false;
  if (current.mode === current.scope) return true;

  const entity = rowScopedEntityForTarget(requested);
  return Boolean(
    entity &&
      current.mode === `${current.scope}-row` &&
      current.entityKind === entity.kind &&
      current.entityId === entity.id,
  );
}

// Compatibility helper retained for existing callers and tests.
export function workspaceReadScopeIsCompatible(
  current: WorkspaceReadScope,
  requested: WorkspaceReadScope,
): boolean {
  return current === "full" || current === requested;
}
