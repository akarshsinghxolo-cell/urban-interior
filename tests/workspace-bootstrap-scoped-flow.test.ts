import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { workspaceReadEndpointForTarget } from "@/lib/rdash/workspace-read-client";
import {
  workspaceReadLoadStateForTarget,
  workspaceReadTargetKey,
  type WorkspaceReadStateSnapshot,
} from "@/lib/rdash/workspace-read-state";
import { loadedWorkspaceCollections } from "@/lib/rdash/workspace-delta";
import {
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeFromMode,
  workspaceReadTargetForModule,
  workspaceReadTargetForPath,
} from "@/lib/rdash/workspace-read-scope";

describe("workspace bootstrap and scoped client reads", () => {
  test("treats bootstrap as session context rather than module data", () => {
    const target = workspaceReadTargetForModule("workdesk");
    expect(workspaceReadScopeFromMode("bootstrap")).toBe("bootstrap");
    expect(workspaceReadCoverageIsCompatible(
      { scope: "bootstrap", mode: "bootstrap", strategy: "bootstrap" },
      target,
    )).toBe(false);
  });

  test("distinguishes not-loaded, loading, error, loaded-empty and loaded-with-data", () => {
    const target = workspaceReadTargetForModule("masterSetup");
    const initial: WorkspaceReadStateSnapshot = {
      scope: "bootstrap",
      mode: "bootstrap",
      strategy: "bootstrap",
      requestStatus: "idle",
    };
    expect(workspaceReadLoadStateForTarget(initial, target)).toEqual({ status: "not_loaded" });

    const loading: WorkspaceReadStateSnapshot = {
      ...initial,
      requestStatus: "loading",
      requestTargetKey: workspaceReadTargetKey(target),
    };
    expect(workspaceReadLoadStateForTarget(loading, target)).toEqual({ status: "loading" });

    const failed: WorkspaceReadStateSnapshot = {
      ...loading,
      requestStatus: "error",
      requestError: "Network unavailable",
    };
    expect(workspaceReadLoadStateForTarget(failed, target)).toEqual({
      status: "error",
      error: "Network unavailable",
    });

    for (const rowCount of [0, 323]) {
      const loaded: WorkspaceReadStateSnapshot = {
        scope: "master",
        mode: "master",
        strategy: "scope",
        moduleId: "masterSetup",
        rowCount,
        requestStatus: "idle",
      };
      expect(workspaceReadLoadStateForTarget(loaded, target)).toEqual({ status: "loaded" });
    }
  });

  test("routes module families through dedicated bounded endpoints", () => {
    for (const [moduleId, endpoint] of [
      ["customerDesk", "/api/customers"],
      ["siteExecution", "/api/sites"],
      ["workdesk", "/api/tasks"],
      ["quotationDesk", "/api/quotations"],
      ["fieldOperations", "/api/field-operations"],
      ["procurementInventory", "/api/procurement"],
      ["financeDesk", "/api/finance"],
      ["mediaCommunication", "/api/media"],
      ["hrStaff", "/api/hr"],
      ["masterSetup", "/api/master"],
      ["reportsDesk", "/api/reports"],
      ["systemSettings", "/api/system"],
    ] as const) {
      expect(workspaceReadEndpointForTarget(workspaceReadTargetForModule(moduleId))).toBe(endpoint);
    }
  });

  test("keeps concrete Customer and Site URLs on the row-graph planner", () => {
    expect(workspaceReadEndpointForTarget(
      workspaceReadTargetForPath("/workspace/customers/cust-123"),
    )).toBe("/api/workspace");
    expect(workspaceReadEndpointForTarget(
      workspaceReadTargetForPath("/workspace/sites/site-123"),
    )).toBe("/api/workspace");
  });

  test("loads the reusable Master foundation once in bootstrap", async () => {
    const projectedBootstrap = await testFile("src/lib/rdash/server/projected-workspace-bootstrap.ts").text();
    const moduleReader = await testFile("src/lib/rdash/server/module-scoped-read.ts").text();
    for (const collection of ["master.units", "master.workCategories", "master.workSubcategories", "master.articles", "master.articleVariants", "master.subcategoryArticleMap", "master.workOptionGroups", "master.workOptionValues"]) {
      expect(projectedBootstrap).toContain(`"${collection}"`);
    }
    expect(projectedBootstrap).toContain("fullCollections: [...WORKSPACE_FOUNDATION_COLLECTIONS]");
    expect(projectedBootstrap).not.toContain("bounded compatibility read");
    expect(moduleReader).toContain("!FOUNDATION_COLLECTIONS.has(collection)");
  });

  test("hydrates the foundation bootstrap without loading operational workspace tables", async () => {
    const app = await testFile("src/components/rdash/RDashApp.tsx").text();
    const bootstrap = await testFile("src/app/api/bootstrap/route.ts").text();
    expect(app).toContain('fetch("/api/bootstrap"');
    expect(app).not.toContain('fetch("/api/workspace"');
    expect(app).toContain("hydrateSecureWorkspace({");
    expect(app).toContain("const secureWorkspaceReady = secureBootstrapReady;");
    expect(app).not.toContain('readState.scope !== "bootstrap"');
    expect(app).not.toContain("QuickActionsToolbar");
    expect(app).toContain("<QuickAddSheet");
    expect(bootstrap).toContain("getProjectedWorkspaceBootstrap(user.staffId)");
    expect(bootstrap).toContain("data: workspace.data");
    expect(bootstrap).toContain('readStrategy: "foundation-first"');
  });

  test("prevents modules from rendering unloaded arrays as authoritative zero values", async () => {
    const router = await testFile("src/components/rdash/WorkspaceModuleRouter.tsx").text();
    const boundary = await testFile("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx").text();
    const gateIndex = router.indexOf('if (dataLoadState.status !== "loaded")');
    const rendererIndex = router.indexOf("switch (route.renderer)");

    expect(router).toContain("workspaceReadLoadStateForTarget");
    expect(router).toContain("workspaceReadTargetForActiveNavigation(pathname, currentActiveModuleId)");
    expect(router).toContain("workspaceReadTargetForModule(activeModuleId)");
    expect(boundary).toContain("workspaceReadTargetForActiveNavigation(pathname, activeModuleId)");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(rendererIndex).toBeGreaterThan(gateIndex);
    expect(boundary).toContain("workspaceReadState.beginRequest(requestedTarget)");
    expect(boundary).toContain("workspaceReadState.failRequest(");
    expect(boundary).toContain("workspaceReadState.clearRequest(requestedTarget)");
    expect(boundary).toContain("workspaceReadState.recordResponse(response, requestedTarget)");
  });

  test("does not present omitted scoped collections as real zero totals", async () => {
    const app = await testFile("src/components/rdash/RDashApp.tsx").text();
    expect(app).toContain("loadedWorkspaceCollections(db)");
    expect(app).toContain('loadedCollections && !loadedCollections.has(collection) ? "—" : String(count)');
    expect(app).toContain('collectionCount("customers", db.customers.length)');
    expect(app).toContain('collectionCount("workOrders", db.workOrders.length)');
    expect(app).toContain('collectionCount("purchaseOrders", db.purchaseOrders.length)');
  });

  test("does not present unloaded notification sources as authoritative zero alerts", async () => {
    const notifications = await testFile("src/components/rdash/NotificationCenter.tsx").text();
    expect(notifications).toContain("_workspace_read_collections");
    expect(notifications).toContain("_workspace_read_strategy");
    expect(notifications).toContain("notificationCoverageComplete");
    expect(notifications).toContain("filterCoverageComplete");
    expect(notifications).toContain('strategy !== "row"');
    expect(notifications).toContain("module details load on demand");
    expect(notifications).not.toContain("notificationCoverageComplete && unread.length > 0");
    expect(notifications).toContain("useWorkspaceHealth");
    expect(notifications).toContain("health-overdue-tasks-");
    expect(notifications).toContain('setActiveModule("tasks")');
    expect(notifications).toContain("unread.length > 0 ?");
    expect(notifications).toContain("Notification data will fill in as relevant modules load.");
    expect(notifications).toContain("All caught up! No pending alerts.");
    expect(notifications).toContain("filterCoverageComplete ?");
  });

  test("routes the mobile plus launcher through authoritative scopes and canonical forms", async () => {
    const sheet = await testFile("src/components/rdash/QuickAddSheet.tsx").text();

    for (const [label, moduleId] of [
      ["Add Customer", "customerDesk"],
      ["Add Contractor", "contractorDetail"],
      ["Add Vendor", "vendors"],
      ["Sites & Execution", "siteExecution"],
    ] as const) {
      expect(sheet).toContain(`label: "${label}"`);
      expect(sheet).toContain(`moduleId: "${moduleId}"`);
    }

    expect(sheet).toContain('import("./CustomerSitesDialog")');
    expect(sheet).toContain('import("./EntityFormDialog")');
    expect(sheet).toContain("workspaceReadTargetForModule");
    expect(sheet).toContain("workspaceReadLoadStateForTarget");
    expect(sheet).toContain('pendingLoadState?.status === "loaded"');
    expect(sheet).toContain('type={formAction}');
    expect(sheet).toContain('setActiveModule(option.moduleId)');

    for (const duplicatePersistenceToken of [
      "saveCustomerWithSites",
      "addCustomer",
      "addContractor",
      "addVendor",
      "mutateMaster",
    ]) {
      expect(sheet).not.toContain(duplicatePersistenceToken);
    }

    for (const removedQuickCreateKind of [
      'kind: "task"',
      'kind: "visit"',
      'kind: "followup"',
      'kind: "quotation"',
    ]) {
      expect(sheet).not.toContain(removedQuickCreateKind);
    }
  });

  test("preserves module permissions and response telemetry on dedicated endpoints", async () => {
    const helper = await testFile("src/lib/rdash/server/module-scoped-route.ts").text();
    expect(helper).toContain('request.headers.get("x-uc-workspace-module")');
    expect(helper).toContain("tryWorkspaceReadTargetForModule(requestedModule)");
    expect(helper).toContain("target?.scope === endpointTarget.scope");
    expect(helper).toContain("getModuleScopedWorkspace(user, target)");
    expect(helper).toContain('"X-UC-Read-Module"');
    expect(helper).toContain('"X-UC-Response-Bytes"');
  });

  test("normal workspace reads have no full-workspace fallback or fallback feature flag", async () => {
    const route = await testFile("src/app/api/workspace/route.ts").text();
    expect(route).not.toContain("UC_FULL_WORKSPACE_FALLBACK");
    expect(route).not.toContain("getWorkspace(");
    expect(route).not.toContain("fullWorkspacePayload");
    expect(route).toContain('"X-UC-Read-Architecture": "scoped-only"');
    expect(route).toContain("trying the module graph");
  });

  test("keeps delta recovery on the same scoped data path", async () => {
    const source = await testFile("src/components/urban-castle/WorkspaceDeltaSync.tsx").text();
    expect(source).toContain("workspaceReadEndpointForTarget(target)");
    expect(source).not.toContain('fetch("/api/workspace"');
  });
});
