import type { WorkspaceNavigationSnapshot } from "./store/ui-types";
import { workspaceUrlWithDetailTab } from "./workspace-detail-tabs";
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
  "task",
  "followup",
  "payment",
  "invoice",
  "vendorBill",
  "contractorBill",
]);

/**
 * Returns the canonical URL attached to an existing managed history entry.
 * Supported entity inspectors receive stable URLs; temporary overlays keep the
 * current entity URL because they do not replace the detail snapshot.
 *
 * Detail-tab changes update the current entry rather than creating a new Back
 * step. Query parameters are retained only when the target path is unchanged.
 */
export function workspaceHistoryUrl(
  snapshot: Pick<WorkspaceNavigationSnapshot, "moduleId" | "detailPanel">,
  currentPathname: string,
  enabled = WORKSPACE_URL_NAVIGATION_ENABLED,
  currentSearch = "",
): string | undefined {
  if (!enabled || !isWorkspacePath(currentPathname)) return undefined;

  const kind = snapshot.detailPanel.kind;
  const recordId = snapshot.detailPanel.recordId;
  if (kind && recordId && URL_ENTITY_KINDS.has(kind as WorkspaceEntityKind)) {
    const entityPath = workspaceEntityPath(kind as WorkspaceEntityKind, recordId);
    if (entityPath) {
      return workspaceUrlWithDetailTab(
        entityPath,
        entityPath === currentPathname ? currentSearch : "",
        kind,
        snapshot.detailPanel.panelTab,
      );
    }
  }

  const modulePath = workspacePathForModule(snapshot.moduleId);
  return workspaceUrlWithDetailTab(
    modulePath,
    modulePath === currentPathname ? currentSearch : "",
    undefined,
    undefined,
  );
}
