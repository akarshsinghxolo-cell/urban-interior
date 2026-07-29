import { describe, expect, test } from "bun:test";
import { REGISTERED_MODULE_IDS } from "@/lib/rdash/modules";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import {
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
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeForModule,
  workspaceReadScopeFromMode,
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
  test("maps every route family to a bounded scope", () => {
    expect(workspaceReadScopeForModule("customerDesk")).toBe("customer");
    expect(workspaceReadScopeForModule("salesPipeline")).toBe("customer");

    expect(workspaceReadScopeForModule("siteExecution")).toBe("site");
    expect(workspaceReadScopeForModule("contractorDetail")).toBe("site");
    expect(workspaceReadScopeForModule("contractorRates")).toBe("site");

    expect(workspaceReadScopeForModule("workdesk")).toBe("workdesk");
    expect(workspaceReadScopeForModule("tasks")).toBe("workdesk");
    expect(workspaceReadScopeForModule("approvals")).toBe("workdesk");

    expect(workspaceReadScopeForModule("quotationDesk")).toBe("quotation");
    expect(workspaceReadScopeForModule("quotationConfig")).toBe("quotation");

    expect(workspaceReadScopeForModule("fieldOperations")).toBe("field");
    expect(workspaceReadScopeForModule("gpsTracking")).toBe("field");

    expect(workspaceReadScopeForModule("procurementInventory")).toBe("procurement");
    expect(workspaceReadScopeForModule("vendors")).toBe("procurement");
    expect(workspaceReadScopeForModule("rateFinder")).toBe("procurement");

    expect(workspaceReadScopeForModule("financeDesk")).toBe("finance");
    expect(workspaceReadScopeForModule("vendorBills")).toBe("finance");
    expect(workspaceReadScopeForModule("contractorPayments")).toBe("finance");

    expect(workspaceReadScopeForModule("mediaCommunication")).toBe("media");
    expect(workspaceReadScopeForModule("driveManager")).toBe("media");

    expect(workspaceReadScopeForModule("hrStaff")).toBe("hr");
    expect(workspaceReadScopeForModule("staffSalary")).toBe("hr");

    expect(workspaceReadScopeForModule("masterSetup")).toBe("master");
    expect(workspaceReadScopeForModule("reportsDesk")).toBe("reports");
    expect(workspaceReadScopeForModule("systemSettings")).toBe("system");
    expect(workspaceReadScopeForModule("integrity")).toBe("system");
  });

  test("does not leave a registered module on the full compatibility read", () => {
    for (const moduleId of REGISTERED_MODULE_IDS) {
      expect(workspaceReadScopeForModule(moduleId)).not.toBe("full");
    }
  });

  test("normalizes server read modes without widening unknown values", () => {
    expect(workspaceReadScopeFromMode("customer-row")).toBe("customer");
    expect(workspaceReadScopeFromMode("site-row")).toBe("site");
    expect(workspaceReadScopeFromMode("workdesk")).toBe("workdesk");
    expect(workspaceReadScopeFromMode("quotation")).toBe("quotation");
    expect(workspaceReadScopeFromMode("field")).toBe("field");
    expect(workspaceReadScopeFromMode("procurement")).toBe("procurement");
    expect(workspaceReadScopeFromMode("finance")).toBe("finance");
    expect(workspaceReadScopeFromMode("media")).toBe("media");
    expect(workspaceReadScopeFromMode("hr")).toBe("hr");
    expect(workspaceReadScopeFromMode("master")).toBe("master");
    expect(workspaceReadScopeFromMode("reports")).toBe("reports");
    expect(workspaceReadScopeFromMode("system")).toBe("system");
    expect(workspaceReadScopeFromMode("unknown-mode")).toBe("full");
  });

  test("retains entity-specific permissions while selecting bounded scopes", () => {
    expect(workspaceReadTargetForPath("/workspace/customers/cust-123")).toMatchObject({
      scope: "customer",
      moduleId: "customerDesk",
      permissionModule: "customers",
    });
    expect(workspaceReadTargetForPath("/workspace/sites/site-123")).toMatchObject({
      scope: "site",
      moduleId: "siteExecution",
      permissionModule: "sites",
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
    expect(workspaceReadTargetForPath("/workspace/quotations/quote-123")).toMatchObject({
      scope: "quotation",
      moduleId: "quotationDesk",
      permissionModule: "quotations",
    });
    expect(workspaceReadTargetForPath("/workspace/purchase-orders/po-123")).toMatchObject({
      scope: "procurement",
      moduleId: "procurementInventory",
      permissionModule: "purchaseOrders",
    });
    expect(workspaceReadTargetForPath("/workspace/vendor-bills/vb-123")).toMatchObject({
      scope: "finance",
      moduleId: "vendorBills",
      permissionModule: "finance",
    });
  });

  test("full snapshots cover every scope while collection families stay isolated", () => {
    for (const requested of [
      "customer",
      "site",
      "workdesk",
      "quotation",
      "field",
      "procurement",
      "finance",
      "media",
      "hr",
      "master",
      "reports",
      "system",
    ] as const) {
      expect(workspaceReadScopeIsCompatible("full", requested)).toBe(true);
      expect(workspaceReadScopeIsCompatible(requested, requested)).toBe(true);
      expect(workspaceReadCoverageIsCompatible(
        { scope: requested, mode: requested },
        { scope: requested, moduleId: "test", permissionModule: "test" },
      )).toBe(true);
    }
    expect(workspaceReadScopeIsCompatible("workdesk", "finance")).toBe(false);
    expect(workspaceReadScopeIsCompatible("finance", "full")).toBe(false);
    expect(workspaceReadCoverageIsCompatible(
      { scope: "procurement", mode: "procurement" },
      { scope: "finance", moduleId: "financeDesk", permissionModule: "finance" },
    )).toBe(false);
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

  test("every supported scope resolves to a valid bounded collection plan", () => {
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

    for (const [scope, collections] of Object.entries(plans)) {
      assertValidPlan(collections);
      expect(collectionsForWorkspaceReadScope(scope as keyof typeof plans)).toBe(collections);
    }
  });

  test("Workdesk covers action queues and every dashboard widget dependency", () => {
    for (const collection of [
      "tasks",
      "followups",
      "actions",
      "blocked",
      "risks",
      "threads",
      "customerReceipts",
      "vendorPayments",
      "contractorPayments",
      "workOrderCostLines",
      "inventory",
      "stockMovements",
      "attendance",
      "master.vendorRates",
      "master.vendorRateHistories",
    ]) {
      expect(WORKDESK_SCOPE_COLLECTIONS).toContain(collection);
    }
    expect(WORKDESK_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    expect(WORKDESK_SCOPE_COLLECTIONS).not.toContain("automationRules");
  });

  test("Quotation includes pricing and terms but excludes inventory and payroll", () => {
    expect(QUOTATION_SCOPE_COLLECTIONS).toContain("quotations");
    expect(QUOTATION_SCOPE_COLLECTIONS).toContain("commercialTerms");
    expect(QUOTATION_SCOPE_COLLECTIONS).toContain("master.customerRateSuggestions");
    expect(QUOTATION_SCOPE_COLLECTIONS).not.toContain("inventory");
    expect(QUOTATION_SCOPE_COLLECTIONS).not.toContain("payrollPeriods");
  });

  test("Field includes visits, GPS attendance and execution context", () => {
    expect(FIELD_SCOPE_COLLECTIONS).toContain("visits");
    expect(FIELD_SCOPE_COLLECTIONS).toContain("attendance");
    expect(FIELD_SCOPE_COLLECTIONS).toContain("executionLogs");
    expect(FIELD_SCOPE_COLLECTIONS).not.toContain("vendorBills");
    expect(FIELD_SCOPE_COLLECTIONS).not.toContain("salaryAdjustments");
  });

  test("Procurement includes BOQ-to-stock and vendor dependencies", () => {
    expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("boqs");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("vendorRfqs");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("purchaseOrders");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("inventory");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("master.vendorRates");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).not.toContain("customerReceipts");
    expect(PROCUREMENT_SCOPE_COLLECTIONS).not.toContain("payrollLines");
  });

  test("Finance includes receivables, payables and profitability dependencies", () => {
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("payments");
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("invoices");
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("vendorBills");
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("contractorBills");
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("workOrderCostLines");
    expect(FINANCE_SCOPE_COLLECTIONS).toContain("master.commissionRules");
    expect(FINANCE_SCOPE_COLLECTIONS).not.toContain("attendance");
    expect(FINANCE_SCOPE_COLLECTIONS).not.toContain("automationRules");
  });

  test("Media includes Drive, catalogue and outbound communication data only", () => {
    expect(MEDIA_SCOPE_COLLECTIONS).toContain("commSends");
    expect(MEDIA_SCOPE_COLLECTIONS).toContain("master.storageAccounts");
    expect(MEDIA_SCOPE_COLLECTIONS).toContain("master.catalogues");
    expect(MEDIA_SCOPE_COLLECTIONS).toContain("master.referenceMedia");
    expect(MEDIA_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    expect(MEDIA_SCOPE_COLLECTIONS).not.toContain("contractorPayments");
  });

  test("HR includes attendance, payroll and staff evidence", () => {
    expect(HR_SCOPE_COLLECTIONS).toContain("attendance");
    expect(HR_SCOPE_COLLECTIONS).toContain("payrollPeriods");
    expect(HR_SCOPE_COLLECTIONS).toContain("salaryAdjustments");
    expect(HR_SCOPE_COLLECTIONS).toContain("staffDocuments");
    expect(HR_SCOPE_COLLECTIONS).toContain("master.staff");
    expect(HR_SCOPE_COLLECTIONS).not.toContain("vendorRfqs");
  });

  test("Master Setup loads only the Work & Rate catalogue graph", () => {
    expect(MASTER_SCOPE_COLLECTIONS).toEqual([
      "auditLog",
      "master.units",
      "master.workCategories",
      "master.workSubcategories",
      "master.articles",
      "master.articleVariants",
      "master.subcategoryArticleMap",
      "master.workOptionGroups",
      "master.workOptionValues",
    ]);
    for (const excluded of [
      "master.vendors",
      "master.contractors",
      "master.vendorRates",
      "master.vendorRateHistories",
      "master.storageAccounts",
      "master.fileAssets",
      "master.catalogues",
      "master.referenceMedia",
      "payments",
      "workOrders",
    ]) {
      expect(MASTER_SCOPE_COLLECTIONS).not.toContain(excluded);
    }
  });

  test("Reports includes cross-domain metrics without media administration", () => {
    expect(REPORTS_SCOPE_COLLECTIONS).toContain("quotations");
    expect(REPORTS_SCOPE_COLLECTIONS).toContain("payments");
    expect(REPORTS_SCOPE_COLLECTIONS).toContain("workOrderCostLines");
    expect(REPORTS_SCOPE_COLLECTIONS).toContain("payrollLines");
    expect(REPORTS_SCOPE_COLLECTIONS).not.toContain("master.storageAccounts");
    expect(REPORTS_SCOPE_COLLECTIONS).not.toContain("automationRules");
  });

  test("System includes integrity and import/export dependencies without loading all 80 tables", () => {
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("customers");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("automationRules");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("auditLog");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("master.articles");
    expect(SYSTEM_SCOPE_COLLECTIONS).toContain("master.fileAssets");
    expect(SYSTEM_SCOPE_COLLECTIONS.length).toBeLessThan(fullCollectionCount);
    expect(SYSTEM_SCOPE_COLLECTIONS).not.toContain("master.catalogues");
  });
});

describe("dedicated scoped read endpoints", () => {
  test("exposes authenticated endpoints for the bounded high-frequency module families", async () => {
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
    expect(helper).toContain("workspaceReadTargetForModule");
    expect(helper).toContain('"X-UC-Read-Mode"');
    expect(helper).toContain("status: 403");
    expect(helper).toContain("status: 503");
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
