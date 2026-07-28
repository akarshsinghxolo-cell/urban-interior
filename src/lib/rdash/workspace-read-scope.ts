import { resolveRenderer } from "./modules";
import { permissionModuleForRoute } from "./staff-operations";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
} from "./workspace-entity-routes";

export type WorkspaceReadScope = "full" | "customer" | "site";

const CUSTOMER_SCOPE_MODULES = new Set([
  "customerDesk",
  "customerTimeline",
  "customerRequests",
]);

const SITE_SCOPE_MODULES = new Set([
  "siteExecution",
  "drawings",
  "executionLogs",
  "woTimeline",
]);

export interface WorkspaceReadTarget {
  scope: WorkspaceReadScope;
  moduleId: string;
  permissionModule: string;
}

export function workspaceReadScopeForModule(moduleId: string | null | undefined): WorkspaceReadScope {
  const id = String(moduleId || "").trim();
  if (CUSTOMER_SCOPE_MODULES.has(id)) return "customer";
  if (SITE_SCOPE_MODULES.has(id)) return "site";
  return "full";
}

export function workspaceReadScopeFromDatabase(database: unknown): WorkspaceReadScope {
  const value = database && typeof database === "object"
    ? String((database as Record<string, unknown>)._workspace_read_scope || "")
    : "";
  return value === "customer" || value === "site" ? value : "full";
}

export function workspaceReadTargetForModule(moduleId: string): WorkspaceReadTarget {
  const route = resolveRenderer(moduleId);
  return {
    scope: workspaceReadScopeForModule(route.id),
    moduleId: route.id,
    permissionModule: permissionModuleForRoute(route),
  };
}

/**
 * Resolves the authenticated page location into the smallest currently supported
 * server read scope. Entity routes retain their narrower permission key even when
 * they reuse a broader module data scope (for example Work Order -> Site scope).
 */
export function workspaceReadTargetForPath(input: string): WorkspaceReadTarget {
  const location = resolveWorkspaceLocation(input);
  if (!location) return workspaceReadTargetForModule("workdesk");
  const route = resolveRenderer(location.moduleId);
  return {
    scope: workspaceReadScopeForModule(route.id),
    moduleId: route.id,
    permissionModule: isWorkspaceEntityLocation(location)
      ? location.entity.permissionModule
      : permissionModuleForRoute(route),
  };
}

export function workspaceReadScopeIsCompatible(
  current: WorkspaceReadScope,
  requested: WorkspaceReadScope,
): boolean {
  return current === "full" || current === requested;
}
