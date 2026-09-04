import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import {
  reconcilePartnerPerformance,
  deriveContractorPerformance,
  deriveVendorPerformance,
} from "@/lib/rdash/performance-reconciliation";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import {
  tryWorkspaceReadTargetForModule,
  workspaceReadCoverageIsCompatible,
  workspaceReadScopeFromMode,
  workspaceReadTargetForModule,
} from "@/lib/rdash/workspace-read-scope";

describe("bug hunt: scoped read correctness", () => {
  test("fails closed for unknown server modes", () => {
    expect(workspaceReadScopeFromMode("unknown-mode")).toBe("bootstrap");
    expect(workspaceReadScopeFromMode("")).toBe("bootstrap");
  });

  test("rejects unknown and oversized module IDs without falling back", () => {
    expect(tryWorkspaceReadTargetForModule("does-not-exist")).toBeNull();
    expect(tryWorkspaceReadTargetForModule("x".repeat(121))).toBeNull();
  });

  test("does not reuse an exact module snapshot for a sibling module", () => {
    const tasks = workspaceReadTargetForModule("tasks");
    const approvals = workspaceReadTargetForModule("approvals");
    expect(workspaceReadCoverageIsCompatible({
      scope: "workdesk",
      mode: "workdesk",
      strategy: "module",
      moduleId: "tasks",
    }, tasks)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({
      scope: "workdesk",
      mode: "workdesk",
      strategy: "module",
      moduleId: "tasks",
    }, approvals)).toBe(false);
  });

  test("complete scope snapshots cover sibling modules and their records", () => {
    expect(workspaceReadCoverageIsCompatible({
      scope: "workdesk",
      mode: "workdesk",
      strategy: "scope",
    }, workspaceReadTargetForModule("approvals"))).toBe(true);
    expect(workspaceReadCoverageIsCompatible({
      scope: "customer",
      mode: "customer",
      strategy: "scope",
    }, {
      ...workspaceReadTargetForModule("customerDesk"),
      entity: { kind: "customer", id: "cust-1" },
    })).toBe(true);
  });

  test("row snapshots require the exact entity", () => {
    const requested = {
      ...workspaceReadTargetForModule("customerDesk"),
      entity: { kind: "customer" as const, id: "cust-1" },
    };
    expect(workspaceReadCoverageIsCompatible({
      scope: "customer",
      mode: "customer-row",
      strategy: "row",
      entityKind: "customer",
      entityId: "cust-1",
    }, requested)).toBe(true);
    expect(workspaceReadCoverageIsCompatible({
      scope: "customer",
      mode: "customer-row",
      strategy: "row",
      entityKind: "customer",
      entityId: "cust-2",
    }, requested)).toBe(false);
  });
});

describe("bug hunt: partner performance correctness", () => {
  test("compares delivery instants rather than date strings", () => {
    const score = deriveVendorPerformance({
      purchaseOrders: [{
        id: "po-1",
        vendor_id: "vendor-1",
        status: "received",
        expected_delivery: "2026-01-01T19:00:00Z",
        actual_delivery: "2026-01-02T00:00:00+05:30",
      }] as never[],
      vendorBills: [],
    }, "vendor-1");
    expect(score.on_time_pct).toBe(100);
    expect(score.reliability_score).toBe(100);
  });

  test("ignores cancelled and invalid delivery evidence", () => {
    const score = deriveVendorPerformance({
      purchaseOrders: [
        {
          id: "po-cancelled",
          vendor_id: "vendor-1",
          status: "cancelled",
          expected_delivery: "2026-01-01",
          actual_delivery: "2027-01-01",
        },
        {
          id: "po-invalid",
          vendor_id: "vendor-1",
          status: "received",
          expected_delivery: "not-a-date",
          actual_delivery: "2026-01-01",
        },
      ] as never[],
      vendorBills: [{
        id: "bill-1",
        vendor_id: "vendor-1",
        status: "approved",
        matched: true,
      }] as never[],
    }, "vendor-1");
    expect(score.on_time_pct).toBe(0);
    expect(score.reliability_score).toBe(100);
  });

  test("does not punish a contractor because an accepted bill is unpaid", () => {
    const score = deriveContractorPerformance({
      workOrders: [],
      contractorBills: [{
        id: "cb-1",
        contractor_id: "contractor-1",
        status: "approved",
      }] as never[],
    }, "contractor-1");
    expect(score.reliability_score).toBe(100);
    expect(score.rating).toBe(5);
  });

  test("preserves existing partner ratings when no evidence exists", () => {
    const db = buildSeedDatabase();
    db.purchaseOrders = [];
    db.vendorBills = [];
    db.workOrders = [];
    db.contractorBills = [];
    db.master.vendors = [{
      ...db.master.vendors[0],
      id: "vendor-no-evidence",
      reliability_score: 73,
      on_time_pct: 71,
      rating: 4,
    }];
    db.master.contractors = [{
      ...db.master.contractors[0],
      id: "contractor-no-evidence",
      reliability_score: 68,
      on_time_pct: 66,
      rating: 3,
    }];

    const reconciled = reconcilePartnerPerformance(db);
    expect(reconciled.vendors[0].reliability_score).toBe(73);
    expect(reconciled.vendors[0].rating).toBe(4);
    expect(reconciled.contractors[0].reliability_score).toBe(68);
    expect(reconciled.contractors[0].rating).toBe(3);
  });
});

describe("bug hunt: source-level race and validation guards", () => {
  test("aborts stale scoped reads and validates the request target", async () => {
    const source = await testFile("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx").text();
    expectTokens(source, ["new AbortController()"]);
    expectTokens(source, ["const requestStillCurrent = () =>"]);
    expectTokens(source, ["requestSequenceRef.current === requestId"]);
    expectTokens(source, ["latestTargetKeyRef.current === requestTargetKey"]);
    expectTokens(source, ["if (!requestStillCurrent()) return"]);
    expectNoTokens(source, ["inFlightRef.current || error"]);
  });

  test("delta sync detects non-advancing journals and redirects expired sessions", async () => {
    const source = await testFile("src/components/urban-castle/WorkspaceDeltaSync.tsx").text();
    expectTokens(source, ["delta.revision === afterRevision"]);
    expectTokens(source, ["Delta journal did not advance"]);
    expect(source).toContain("clearSessionToken()");
    expect(source).not.toContain("activeModuleId");
  });

  test("variation dialog blocks invalid links, precision, and duplicate submissions", async () => {
    const source = await testFile("src/components/rdash/VariationRequestDialog.tsx").text();
    expectTokens(source, ["selectedExecutionLog.work_order_id !== targetWorkOrderId"]);
    expectTokens(source, ["if (submitting) return"]);
    expectTokens(source, ["no more than two decimal places"]);
    expect(source).toContain("MAX_DESCRIPTION_LENGTH");
    expect(source).toContain("TERMINAL_WORK_ORDER_STATUSES");
  });

  test("API routes distinguish authentication failures from service failures", async () => {
    const scoped = await testFile("src/lib/rdash/server/module-scoped-route.ts").text();
    const bootstrap = await testFile("src/app/api/bootstrap/route.ts").text();
    for (const source of [scoped, bootstrap]) {
      expectTokens(source, ['error.message === "UNAUTHORIZED"']);
      expectTokens(source, ["authentication service is temporarily unavailable"]);
      expectTokens(source, ['"X-Content-Type-Options": "nosniff"']);
    }
  });
});
