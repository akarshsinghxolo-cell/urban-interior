import { describe, expect, test } from "bun:test";
import { REGISTERED_MODULE_IDS } from "@/lib/rdash/modules";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
  COLLECTIONS_BY_SCOPE,
  CUSTOMER_SCOPE_COLLECTIONS,
  FIELD_SCOPE_COLLECTIONS,
  FINANCE_SCOPE_COLLECTIONS,
  HR_SCOPE_COLLECTIONS,
  MASTER_SCOPE_COLLECTIONS,
  MEDIA_SCOPE_COLLECTIONS,
  PROCUREMENT_SCOPE_COLLECTIONS,
  QUOTATION_SCOPE_COLLECTIONS,
  REPORTS_SCOPE_COLLECTIONS,
  SITE_SCOPE_COLLECTIONS,
  SYSTEM_SCOPE_COLLECTIONS,
  WORKDESK_SCOPE_COLLECTIONS,
  WORKSPACE_BOOTSTRAP_COLLECTIONS,
  collectionsForWorkspaceReadScope,
  mergeWorkspaceSubsets,
} from "@/lib/rdash/server/module-scoped-read";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";
import {
  tryWorkspaceReadTargetForModule,
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeForModule,
  workspaceReadScopeFromMode,
  workspaceReadScopeIsCompatible,
  workspaceReadTargetForModule,
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

const EXPECTED_SCOPE_BY_MODULE = {
  customerDesk: "customer",
  salesPipeline: "customer",
  siteExecution: "site",
  contractorDetail: "site",
  contractorRates: "site",
  workdesk: "workdesk",
  tasks: "workdesk",
  approvals: "workdesk",
  quotationDesk: "quotation",
  quotationConfig: "quotation",
  fieldOperations: "field",
  gpsTracking: "field",
  procurementInventory: "procurement",
  vendors: "procurement",
  rateFinder: "procurement",
  financeDesk: "finance",
  vendorBills: "finance",
  contractorPayments: "finance",
  mediaCommunication: "media",
  driveManager: "media",
  hrStaff: "hr",
  staffSalary: "hr",
  masterSetup: "master",
  reportsDesk: "reports",
  systemSettings: "system",
  integrity: "system",
} as const;

describe("workspace module read scopes", () => {
  test("maps every route family to a bounded scope", () => {
    for (const [moduleId, scope] of Object.entries(EXPECTED_SCOPE_BY_MODULE)) {
      expect(workspaceReadScopeForModule(moduleId)).toBe(scope);
    }
  });

  test("does not leave a registered module on full or bootstrap fallback", () => {
    for (const moduleId of REGISTERED_MODULE_IDS) {
      expect(workspaceReadScopeForModule(moduleId)).not.toBe("full");
      expect(workspaceReadScopeForModule(moduleId)).not.toBe("bootstrap");
      expect(tryWorkspaceReadTargetForModule(moduleId)).not.toBeNull();
    }
  });

  test("fails closed for unknown modes and module IDs", () => {
    expect(workspaceReadScopeFromMode("customer-row")).toBe("customer");
    expect(workspaceReadScopeFromMode("site-row")).toBe("site");
    expect(workspaceReadScopeFromMode("workdesk")).toBe("workdesk");
    expect(workspaceReadScopeFromMode("unknown-mode")).toBe("bootstrap");
    expect(workspaceReadScopeForModule("unknown-module")).toBe("bootstrap");
    expect(tryWorkspaceReadTargetForModule("unknown-module")).toBeNull();
  });

  test("retains entity-specific permissions while selecting bounded scopes", () => {
    expect(workspaceReadTargetForPath("/workspace/customers/cust-123")).toMatchObject({
      scope: "customer",
      moduleId: "customerDesk",
      permissionModule: "customers",
      entity: { kind: "customer", id: "cust-123" },
    });
    expect(workspaceReadTargetForPath("/workspace/sites/site-123")).toMatchObject({
      scope: "site",
      moduleId: "siteExecution",
      permissionModule: "sites",
      entity: { kind: "site", id: "site-123" },
    });
    expect(workspaceReadTargetForPath("/workspace/work-orders/wo-123")).toMatchObject({
      scope: "site",
      moduleId: "woTimeline",
      permissionModule: "workOrders",
    });
    expect(workspaceReadTargetForPath("/workspace/tasks/task-123")).toMatchObject({
      scope: "workdesk",
      moduleId: "tasks",
      permissionModule: "tasks",
    });
    expect(workspaceReadTargetForPath("/workspace/purchase-orders/po-123")).toMatchObject({
      scope: "procurement",
      moduleId: "procurementInventory",
      permissionModule: "purchaseOrders",
    });
  });

  test("distinguishes full, scope, exact-module, and row coverage", () => {
    const tasks = workspaceReadTargetForModule("tasks");
    const approvals = workspaceReadTargetForModule("approvals");
    expect(workspaceReadCoverageIsCompatible(
      { scope: "full", mode: "full", strategy: "full" },
      tasks,
    )).toBe(true);
    expect(workspaceReadCoverageIsCompatible(
      { scope: "workdesk", mode: "workdesk", strategy: "scope" },
      approvals,
    )).toBe(true);
    expect(workspaceReadCoverageIsCompatible(
      { scope: "workdesk", mode: "workdesk", strategy: "module", moduleId: "tasks" },
      tasks,
    )).toBe(true);
    expect(workspaceReadCoverageIsCompatible(
      { scope: "workdesk", mode: "workdesk", strategy: "module", moduleId: "tasks" },
      approvals,
    )).toBe(false);
    expect(workspaceReadCoverageIsCompatible(
      { scope: "bootstrap", mode: "unknown", strategy: "unknown" },
      tasks,
    )).toBe(false);
  });

  test("keeps compatibility helper behavior explicit", () => {
    expect(workspaceReadScopeIsCompatible("full", "finance")).toBe(true);
    expect(workspaceReadScopeIsCompatible("finance", "finance")).toBe(true);
    expect(workspaceReadScopeIsCompatible("workdesk", "finance")).toBe(false);
  });
});

describe("module-scoped collection plans", () => {
  const knownCollections = new Set(Object.keys(COLLECTION_TO_TABLE));
  const fullCollectionCount = knownCollections.size;
  const plans = {
    customer: CUSTOMER_SCOPE_COLLECTIONS,
    site: SITE_SCOPE_COLLECTIONS,
    workdesk: WORKDESK_SCOPE_COLLECTIONS,
    quotation: QUOTATION_SCOPE_COLLECTIONS,
    field: FIELD_SCOPE_COLLECTIONS,
    procurement: PROCUREMENT_SCOPE_COLLECTIONS,
    finance: FINANCE_SCOPE_COLLECTIONS,
    media: MEDIA_SCOPE_COLLECTIONS,
    hr: HR_SCOPE_COLLECTIONS,
    master: MASTER_SCOPE_COLLECTIONS,
    reports: REPORTS_SCOPE_COLLECTIONS,
    system: SYSTEM_SCOPE_COLLECTIONS,
  } as const;

  test("uses a minimal permission and safe Staff-directory bootstrap", () => {
    expect(WORKSPACE_BOOTSTRAP_COLLECTIONS).toEqual([
      "staffRolePermissions",
      "master.staff",
    ]);
  });

  test("every supported scope resolves to a unique valid bounded plan", () => {
    for (const [scope, collections] of Object.entries(plans)) {
      expect(collectionsForWorkspaceReadScope(scope as keyof typeof plans)).toBe(collections);
      expect(COLLECTIONS_BY_SCOPE[scope as keyof typeof COLLECTIONS_BY_SCOPE]).toBe(collections);
      expect(new Set(collections).size).toBe(collections.length);
      expect(collections.length).toBeLessThan(fullCollectionCount);
      for (const collection of collections) {
        expect(knownCollections.has(collection)).toBe(true);
      }
    }
  });

  test("scope plans contain their critical dependencies without unrelated administration", () => {
    for (const collection of ["tasks", "followups", "actions", "blocked", "risks", "threads"] as const) {
      expect(WORKDESK_SCOPE_COLLECTIONS).toContain(collection);
    }
    for (const collection of ["quotations", "commercialTerms", "master.customerRateSuggestions"] as const) {
      expect(QUOTATION_SCOPE_COLLECTIONS).toContain(collection);
    }
    for (const collection of ["visits", "attendance", "executionLogs"] as const) {
      expect(FIELD_SCOPE_COLLECTIONS).toContain(collection);
    }
    for (const collection of ["boqs", "vendorRfqs", "purchaseOrders", "inventory", "master.vendorRates"] as const) {
      expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain(collection);
    }
    for (const collection of ["payments", "invoices", "vendorBills", "contractorBills", "workOrderCostLines"] as const) {
      expect(FINANCE_SCOPE_COLLECTIONS).toContain(collection);
    }
    expect(WORKDESK_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    expect(QUOTATION_SCOPE_COLLECTIONS).not.toContain("inventory");
    expect(FIELD_SCOPE_COLLECTIONS).not.toContain("vendorBills");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    expect(FINANCE_SCOPE_COLLECTIONS).not.toContain("automationRules");
    expect(MEDIA_SCOPE_COLLECTIONS).not.toContain("contractorPayments");
    expect(HR_SCOPE_COLLECTIONS).not.toContain("vendorRfqs");
  });

  test("loads canonical full Staff only in the HR scope", () => {
    for (const [scope, collections] of Object.entries(plans)) {
      if (scope === "hr") {
        expect(collections).toContain("master.staff");
      } else {
        expect(collections).not.toContain("master.staff");
      }
    }
  });

  test("master and system plans stay intentionally bounded", () => {
    expect(MASTER_SCOPE_COLLECTIONS).toContain("master.articles");
    expect(MASTER_SCOPE_COLLECTIONS).not.toContain("master.vendors");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("automationRules");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("auditLog");
    expect(SYSTEM_SCOPE_COLLECTIONS.length).toBeLessThan(fullCollectionCount);
    expect(REPORTS_SCOPE_COLLECTIONS).toContain("payments");
    expect(REPORTS_SCOPE_COLLECTIONS).not.toContain("master.storageAccounts");
    expect(CUSTOMER_SCOPE_COLLECTIONS).toContain("customers");
    expect(SITE_SCOPE_COLLECTIONS).toContain("workOrders");
  });
});

describe("dedicated scoped read endpoints", () => {
  test("uses strict authenticated routing and structured errors", async () => {
    for (const path of [
      "src/app/api/tasks/route.ts",
      "src/app/api/quotations/route.ts",
      "src/app/api/field-operations/route.ts",
      "src/app/api/procurement/route.ts",
      "src/app/api/finance/route.ts",
    ]) {
      const source = await Bun.file(path).text();
      expect(source).toContain("handleModuleScopedRead");
      expect(source).toContain("export async function GET");
    }

    const helper = await Bun.file("src/lib/rdash/server/module-scoped-route.ts").text();
    expect(helper).toContain("requireSession(request)");
    expect(helper).toContain("tryWorkspaceReadTargetForModule");
    expect(helper).toContain('"X-UC-Read-Mode"');
    expect(helper).toContain("errorJson(message.slice(\"FORBIDDEN:\".length), 403)");
    expect(helper).toContain("errorJson(`${options.errorLabel} data is temporarily unavailable.`, 503");
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

  test("rejects reads from different workspace revisions", () => {
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
