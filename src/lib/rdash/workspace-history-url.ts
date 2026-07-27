import { isWorkspacePath, workspacePathForModule } from "./workspace-routes";

export const WORKSPACE_URL_NAVIGATION_ENABLED =
  process.env.NEXT_PUBLIC_UC_URL_NAVIGATION !== "0";

/**
 * Returns the canonical URL that should be attached to an existing managed
 * browser-history entry. Legacy root navigation remains state-only until the
 * migration redirects `/` to `/workspace`.
 */
export function workspaceHistoryUrl(
  moduleId: string,
  currentPathname: string,
  enabled = WORKSPACE_URL_NAVIGATION_ENABLED,
): string | undefined {
  if (!enabled || !isWorkspacePath(currentPathname)) return undefined;
  return workspacePathForModule(moduleId);
}
