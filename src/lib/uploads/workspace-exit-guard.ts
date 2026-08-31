import type { WorkspaceOutboxSnapshot } from "./workspace-outbox-types";

type WorkspaceExitAction = "reload" | "sign-out" | "leave";

interface WorkspaceExitRisk {
  shouldWarn: boolean;
  pendingCount: number;
  hasConflict: boolean;
  hasFailedChange: boolean;
  isSynchronizing: boolean;
}

const FAILED_STATUSES = new Set(["failed_retryable", "failed_permanent"]);
let bypassExpiresAt = 0;

export function workspaceExitRisk(snapshot: WorkspaceOutboxSnapshot): WorkspaceExitRisk {
  const items = snapshot.ready ? snapshot.items : [];
  return {
    shouldWarn: items.length > 0,
    pendingCount: items.length,
    hasConflict: items.some((item) => item.status === "conflict"),
    hasFailedChange: items.some((item) => FAILED_STATUSES.has(item.status)),
    isSynchronizing: items.some((item) => item.status === "syncing"),
  };
}

export function workspaceExitMessage(
  action: WorkspaceExitAction,
  risk: WorkspaceExitRisk,
): string {
  const count = `${risk.pendingCount} locally saved change${risk.pendingCount === 1 ? "" : "s"}`;
  const status = risk.hasConflict || risk.hasFailedChange
    ? `${count} still need review before the server can accept them.`
    : risk.isSynchronizing
      ? `${count} are still synchronizing with the server.`
      : `${count} have not reached the server yet.`;

  if (action === "sign-out") {
    return `${status}\n\nSigning out stops automatic synchronization until you sign in again. The changes will remain on this device. Continue?`;
  }
  if (action === "reload") {
    return `${status}\n\nReloading can interrupt the current synchronization attempt. The changes will remain on this device and retry after the workspace opens again. Continue?`;
  }
  return `${status}\n\nThe changes will remain on this device, but synchronization will pause while Urban Castle is closed.`;
}

export function allowNextWorkspaceExit(): void {
  bypassExpiresAt = Date.now() + 15_000;
}

export function consumeWorkspaceExitBypass(): boolean {
  if (bypassExpiresAt < Date.now()) {
    bypassExpiresAt = 0;
    return false;
  }
  bypassExpiresAt = 0;
  return true;
}

export function confirmWorkspaceExit(
  snapshot: WorkspaceOutboxSnapshot,
  action: WorkspaceExitAction,
  confirmFn: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  const risk = workspaceExitRisk(snapshot);
  if (!risk.shouldWarn) return true;
  const confirmed = confirmFn(workspaceExitMessage(action, risk));
  if (confirmed) allowNextWorkspaceExit();
  return confirmed;
}
