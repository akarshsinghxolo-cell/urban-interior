import { describe, expect, test } from "vitest";
import { MODULE_ROUTE_REGISTRY } from "@/lib/rdash/modules";
import { workspacePathForModule } from "@/lib/rdash/workspace-routes";
import { testFile } from "./test-file";

describe("workspace conversation and field navigation", () => {
  test("separates conversations from the activity timeline", () => {
    const conversations = MODULE_ROUTE_REGISTRY.get("conversationInbox");
    const timeline = MODULE_ROUTE_REGISTRY.get("unifiedThreadInbox");

    expect(conversations?.label).toBe("Conversation Inbox");
    expect(conversations?.filter).toEqual({ view: "conversation" });
    expect(workspacePathForModule("conversationInbox")).toBe("/workspace/conversations");

    expect(timeline?.label).toBe("Timeline / History");
    expect(timeline?.filter).toEqual({ view: "timeline" });
    expect(workspacePathForModule("unifiedThreadInbox")).toBe("/workspace/inbox");
  });

  test("removes the standalone measurement module while retaining field visits", async () => {
    expect(MODULE_ROUTE_REGISTRY.has("siteMeasurement")).toBe(false);
    expect(MODULE_ROUTE_REGISTRY.has("fieldOperations")).toBe(true);
    expect(await testFile("src/components/rdash/modules/SiteMeasurementModule.tsx").exists()).toBe(false);
    expect(await testFile("src/components/rdash/customer/CustomerMeasurementDialog.tsx").exists()).toBe(false);

    const routes = await testFile("src/lib/rdash/workspace-routes.ts").text();
    expect(routes).not.toContain("/workspace/field/measurements");
  });
});
