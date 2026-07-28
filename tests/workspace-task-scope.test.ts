import { describe, expect, test } from "bun:test";
import {
  WORKSPACE_TASK_SCOPES,
  isWorkspaceTaskScope,
  workspaceTaskScopeRequest,
  workspaceUrlWithTaskScope,
} from "../src/lib/rdash/workspace-task-scope";

describe("workspace task scope URLs", () => {
  test("defines exactly the existing Tasks & Follow-ups scope selector", () => {
    expect(WORKSPACE_TASK_SCOPES).toEqual([
      "all",
      "today",
      "daily",
      "weekly",
      "client",
      "site",
      "staff",
      "completed",
    ]);
    for (const scope of WORKSPACE_TASK_SCOPES) expect(isWorkspaceTaskScope(scope)).toBe(true);
    expect(isWorkspaceTaskScope("calls")).toBe(false);
    expect(isWorkspaceTaskScope("overdue")).toBe(false);
  });

  test("uses All when scope is absent", () => {
    expect(workspaceTaskScopeRequest("")).toEqual({ scope: "all", explicit: false, valid: true });
    expect(workspaceTaskScopeRequest("?source=notification")).toEqual({
      scope: "all",
      explicit: false,
      valid: true,
    });
  });

  test("accepts every allowlisted non-default scope", () => {
    for (const scope of WORKSPACE_TASK_SCOPES.filter((value) => value !== "all")) {
      expect(workspaceTaskScopeRequest(`scope=${scope}`)).toEqual({
        scope,
        explicit: true,
        valid: true,
      });
    }
  });

  test("rejects empty, unsupported and repeated values", () => {
    expect(workspaceTaskScopeRequest("scope=")).toEqual({ scope: "all", explicit: true, valid: false });
    expect(workspaceTaskScopeRequest("scope=overdue")).toEqual({ scope: "all", explicit: true, valid: false });
    expect(workspaceTaskScopeRequest("scope=today&scope=staff")).toEqual({
      scope: "all",
      explicit: true,
      valid: false,
    });
  });

  test("keeps the default URL clean and preserves unrelated query state", () => {
    expect(workspaceUrlWithTaskScope("/workspace/tasks", "scope=today", "all")).toBe("/workspace/tasks");
    expect(workspaceUrlWithTaskScope(
      "/workspace/tasks",
      "source=notification&scope=today",
      "staff",
    )).toBe("/workspace/tasks?source=notification&scope=staff");
  });

  test("does not carry task scope to a different route", () => {
    expect(workspaceUrlWithTaskScope(
      "/workspace/followups",
      "source=notification&scope=today",
      "staff",
    )).toBe("/workspace/followups?source=notification");
  });
});
