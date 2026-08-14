import { describe, expect, test } from "vitest";
import {
  WORKSPACE_CUSTOMER_TABS,
  workspaceCustomerTabRequest,
  workspaceUrlWithCustomerTab,
} from "../src/lib/rdash/workspace-customer-tabs";

describe("workspace customer-tab query state", () => {
  test("covers every existing customer workspace tab", () => {
    expect(WORKSPACE_CUSTOMER_TABS).toEqual(expect.arrayContaining([
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
    ]));
    expect(WORKSPACE_CUSTOMER_TABS).toHaveLength(10);
  });

  test("uses overview when no customer tab is requested", () => {
    expect(workspaceCustomerTabRequest("")).toEqual({
      tab: "overview",
      explicit: false,
      invalid: false,
    });
  });

  test("accepts durable customer views", () => {
    for (const tab of WORKSPACE_CUSTOMER_TABS) {
      expect(workspaceCustomerTabRequest(`tab=${tab}`)).toEqual({
        tab,
        explicit: true,
        invalid: false,
      });
    }
  });

  test("rejects record-detail, unknown and repeated tab values", () => {
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

  test("adds a customer tab while preserving unrelated parameters", () => {
    expect(workspaceUrlWithCustomerTab(
      "/workspace/customers/cust-1",
      "source=notification",
      "activity",
    )).toBe("/workspace/customers/cust-1?source=notification&tab=activity");
    expect(workspaceUrlWithCustomerTab(
      "/workspace/customers/cust-1",
      "tab=sites&source=search",
      "payments",
    )).toBe("/workspace/customers/cust-1?source=search&tab=payments");
  });
});
