import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { workspaceModuleReadPlan } from "@/lib/rdash/server/module-read-plans";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

const read = (path: string) => testFile(path).text();

describe("runtime efficiency hardening", () => {
  test("health summary uses one aggregate PostgreSQL RPC", async () => {
    const source = await read("src/lib/rdash/server/workspace-health.ts");
    expect(source).toContain('admin.rpc("get_workspace_health_summary_v2"');
    expectTokens(source, ["queryCount: 1"]);
    expectTokens(source, ["collectionCount: 0"]);
    expect(source).not.toContain("getWorkspaceSubset");
    expect(source).not.toContain("HEALTH_SUMMARY_COLLECTIONS");
    expect(source).not.toContain("buildOperationalHealth");

    const migration = await read("supabase/migrations/20260806131500_get_workspace_health_summary_v2.sql");
    expectTokens(migration, ["create or replace function public.get_workspace_health_summary_v2"]);
    expectTokens(migration, ["returns jsonb"]);
    expectTokens(migration, ["security definer"]);
    expectTokens(migration, ["grant execute on function public.get_workspace_health_summary_v2(text) to service_role"]);
    expectTokens(migration, ["with recursive"]);
    expect(migration).toContain("quotation_chain");
    expect(migration).toContain("latest_quotations");
    expect(migration).toContain("Asia/Kolkata");
    expectTokens(migration, ["limit 5"]);
    expect(migration).toContain('"entity_auditLog_workspace_timestamp_idx"');
  });

  test("dashboard health no longer loads or scans the full workspace", async () => {
    const route = await read("src/app/api/health/summary/route.ts");
    expect(route).toContain("getWorkspaceHealthSummary");
    expect(route).not.toContain("getWorkspace(");
    expect(route).not.toContain("checkWorkspaceIntegrity");
    expectTokens(route, ["private, max-age=300, stale-while-revalidate=3600"]);
  });

  test("browser shares duplicate workspace and health requests", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("singleFlightWorkspaceRead");
    expect(source).toContain("sharedHealthRead");
    expectTokens(source, ["HEALTH_CACHE_TTL_MS = 5 * 60_000"]);
    expect(source).toContain("HEALTH_CACHE_PREFIX");
    expectTokens(source, ["navigator as unknown as { locks?: BrowserLocks }"]);
    expectTokens(source, ["Re-check after entering the cross-tab lock"]);
    expect(source).toContain("readStoredHealthResponse");
    expect(source).toContain("persistHealthResponse");
    expect(source).not.toContain("scoped-health-deferred");
  });

  test("session refresh keeps the same shared health cache", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("decodeSessionIdentity");
    expectTokens(source, ["payload.sub || payload.user_id || payload.email"]);
    expectTokens(source, ["decodeSessionIdentity(previous) !== decodeSessionIdentity(token)"]);
    expectNoTokens(source, ["function tokenFingerprint"]);
  });

  test("workspace deduplication follows canonical entity URLs while module reads follow active navigation", async () => {
    const client = await read("src/lib/rdash/client-auth.ts");
    expectTokens(client, ["WORKSPACE_READ_DEDUPE_TTL_MS = 10_000"]);
    expectTokens(client, ['headers.get("X-UC-Workspace-Path") || window.location.pathname']);
    expectNoTokens(client, ['headers.get("X-UC-Workspace-Module") || ""']);

    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    const resolver = await read("src/lib/rdash/workspace-active-read-target.ts");
    expectTokens(boundary, ["workspaceReadTargetForActiveNavigation(pathname, activeModuleId)"]);
    expectTokens(boundary, ['"X-UC-Workspace-Module": requestedTarget.moduleId']);
    expectTokens(resolver, ["pathTarget.moduleId === activeTarget.moduleId ? pathTarget : activeTarget"]);
    expect(resolver).toContain("workspaceReadTargetForPath(pathname)");
    expect(resolver).toContain("workspaceReadTargetForModule(activeModuleId)");
  });

  test("hidden tabs reuse bounded stale health rather than polling the server", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expectTokens(source, ["HEALTH_HIDDEN_STALE_MS = 24 * 60 * 60_000"]);
    expectTokens(source, ['document.visibilityState !== "visible"']);
    expect(source).toContain("clearStoredHealthResponses");
  });

  test("GPS writes use one hourly browser bundle instead of point-by-point database traffic", async () => {
    const server = await read("src/lib/rdash/server/staff-location.ts");
    expect(server).toContain('.from("StaffRouteBundle")');
    expect(server).toContain("recordStaffRouteBundle");
    expect(server).toContain("cleanupExpiredStaffRouteBundles");
    expect(server).not.toContain('from("StaffLocationPing")');
    expectNoTokens(server, ["const retained ="]);
    expectNoTokens(server, ["await allPoints()"]);

    const client = await read("src/components/rdash/StaffLocationTracker.tsx");
    expectTokens(client, ["HOURLY_SYNC_MS = 60 * 60_000"]);
    expectTokens(client, ["MOVING_CAPTURE_INTERVAL_MS = 30_000"]);
    expectTokens(client, ["STATIONARY_CAPTURE_INTERVAL_MS = 2 * 60_000"]);
    expectTokens(client, ["POSITION_HEARTBEAT_MS = 2 * 60_000"]);
    expectTokens(client, ["POST_TIMEOUT_MS = 15_000"]);
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
    expectTokens(rest, [".range(offset, offset + configuredLimit)"]);
    expectTokens(rest, ["rawRows.slice(0, configuredLimit)"]);
    expectTokens(rest, ["rawRows.length > configuredLimit"]);
    expectNoTokens(rest, ['count: "exact"']);

    const route = await read("src/lib/rdash/server/module-scoped-route.ts");
    expect(route).toContain('request.nextUrl.searchParams.getAll("page")');
    expect(route).toContain("getModuleScopedWorkspacePage");
    expect(route).toContain('"X-UC-Read-Page-Only"');
    expect(route).toContain('"X-UC-Read-Has-More"');
    expectTokens(route, ["MODULE_RESPONSE_WARN_BYTES = 512 * 1024"]);
  });

  test("browser merges next pages instead of replacing the scoped workspace", async () => {
    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    expect(boundary).toContain("mergeWorkspacePage");
    expectTokens(boundary, ["MAX_COLLECTION_PAGES_PER_REQUEST = 4"]);
    expectTokens(boundary, ['response.headers.get("X-UC-Read-Page-Only") !== "1"']);
    expectTokens(boundary, ["payload.revision !== latest.serverRevision"]);
    expect(boundary).toContain("workspaceReadCache.store");
  });

  test("stale scoped responses and workspace reset epochs cannot overwrite newer session data", async () => {
    const rawStore = await read("src/lib/rdash/raw-store.ts");
    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    const bridge = await read("src/lib/rdash/use-workspace-row-version-bridge.ts");
    const outbox = await read("src/lib/uploads/workspace-outbox.ts");
    const clientAuth = await read("src/lib/rdash/client-auth.ts");
    expect(rawStore).toContain("workspaceHydrationRevisionIsCurrent(");
    expectTokens(rawStore, ["if (saveEpoch !== syncEpoch) return;"]);
    expectTokens(rawStore, ["await beginWorkspaceOutboxResetBarrier()"]);
    expectTokens(rawStore, ["await serverSyncQueue.catch(() => undefined)"]);
    expectTokens(rawStore, ["rowVersionsCache = null"]);
    expect(rawStore).toContain("workspaceRowVersionState.replace(undefined)");
    expect(rawStore).toContain("workspaceFoundationRevisionState.replace(payload.revision)");
    expect(rawStore).toContain("workspaceReadCache.clear()");
    expect(rawStore).toContain("resetWorkspaceOutboxAfterWorkspaceReset");
    expect(rawStore).toContain("invalidateWorkspaceClientCaches()");
    expect(rawStore).toContain("window.location.reload()");
    expect(boundary).toContain("clearWorkspaceReadRequestCache()");
    expectTokens(boundary, ['result.reason === "client_ahead"']);
    expectTokens(boundary, ["if (!hydrated)"]);
    expect(bridge.indexOf("const accepted = original(input)")).toBeLessThan(bridge.indexOf("workspaceRowVersionState.merge(input.rowVersions)"));
    expect(outbox).toContain("beginWorkspaceOutboxResetBarrier");
    expectTokens(outbox, ["if (resetBarrier) return { replayed: false, conflict: false }"]);
    expect(outbox).toContain("resetWorkspaceOutboxAfterWorkspaceReset");
    expectTokens(outbox, ["await uploadIndexedDb.deleteWorkspaceOutbox(item.operationId)"]);
    expectTokens(clientAuth, ["if (isWorkspaceRead && !deferReadState)"]);
  });

  test("module, bounded page and entity reads finish behind a revision fence", async () => {
    const moduleRead = await read("src/lib/rdash/server/module-scoped-read.ts");
    const entityRead = await read("src/lib/rdash/server/entity-scoped-read.ts");
    expectTokens(moduleRead, ["const revisionFence = await getWorkspaceSubset({})"]);
    expectTokens(moduleRead, ["revisionFence.revision !== scoped.revision"]);
    expectTokens(moduleRead, ["revisionFence.revision !== page.revision"]);
    expectTokens(entityRead, ["const revisionFence = await getWorkspaceSubset({})"]);
    expectTokens(entityRead, ["revisionFence.revision !== merged.revision"]);
  });

  test("pagination metadata survives normalization and offline overlays", async () => {
    const workCategory = await read("src/lib/rdash/work-category-master.ts");
    const rawStore = await read("src/lib/rdash/raw-store.ts");
    const sessionMerge = await read("src/lib/rdash/workspace-session-merge.ts");
    const outbox = await read("src/lib/uploads/workspace-outbox.ts");
    expectTokens(workCategory, ["...(db as RDashDatabase)"]);
    expectTokens(rawStore, ["mergeWorkspaceSnapshot(current.db, db)"]);
    expectTokens(sessionMerge, ["prepareWorkspaceData(structuredClone(input) as RDashDatabase)"]);
    expectTokens(sessionMerge, ["structuredClone(current || createEmptyWorkspaceDatabase())"]);
    expectTokens(outbox, ["acceptedWorkspace = structuredClone(base) as RDashDatabase"]);
    expectTokens(outbox, ["let db = structuredClone(base) as RDashDatabase"]);
  });

  test("server workspace persistence is Supabase-only with no in-memory fallback backend", async () => {
    const workspace = await read("src/lib/rdash/server/workspace.ts");
    const env = await read(".env.example");
    expectTokens(workspace, ["Supabase/PostgreSQL is the single server workspace persistence system"]);
    expect(workspace).toContain("assertSupabaseSchemaReady");
    expect(workspace).not.toContain("UC_ALLOW_IN_MEMORY_WORKSPACE_FALLBACK");
    expect(workspace).not.toContain("memorySnapshot");
    expect(workspace).not.toContain("memoryRowRevisions");
    expect(env).not.toContain("UC_ALLOW_IN_MEMORY_WORKSPACE_FALLBACK");
  });

  test("commit retry and repair paths never reconstruct the complete workspace", async () => {
    const route = await read("src/app/api/operations/commit/route.ts");
    expect(route).toContain("loadOperationSubset");
    expect(route).toContain("operationRowsByCollection");
    expectTokens(route, ["getWorkspaceSubset({ rowsByCollection })"]);
    expect(route).toContain('commitHeaders("no-op-revision-read"');
    expect(route).not.toContain("getWorkspace(true)");
    expect(route).not.toContain("getWorkspace,");
  });

  test("all normal commits use row or domain subset validation with no old full-workspace fallback", async () => {
    const authorized = await read("src/lib/rdash/server/authorized-commit.ts");
    const targeted = await read("src/lib/rdash/server/targeted-commit.ts");
    const simple = await read("src/lib/rdash/server/simple-targeted-commit.ts");

    expect(authorized).toContain("validationReadPlan");
    expect(authorized).toContain("getWorkspaceSubset(validationReadPlan");
    expectTokens(authorized, ['CommitMode = "row-targeted" | "domain-targeted"']);
    expect(authorized).toContain("assertCanonicalThreadOperations");
    expect(authorized).not.toContain("getWorkspace(");
    expect(authorized).not.toContain("phase2-single-read");
    expect(targeted).not.toContain("UC_PHASE2B_TARGETED_COMMITS");
    expect(simple).not.toContain("UC_PHASE2B_TARGETED_COMMITS");
  });

  test("workspace, module and entity reads have no old-system feature switch", async () => {
    const workspace = await read("src/app/api/workspace/route.ts");
    const moduleRead = await read("src/lib/rdash/server/module-scoped-read.ts");
    const entityRead = await read("src/lib/rdash/server/entity-scoped-read.ts");
    const readState = await read("src/lib/rdash/workspace-read-state.ts");

    expect(workspace).not.toContain("UC_FULL_WORKSPACE_FALLBACK");
    expect(workspace).not.toContain("getWorkspace(");
    expectTokens(workspace, ['"X-UC-Read-Architecture": "scoped-only"']);
    expect(moduleRead).not.toContain("UC_MODULE_SCOPED_READS");
    expect(entityRead).not.toContain("UC_ENTITY_SCOPED_READS");
    expectNoTokens(readState, ['mode === "full" ? "full"']);
  });

  test("ordinary and nested Drive uploads use one targeted context architecture", async () => {
    const initiate = await read("src/lib/rdash/server/direct-upload-initiate.ts");
    const finalize = await read("src/lib/rdash/server/direct-upload-finalize-core.ts");
    const context = await read("src/lib/rdash/server/direct-upload-workspace.ts");

    expect(initiate).toContain("getDirectUploadWorkspace");
    expect(initiate).not.toContain("getWorkspace(");
    expect(finalize).toContain("getDirectUploadWorkspace");
    expect(finalize).toContain("getWorkspaceSubset");
    expect(finalize).not.toContain("getWorkspace(");
    expect(context).toContain("NESTED_TARGET_PARENT_COLLECTION");
    expectTokens(context, ['quotation_item: "quotations"']);
    expectTokens(context, ['boq_item: "boqs"']);
    expectTokens(context, ['thread_message: "threads"']);
    expect(context).toContain("prepareNestedResolverProjection");
    expect(context).toContain("getWorkspaceSubset");
    expect(context).toContain("invalidUploadContext");
    expect(context).not.toContain("getWorkspace(");
    expect(context).not.toContain("COMPATIBILITY_NESTED_TARGETS");
    expectNoTokens(context, ["compatibility full read"]);
  });

  test("normal file cleanup and Drive account maintenance never load or save the whole workspace", async () => {
    const cleanup = await read("src/lib/rdash/server/file-cleanup.ts");
    const refresh = await read("src/app/api/google-drive/refresh-account/route.ts");
    const callback = await read("src/app/api/google-drive/oauth/callback/route.ts");

    for (const source of [cleanup, refresh, callback]) {
      expect(source).not.toContain("getWorkspace(");
      expect(source).not.toContain("saveWorkspace(");
      expect(source).toContain("getWorkspaceSubset");
      expect(source).toContain("commitWorkspaceOperations");
    }
  });

  test("canonical Customer thread migration removes the old bare identity", async () => {
    const migration = await read("supabase/migrations/20260815163500_canonical_customer_thread_identity.sql");
    expect(migration).toContain("customer-conversation:");
    expectTokens(migration, ["data->>'record_id' like 'cust-%'"]);
    expectTokens(migration, ['from public."entity_customers" as customer']);
    expectTokens(migration, ["revision = thread.revision + 1"]);

    const targeted = await read("src/lib/rdash/server/targeted-commit.ts");
    const authorized = await read("src/lib/rdash/server/authorized-commit.ts");
    const entityRead = await read("src/lib/rdash/server/entity-scoped-read.ts");
    const workspace = await read("src/lib/rdash/server/workspace.ts");
    const resetPersistence = await read("src/lib/rdash/server/commit-rest.ts");
    expect(targeted).toContain('recordId.startsWith("customer-conversation:")');
    expect(targeted).not.toContain('recordId.startsWith("cust-")');
    expect(authorized).toContain('recordId.startsWith("cust-")');
    expectTokens(authorized, ["must use customer-conversation:<customer_id>"]);
    expect(entityRead).toContain("canonicalThreadRecordIds");
    expect(workspace).not.toContain("canonicalizeResetCustomerThreads");
    const resetCanonicalization = resetPersistence.indexOf("customer-conversation:${thread.record_id}");
    const resetDiff = resetPersistence.indexOf("diffWorkspaceOperations(current.data, seedData)");
    expect(resetCanonicalization).toBeGreaterThan(0);
    expect(resetDiff).toBeGreaterThan(resetCanonicalization);
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
  test("uses one foundation-first client hydration lifecycle", async () => {
    const store = await read("src/lib/rdash/raw-store.ts");
    const bootstrap = await read("src/app/api/bootstrap/route.ts");
    const projected = await read("src/lib/rdash/server/projected-workspace-bootstrap.ts");
    const appShell = await read("src/components/urban-castle/UrbanCastleApp.tsx");
    expectNoTokens(store, ['import { buildSeedDatabase } from "./seed"']);
    expect(store).not.toContain("prepareWorkspaceDatabase(");
    expectNoTokens(store, ['selectedCustomerId: "cust-das"']);
    expectTokens(store, ["db: createEmptyWorkspaceDatabase()"]);
    expectTokens(store, ["mergeWorkspaceSnapshot(current.db, db)"]);
    expect(bootstrap).toContain("getProjectedWorkspaceBootstrap(user.staffId)");
    expect(projected).toContain("getProjectedWorkspacePermissions");
    expectNoTokens(projected, ["compatibility read"]);
    expectTokens(appShell, ['return scope === "workdesk";']);
    expectNoTokens(appShell, ['scope === "full"']);
  });

  test("does not rehydrate unchanged cached modules or auto-rebase conflicts through workspace reads", async () => {
    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    const outbox = await read("src/lib/uploads/workspace-outbox.ts");
    const cache = await read("src/lib/rdash/workspace-read-cache.ts");
    const coreTypes = await read("src/lib/rdash/store/types.ts");
    expectNoTokens(boundary, ["db: cachedTarget.data"]);
    expectTokens(boundary, ["if (!result.changed)"]);
    expect(boundary).toContain("acceptWorkspaceServerRevision");
    expect(outbox).not.toContain('fetch("/api/workspace"');
    expect(outbox).not.toContain("expectedRevisions");
    expect(outbox).not.toContain("bumpedAggregateRevisions");
    expect(cache).not.toContain("aggregateRevisions");
    expect(coreTypes).not.toContain("aggregateRevisions");
  });

  test("keeps the bootstrap Master foundation revision-safe without retransmitting it on module reads", async () => {
    const foundationSync = await read("src/components/urban-castle/WorkspaceFoundationSync.tsx");
    const moduleReader = await read("src/lib/rdash/server/module-scoped-read.ts");
    const appShell = await read("src/components/urban-castle/UrbanCastleApp.tsx");
    expectTokens(appShell, ["<WorkspaceFoundationSync />"]);
    expect(foundationSync).toContain("WORKSPACE_SESSION_BOOTSTRAP_COLLECTIONS.join");
    expect(foundationSync).toContain('fetch(`/api/changes?${params.toString()}`');
    expectTokens(foundationSync, ['"X-UC-Delta-Client": "workspace-foundation"']);
    expect(foundationSync).toContain("workspaceFoundationRevisionState");
    expect(foundationSync).toContain("acceptWorkspaceServerRevision");
    expect(foundationSync).toContain("applyWorkspaceDelta");
    expect(foundationSync).toContain('fetch("/api/bootstrap"');
    expect(foundationSync).not.toContain("setInterval");
    expect(moduleReader).toContain("!FOUNDATION_COLLECTIONS.has(collection)");
  });

  test("syncs shared foundation only after global revision advancement and keeps Staff projected", async () => {
    const app = await read("src/components/rdash/RDashApp.tsx");
    const foundationSync = await read("src/components/urban-castle/WorkspaceFoundationSync.tsx");
    const changes = await read("src/app/api/changes/route.ts");
    expect(app).toContain("workspaceFoundationRevisionState.replace(payload.revision)");
    expectTokens(foundationSync, ["if (knownFoundationRevision >= serverRevision) return"]);
    expect(foundationSync).not.toContain("targetChanged");
    expectTokens(foundationSync, ['"X-UC-Foundation-Delta": "1"']);
    expectTokens(changes, ['request.headers.get("x-uc-foundation-delta") === "1"']);
    expectTokens(changes, ["canReturnFullStaffRows = canReadFullStaff && !foundationProjection"]);
    expectTokens(changes, ["canReturnFullStaffRows ? undefined : DIRECTORY_PROJECTION_COLLECTIONS"]);
  });

});
