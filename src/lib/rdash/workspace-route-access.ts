import { resolveRenderer } from "./modules";
import {
  canRole,
  normalizeStaffPermissions,
  permissionModuleForRoute,
  type StaffPermissionRecord,
} from "./staff-operations";

export type WorkspaceRouteAccess = "pending" | "allowed" | "denied";

export interface WorkspaceRouteAccessDecision {
  status: WorkspaceRouteAccess;
  moduleId: string;
  moduleLabel: string;
  permissionModule: string;
}

/**
 * Uses the same normalized role-permission matrix as the Sidebar. Entity routes
 * may provide a narrower permission key than their parent module—for example a
 * Purchase Order detail requires `purchaseOrders`, not merely `procurement`.
 */
export function workspaceRouteAccessDecision(
  moduleId: string,
  role: string | null | undefined,
  rawPermissions: unknown[] | undefined,
  permissionModuleOverride?: string,
): WorkspaceRouteAccessDecision {
  const route = resolveRenderer(moduleId);
  const permissionModule = permissionModuleOverride || permissionModuleForRoute(route);
  if (!role) {
    return {
      status: "pending",
      moduleId: route.id,
      moduleLabel: route.label,
      permissionModule,
    };
  }

  const permissions = normalizeStaffPermissions(rawPermissions) as StaffPermissionRecord[];
  return {
    status: canRole(permissions, role, permissionModule, "view") ? "allowed" : "denied",
    moduleId: route.id,
    moduleLabel: route.label,
    permissionModule,
  };
}
