interface WorkspaceDeltaSyncSafety {
  authenticated: boolean;
  workspaceSyncStatus: string;
  outboxReady: boolean;
  outboxCount: number;
  dirtyFormCount: number;
  routeCovered: boolean;
  visible: boolean;
  online: boolean;
}

/** Remote state may replace the accepted snapshot only when no local work can race it. */
export function workspaceDeltaSyncIsSafe(input: WorkspaceDeltaSyncSafety): boolean {
  return input.authenticated &&
    input.workspaceSyncStatus === "saved" &&
    input.outboxReady &&
    input.outboxCount === 0 &&
    input.dirtyFormCount === 0 &&
    input.routeCovered &&
    input.visible &&
    input.online;
}
