import { describe, expect, test } from "bun:test";
import { workspaceOutboxRecordMatchesScope } from "../src/lib/uploads/workspace-outbox";

describe("workspace outbox account partition", () => {
  const item = { workspaceId: "workspace-a", ownerUserId: "user-a" };

  test("restores only the same user in the same workspace", () => {
    expect(workspaceOutboxRecordMatchesScope(item, item)).toBe(true);
    expect(workspaceOutboxRecordMatchesScope(item, {
      workspaceId: "workspace-a",
      ownerUserId: "user-b",
    })).toBe(false);
    expect(workspaceOutboxRecordMatchesScope(item, {
      workspaceId: "workspace-b",
      ownerUserId: "user-a",
    })).toBe(false);
  });

  test("does not expose records while signed out", () => {
    expect(workspaceOutboxRecordMatchesScope(item, null)).toBe(false);
  });
});
