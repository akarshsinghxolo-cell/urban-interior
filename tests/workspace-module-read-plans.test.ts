import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import { COLLECTION_TO_TABLE } from "@/lib/rdash/server/commit-rest";
import { COLLECTIONS_BY_SCOPE } from "@/lib/rdash/server/module-scoped-collections";
import {
  collectionsForWorkspaceReadTarget,
  moduleReadPlanSavings,
  workspaceModuleReadPlan,
} from "@/lib/rdash/server/module-read-plans";
import {
  WORKSPACE_BOOTSTRAP_PROJECTED_FIELDS,
  WORKSPACE_FOUNDATION_COLLECTIONS,
} from "@/lib/rdash/server/projected-workspace-bootstrap";
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
  "controlBrainWorkflows",
  "dataImport",
  "systemSettings",
  "customerTimeline",
  "customerRequests",
  "salesPipeline",
  "lostClosedReview",
  "drawings",
  "executionLogs",
  "woTimeline",
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

  test("bounds existing and true-history feeds only", () => {
    const audit = workspaceModuleReadPlan(workspaceReadTargetForModule("auditLog"));
    expect(audit.limitsByCollection?.auditLog).toBe(250);

    const rates = workspaceModuleReadPlan(workspaceReadTargetForModule("vendorRates"));
    expect(rates.limitsByCollection?.["master.vendorRateHistories"]).toBe(100);

    const customerTimeline = workspaceModuleReadPlan(workspaceReadTargetForModule("customerTimeline"));
    expect(customerTimeline.limitsByCollection?.executionLogs).toBe(100);
    expect(customerTimeline.limitsByCollection?.commSends).toBe(100);
    expect(customerTimeline.limitsByCollection?.auditLog).toBe(100);
  });

  test("does not truncate primary arrays that currently drive total counters", () => {
    const drawings = workspaceModuleReadPlan(workspaceReadTargetForModule("drawings"));
    expect(drawings.limitsByCollection?.drawings).toBeUndefined();
    expect(drawings.limitsByCollection?.customers).toBeUndefined();
    expect(drawings.limitsByCollection?.sites).toBeUndefined();
    expect(drawings.limitsByCollection?.entityFileAttachments).toBeUndefined();
    expect(drawings.limitsByCollection?.["master.fileAssets"]).toBeUndefined();

    const executionLogs = workspaceModuleReadPlan(workspaceReadTargetForModule("executionLogs"));
    expect(executionLogs.limitsByCollection?.executionLogs).toBeUndefined();

    const inbox = workspaceModuleReadPlan(workspaceReadTargetForModule("unifiedThreadInbox"));
    expect(inbox.limitsByCollection?.threads).toBeUndefined();
    expect(inbox.limitsByCollection?.customers).toBeUndefined();
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

  test("builds JSON selectors and preserves a bounded taxonomy foundation", async () => {
    const projected = (await testFile("src/lib/rdash/server/projected-workspace-bootstrap.ts").text())
      .replace(/\r\n/g, "\n");
    expect(projected).toContain("data->${field}");
    expect(WORKSPACE_FOUNDATION_COLLECTIONS).toEqual([
      "master.units",
      "master.workCategories",
      "master.workSubcategories",
      "master.articles",
      "master.articleVariants",
      "master.subcategoryArticleMap",
      "master.workOptionGroups",
      "master.workOptionValues",
    ]);
    expect(projected).toContain("fullCollections: [...WORKSPACE_FOUNDATION_COLLECTIONS]");
    expect(projected).toContain("WORKSPACE_BOOTSTRAP_DATA_COLLECTIONS");
    expect(projected).toContain("...WORKSPACE_FOUNDATION_COLLECTIONS,");
    expect(projected).not.toContain("select(\"id,revision,data\")");
  });

  test("marks entity graphs as partial row reads", async () => {
    const entityRead = await testFile("src/lib/rdash/server/entity-scoped-read.ts").text();
    expect(entityRead).toContain('metadata._workspace_read_strategy = "row"');
    expect(entityRead).toContain('metadata._workspace_foundation_embedded = false');
  });

  test("exposes plan and page-limit telemetry", async () => {
    const route = await testFile("src/lib/rdash/server/module-scoped-route.ts").text();
    expect(route).toContain('"X-UC-Read-Strategy"');
    expect(route).toContain('"X-UC-Read-Scope-Collections"');
    expect(route).toContain('"X-UC-Read-Limited-Collections"');
  });

  test("keeps runtime verification preview-only and token protected", async () => {
    const route = await testFile("src/app/api/internal/preview-read-plans/route.ts").text();
    expect(route).toContain('process.env.VERCEL_ENV !== "preview"');
    expect(route).toContain("UC_PREVIEW_VERIFY_TOKEN");
    expect(route).toContain('request.headers.get("x-uc-preview-verifier")');
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("projectedBootstrap");
    expect(route).toContain("status: valid ? 200 : 503");
  });
});
