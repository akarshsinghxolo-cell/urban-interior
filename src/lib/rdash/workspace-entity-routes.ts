import type { DetailPanelKind } from "./store/ui-types";
import { resolveWorkspacePath, workspacePathForModule, type WorkspaceRouteMatch } from "./workspace-routes";

export type CoreWorkspaceEntityKind = Extract<
  Exclude<DetailPanelKind, null>,
  "customer" | "site" | "contractor" | "vendor"
>;

export interface WorkspaceEntityRouteDefinition {
  kind: CoreWorkspaceEntityKind;
  moduleId: string;
  collection: "customers" | "sites" | "contractors" | "vendors";
}

export interface WorkspaceEntityLocation extends WorkspaceRouteMatch {
  entity: {
    kind: CoreWorkspaceEntityKind;
    id: string;
  };
}

export type WorkspaceLocation = WorkspaceRouteMatch | WorkspaceEntityLocation;

const ENTITY_ROUTE_DEFINITIONS: readonly WorkspaceEntityRouteDefinition[] = [
  { kind: "customer", moduleId: "customerDesk", collection: "customers" },
  { kind: "site", moduleId: "siteExecution", collection: "sites" },
  { kind: "contractor", moduleId: "contractorDetail", collection: "contractors" },
  { kind: "vendor", moduleId: "vendors", collection: "vendors" },
] as const;

const ENTITY_ROUTE_BY_KIND = new Map(
  ENTITY_ROUTE_DEFINITIONS.map((definition) => [definition.kind, definition]),
);

function pathnameOnly(input: string): string {
  const raw = String(input || "").split(/[?#]/, 1)[0] || "/";
  let path = raw.startsWith("/") ? raw : `/${raw}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path;
}

function decodeEntityId(segment: string): string | undefined {
  if (!segment) return undefined;
  try {
    const value = decodeURIComponent(segment).trim();
    if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export function workspaceEntityPath(kind: CoreWorkspaceEntityKind, id: string): string | undefined {
  const definition = ENTITY_ROUTE_BY_KIND.get(kind);
  const normalizedId = String(id || "").trim();
  if (!definition || !normalizedId || normalizedId.includes("/") || normalizedId.includes("\\")) {
    return undefined;
  }
  return `${workspacePathForModule(definition.moduleId)}/${encodeURIComponent(normalizedId)}`;
}

export function resolveWorkspaceLocation(input: string): WorkspaceLocation | undefined {
  const pathname = pathnameOnly(input);
  const moduleMatch = resolveWorkspacePath(pathname);
  if (moduleMatch) return moduleMatch;

  for (const definition of ENTITY_ROUTE_DEFINITIONS) {
    const modulePath = workspacePathForModule(definition.moduleId);
    if (!pathname.startsWith(`${modulePath}/`)) continue;
    const remainder = pathname.slice(modulePath.length + 1);
    if (!remainder || remainder.includes("/")) continue;
    const id = decodeEntityId(remainder);
    if (!id) continue;
    const route = resolveWorkspacePath(modulePath);
    const canonicalPath = workspaceEntityPath(definition.kind, id);
    if (!route || !canonicalPath) continue;
    return {
      ...route,
      canonicalPath,
      matchedPath: pathname,
      isAlias: pathname !== canonicalPath,
      entity: { kind: definition.kind, id },
    };
  }

  return undefined;
}

export function isWorkspaceEntityLocation(
  location: WorkspaceLocation | undefined,
): location is WorkspaceEntityLocation {
  return Boolean(location && "entity" in location);
}

export const CORE_WORKSPACE_ENTITY_ROUTES = Object.freeze([...ENTITY_ROUTE_DEFINITIONS]);
