import type { WorkspaceNavigationSnapshot } from "./store/ui-types";
import { workspaceEntityPath, type CoreWorkspaceEntityKind } from "./workspace-entity-routes";
import { isWorkspacePath, workspacePathForModule } from "./workspace-routes";

export const WORKSPACE_URL_NAVIGATION_ENABLED =
  process.env.NEXT_PUBLIC_UC_URL_NAVIGATION !== "0";

const CORE_ENTITY_KINDS = new Set<CoreWorkspaceEntityKind>([
  "customer",
  "site",
  "contractor",
  "vendor",
]);

/**
 * Returns the canonical URL attached to an existing managed history entry.
 * Core entity inspectors receive stable URLs; temporary overlays keep the
 * current entity URL because they do not replace the detail snapshot.
 */
export function workspaceHistoryUrl(
  snapshot: Pick<WorkspaceNavigationSnapshot, "moduleId" | "detailPanel">,
  currentPathname: string,
  enabled = WORKSPACE_URL_NAVIGATION_ENABLED,
): string | undefined {
  if (!enabled || !isWorkspacePath(currentPathname)) return undefined;

  const kind = snapshot.detailPanel.kind;
  const recordId = snapshot.detailPanel.recordId;
  if (kind && recordId && CORE_ENTITY_KINDS.has(kind as CoreWorkspaceEntityKind)) {
    const entityPath = workspaceEntityPath(kind as CoreWorkspaceEntityKind, recordId);
    if (entityPath) return entityPath;
  }

  return workspacePathForModule(snapshot.moduleId);
}
