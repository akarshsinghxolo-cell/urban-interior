import { describe, expect, test } from "bun:test";
import {
  CURRENT_STAFF_RUNTIME_FIELDS,
  STAFF_DIRECTORY_FIELDS,
  canReadFullStaffData,
} from "@/lib/rdash/staff-directory";
import { collectionsForWorkspaceReadTarget } from "@/lib/rdash/server/module-read-plans";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";
import {
  workspaceCollectionFilterParam,
  workspaceStaffProjectionParam,
} from "@/lib/rdash/workspace-delta";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";

const SENSITIVE_STAFF_FIELDS = [
  "auth_user_id",
  "login_email",
  "login_enabled",
  "monthly_salary",
  "daily_wage",
  "bank_details",
  "address",
  "emergency_contact",
  "joining_date",
  "exit_date",
] as const;

describe("Staff data minimization", () => {
  test("keeps ordinary Staff directory fields operational but excludes HR/auth secrets", () => {
    expect(STAFF_DIRECTORY_FIELDS).toContain("name");
    expect(STAFF_DIRECTORY_FIELDS).toContain("role");
    expect(STAFF_DIRECTORY_FIELDS).toContain("status");
    expect(STAFF_DIRECTORY_FIELDS).toContain("gps_tracking_enabled");
    for (const field of SENSITIVE_STAFF_FIELDS) {
      expect(STAFF_DIRECTORY_FIELDS).not.toContain(field as never);
    }
    expect(CURRENT_STAFF_RUNTIME_FIELDS).toEqual(["attendance_policy"]);
  });

  test("permits full Staff HR reads only for HR-management roles", () => {
    expect(canReadFullStaffData("Owner")).toBe(true);
    expect(canReadFullStaffData("Operations Manager")).toBe(true);
    expect(canReadFullStaffData("Accounts / Admin")).toBe(true);
    expect(canReadFullStaffData("Field Staff")).toBe(false);
    expect(canReadFullStaffData("Sales / Telecaller")).toBe(false);
    expect(canReadFullStaffData("Procurement Staff")).toBe(false);
    expect(canReadFullStaffData("Finance")).toBe(false);
  });

  test("does not request canonical full Staff rows from non-HR exact module plans", () => {
    for (const moduleId of [
      "tasks",
      "blockedRisks",
      "approvals",
      "calendarRecurring",
      "siteMeasurement",
      "visitProofs",
      "fieldMode",
      "gpsTracking",
      "grn",
      "inventory",
      "dispatch",
      "payments",
      "invoices",
      "vendorBills",
      "contractorPayments",
      "commissions",
      "communicationCentre",
      "userApprovals",
      "approvalPolicies",
      "auditLog",
    ]) {
      expect(collectionsForWorkspaceReadTarget(
        workspaceReadTargetForModule(moduleId),
      )).not.toContain("master.staff");
    }
  });

  test("keeps full Staff available for attendance/payroll and salary routes", () => {
    expect(collectionsForWorkspaceReadTarget(
      workspaceReadTargetForModule("attendancePayroll"),
    )).toContain("master.staff");
    expect(collectionsForWorkspaceReadTarget(
      workspaceReadTargetForModule("staffSalary"),
    )).toContain("master.staff");
  });

  test("directory-scoped delta filters never request full Staff journal rows", () => {
    const db = buildSeedDatabase() as RDashDatabase;
    const metadata = db as unknown as Record<string, unknown>;
    metadata._workspace_read_scope = "workdesk";
    metadata._workspace_read_collections = [
      "staffRolePermissions",
      "master.staff",
      "tasks",
      "followups",
    ];
    metadata._workspace_staff_projection = "directory";

    expect(workspaceStaffProjectionParam(db)).toBe("directory");
    const directoryFilter = workspaceCollectionFilterParam(db) || "";
    expect(directoryFilter.split(",")).not.toContain("master.staff");
    expect(directoryFilter.split(",")).toContain("tasks");

    metadata._workspace_staff_projection = "full";
    expect(workspaceStaffProjectionParam(db)).toBe("full");
    expect((workspaceCollectionFilterParam(db) || "").split(",")).toContain("master.staff");
  });

  test("delta API strips master.staff for non-HR roles even without a client filter", async () => {
    const source = await Bun.file("src/app/api/changes/route.ts").text();
    expect(source).toContain("canReadFullStaffData(user.role)");
    expect(source).toContain('safe.delete("master.staff")');
    expect(source).toContain("requested || new Set(Object.keys(COLLECTION_TO_TABLE))");
  });
});
