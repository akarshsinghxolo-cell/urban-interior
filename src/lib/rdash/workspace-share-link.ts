import type { WorkspaceNavigationSnapshot } from "./store/ui-types";
import {
  WORKSPACE_ENTITY_ROUTES,
  workspaceEntityPath,
  type WorkspaceEntityKind,
} from "./workspace-entity-routes";
import { workspaceHistoryUrl } from "./workspace-history-url";

type WorkspaceShareSnapshot = Pick<
  WorkspaceNavigationSnapshot,
  "moduleId" | "detailPanel" | "contextHistory" | "contextHistoryIndex"
>;

const SHAREABLE_ENTITY_KINDS = new Set<WorkspaceEntityKind>(
  WORKSPACE_ENTITY_ROUTES.map((definition) => definition.kind),
);

/**
 * Resolves the stable URL for the record and durable view represented by the
 * current workspace navigation snapshot. Drawer-only entities intentionally do
 * not fall back to a parent module URL because that would be a misleading share.
 */
export function canonicalWorkspaceRecordPath(
  snapshot: WorkspaceShareSnapshot,
  currentPathname: string,
  currentSearch = "",
): string | undefined {
  const kind = snapshot.detailPanel.kind;
  const recordId = snapshot.detailPanel.recordId;
  if (!kind || !recordId || !SHAREABLE_ENTITY_KINDS.has(kind as WorkspaceEntityKind)) {
    return undefined;
  }

  const entityPath = workspaceEntityPath(kind as WorkspaceEntityKind, recordId);
  if (!entityPath) return undefined;

  const canonical = workspaceHistoryUrl(snapshot, currentPathname, true, currentSearch);
  if (!canonical) return undefined;
  const canonicalPathname = canonical.split(/[?#]/, 1)[0];
  return canonicalPathname === entityPath ? canonical : undefined;
}

export function canonicalWorkspaceRecordUrl(
  snapshot: WorkspaceShareSnapshot,
  currentPathname: string,
  currentSearch: string,
  origin: string,
): string | undefined {
  const path = canonicalWorkspaceRecordPath(snapshot, currentPathname, currentSearch);
  if (!path) return undefined;
  try {
    return new URL(path, origin).toString();
  } catch {
    return undefined;
  }
}
