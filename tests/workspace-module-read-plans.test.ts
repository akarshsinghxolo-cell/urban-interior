import { describe, expect, test } from "bun:test";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import { COLLECTIONS_BY_SCOPE } from "@/lib/rdash/server/module-scoped-collections";
import {
  collectionsForWorkspaceReadTarget,
  moduleReadPlanSavings,
  workspaceModuleReadPlan,
} from "@/lib/rdash/server/module-read-plans";
import { WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS } from "@/lib/rdash/server/projected-workspace-bootstrap";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

const EXACT_MODULES = [
  "tasks",
  "blockedRisks",
  "approvals",
  "calendarRecurring",
  "quotationConfig",
  "siteMeasurement",
  "visitProofs",
  "fieldMode",
  "gpsTracking",
  "grn",
  "inventory",
  "dispatch",
  "vendorRates",
  "rateFinder",
  "payments",
  "invoices",
  "vendorBills",
  "contractorPayments",
  "commissions",
  "gstReturns",
  "driveManager",
  "communicationCentre",
  "attendancePayroll",
  "staffSalary",
  "articleVariants",
  "userApprovals",
  "approvalPolicies",
  "auditLog",
] as const;

describe("exact module workspace read plans", () => {
  test("uses smaller module plans for focused screens", () => {
    for (const moduleId of EXACT_MODULES) {
      const target = workspaceReadTargetForModule(moduleId);
      const plan = workspaceModuleReadPlan(target);
      const savings = moduleReadPlanSavings(target);
      expect(plan.strategy).toBe("module");
      expect(savings.selected).toBe(plan.collections.length);
      expect(savings.selected).toBeLessThan(savings.scope);
    }
  });

  test("keeps aggregate dashboards on complete scope plans", () => {
    for (const moduleId of [
      "workdesk",
      "customerDesk",
      "siteExecution",
      "quotationDesk",
      "fieldOperations",
      "procurementInventory",
      "financeDesk",
      "profitability",
      "mediaCommunication",
      "hrStaff",
      "masterSetup",
      "reportsDesk",
      "systemSettings",
      "integrity",
    ]) {
      const target = workspaceReadTargetForModule(moduleId);
      const plan = workspaceModuleReadPlan(target);
      expect(plan.strategy).toBe("scope");
      expect(plan.collections).toBe(COLLECTIONS_BY_SCOPE[target.scope as keyof typeof COLLECTIONS_BY_SCOPE]);
    }
  });

  test("references only registered entity collections", () => {
    const known = new Set(Object.keys(COLLECTION_TO_TABLE));
    for (const moduleId of EXACT_MODULES) {
      const collections = collectionsForWorkspaceReadTarget(
        workspaceReadTargetForModule(moduleId),
      );
      expect(new Set(collections).size).toBe(collections.length);
      for (const collection of collections) expect(known.has(collection)).toBe(true);
    }
  });

  test("bounds history-heavy secondary collections", () => {
    const audit = workspaceModuleReadPlan(workspaceReadTargetForModule("auditLog"));
    expect(audit.limitsByCollection?.auditLog).toBe(250);

    const rates = workspaceModuleReadPlan(workspaceReadTargetForModule("vendorRates"));
    expect(rates.limitsByCollection?.["master.vendorRateHistories"]).toBe(100);
  });
});

describe("bootstrap JSON projections", () => {
  test("selects only authorization and current-staff identity fields", () => {
    expect(WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS.staffRolePermissions).toContain("module_key");
    expect(WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS.staffRolePermissions).toContain("can_view");
    expect(WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS.staffRolePermissions).not.toContain("data");
    expect(WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS["master.staff"]).toContain("role");
    expect(WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS["master.staff"]).toContain("status");
  });

  test("builds JSON selectors and preserves a bounded fallback", async () => {
    const projected = await Bun.file("src/lib/rdash/server/projected-workspace-bootstrap.ts").text();
    expect(projected).toContain("data->${field}");
    expect(projected).toContain("getWorkspaceSubset({});");
    expect(projected).toContain('fullCollections: ["staffRolePermissions"]');
    expect(projected).not.toContain("select(\"id,revision,data\")");
  });

  test("exposes plan and page-limit telemetry", async () => {
    const route = await Bun.file("src/lib/rdash/server/module-scoped-route.ts").text();
    expect(route).toContain('"X-UC-Read-Strategy"');
    expect(route).toContain('"X-UC-Read-Scope-Collections"');
    expect(route).toContain('"X-UC-Read-Limited-Collections"');
  });
});
