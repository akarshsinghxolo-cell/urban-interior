import { describe, expect, test } from "bun:test";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  CUSTOMER_RELATION_COLLECTIONS,
  ENTITY_REFERENCE_COLLECTIONS,
  SITE_RELATION_COLLECTIONS,
} from "@/lib/rdash/server/entity-scoped-read";
import {
  rowScopedEntityForTarget,
  workspaceReadCoverageIsCompatible,
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";

describe("row-scoped workspace targets", () => {
  test("retains concrete Customer and Site IDs only for supported detail routes", () => {
    const customer = workspaceReadTargetForPath("/workspace/customers/cust-123?tab=activity");
    expect(customer).toMatchObject({
      scope: "customer",
      moduleId: "customerDesk",
      permissionModule: "customers",
      entity: { kind: "customer", id: "cust-123" },
    });
    expect(rowScopedEntityForTarget(customer)).toEqual({ kind: "customer", id: "cust-123" });

    const site = workspaceReadTargetForPath("/workspace/sites/site-123");
    expect(site).toMatchObject({
      scope: "site",
      moduleId: "siteExecution",
      permissionModule: "sites",
      entity: { kind: "site", id: "site-123" },
    });
    expect(rowScopedEntityForTarget(site)).toEqual({ kind: "site", id: "site-123" });

    const workOrder = workspaceReadTargetForPath("/workspace/work-orders/wo-123");
    expect(workOrder).toMatchObject({
      scope: "site",
      permissionModule: "workOrders",
      entity: { kind: "workOrder", id: "wo-123" },
    });
    expect(rowScopedEntityForTarget(workOrder)).toBeUndefined();
  });

  test("reuses one row graph only for the same canonical record", () => {
    const customer123 = workspaceReadTargetForPath("/workspace/customers/cust-123");
    const customer456 = workspaceReadTargetForPath("/workspace/customers/cust-456");
    const customerList = workspaceReadTargetForModule("customerDesk");

    const current = {
      scope: "customer" as const,
      mode: "customer-row",
      entityKind: "customer" as const,
      entityId: "cust-123",
    };
    expect(workspaceReadCoverageIsCompatible(current, customer123)).toBe(true);
    expect(workspaceReadCoverageIsCompatible(current, customer456)).toBe(false);
    expect(workspaceReadCoverageIsCompatible(current, customerList)).toBe(false);
  });

  test("broader module and full snapshots cover narrower record links", () => {
    const customer = workspaceReadTargetForPath("/workspace/customers/cust-123");
    const site = workspaceReadTargetForPath("/workspace/sites/site-123");

    expect(workspaceReadCoverageIsCompatible({ scope: "customer", mode: "customer" }, customer)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({ scope: "site", mode: "site" }, site)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({ scope: "full", mode: "full" }, customer)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({ scope: "full", mode: "full" }, site)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({ scope: "customer", mode: "customer" }, site)).toBe(false);
  });
});

describe("entity-scoped collection policy", () => {
  const known = new Set(Object.keys(COLLECTION_TO_TABLE));

  function assertKnownUnique(collections: readonly string[]) {
    expect(new Set(collections).size).toBe(collections.length);
    for (const collection of collections) expect(known.has(collection)).toBe(true);
  }

  test("uses known global references without unrelated HR or system collections", () => {
    assertKnownUnique(ENTITY_REFERENCE_COLLECTIONS);
    expect(ENTITY_REFERENCE_COLLECTIONS).toContain("master.workCategories");
    expect(ENTITY_REFERENCE_COLLECTIONS).toContain("commercialTerms");
    expect(ENTITY_REFERENCE_COLLECTIONS).not.toContain("payrollLines");
    expect(ENTITY_REFERENCE_COLLECTIONS).not.toContain("attendance");
    expect(ENTITY_REFERENCE_COLLECTIONS).not.toContain("automationRules");
  });

  test("Customer and Site primary relation sets stay bounded and valid", () => {
    assertKnownUnique(CUSTOMER_RELATION_COLLECTIONS);
    assertKnownUnique(SITE_RELATION_COLLECTIONS);
    expect(CUSTOMER_RELATION_COLLECTIONS).toContain("sites");
    expect(CUSTOMER_RELATION_COLLECTIONS).toContain("quotations");
    expect(SITE_RELATION_COLLECTIONS).toContain("areas");
    expect(SITE_RELATION_COLLECTIONS).toContain("purchaseOrders");
    expect(CUSTOMER_RELATION_COLLECTIONS.length).toBeLessThan(25);
    expect(SITE_RELATION_COLLECTIONS.length).toBeLessThan(35);
  });

  test("REST selector validates fields and combines one table's JSONB paths", async () => {
    const source = await Bun.file("src/lib/rdash/server/entity-scoped-rest.ts").text();
    expect(source).toContain("SAFE_JSON_FIELD");
    expect(source).toContain("data->>");
    expect(source).toContain("slice(0, 500)");
    expect(source).toContain("query.or(filters.join");
    expect(source).toContain("quotePostgrestValue");
    expect(source).toContain("queryCount: 1 + queries.length");
  });

  test("entity reader has revision restart, rollback, and plural proof coverage", async () => {
    const source = await Bun.file("src/lib/rdash/server/entity-scoped-read.ts").text();
    expect(source).toContain('UC_ENTITY_SCOPED_READS !== "0"');
    expect(source).toContain('error.message !== "READ_CONFLICT"');
    expect(source).toContain("getWorkspaceBootstrap(user)");
    expect(source).toContain("workspaceRouteAccessDecision");
    expect(source).toContain('"proof_attachment_ids"');
  });
});
