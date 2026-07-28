import { resolveRenderer } from "./modules";
import { permissionModuleForRoute } from "./staff-operations";
import {
  isWorkspaceEntityLocation,
  resolveWorkspaceLocation,
  type WorkspaceEntityKind,
} from "./workspace-entity-routes";

export type WorkspaceReadScope = "full" | "customer" | "site";
export type RowScopedWorkspaceEntityKind = Extract<WorkspaceEntityKind, "customer" | "site">;

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
 * Resolves the authenticated page location into the smallest supported server
 * read target. Customer and Site entity URLs retain their concrete record ID so
 * the server can load one dependency graph instead of every row in the module.
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
 * Full and collection-scoped snapshots cover narrower entity routes. A row
 * snapshot covers only the same Customer/Site URL; closing it to the module list
 * or opening a different record requires an expansion before interaction.
 */
export function workspaceReadCoverageIsCompatible(
  current: WorkspaceReadCoverage,
  requested: WorkspaceReadTarget,
): boolean {
  if (current.scope === "full") return true;
  if (current.scope !== requested.scope) return false;
  if (current.mode === "customer" || current.mode === "site") return true;

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
