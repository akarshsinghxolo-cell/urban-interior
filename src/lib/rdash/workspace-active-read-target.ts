import {
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
  type WorkspaceReadTarget,
} from "./workspace-read-scope";

/**
 * Resolves the data target for the module the user is actually viewing.
 *
 * Module navigation updates the Zustand workspace state before the managed
 * browser-history URL is guaranteed to propagate through Next's usePathname()
 * subscription. During that short (and, in some browsers, persistent) mismatch,
 * trusting pathname would make the new module render against the previous
 * module's scoped snapshot and would prevent the correct scoped request from
 * starting.
 *
 * The active module therefore wins whenever pathname still belongs to another
 * module. Once both agree, pathname remains authoritative so Customer/Site
 * entity deep links keep their row-scoped target.
 */
export function workspaceReadTargetForActiveNavigation(
  pathname: string,
  activeModuleId: string,
): WorkspaceReadTarget {
  const activeTarget = workspaceReadTargetForModule(activeModuleId);
  const pathTarget = workspaceReadTargetForPath(pathname);
  return pathTarget.moduleId === activeTarget.moduleId ? pathTarget : activeTarget;
}
