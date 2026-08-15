import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { workspaceModuleReadPlan } from "@/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

const read = (path: string) => testFile(path).text();

describe("runtime efficiency hardening", () => {
  test("health summary uses one aggregate PostgreSQL RPC", async () => {
    const source = await read("src/lib/rdash/server/workspace-health.ts");
    expect(source).toContain('admin.rpc("get_workspace_health_summary_v2"');
    expect(source).toContain("queryCount: 1");
    expect(source).toContain("collectionCount: 0");
    expect(source).not.toContain("getWorkspaceSubset");
    expect(source).not.toContain("HEALTH_SUMMARY_COLLECTIONS");
    expect(source).not.toContain("buildOperationalHealth");

    const migration = await read("supabase/migrations/20260806131500_get_workspace_health_summary_v2.sql");
    expect(migration).toContain("create or replace function public.get_workspace_health_summary_v2");
    expect(migration).toContain("returns jsonb");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.get_workspace_health_summary_v2(text) to service_role");
    expect(migration).toContain("with recursive");
    expect(migration).toContain("quotation_chain");
    expect(migration).toContain("latest_quotations");
    expect(migration).toContain("Asia/Kolkata");
    expect(migration).toContain("limit 5");
    expect(migration).toContain('"entity_auditLog_workspace_timestamp_idx"');
  });

  test("dashboard health no longer loads or scans the full workspace", async () => {
    const route = await read("src/app/api/health/summary/route.ts");
    expect(route).toContain("getWorkspaceHealthSummary");
    expect(route).not.toContain("getWorkspace(");
    expect(route).not.toContain("checkWorkspaceIntegrity");
    expect(route).toContain("private, max-age=300, stale-while-revalidate=3600");
  });

  test("browser shares duplicate workspace and health requests", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("singleFlightWorkspaceRead");
    expect(source).toContain("sharedHealthRead");
    expect(source).toContain("HEALTH_CACHE_TTL_MS = 5 * 60_000");
    expect(source).toContain("HEALTH_CACHE_PREFIX");
    expect(source).toContain("navigator as unknown as { locks?: BrowserLocks }");
    expect(source).toContain("Re-check after entering the cross-tab lock");
    expect(source).toContain("readStoredHealthResponse");
    expect(source).toContain("persistHealthResponse");
    expect(source).not.toContain("scoped-health-deferred");
  });

  test("session refresh keeps the same shared health cache", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("decodeSessionIdentity");
    expect(source).toContain("payload.sub || payload.user_id || payload.email");
    expect(source).toContain("decodeSessionIdentity(previous) !== decodeSessionIdentity(token)");
    expect(source).not.toContain("function tokenFingerprint");
  });

  test("workspace deduplication follows canonical entity URLs while module reads follow active navigation", async () => {
    const client = await read("src/lib/rdash/client-auth.ts");
    expect(client).toContain("WORKSPACE_READ_DEDUPE_TTL_MS = 10_000");
    expect(client).toContain('headers.get("X-UC-Workspace-Path") || window.location.pathname');
    expect(client).not.toContain('headers.get("X-UC-Workspace-Module") || ""');

    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    const resolver = await read("src/lib/rdash/workspace-active-read-target.ts");
    expect(boundary).toContain("workspaceReadTargetForActiveNavigation(pathname, activeModuleId)");
    expect(boundary).toContain('"X-UC-Workspace-Module": requestedTarget.moduleId');
    expect(resolver).toContain("pathTarget.moduleId === activeTarget.moduleId ? pathTarget : activeTarget");
    expect(resolver).toContain("workspaceReadTargetForPath(pathname)");
    expect(resolver).toContain("workspaceReadTargetForModule(activeModuleId)");
  });

  test("hidden tabs reuse bounded stale health rather than polling the server", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("HEALTH_HIDDEN_STALE_MS = 24 * 60 * 60_000");
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).toContain("clearStoredHealthResponses");
  });

  test("GPS writes use one hourly browser bundle instead of point-by-point database traffic", async () => {
    const server = await read("src/lib/rdash/server/staff-location.ts");
    expect(server).toContain('.from("StaffRouteBundle")');
    expect(server).toContain("recordStaffRouteBundle");
    expect(server).toContain("cleanupExpiredStaffRouteBundles");
    expect(server).not.toContain('from("StaffLocationPing")');
    expect(server).not.toContain("const retained =");
    expect(server).not.toContain("await allPoints()");

    const client = await read("src/components/rdash/StaffLocationTracker.tsx");
    expect(client).toContain("HOURLY_SYNC_MS = 60 * 60_000");
    expect(client).toContain("MOVING_CAPTURE_INTERVAL_MS = 30_000");
    expect(client).toContain("STATIONARY_CAPTURE_INTERVAL_MS = 2 * 60_000");
    expect(client).toContain("POSITION_HEARTBEAT_MS = 2 * 60_000");
    expect(client).toContain("POST_TIMEOUT_MS = 15_000");
    expect(client).toContain("staffRouteQueueKey(staffId)");
    expect(client).toContain('/api/tracking/routes');
    expect(client).not.toContain('/api/tracking/ping');
    expect(client).not.toContain("native_background");
    expect(client).not.toContain("SESSION_RENEW_INTERVAL_MS");
  });

  test("functions execute beside the Tokyo database", async () => {
    const config = JSON.parse(await read("vercel.json")) as { regions?: string[] };
    expect(config.regions).toEqual(["hnd1"]);
  });

  test("database migration prepares route bundles before removing point telemetry", async () => {
    const migration = await read("supabase/migrations/20260730171000_frontend_route_bundles.sql");
    const createIndex = migration.indexOf('create table if not exists public."StaffRouteBundle"');
    const dropIndex = migration.indexOf('drop table if exists public."StaffLocationPing"');
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(dropIndex).toBeGreaterThan(createIndex);
    expect(migration).toContain('"StaffRouteBundle_staffId_startedAt_idx"');
    expect(migration).toContain('"StaffRouteBundle_endedAt_idx"');
  });

  test("bounded module pages use limit-plus-one without a count query", async () => {
    const rest = await read("src/lib/rdash/server/commit-rest.ts");
    expect(rest).toContain("offsetsByCollection");
    expect(rest).toContain(".range(offset, offset + configuredLimit)");
    expect(rest).toContain("rawRows.slice(0, configuredLimit)");
    expect(rest).toContain("rawRows.length > configuredLimit");
    expect(rest).not.toContain('count: "exact"');

    const route = await read("src/lib/rdash/server/module-scoped-route.ts");
    expect(route).toContain('request.nextUrl.searchParams.getAll("page")');
    expect(route).toContain("getModuleScopedWorkspacePage");
    expect(route).toContain('"X-UC-Read-Page-Only"');
    expect(route).toContain('"X-UC-Read-Has-More"');
    expect(route).toContain("MODULE_RESPONSE_WARN_BYTES = 512 * 1024");
  });

  test("browser merges next pages instead of replacing the scoped workspace", async () => {
    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    expect(boundary).toContain("mergeWorkspacePage");
    expect(boundary).toContain("MAX_COLLECTION_PAGES_PER_REQUEST = 4");
    expect(boundary).toContain('response.headers.get("X-UC-Read-Page-Only") !== "1"');
    expect(boundary).toContain("payload.revision !== latest.serverRevision");
    expect(boundary).toContain("workspaceReadCache.store");
  });

  test("pagination metadata survives normalization and offline overlays", async () => {
    const workCategory = await read("src/lib/rdash/work-category-master.ts");
    const rawStore = await read("src/lib/rdash/raw-store.ts");
    const outbox = await read("src/lib/uploads/workspace-outbox.ts");
    expect(workCategory).toContain("...(db as RDashDatabase)");
    expect(rawStore).toContain("prepareWorkspaceData({ ...input })");
    expect(rawStore).toContain("...base");
    expect(outbox).toContain("acceptedWorkspace = structuredClone(base) as RDashDatabase");
    expect(outbox).toContain("let db = structuredClone(base) as RDashDatabase");
  });

  test("commit retry and repair paths never reconstruct the complete workspace", async () => {
    const route = await read("src/app/api/operations/commit/route.ts");
    expect(route).toContain("loadOperationSubset");
    expect(route).toContain("operationRowsByCollection");
    expect(route).toContain("getWorkspaceSubset({ rowsByCollection })");
    expect(route).toContain('commitHeaders("no-op-revision-read"');
    expect(route).not.toContain("getWorkspace(true)");
    expect(route).not.toMatch(/import\s*\{[^}]*\bgetWorkspace\b[^}]*\}\s*from\s*["']@\/lib\/rdash\/server\/workspace["']/s);
  });

  test("ordinary Drive upload lifecycle reads targeted context instead of the ERP workspace", async () => {
    const initiate = await read("src/lib/rdash/server/direct-upload-initiate.ts");
    const finalize = await read("src/lib/rdash/server/direct-upload-finalize-core.ts");
    const context = await read("src/lib/rdash/server/direct-upload-workspace.ts");

    expect(initiate).toContain("getDirectUploadWorkspace");
    expect(initiate).not.toContain("getWorkspace(");
    expect(finalize).toContain("getDirectUploadWorkspace");
    expect(finalize).toContain("getWorkspaceSubset");
    expect(finalize).not.toContain("getWorkspace(");
    expect(context).toContain("COMPATIBILITY_NESTED_TARGETS");
    expect(context).toContain('"quotation_item"');
    expect(context).toContain('"boq_item"');
    expect(context).toContain('"thread_message"');
    expect(context).toContain("getWorkspaceSubset");
    expect(context).toContain("TARGET_COLLECTION");
    expect(context).toContain("[upload-context] targeted context incomplete; using compatibility full read");
  });

  test("report families narrow complete inputs without paginating business totals", () => {
    for (const moduleId of [
      "salesAnalytics",
      "collectionAnalytics",
      "operationsAnalytics",
      "financialAnalytics",
    ]) {
      const target = workspaceReadTargetForModule(moduleId);
      const plan = workspaceModuleReadPlan(target);
      expect(plan.strategy).toBe("module");
      expect(plan.collections.length).toBeLessThan(
        workspaceModuleReadPlan(workspaceReadTargetForModule("reportsDesk")).collections.length,
      );
      for (const collection of plan.collections) {
        expect(plan.limitsByCollection?.[collection]).toBeUndefined();
      }
    }
  });
});
