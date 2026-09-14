import { describe, expect, test } from "vitest";
import {
  CUSTOMER_CONTRACTOR_COLLECTIONS,
  CUSTOMER_CRM_COLLECTIONS,
  CUSTOMER_CRM_DIRECT_RELATIONS,
  CUSTOMER_CRM_FORBIDDEN_COLLECTIONS,
  CUSTOMER_FINANCE_COLLECTIONS,
  CUSTOMER_MEDIA_COLLECTIONS,
  CUSTOMER_PERMISSION_AWARE_COLLECTIONS,
  CUSTOMER_PERMISSION_EXTENSION_MODULES,
  CUSTOMER_PROCUREMENT_COLLECTIONS,
  CUSTOMER_VENDOR_COLLECTIONS,
} from "../src/lib/rdash/server/customer-read-plan";
import { CUSTOMER_RELATION_COLLECTIONS } from "../src/lib/rdash/server/entity-scoped-read";
import {
  collectionsForWorkspaceReadTarget,
  workspaceModuleReadPlan,
} from "../src/lib/rdash/server/module-read-plans";
import { permissionAwareModuleCollections } from "../src/lib/rdash/server/module-scoped-read";
import { createDefaultStaffPermissions } from "../src/lib/rdash/staff-operations";
import { workspaceReadTargetForModule } from "../src/lib/rdash/workspace-read-scope";

const CUSTOMER_MODULES = CUSTOMER_PERMISSION_EXTENSION_MODULES;

const authorization = {
  data: { staffRolePermissions: createDefaultStaffPermissions() },
} as never;

describe("Customer CRM read plan", () => {
  test("every Customer-family screen starts from one canonical CRM contract", () => {
    for (const moduleId of CUSTOMER_MODULES) {
      const plan = workspaceModuleReadPlan(workspaceReadTargetForModule(moduleId));
      expect(plan.collections).toEqual(CUSTOMER_CRM_COLLECTIONS);
    }
  });

  test("static coverage includes every permission-gated Customer cockpit collection without widening the runtime base", () => {
    for (const moduleId of CUSTOMER_MODULES) {
      const target = workspaceReadTargetForModule(moduleId);
      const runtime = workspaceModuleReadPlan(target).collections;
      const coverage = collectionsForWorkspaceReadTarget(target);
      expect(runtime).toEqual(CUSTOMER_CRM_COLLECTIONS);
      for (const collection of CUSTOMER_PERMISSION_AWARE_COLLECTIONS) {
        expect(coverage, `${moduleId}: ${collection}`).toContain(collection);
      }
    }
  });

  test("Customer detail uses the same canonical direct relation graph", () => {
    expect(CUSTOMER_RELATION_COLLECTIONS).toEqual(CUSTOMER_CRM_DIRECT_RELATIONS);
  });

  test("restricted collections never drift into the Customers-only base graph", () => {
    for (const collection of CUSTOMER_CRM_FORBIDDEN_COLLECTIONS) {
      expect(CUSTOMER_CRM_COLLECTIONS).not.toContain(collection);
    }
  });

  test("Sales/Telecaller gets CRM + media but not finance, procurement, vendor or contractor masters", () => {
    const target = workspaceReadTargetForModule("customerDesk") as never;
    const collections = permissionAwareModuleCollections(
      { role: "SALES_TELECALLER" },
      target,
      authorization,
      CUSTOMER_CRM_COLLECTIONS,
    );

    for (const collection of CUSTOMER_MEDIA_COLLECTIONS) expect(collections).toContain(collection);
    for (const collection of CUSTOMER_FINANCE_COLLECTIONS) expect(collections).not.toContain(collection);
    for (const collection of CUSTOMER_PROCUREMENT_COLLECTIONS) expect(collections).not.toContain(collection);
    for (const collection of CUSTOMER_VENDOR_COLLECTIONS) expect(collections).not.toContain(collection);
    for (const collection of CUSTOMER_CONTRACTOR_COLLECTIONS) expect(collections).not.toContain(collection);
  });

  test("Operations Manager regains the full authorized Customer cockpit", () => {
    const target = workspaceReadTargetForModule("customerDesk") as never;
    const collections = permissionAwareModuleCollections(
      { role: "OPERATIONS_MANAGER" },
      target,
      authorization,
      CUSTOMER_CRM_COLLECTIONS,
    );

    for (const collection of CUSTOMER_PERMISSION_AWARE_COLLECTIONS) {
      expect(collections).toContain(collection);
    }
  });

  test("permission-aware extensions do not affect non-Customer modules", () => {
    const target = workspaceReadTargetForModule("siteExecution") as never;
    const planned = ["sites", "areas"] as const;
    expect(permissionAwareModuleCollections(
      { role: "OPERATIONS_MANAGER" },
      target,
      authorization,
      planned,
    )).toEqual(planned);
  });
});
