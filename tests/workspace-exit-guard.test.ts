import { describe, expect, test } from "bun:test";
import type {
  WorkspaceCommitOutboxRecord,
  WorkspaceOutboxSnapshot,
  WorkspaceOutboxStatus,
} from "../src/lib/uploads/workspace-outbox-types";
import {
  confirmWorkspaceExit,
  consumeWorkspaceExitBypass,
  workspaceExitMessage,
  workspaceExitRisk,
} from "../src/lib/uploads/workspace-exit-guard";

function item(status: WorkspaceOutboxStatus, id = status): WorkspaceCommitOutboxRecord {
  return {
    operationId: id,
    workspaceId: "default",
    revision: 1,
    operations: [],
    uploadBatchIds: [],
    status,
    retryCount: 0,
    summary: [],
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function snapshot(
  items: WorkspaceCommitOutboxRecord[],
  ready = true,
): WorkspaceOutboxSnapshot {
  return { ready, online: true, items };
}

describe("workspace exit protection", () => {
  test("does not warn before outbox hydration or when all changes are synchronized", () => {
    expect(workspaceExitRisk(snapshot([item("pending")], false)).shouldWarn).toBe(false);
    expect(workspaceExitRisk(snapshot([]))).toEqual({
      shouldWarn: false,
      pendingCount: 0,
      hasConflict: false,
      hasFailedChange: false,
      isSynchronizing: false,
    });
  });

  test("summarizes pending and synchronizing changes", () => {
    const risk = workspaceExitRisk(snapshot([item("pending"), item("syncing")]));
    expect(risk).toEqual({
      shouldWarn: true,
      pendingCount: 2,
      hasConflict: false,
      hasFailedChange: false,
      isSynchronizing: true,
    });
    expect(workspaceExitMessage("reload", risk)).toContain("2 locally saved changes are still synchronizing");
    expect(workspaceExitMessage("reload", risk)).toContain("remain on this device");
  });

  test("uses stronger review wording for conflicts and permanent failures", () => {
    const risk = workspaceExitRisk(snapshot([
      item("conflict", "conflict-1"),
      item("failed_permanent", "failed-1"),
    ]));
    expect(risk.hasConflict).toBe(true);
    expect(risk.hasFailedChange).toBe(true);
    expect(workspaceExitMessage("sign-out", risk)).toContain("still need review");
    expect(workspaceExitMessage("sign-out", risk)).toContain("stops automatic synchronization");
  });

  test("cancellation keeps the exit guard active", () => {
    const pending = snapshot([item("pending")]);
    expect(confirmWorkspaceExit(pending, "reload", () => false)).toBe(false);
    expect(consumeWorkspaceExitBypass()).toBe(false);
  });

  test("confirmation grants exactly one unload bypass", () => {
    const pending = snapshot([item("pending")]);
    expect(confirmWorkspaceExit(pending, "sign-out", () => true)).toBe(true);
    expect(consumeWorkspaceExitBypass()).toBe(true);
    expect(consumeWorkspaceExitBypass()).toBe(false);
  });

  test("synchronized work exits without prompting", () => {
    let prompted = false;
    expect(confirmWorkspaceExit(snapshot([]), "reload", () => {
      prompted = true;
      return false;
    })).toBe(true);
    expect(prompted).toBe(false);
  });
});
