import { describe, expect, test } from "bun:test";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  CUSTOMER_SCOPE_COLLECTIONS,
  SITE_SCOPE_COLLECTIONS,
  WORKSPACE_BOOTSTRAP_COLLECTIONS,
  collectionsForWorkspaceReadScope,
  mergeWorkspaceSubsets,
} from "@/lib/rdash/server/module-scoped-read";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";
import {
  workspaceReadScopeForModule,
  workspaceReadScopeIsCompatible,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";

function emptyDatabase(): RDashDatabase {
  const database = structuredClone(buildSeedDatabase()) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(database)) {
    if (Array.isArray(value)) database[key] = [];
  }
  const master = database.master as Record<string, unknown>;
  for (const [key, value] of Object.entries(master)) {
    if (Array.isArray(value)) master[key] = [];
  }
  return database as unknown as RDashDatabase;
}

describe("workspace module read scopes", () => {
  test("maps Customer and Site route families without widening unrelated modules", () => {
    expect(workspaceReadScopeForModule("customerDesk")).toBe("customer");
    expect(workspaceReadScopeForModule("customerTimeline")).toBe("customer");
    expect(workspaceReadScopeForModule("siteExecution")).toBe("site");
    expect(workspaceReadScopeForModule("drawings")).toBe("site");
    expect(workspaceReadScopeForModule("tasks")).toBe("full");
    expect(workspaceReadScopeForModule("financeDesk")).toBe("full");
  });

  test("retains entity-specific permission keys while reusing module scopes", () => {
    const customer = workspaceReadTargetForPath("/workspace/customers/cust-123");
    expect(customer).toMatchObject({
      scope: "customer",
      moduleId: "customerDesk",
      permissionModule: "customers",
    });

    const site = workspaceReadTargetForPath("/workspace/sites/site-123");
    expect(site).toMatchObject({
      scope: "site",
      moduleId: "siteExecution",
      permissionModule: "sites",
    });

    const workOrder = workspaceReadTargetForPath("/workspace/work-orders/wo-123");
    expect(workOrder).toMatchObject({
      scope: "site",
      moduleId: "woTimeline",
      permissionModule: "workOrders",
    });
  });

  test("treats full snapshots as compatible and scoped families as isolated", () => {
    expect(workspaceReadScopeIsCompatible("full", "customer")).toBe(true);
    expect(workspaceReadScopeIsCompatible("full", "site")).toBe(true);
    expect(workspaceReadScopeIsCompatible("customer", "customer")).toBe(true);
    expect(workspaceReadScopeIsCompatible("site", "site")).toBe(true);
    expect(workspaceReadScopeIsCompatible("customer", "site")).toBe(false);
    expect(workspaceReadScopeIsCompatible("site", "full")).toBe(false);
  });
});

describe("module-scoped collection plans", () => {
  const knownCollections = new Set(Object.keys(COLLECTION_TO_TABLE));
  const fullCollectionCount = knownCollections.size;

  function assertValidPlan(collections: readonly string[]) {
    expect(new Set(collections).size).toBe(collections.length);
    for (const collection of collections) {
      expect(knownCollections.has(collection)).toBe(true);
    }
    expect(collections.length).toBeLessThan(fullCollectionCount * 0.8);
  }

  test("uses a minimal permission bootstrap", () => {
    expect(WORKSPACE_BOOTSTRAP_COLLECTIONS).toEqual(["staffRolePermissions"]);
  });

  test("Customer scope is valid, bounded, and excludes unrelated administration", () => {
    assertValidPlan(CUSTOMER_SCOPE_COLLECTIONS);
    expect(collectionsForWorkspaceReadScope("customer")).toBe(CUSTOMER_SCOPE_COLLECTIONS);
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("customers");
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("sites");
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("tasks");
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("threads");
    expect(CUSTOMER_SCOPE_COLLECTIONS).not.toContain("attendance");
    expect(CUSTOMER_SCOPE_COLLECTIONS).not.toContain("payrollPeriods");
    expect(CUSTOMER_SCOPE_COLLECTIONS).not.toContain("automationRules");
  });

  test("Site scope is valid, bounded, and includes execution dependencies", () => {
    assertValidPlan(SITE_SCOPE_COLLECTIONS);
    expect(collectionsForWorkspaceReadScope("site")).toBe(SITE_SCOPE_COLLECTIONS);
    expect(SITE_SCOPE_COLLECTIONS).toContain("workRequired");
    expect(SITE_SCOPE_COLLECTIONS).toContain("measurementRevisions");
    expect(SITE_SCOPE_COLLECTIONS).toContain("workOrders");
    expect(SITE_SCOPE_COLLECTIONS).toContain("purchaseOrders");
    expect(SITE_SCOPE_COLLECTIONS).toContain("master.contractorRates");
    expect(SITE_SCOPE_COLLECTIONS).not.toContain("attendance");
    expect(SITE_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    expect(SITE_SCOPE_COLLECTIONS).not.toContain("leaveRequests");
  });
});

describe("revision-consistent subset merge", () => {
  test("merges entity rows, master rows, versions, and query telemetry", () => {
    const bootstrapDb = emptyDatabase();
    bootstrapDb.staffRolePermissions = [{
      id: "perm-owner-customers",
      role_key: "OWNER",
      module_key: "customers",
      module_label: "Customers",
      can_view: true,
      can_create: true,
      can_update: true,
      can_approve: true,
      can_delete: true,
      updated_at: "2026-07-28T00:00:00.000Z",
    }];
    bootstrapDb.master.staff = [{
      id: "staff-owner",
      name: "Owner",
      role: "Owner",
      status: "active",
    } as never];

    const scopedDb = emptyDatabase();
    scopedDb.customers = [{
      id: "cust-1",
      name: "Customer One",
      phone: "9999999999",
      status: "active",
      created_at: "2026-07-28T00:00:00.000Z",
      updated_at: "2026-07-28T00:00:00.000Z",
    } as never];
    scopedDb.master.staff = [{
      id: "staff-field",
      name: "Field Staff",
      role: "Field Staff",
      status: "active",
    } as never];

    const merged = mergeWorkspaceSubsets(
      {
        revision: 44,
        updatedAt: "2026-07-28T00:00:00.000Z",
        data: bootstrapDb,
        rowVersions: { "staff-owner": 2 },
        queryCount: 3,
      },
      {
        revision: 44,
        updatedAt: "2026-07-28T00:01:00.000Z",
        data: scopedDb,
        rowVersions: { "cust-1": 7, "staff-field": 1 },
        queryCount: 5,
      },
    );

    expect(merged.data.customers.map((row) => row.id)).toEqual(["cust-1"]);
    expect(merged.data.master.staff.map((row) => row.id).sort()).toEqual(["staff-field", "staff-owner"]);
    expect(merged.rowVersions).toEqual({
      "staff-owner": 2,
      "cust-1": 7,
      "staff-field": 1,
    });
    expect(merged.queryCount).toBe(8);
    expect(merged.updatedAt).toBe("2026-07-28T00:01:00.000Z");
  });

  test("rejects a bootstrap and scope read from different workspace revisions", () => {
    const database = emptyDatabase();
    expect(() => mergeWorkspaceSubsets(
      {
        revision: 10,
        updatedAt: "2026-07-28T00:00:00.000Z",
        data: database,
        rowVersions: {},
        queryCount: 1,
      },
      {
        revision: 11,
        updatedAt: "2026-07-28T00:00:01.000Z",
        data: database,
        rowVersions: {},
        queryCount: 1,
      },
    )).toThrow("READ_CONFLICT");
  });
});
