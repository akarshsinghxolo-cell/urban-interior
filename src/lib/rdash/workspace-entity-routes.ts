import type { DetailPanelKind } from "./store/ui-types";
import { resolveWorkspacePath, workspacePathForModule, type WorkspaceRouteMatch } from "./workspace-routes";

export type WorkspaceEntityKind = Extract<
  Exclude<DetailPanelKind, null>,
  | "customer"
  | "site"
  | "contractor"
  | "vendor"
  | "workOrder"
  | "quotation"
  | "po"
  | "visit"
  | "task"
  | "followup"
  | "payment"
  | "invoice"
  | "vendorBill"
  | "contractorBill"
>;

// Compatibility name retained for the Stage 6 imports.
export type CoreWorkspaceEntityKind = WorkspaceEntityKind;

export interface WorkspaceEntityRouteDefinition {
  kind: WorkspaceEntityKind;
  moduleId: string;
  collection:
    | "customers"
    | "sites"
    | "contractors"
    | "vendors"
    | "workOrders"
    | "quotations"
    | "purchaseOrders"
    | "visits"
    | "tasks"
    | "followups"
    | "payments"
    | "invoices"
    | "vendorBills"
    | "contractorBills";
  /** Public entity namespace. Defaults to the parent module's canonical path. */
  basePath?: string;
  /** Permission key when record access is narrower than the parent module. */
  permissionModule: string;
}

export interface WorkspaceEntityLocation extends WorkspaceRouteMatch {
  entity: {
    kind: WorkspaceEntityKind;
    id: string;
    permissionModule: string;
  };
}

export type WorkspaceLocation = WorkspaceRouteMatch | WorkspaceEntityLocation;

const ENTITY_ROUTE_DEFINITIONS: readonly WorkspaceEntityRouteDefinition[] = [
  { kind: "customer", moduleId: "customerDesk", collection: "customers", permissionModule: "customers" },
  { kind: "site", moduleId: "siteExecution", collection: "sites", permissionModule: "sites" },
  { kind: "contractor", moduleId: "contractorDetail", collection: "contractors", permissionModule: "contractors" },
  { kind: "vendor", moduleId: "vendors", collection: "vendors", permissionModule: "vendors" },
  {
    kind: "workOrder",
    moduleId: "woTimeline",
    collection: "workOrders",
    basePath: "/workspace/work-orders",
    permissionModule: "workOrders",
  },
  {
    kind: "quotation",
    moduleId: "quotationDesk",
    collection: "quotations",
    basePath: "/workspace/quotations",
    permissionModule: "quotations",
  },
  {
    kind: "po",
    moduleId: "procurementInventory",
    collection: "purchaseOrders",
    basePath: "/workspace/purchase-orders",
    permissionModule: "purchaseOrders",
  },
  {
    kind: "visit",
    moduleId: "fieldOperations",
    collection: "visits",
    basePath: "/workspace/visits",
    permissionModule: "visits",
  },
  {
    kind: "task",
    moduleId: "tasks",
    collection: "tasks",
    basePath: "/workspace/tasks",
    permissionModule: "tasks",
  },
  {
    kind: "followup",
    moduleId: "tasks",
    collection: "followups",
    basePath: "/workspace/followups",
    permissionModule: "tasks",
  },
  {
    kind: "payment",
    moduleId: "payments",
    collection: "payments",
    basePath: "/workspace/payments",
    permissionModule: "finance",
  },
  {
    kind: "invoice",
    moduleId: "invoices",
    collection: "invoices",
    basePath: "/workspace/invoices",
    permissionModule: "finance",
  },
  {
    kind: "vendorBill",
    moduleId: "vendorBills",
    collection: "vendorBills",
    basePath: "/workspace/vendor-bills",
    permissionModule: "finance",
  },
  {
    kind: "contractorBill",
    moduleId: "contractorPayments",
    collection: "contractorBills",
    basePath: "/workspace/contractor-bills",
    permissionModule: "finance",
  },
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

function entityBasePath(definition: WorkspaceEntityRouteDefinition): string {
  return definition.basePath || workspacePathForModule(definition.moduleId);
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

export function workspaceEntityPath(kind: WorkspaceEntityKind, id: string): string | undefined {
  const definition = ENTITY_ROUTE_BY_KIND.get(kind);
  const normalizedId = String(id || "").trim();
  if (!definition || !normalizedId || normalizedId.includes("/") || normalizedId.includes("\\")) {
    return undefined;
  }
  return `${entityBasePath(definition)}/${encodeURIComponent(normalizedId)}`;
}

export function resolveWorkspaceLocation(input: string): WorkspaceLocation | undefined {
  const pathname = pathnameOnly(input);
  const moduleMatch = resolveWorkspacePath(pathname);
  if (moduleMatch) return moduleMatch;

  for (const definition of ENTITY_ROUTE_DEFINITIONS) {
    const basePath = entityBasePath(definition);
    if (!pathname.startsWith(`${basePath}/`)) continue;
    const remainder = pathname.slice(basePath.length + 1);
    if (!remainder || remainder.includes("/")) continue;
    const id = decodeEntityId(remainder);
    if (!id) continue;

    const parentModulePath = workspacePathForModule(definition.moduleId);
    const route = resolveWorkspacePath(parentModulePath);
    const canonicalPath = workspaceEntityPath(definition.kind, id);
    if (!route || !canonicalPath) continue;

    return {
      ...route,
      canonicalPath,
      matchedPath: pathname,
      isAlias: pathname !== canonicalPath,
      entity: {
        kind: definition.kind,
        id,
        permissionModule: definition.permissionModule,
      },
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
export const WORKSPACE_ENTITY_ROUTES = CORE_WORKSPACE_ENTITY_ROUTES;
