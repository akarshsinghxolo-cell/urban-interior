import type { WorkspaceNavigationSnapshot } from "./store/ui-types";
import { workspaceEntityPath, type WorkspaceEntityKind } from "./workspace-entity-routes";
import { isWorkspacePath, workspacePathForModule } from "./workspace-routes";

export const WORKSPACE_URL_NAVIGATION_ENABLED =
  process.env.NEXT_PUBLIC_UC_URL_NAVIGATION !== "0";

const URL_ENTITY_KINDS = new Set<WorkspaceEntityKind>([
  "customer",
  "site",
  "contractor",
  "vendor",
  "workOrder",
  "quotation",
  "po",
  "visit",
]);

/**
 * Returns the canonical URL attached to an existing managed history entry.
 * Supported entity inspectors receive stable URLs; temporary overlays keep the
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
  if (kind && recordId && URL_ENTITY_KINDS.has(kind as WorkspaceEntityKind)) {
    const entityPath = workspaceEntityPath(kind as WorkspaceEntityKind, recordId);
    if (entityPath) return entityPath;
  }

  return workspacePathForModule(snapshot.moduleId);
}
