import { describe, expect, test } from "bun:test";
import { HEALTH_SUMMARY_COLLECTIONS } from "@/lib/rdash/server/workspace-health";

const read = (path: string) => Bun.file(path).text();

describe("runtime efficiency hardening", () => {
  test("health summary uses a bounded collection plan", () => {
    expect(HEALTH_SUMMARY_COLLECTIONS.length).toBeLessThan(20);
    for (const collection of [
      "tasks",
      "actions",
      "visits",
      "invoices",
      "customerReceipts",
      "vendorPayments",
      "auditLog",
    ]) {
      expect(HEALTH_SUMMARY_COLLECTIONS).toContain(collection);
    }
  });

  test("dashboard health no longer loads or scans the full workspace", async () => {
    const route = await read("src/app/api/health/summary/route.ts");
    expect(route).toContain("getWorkspaceHealthSummary");
    expect(route).not.toContain("getWorkspace(");
    expect(route).not.toContain("checkWorkspaceIntegrity");
    expect(route).toContain("private, max-age=60, stale-while-revalidate=300");
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

  test("workspace deduplication follows the canonical URL rather than a lagging module", async () => {
    const client = await read("src/lib/rdash/client-auth.ts");
    expect(client).toContain("WORKSPACE_READ_DEDUPE_TTL_MS = 10_000");
    expect(client).toContain('headers.get("X-UC-Workspace-Path") || window.location.pathname');
    expect(client).not.toContain('headers.get("X-UC-Workspace-Module") || ""');

    const boundary = await read("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx");
    expect(boundary).toContain("workspaceReadTargetForPath(pathname)");
    expect(boundary).toContain('"X-UC-Workspace-Module": requestedTarget.moduleId');
    expect(boundary).not.toContain("workspaceReadTargetForModule");
  });

  test("hidden tabs reuse bounded stale health rather than polling the server", async () => {
    const source = await read("src/lib/rdash/client-auth.ts");
    expect(source).toContain("HEALTH_HIDDEN_STALE_MS = 24 * 60 * 60_000");
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).toContain("clearStoredHealthResponses");
  });

  test("GPS writes do not reload and prune the whole history table", async () => {
    const server = await read("src/lib/rdash/server/staff-location.ts");
    expect(server).toContain('.from("StaffLocationPing").insert');
    expect(server).toContain("cleanupExpiredStaffLocationPings");
    expect(server).not.toContain("const retained =");
    expect(server).not.toContain("await allPoints()");

    const client = await read("src/components/rdash/StaffLocationTracker.tsx");
    expect(client).toContain("MINIMUM_PING_INTERVAL_MS = 2 * 60_000");
    expect(client).toContain("MINIMUM_MOVEMENT_METERS = 30");
    expect(client).toContain("POST_TIMEOUT_MS = 8_000");
    expect(client).not.toContain('authUser.role === "Owner"');
  });

  test("functions execute beside the Tokyo database", async () => {
    const config = JSON.parse(await read("vercel.json")) as { regions?: string[] };
    expect(config.regions).toEqual(["hnd1"]);
  });

  test("database migration provides health storage and GPS indexes", async () => {
    const migration = await read("supabase/migrations/20260728130000_runtime_efficiency_hardening.sql");
    expect(migration).toContain("workspace_health_snapshot");
    expect(migration).toContain('"StaffLocationPing_capturedAt_idx"');
    expect(migration).toContain('"StaffLocationPing_staffId_capturedAt_desc_idx"');
  });
});
