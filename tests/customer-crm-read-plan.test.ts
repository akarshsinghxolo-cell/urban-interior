import { describe, expect, test } from "vitest";
import {
  CUSTOMER_CRM_COLLECTIONS,
  CUSTOMER_CRM_FORBIDDEN_COLLECTIONS,
} from "../src/lib/rdash/server/customer-read-plan";
import { workspaceModuleReadPlan } from "../src/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";

describe("Customer CRM read plan", () => {
  test("Customer Desk and Customer Timeline share one canonical collection contract", () => {
    const desk = workspaceModuleReadPlan(workspaceReadTargetForModule("customerDesk"));
    const timeline = workspaceModuleReadPlan(workspaceReadTargetForModule("customerTimeline"));

    expect(desk.collections).toEqual(CUSTOMER_CRM_COLLECTIONS);
    expect(timeline.collections).toEqual(CUSTOMER_CRM_COLLECTIONS);
  });

  test("finance and procurement collections cannot drift into the Customer CRM surface", () => {
    for (const collection of CUSTOMER_CRM_FORBIDDEN_COLLECTIONS) {
      expect(CUSTOMER_CRM_COLLECTIONS).not.toContain(collection);
    }
  });
});
