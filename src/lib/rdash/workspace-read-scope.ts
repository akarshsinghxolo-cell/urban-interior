import {
  canonicalModuleId,
  isRegisteredModuleId,
  resolveRenderer,
} from "./modules";
import { permissionModuleForRoute } from "./staff-operations";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  type WorkspaceEntityKind,
} from "./workspace-entity-routes";

export type WorkspaceReadScope =
  | "bootstrap"
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
export type ModuleWorkspaceReadScope = Exclude<WorkspaceReadScope, "bootstrap" | "full">;
export type RowScopedWorkspaceEntityKind = Extract<
  WorkspaceEntityKind,
  "customer" | "site"
>;
export type WorkspaceReadStrategy =
  | "unknown"
  | "bootstrap"
  | "full"
  | "scope"
  | "module"
  | "row";

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
  "bootstrap",
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
  strategy?: WorkspaceReadStrategy;
  moduleId?: string;
  entityKind?: RowScopedWorkspaceEntityKind;
  entityId?: string;
}

export function workspaceReadScopeForModule(
  moduleId: string | null | undefined,
): WorkspaceReadScope {
  const raw = String(moduleId || "").trim();
  if (!raw || !isRegisteredModuleId(raw)) return "bootstrap";
  const id = canonicalModuleId(raw);
  return MODULE_SCOPE_BY_ID.get(id) || "bootstrap";
}

export function workspaceReadScopeFromMode(
  mode: string | null | undefined,
): WorkspaceReadScope {
  const raw = String(mode || "").trim();
  const normalized = raw.endsWith("-row")
    ? raw.slice(0, -"-row".length)
    : raw;
  return KNOWN_SCOPES.has(normalized as WorkspaceReadScope)
    ? normalized as WorkspaceReadScope
    : "bootstrap";
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

export function tryWorkspaceReadTargetForModule(
  moduleId: string | null | undefined,
): WorkspaceReadTarget | null {
  const normalized = String(moduleId || "").trim();
  if (!normalized || normalized.length > 120 || !isRegisteredModuleId(normalized)) {
    return null;
  }
  const route = resolveRenderer(normalized);
  const scope = MODULE_SCOPE_BY_ID.get(route.id);
  if (!scope) return null;
  return {
    scope,
    moduleId: route.id,
    permissionModule: permissionModuleForRoute(route),
  };
}

export function workspaceReadTargetForModule(
  moduleId: string,
): WorkspaceReadTarget {
  return tryWorkspaceReadTargetForModule(moduleId) || {
    scope: "workdesk",
    moduleId: resolveRenderer("workdesk").id,
    permissionModule: permissionModuleForRoute(resolveRenderer("workdesk")),
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
  const entityId = isWorkspaceEntityLocation(location)
    ? String(location.entity.id || "").trim()
    : "";
  return {
    scope: workspaceReadScopeForModule(route.id),
    moduleId: route.id,
    permissionModule: isWorkspaceEntityLocation(location)
      ? location.entity.permissionModule
      : permissionModuleForRoute(route),
    ...(isWorkspaceEntityLocation(location) && entityId
      ? { entity: { kind: location.entity.kind, id: entityId } }
      : {}),
  };
}

export function rowScopedEntityForTarget(
  target: WorkspaceReadTarget,
): { kind: RowScopedWorkspaceEntityKind; id: string } | undefined {
  const id = String(target.entity?.id || "").trim();
  if (
    target.entity?.kind === "customer" &&
    target.scope === "customer" &&
    id
  ) {
    return { kind: "customer", id };
  }
  if (
    target.entity?.kind === "site" &&
    target.scope === "site" &&
    id
  ) {
    return { kind: "site", id };
  }
  return undefined;
}

/**
 * A full snapshot covers every destination. Bootstrap contains authentication
 * and permission context only, so it never satisfies a module or entity read.
 * Scope snapshots cover every module assigned to the same scope. Exact-module
 * snapshots cover only the module that produced them. Customer/Site row
 * snapshots remain compatible only with the same record.
 */
export function workspaceReadCoverageIsCompatible(
  current: WorkspaceReadCoverage,
  requested: WorkspaceReadTarget,
): boolean {
  const strategy = current.strategy || (
    current.mode === current.scope ? "scope" : "unknown"
  );
  if (
    current.mode === "unknown" ||
    strategy === "unknown" ||
    current.scope === "bootstrap" ||
    strategy === "bootstrap"
  ) return false;
  if (current.scope === "full" && strategy === "full") return true;
  if (current.scope !== requested.scope) return false;

  const entity = rowScopedEntityForTarget(requested);
  if (strategy === "row" || current.mode.endsWith("-row")) {
    return Boolean(
      entity &&
        current.entityKind === entity.kind &&
        current.entityId === entity.id,
    );
  }
  if (entity) return false;
  if (strategy === "module") return current.moduleId === requested.moduleId;
  return strategy === "scope";
}

// Compatibility helper retained for existing callers and tests.
export function workspaceReadScopeIsCompatible(
  current: WorkspaceReadScope,
  requested: WorkspaceReadScope,
): boolean {
  return current === "full" || current === requested;
}
