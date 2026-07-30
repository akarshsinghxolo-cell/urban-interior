import {
  rowScopedEntityForTarget,
  type ModuleWorkspaceReadScope,
  type WorkspaceReadTarget,
} from "./workspace-read-scope";

const ENDPOINT_BY_SCOPE: Readonly<Record<ModuleWorkspaceReadScope, string>> = Object.freeze({
  customer: "/api/customers",
  site: "/api/sites",
  workdesk: "/api/tasks",
  quotation: "/api/quotations",
  field: "/api/field-operations",
  procurement: "/api/procurement",
  finance: "/api/finance",
  media: "/api/media",
  hr: "/api/hr",
  master: "/api/master",
  reports: "/api/reports",
  system: "/api/system",
});

/**
 * Chooses the smallest authenticated HTTP surface for the requested workspace
 * destination. Concrete Customer/Site records retain the row-graph planner;
 * module lists use dedicated scope-family endpoints.
 */
export function workspaceReadEndpointForTarget(target: WorkspaceReadTarget): string {
  if (rowScopedEntityForTarget(target)) return "/api/workspace";
  if (target.scope === "full" || target.scope === "bootstrap") return "/api/workspace";
  return ENDPOINT_BY_SCOPE[target.scope];
}
