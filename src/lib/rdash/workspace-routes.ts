import {
  DEFAULT_MODULE_ID,
  MODULE_ROUTE_REGISTRY,
  type ModuleRoute,
} from "./modules";
import {
  LEGACY_MODULE_ALIASES,
  canonicalLegacyModuleId,
} from "./module-aliases";

export const WORKSPACE_ROOT_PATH = "/workspace";

export interface WorkspaceRouteDefinition {
  moduleId: string;
  canonicalPath: string;
  aliases?: readonly string[];
}

export interface WorkspaceRouteMatch {
  moduleId: string;
  route: ModuleRoute;
  canonicalPath: string;
  matchedPath: string;
  isAlias: boolean;
}

const ROUTE_DEFINITIONS: readonly WorkspaceRouteDefinition[] = [
  { moduleId: "workdesk", canonicalPath: "/workspace", aliases: ["/workspace/workdesk"] },
  { moduleId: "customerDesk", canonicalPath: "/workspace/customers", aliases: ["/workspace/customerDesk"] },
  { moduleId: "customerTimeline", canonicalPath: "/workspace/customers/timeline" },
  { moduleId: "customerRequests", canonicalPath: "/workspace/customers/requests" },
  { moduleId: "salesPipeline", canonicalPath: "/workspace/sales", aliases: ["/workspace/salesPipeline"] },
  { moduleId: "lostClosedReview", canonicalPath: "/workspace/sales/lost-closed-review" },
  { moduleId: "fieldOperations", canonicalPath: "/workspace/field", aliases: ["/workspace/fieldOperations", "/workspace/visits"] },
  { moduleId: "siteMeasurement", canonicalPath: "/workspace/field/measurements" },
  { moduleId: "visitProofs", canonicalPath: "/workspace/field/visit-proofs" },
  { moduleId: "fieldMode", canonicalPath: "/workspace/field/mobile" },
  { moduleId: "gpsTracking", canonicalPath: "/workspace/field/gps" },
  { moduleId: "siteExecution", canonicalPath: "/workspace/sites", aliases: ["/workspace/siteExecution"] },
  { moduleId: "drawings", canonicalPath: "/workspace/sites/drawings" },
  { moduleId: "executionLogs", canonicalPath: "/workspace/sites/execution-logs" },
  { moduleId: "woTimeline", canonicalPath: "/workspace/sites/work-order-timeline" },
  { moduleId: "quotationDesk", canonicalPath: "/workspace/quotations", aliases: ["/workspace/quotationDesk"] },
  { moduleId: "quotationConfig", canonicalPath: "/workspace/quotations/settings" },
  { moduleId: "procurementInventory", canonicalPath: "/workspace/procurement", aliases: ["/workspace/procurementInventory"] },
  { moduleId: "boqControlCentre", canonicalPath: "/workspace/procurement/boq" },
  { moduleId: "grn", canonicalPath: "/workspace/procurement/grn" },
  { moduleId: "inventory", canonicalPath: "/workspace/procurement/inventory" },
  { moduleId: "dispatch", canonicalPath: "/workspace/procurement/dispatch" },
  { moduleId: "contractorDetail", canonicalPath: "/workspace/contractors", aliases: ["/workspace/contractorDetail"] },
  { moduleId: "contractorRates", canonicalPath: "/workspace/contractors/rates" },
  { moduleId: "vendors", canonicalPath: "/workspace/vendors" },
  { moduleId: "vendorRates", canonicalPath: "/workspace/vendors/rates" },
  { moduleId: "rateFinder", canonicalPath: "/workspace/vendors/rate-finder" },
  { moduleId: "masterSetup", canonicalPath: "/workspace/masters", aliases: ["/workspace/masterSetup"] },
  { moduleId: "articleVariants", canonicalPath: "/workspace/masters/article-variants" },
  { moduleId: "financeDesk", canonicalPath: "/workspace/finance", aliases: ["/workspace/financeDesk"] },
  { moduleId: "payments", canonicalPath: "/workspace/finance/collections" },
  { moduleId: "invoices", canonicalPath: "/workspace/finance/invoices" },
  { moduleId: "vendorBills", canonicalPath: "/workspace/finance/vendor-bills" },
  { moduleId: "contractorPayments", canonicalPath: "/workspace/finance/contractor-bills" },
  { moduleId: "profitability", canonicalPath: "/workspace/finance/profitability" },
  { moduleId: "commissions", canonicalPath: "/workspace/finance/commissions" },
  { moduleId: "gstReturns", canonicalPath: "/workspace/finance/gst" },
  { moduleId: "mediaCommunication", canonicalPath: "/workspace/media", aliases: ["/workspace/mediaCommunication"] },
  { moduleId: "driveManager", canonicalPath: "/workspace/media/drive" },
  { moduleId: "communicationCentre", canonicalPath: "/workspace/media/communication" },
  { moduleId: "hrStaff", canonicalPath: "/workspace/staff", aliases: ["/workspace/hrStaff"] },
  { moduleId: "attendancePayroll", canonicalPath: "/workspace/staff/attendance-payroll" },
  { moduleId: "staffSalary", canonicalPath: "/workspace/staff/salary" },
  { moduleId: "reportsDesk", canonicalPath: "/workspace/reports", aliases: ["/workspace/reportsDesk"] },
  { moduleId: "salesAnalytics", canonicalPath: "/workspace/reports/sales" },
  { moduleId: "collectionAnalytics", canonicalPath: "/workspace/reports/collections" },
  { moduleId: "operationsAnalytics", canonicalPath: "/workspace/reports/operations" },
  { moduleId: "financialAnalytics", canonicalPath: "/workspace/reports/financial" },
  { moduleId: "systemSettings", canonicalPath: "/workspace/settings", aliases: ["/workspace/systemSettings"] },
  { moduleId: "userApprovals", canonicalPath: "/workspace/settings/access-requests" },
  { moduleId: "controlBrainWorkflows", canonicalPath: "/workspace/settings/control-brain" },
  { moduleId: "approvalPolicies", canonicalPath: "/workspace/settings/approval-rules" },
  { moduleId: "auditLog", canonicalPath: "/workspace/settings/audit-log" },
  { moduleId: "dataImport", canonicalPath: "/workspace/settings/data-import" },
  { moduleId: "dataExport", canonicalPath: "/workspace/settings/data-export" },
  { moduleId: "integrity", canonicalPath: "/workspace/settings/data-integrity" },
  { moduleId: "unifiedThreadInbox", canonicalPath: "/workspace/inbox" },
  { moduleId: "tasks", canonicalPath: "/workspace/tasks" },
  { moduleId: "blockedRisks", canonicalPath: "/workspace/obstacles" },
  { moduleId: "approvals", canonicalPath: "/workspace/approvals" },
  { moduleId: "calendarRecurring", canonicalPath: "/workspace/calendar" },
] as const;

function normalizeWorkspacePath(input: string): string {
  const rawPath = String(input || "").split(/[?#]/, 1)[0] || "/";
  let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path;
}

function legacyIdPath(moduleId: string): string {
  return normalizeWorkspacePath(`${WORKSPACE_ROOT_PATH}/${moduleId}`);
}

function buildWorkspaceRouteRegistry() {
  const byModuleId = new Map<string, WorkspaceRouteDefinition>();
  const byPath = new Map<string, { definition: WorkspaceRouteDefinition; isAlias: boolean }>();

  const registerPath = (
    path: string,
    definition: WorkspaceRouteDefinition,
    isAlias: boolean,
  ) => {
    const normalized = normalizeWorkspacePath(path);
    const existing = byPath.get(normalized);
    if (existing && existing.definition.moduleId !== definition.moduleId) {
      throw new Error(
        `Duplicate workspace path ${normalized}: ${existing.definition.moduleId} and ${definition.moduleId}`,
      );
    }
    if (existing) {
      byPath.set(normalized, {
        definition,
        isAlias: existing.isAlias && isAlias,
      });
      return;
    }
    byPath.set(normalized, { definition, isAlias });
  };

  for (const rawDefinition of ROUTE_DEFINITIONS) {
    const definition = Object.freeze({
      ...rawDefinition,
      canonicalPath: normalizeWorkspacePath(rawDefinition.canonicalPath),
      aliases: Object.freeze(
        [...(rawDefinition.aliases || [])].map(normalizeWorkspacePath),
      ),
    });

    if (byModuleId.has(definition.moduleId)) {
      throw new Error(`Duplicate workspace module route ${definition.moduleId}`);
    }

    byModuleId.set(definition.moduleId, definition);
    registerPath(definition.canonicalPath, definition, false);
    registerPath(
      legacyIdPath(definition.moduleId),
      definition,
      definition.canonicalPath !== legacyIdPath(definition.moduleId),
    );
    for (const alias of definition.aliases || []) {
      registerPath(alias, definition, true);
    }
  }

  for (const [legacyModuleId, canonicalModuleId] of Object.entries(
    LEGACY_MODULE_ALIASES,
  )) {
    const definition = byModuleId.get(canonicalModuleId);
    if (!definition) {
      throw new Error(
        `Legacy module id ${legacyModuleId} points to missing canonical module ${canonicalModuleId}`,
      );
    }
    registerPath(legacyIdPath(legacyModuleId), definition, true);
  }

  return {
    byModuleId: byModuleId as ReadonlyMap<string, WorkspaceRouteDefinition>,
    byPath: byPath as ReadonlyMap<
      string,
      { definition: WorkspaceRouteDefinition; isAlias: boolean }
    >,
  };
}

const REGISTRY = buildWorkspaceRouteRegistry();

export const WORKSPACE_ROUTE_DEFINITIONS = Object.freeze([
  ...REGISTRY.byModuleId.values(),
]);

export function workspacePathForModule(moduleId: string): string {
  const canonicalModuleId = canonicalLegacyModuleId(moduleId);
  return (
    REGISTRY.byModuleId.get(canonicalModuleId)?.canonicalPath ||
    REGISTRY.byModuleId.get(DEFAULT_MODULE_ID)?.canonicalPath ||
    WORKSPACE_ROOT_PATH
  );
}

export function resolveWorkspacePath(
  pathname: string,
): WorkspaceRouteMatch | undefined {
  const matchedPath = normalizeWorkspacePath(pathname);
  const match = REGISTRY.byPath.get(matchedPath);
  if (!match) return undefined;

  const route = MODULE_ROUTE_REGISTRY.get(match.definition.moduleId);
  if (!route) return undefined;

  return {
    moduleId: match.definition.moduleId,
    route,
    canonicalPath: match.definition.canonicalPath,
    matchedPath,
    isAlias:
      match.isAlias || matchedPath !== match.definition.canonicalPath,
  };
}

export function canonicalWorkspacePath(
  pathname: string,
): string | undefined {
  return resolveWorkspacePath(pathname)?.canonicalPath;
}

export function isWorkspacePath(pathname: string): boolean {
  const normalized = normalizeWorkspacePath(pathname);
  return (
    normalized === WORKSPACE_ROOT_PATH ||
    normalized.startsWith(`${WORKSPACE_ROOT_PATH}/`)
  );
}

export function validateWorkspaceRouteRegistry(): string[] {
  const issues: string[] = [];
  const moduleIds = [...MODULE_ROUTE_REGISTRY.values()].map(
    (route) => route.id,
  );

  for (const moduleId of moduleIds) {
    if (!REGISTRY.byModuleId.has(moduleId)) {
      issues.push(
        `Visible module route ${moduleId} has no canonical workspace URL.`,
      );
    }
  }

  for (const definition of REGISTRY.byModuleId.values()) {
    const route = MODULE_ROUTE_REGISTRY.get(definition.moduleId);
    if (!route) {
      issues.push(
        `Workspace URL ${definition.canonicalPath} points to unknown module ${definition.moduleId}.`,
      );
    }
    if (!definition.canonicalPath.startsWith(WORKSPACE_ROOT_PATH)) {
      issues.push(
        `Workspace URL for ${definition.moduleId} must start with ${WORKSPACE_ROOT_PATH}.`,
      );
    }
    if (
      definition.canonicalPath !==
      normalizeWorkspacePath(definition.canonicalPath)
    ) {
      issues.push(
        `Workspace URL for ${definition.moduleId} is not normalized.`,
      );
    }
  }

  for (const [legacyModuleId, canonicalModuleId] of Object.entries(
    LEGACY_MODULE_ALIASES,
  )) {
    if (!REGISTRY.byModuleId.has(canonicalModuleId)) {
      issues.push(
        `Legacy module id ${legacyModuleId} points to missing canonical module ${canonicalModuleId}.`,
      );
    }
  }

  return issues;
}
