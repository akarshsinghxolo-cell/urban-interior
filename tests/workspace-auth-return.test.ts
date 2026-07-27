import { describe, expect, test } from "bun:test";
import {
  decodeWorkspaceReturnTo,
  encodeWorkspaceReturnTo,
  safeWorkspaceReturnTo,
  workspaceDefaultEntry,
} from "../src/lib/rdash/workspace-auth-return";

describe("workspace authentication return paths", () => {
  test("accepts same-origin workspace paths and preserves stable query parameters", () => {
    expect(safeWorkspaceReturnTo("/workspace/customers")).toBe("/workspace/customers");
    expect(safeWorkspaceReturnTo("/workspace/tasks?status=open&assignee=staff-1")).toBe(
      "/workspace/tasks?status=open&assignee=staff-1",
    );
  });

  test("round-trips the short-lived HTTP-only cookie value", () => {
    const path = "/workspace/field/gps?staff=staff-1";
    expect(decodeWorkspaceReturnTo(encodeWorkspaceReturnTo(path))).toBe(path);
  });

  test("rejects absolute, scheme-relative and backslash-normalized external URLs", () => {
    expect(safeWorkspaceReturnTo("https://example.com/workspace/customers")).toBeUndefined();
    expect(safeWorkspaceReturnTo("//example.com/workspace/customers")).toBeUndefined();
    expect(safeWorkspaceReturnTo("/\\example.com/workspace/customers")).toBeUndefined();
  });

  test("rejects non-workspace local destinations", () => {
    expect(safeWorkspaceReturnTo("/")).toBeUndefined();
    expect(safeWorkspaceReturnTo("/signin")).toBeUndefined();
    expect(safeWorkspaceReturnTo("/api/workspace")).toBeUndefined();
  });

  test("rejects malformed cookie encoding", () => {
    expect(decodeWorkspaceReturnTo("%E0%A4%A")).toBeUndefined();
  });

  test("uses routed Workdesk as the default with a rollback switch", () => {
    expect(workspaceDefaultEntry(true)).toBe("/workspace");
    expect(workspaceDefaultEntry(false)).toBeUndefined();
  });
});
