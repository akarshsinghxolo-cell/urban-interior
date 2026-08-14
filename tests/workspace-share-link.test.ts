import { describe, expect, test } from "vitest";
import type { WorkspaceNavigationSnapshot } from "../src/lib/rdash/store/ui-types";
import {
  canonicalWorkspaceRecordPath,
  canonicalWorkspaceRecordUrl,
} from "../src/lib/rdash/workspace-share-link";

function snapshot(
  moduleId: string,
  kind: WorkspaceNavigationSnapshot["detailPanel"]["kind"],
  recordId: string | null,
  panelTab: WorkspaceNavigationSnapshot["detailPanel"]["panelTab"] = "overview",
  customerTab: WorkspaceNavigationSnapshot["contextHistory"][number]["customerTab"] = "overview",
): Pick<WorkspaceNavigationSnapshot, "moduleId" | "detailPanel" | "contextHistory" | "contextHistoryIndex"> {
  const contextHistory = kind === "customer" && recordId
    ? [{
        kind: "customer" as const,
        recordId,
        customerId: recordId,
        sourceModule: moduleId,
        customerTab,
        detailTab: "overview" as const,
      }]
    : [];
  return {
    moduleId,
    detailPanel: { kind, recordId, panelTab, fromModule: "context" },
    contextHistory,
    contextHistoryIndex: contextHistory.length ? 0 : -1,
  };
}

describe("canonical workspace record share links", () => {
  test("does not invent record links for module-only or drawer-only states", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("tasks", null, null),
      "/workspace/tasks",
    )).toBeUndefined();
    expect(canonicalWorkspaceRecordPath(
      snapshot("audit", "audit", "audit-1"),
      "/workspace/audit",
    )).toBeUndefined();
  });

  test("returns a clean canonical record path for overview", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("tasks", "task", "task-1"),
      "/workspace/tasks/task-1",
      "tab=overview",
    )).toBe("/workspace/tasks/task-1");
  });

  test("preserves the implemented thread view and unrelated same-route context", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("tasks", "task", "task-1", "thread"),
      "/workspace/tasks/task-1",
      "tab=thread&source=notification",
    )).toBe("/workspace/tasks/task-1?source=notification&tab=thread");
  });

  test("canonicalizes stale history links to the implemented overview state", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("invoices", "invoice", "invoice-1", "overview"),
      "/workspace/invoices/invoice-1",
      "tab=history&source=search",
    )).toBe("/workspace/invoices/invoice-1?source=search");
  });

  test("preserves durable customer workspace views", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("customerDesk", "customer", "cust-1", "overview", "activity"),
      "/workspace/customers/cust-1",
      "source=share&tab=activity",
    )).toBe("/workspace/customers/cust-1?source=share&tab=activity");
  });

  test("does not carry query state from a different route", () => {
    expect(canonicalWorkspaceRecordPath(
      snapshot("tasks", "task", "task-1", "thread"),
      "/workspace/customers",
      "source=notification&tab=activity",
    )).toBe("/workspace/tasks/task-1?tab=thread");
  });

  test("builds an absolute production-safe URL", () => {
    expect(canonicalWorkspaceRecordUrl(
      snapshot("tasks", "followup", "followup 1", "thread"),
      "/workspace/followups/followup%201",
      "tab=thread",
      "https://urban-castle.vercel.app",
    )).toBe("https://urban-castle.vercel.app/workspace/followups/followup%201?tab=thread");
  });
});
