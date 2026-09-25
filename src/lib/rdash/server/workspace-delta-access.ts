import { WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS } from "../workspace-delta";
import { workspaceRouteAccessDecision } from "../workspace-route-access";
import {
  tryWorkspaceReadTargetForModule,
  type ModuleWorkspaceReadScope,
  type WorkspaceReadTarget,
} from "../workspace-read-scope";
import type { AuthenticatedUser } from "./auth";
import { workspaceModuleReadPlan } from "./module-read-plans";
import { permissionAwareModuleCollections } from "./module-scoped-read";
import { getWorkspaceSubset } from "./workspace";

interface WorkspaceDeltaAccess {
  target: WorkspaceReadTarget;
  collections: Set<string>;
  droppedCollectionCount: number;
}

/**
 * Returns the largest already-authorized collection set the caller may use for
 * a delta request to one concrete module target. Client-provided collection
 * filters can only narrow this set; they can never expand it.
 *
 * The optional moduleCollections argument is supplied by the authenticated
 * route path after applying Customer permission extensions. Pure callers that
 * omit it receive only the module's safe runtime base plan.
 *
 * Canonical master.staff is deliberately not part of the universal bootstrap
 * delta set. Normal module snapshots carry a projected Staff directory, while
 * full Staff rows are present only when the target's own read plan requests
 * master.staff. This keeps the delta boundary aligned with the snapshot.
 */
export function deltaCollectionsForTarget(
  target: WorkspaceReadTarget,
  requestedCollections: ReadonlySet<string> | null,
  moduleCollections?: readonly string[],
): { collections: Set<string>; droppedCollectionCount: number } {
  if (target.scope === "bootstrap" || target.scope === "full") {
    throw new Error("INVALID:Delta synchronization requires a bounded workspace module.");
  }

  const runtimeCollections = moduleCollections ?? workspaceModuleReadPlan(target).collections;
  const allowed = new Set<string>([
    ...WORKSPACE_DELTA_BOOTSTRAP_COLLECTIONS.filter(
      (collection) => collection !== "master.staff",
    ),
    ...runtimeCollections,
  ]);

  if (!requestedCollections) {
    return { collections: allowed, droppedCollectionCount: 0 };
  }

  const collections = new Set<string>();
  let droppedCollectionCount = 0;
  for (const collection of requestedCollections) {
    if (allowed.has(collection)) collections.add(collection);
    else droppedCollectionCount += 1;
  }
  return { collections, droppedCollectionCount };
}

/**
 * Re-checks current role/custom permissions before reading revision-journal
 * rows. This prevents /api/changes from becoming a side door around the same
 * module authorization enforced by normal scoped reads.
 */
export async function authorizeWorkspaceDeltaTarget(
  user: AuthenticatedUser,
  moduleId: string,
  requestedCollections: ReadonlySet<string> | null,
): Promise<WorkspaceDeltaAccess> {
  const target = tryWorkspaceReadTargetForModule(moduleId);
  if (!target) {
    throw new Error("INVALID:The requested delta module is not a registered workspace module.");
  }
  if (target.scope === "bootstrap" || target.scope === "full") {
    throw new Error("INVALID:Delta synchronization requires a bounded workspace module.");
  }

  // Only authorization data is required here. Using the canonical subset reader
  // preserves custom Staff permission rows without loading module data or Staff HR fields.
  const permissionSnapshot = await getWorkspaceSubset({
    fullCollections: ["staffRolePermissions"],
  });
  const access = workspaceRouteAccessDecision(
    target.moduleId,
    user.role,
    permissionSnapshot.data.staffRolePermissions as unknown[],
    target.permissionModule,
  );
  if (access.status !== "allowed") {
    throw new Error(`FORBIDDEN:Your role cannot open ${access.moduleLabel}.`);
  }

  const scopedTarget = target as WorkspaceReadTarget & { scope: ModuleWorkspaceReadScope };
  const basePlan = workspaceModuleReadPlan(scopedTarget);
  const authorizedCollections = permissionAwareModuleCollections(
    user,
    scopedTarget,
    permissionSnapshot,
    basePlan.collections,
  );
  const selected = deltaCollectionsForTarget(
    scopedTarget,
    requestedCollections,
    authorizedCollections,
  );
  return {
    target: scopedTarget,
    collections: selected.collections,
    droppedCollectionCount: selected.droppedCollectionCount,
  };
}
