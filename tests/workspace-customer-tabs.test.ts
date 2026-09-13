import { describe, expect, test } from "vitest";
import {
  WORKSPACE_CUSTOMER_TABS,
  workspaceCustomerTabRequest,
  workspaceUrlWithCustomerTab,
} from "../src/lib/rdash/workspace-customer-tabs";

describe("workspace customer-tab query state", () => {
  test("covers only the canonical CRM customer tabs", () => {
    expect(WORKSPACE_CUSTOMER_TABS).toEqual([
      "overview",
      "sites",
      "tasks",
      "quotations",
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

  test("accepts durable customer views", () => {
    for (const tab of WORKSPACE_CUSTOMER_TABS) {
      expect(workspaceCustomerTabRequest(`tab=${tab}`)).toEqual({
        tab,
        explicit: true,
        invalid: false,
      });
    }
  });

  test("rejects retired finance tabs, record-detail, unknown and repeated values", () => {
    for (const retired of ["payments", "invoices", "advances", "liabilities"]) {
      expect(workspaceCustomerTabRequest(`tab=${retired}`)).toEqual({
        tab: "overview",
        explicit: true,
        invalid: true,
      });
    }
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
      "visits",
    )).toBe("/workspace/customers/cust-1?source=search&tab=visits");
  });
});
