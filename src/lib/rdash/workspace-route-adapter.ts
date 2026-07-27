import { resolveWorkspacePath } from "./workspace-routes";

export interface WorkspaceRouteSelection {
  moduleId: string;
  canonicalPath: string;
  title: string;
  shouldActivate: boolean;
}

/**
 * Resolves a URL into the existing module state used by the current workspace.
 * This is deliberately side-effect free so route bootstrapping can be tested
 * independently from React, Next.js and the Zustand store.
 */
export function selectWorkspaceRoute(
  pathname: string,
  activeModuleId?: string | null,
): WorkspaceRouteSelection | undefined {
  const match = resolveWorkspacePath(pathname);
  if (!match) return undefined;
  return {
    moduleId: match.moduleId,
    canonicalPath: match.canonicalPath,
    title: `${match.route.label} · Urban Castle`,
    shouldActivate: match.moduleId !== activeModuleId,
  };
}
