import { describe, expect, test } from "vitest";
import {
  CUSTOMER_CRM_COLLECTIONS,
  CUSTOMER_CRM_DIRECT_RELATIONS,
  CUSTOMER_CRM_FORBIDDEN_COLLECTIONS,
} from "../src/lib/rdash/server/customer-read-plan";
import { CUSTOMER_RELATION_COLLECTIONS } from "../src/lib/rdash/server/entity-scoped-read";
import { workspaceModuleReadPlan } from "../src/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";
import { testFile } from "./test-file";

const CUSTOMER_MODULES = [
  "customerDesk",
  "customerTimeline",
  "customerRequests",
  "salesPipeline",
  "lostClosedReview",
] as const;

describe("Customer CRM read plan", () => {
  test("every Customer-family screen shares one canonical collection contract", () => {
    for (const moduleId of CUSTOMER_MODULES) {
      const plan = workspaceModuleReadPlan(workspaceReadTargetForModule(moduleId));
      expect(plan.collections).toEqual(CUSTOMER_CRM_COLLECTIONS);
    }
  });

  test("Customer detail uses the same canonical direct relation graph", () => {
    expect(CUSTOMER_RELATION_COLLECTIONS).toEqual(CUSTOMER_CRM_DIRECT_RELATIONS);
  });

  test("finance and procurement collections cannot drift into the Customer CRM surface", () => {
    for (const collection of CUSTOMER_CRM_FORBIDDEN_COLLECTIONS) {
      expect(CUSTOMER_CRM_COLLECTIONS).not.toContain(collection);
    }
  });

  test("Customer entity downstream traversal cannot reach restricted finance/procurement rows", async () => {
    const source = await testFile("src/lib/rdash/server/entity-scoped-read.ts").text();
    const start = source.indexOf("function customerDownstreamPlan");
    const end = source.indexOf("function siteDownstreamPlan");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const customerTraversal = source.slice(start, end);

    for (const collection of CUSTOMER_CRM_FORBIDDEN_COLLECTIONS) {
      expect(customerTraversal).not.toContain(`\"${collection}\"`);
    }
  });
});
