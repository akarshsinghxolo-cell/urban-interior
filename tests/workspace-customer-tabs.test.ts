import { describe, expect, test } from "vitest";
import {
  WORKSPACE_CUSTOMER_TABS,
  workspaceCustomerTabRequest,
  workspaceUrlWithCustomerTab,
} from "../src/lib/rdash/workspace-customer-tabs";

describe("workspace customer-tab query state", () => {
  test("covers the restored Customer portfolio tabs", () => {
    expect(WORKSPACE_CUSTOMER_TABS).toEqual([
      "overview",
      "sites",
      "tasks",
      "quotations",
      "payments",
      "invoices",
      "advances",
      "liabilities",
      "visits",
      "activity",
    ]);
  });

  test("uses overview when no customer tab is requested", () => {
    expect(workspaceCustomerTabRequest("")).toEqual({
      tab: "overview",
      explicit: false,
      invalid: false,
    });
  });

  test("accepts every durable restored customer view", () => {
    for (const tab of WORKSPACE_CUSTOMER_TABS) {
      expect(workspaceCustomerTabRequest(`tab=${tab}`)).toEqual({
        tab,
        explicit: true,
        invalid: false,
      });
    }
  });

  test("rejects record-detail, unknown and repeated values", () => {
    expect(workspaceCustomerTabRequest("tab=thread")).toEqual({
      tab: "overview",
      explicit: true,
      invalid: true,
    });
    expect(workspaceCustomerTabRequest("tab=unknown").invalid).toBe(true);
    expect(workspaceCustomerTabRequest("tab=sites&tab=tasks").invalid).toBe(true);
  });

  test("keeps overview on the clean customer URL", () => {
    expect(workspaceUrlWithCustomerTab(
      "/workspace/customers/cust-1",
      "tab=overview",
      "overview",
    )).toBe("/workspace/customers/cust-1");
  });

  test("adds restored tabs while preserving unrelated parameters", () => {
    expect(workspaceUrlWithCustomerTab(
      "/workspace/customers/cust-1",
      "source=notification",
      "payments",
    )).toBe("/workspace/customers/cust-1?source=notification&tab=payments");
    expect(workspaceUrlWithCustomerTab(
      "/workspace/customers/cust-1",
      "tab=sites&source=search",
      "liabilities",
    )).toBe("/workspace/customers/cust-1?source=search&tab=liabilities");
  });
});
