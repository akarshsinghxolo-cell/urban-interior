import type { ContextCustomerTab, WorkspaceNavigationSnapshot } from "./store/ui-types";
import { workspaceUrlWithCustomerTab } from "./workspace-customer-tabs";
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

type HistoryUrlSnapshot = Pick<
  WorkspaceNavigationSnapshot,
  "moduleId" | "detailPanel" | "contextHistory" | "contextHistoryIndex"
>;

function activeCustomerTab(snapshot: HistoryUrlSnapshot): ContextCustomerTab {
  const index = snapshot.contextHistoryIndex;
  const entry = index >= 0 ? snapshot.contextHistory[index] : undefined;
  if (
    entry?.kind === "customer" &&
    entry.recordId === snapshot.detailPanel.recordId
  ) {
    return entry.customerTab || "overview";
  }
  return "overview";
}

/**
 * Returns the canonical URL attached to an existing managed history entry.
 * Supported entity inspectors receive stable URLs; temporary overlays keep the
 * current entity URL because they do not replace the detail snapshot.
 *
 * Customer and detail-tab changes update the current entry rather than creating
 * a new Back step. Query parameters are retained only when the target path is
 * unchanged.
 */
export function workspaceHistoryUrl(
  snapshot: HistoryUrlSnapshot,
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
      const search = entityPath === currentPathname ? currentSearch : "";
      if (kind === "customer") {
        return workspaceUrlWithCustomerTab(
          entityPath,
          search,
          activeCustomerTab(snapshot),
        );
      }
      return workspaceUrlWithDetailTab(
        entityPath,
        search,
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
