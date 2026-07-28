import { describe, expect, test } from "bun:test";
import {
  supportsWorkspaceDetailTabs,
  workspaceDetailTabRequest,
  workspaceUrlWithDetailTab,
} from "../src/lib/rdash/workspace-detail-tabs";

describe("workspace detail-tab query state", () => {
  test("uses overview when no durable tab is requested", () => {
    expect(workspaceDetailTabRequest("", "task")).toEqual({
      tab: "overview",
      explicit: false,
      invalid: false,
    });
  });

  test("accepts only record-detail tabs backed by a renderer", () => {
    expect(workspaceDetailTabRequest("?tab=overview", "task")).toEqual({
      tab: "overview",
      explicit: true,
      invalid: false,
    });
    expect(workspaceDetailTabRequest("tab=thread", "invoice")).toEqual({
      tab: "thread",
      explicit: true,
      invalid: false,
    });
  });

  test("rejects stale history, invalid, repeated and customer-workspace values", () => {
    expect(workspaceDetailTabRequest("tab=history", "vendorBill")).toEqual({
      tab: "overview",
      explicit: true,
      invalid: true,
    });
    expect(workspaceDetailTabRequest("tab=edit", "task")).toEqual({
      tab: "overview",
      explicit: true,
      invalid: true,
    });
    expect(workspaceDetailTabRequest("tab=thread&tab=history", "task").invalid).toBe(true);
    expect(workspaceDetailTabRequest("tab=thread", "customer").invalid).toBe(true);
    expect(supportsWorkspaceDetailTabs("customer")).toBe(false);
    expect(supportsWorkspaceDetailTabs("site")).toBe(true);
  });

  test("keeps overview on the clean canonical entity URL", () => {
    expect(workspaceUrlWithDetailTab(
      "/workspace/tasks/task-1",
      "tab=overview",
      "task",
      "overview",
    )).toBe("/workspace/tasks/task-1");
  });

  test("adds thread while preserving unrelated parameters", () => {
    expect(workspaceUrlWithDetailTab(
      "/workspace/tasks/task-1",
      "source=notification",
      "task",
      "thread",
    )).toBe("/workspace/tasks/task-1?source=notification&tab=thread");
  });

  test("never emits an unsupported history destination", () => {
    expect(workspaceUrlWithDetailTab(
      "/workspace/invoices/invoice-1",
      "tab=thread&source=search",
      "invoice",
      "history",
    )).toBe("/workspace/invoices/invoice-1?source=search");
  });

  test("removes record-detail tab state from unsupported destinations", () => {
    expect(workspaceUrlWithDetailTab(
      "/workspace/customers/cust-1",
      "tab=thread&source=share",
      "customer",
      "thread",
    )).toBe("/workspace/customers/cust-1?source=share");
    expect(workspaceUrlWithDetailTab(
      "/workspace/tasks",
      "tab=history",
      undefined,
      undefined,
    )).toBe("/workspace/tasks");
  });
});
