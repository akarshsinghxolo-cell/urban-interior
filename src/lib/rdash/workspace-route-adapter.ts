import type { WorkspaceEntityKind } from "./workspace-entity-routes";
import { isWorkspaceEntityLocation, resolveWorkspaceLocation } from "./workspace-entity-routes";

interface WorkspaceRouteSelection {
  moduleId: string;
  canonicalPath: string;
  title: string;
  shouldActivate: boolean;
  entity?: {
    kind: WorkspaceEntityKind;
    id: string;
    permissionModule: string;
  };
}

/**
 * Resolves a URL into the existing module/detail state used by the current
 * workspace. This remains side-effect free so bootstrapping can be tested
 * independently from React, Next.js and the Zustand store.
 */
export function selectWorkspaceRoute(
  pathname: string,
  activeModuleId?: string | null,
): WorkspaceRouteSelection | undefined {
  const match = resolveWorkspaceLocation(pathname);
  if (!match) return undefined;
  const selection: WorkspaceRouteSelection = {
    moduleId: match.moduleId,
    canonicalPath: match.canonicalPath,
    title: `${match.route.label} · Urban Castle`,
    shouldActivate: match.moduleId !== activeModuleId,
  };
  if (isWorkspaceEntityLocation(match)) selection.entity = match.entity;
  return selection;
}
