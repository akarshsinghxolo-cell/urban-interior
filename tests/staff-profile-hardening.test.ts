import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import { currentPayrollYearMonth, staffCompensationForMonth } from "@/lib/rdash/payroll";
import { applyWorkspaceOperations } from "@/lib/rdash/workspace-operations";
import { mergeWorkspaceSnapshot } from "@/lib/rdash/workspace-session-merge";
import { readSrc } from "./helpers/source-contract";

describe("staff profile hardening", () => {
  test("monthly daily rate and daily-wage month base use actual calendar days", () => {
    const monthly = { salary_type: "monthly", monthly_salary: 31000, daily_wage: undefined } as any;
    expect(staffCompensationForMonth(monthly, "2026-10")).toMatchObject({
      daysInMonth: 31,
      baseSalary: 31000,
      dailyRate: 1000,
    });
    expect(staffCompensationForMonth(monthly, "2026-09")).toMatchObject({
      daysInMonth: 30,
      baseSalary: 31000,
      dailyRate: 1033.33,
    });
    const daily = { salary_type: "daily_wage", daily_wage: 1000, monthly_salary: undefined } as any;
    expect(staffCompensationForMonth(daily, "2026-09").baseSalary).toBe(30000);
    expect(staffCompensationForMonth(daily, "2026-10").baseSalary).toBe(31000);
    expect(currentPayrollYearMonth(new Date(2026, 8, 29))).toBe("2026-09");
  });

  test("foundation staff projection cannot erase HR-only fields already loaded", () => {
    const db = buildSeedDatabase();
    const staff = db.master.staff[0];
    staff.monthly_salary = 34555;
    staff.address = "Saved address";
    staff.emergency_contact = "Saved contact";

    const next = applyWorkspaceOperations(
      db,
      [{ collection: "master.staff", upsert: [{ id: staff.id, name: "Updated Name", role: staff.role, status: staff.status }] }],
      { mergeProjectedStaff: true },
    );
    const merged = next.master.staff.find((row) => row.id === staff.id)!;
    expect(merged.name).toBe("Updated Name");
    expect(merged.monthly_salary).toBe(34555);
    expect(merged.address).toBe("Saved address");
    expect(merged.emergency_contact).toBe("Saved contact");
  });

  test("directory module snapshots merge projected Staff rows instead of replacing full HR rows", () => {
    const current = buildSeedDatabase();
    const staff = current.master.staff[0];
    staff.monthly_salary = 34555;
    staff.address = "Saved address";
    staff.emergency_contact = "Saved contact";

    const incoming = buildSeedDatabase();
    incoming.master.staff = [{ id: staff.id, name: "Directory Name", role: staff.role, status: staff.status } as any];
    (incoming as any)._workspace_read_scope = "tasks";
    (incoming as any)._workspace_read_mode = "module";
    (incoming as any)._workspace_read_strategy = "module";
    (incoming as any)._workspace_read_collections = ["master.staff"];
    (incoming as any)._workspace_staff_projection = "directory";

    const merged = mergeWorkspaceSnapshot(current, incoming);
    const row = merged.master.staff.find((candidate) => candidate.id === staff.id)!;
    expect(row.name).toBe("Directory Name");
    expect(row.monthly_salary).toBe(34555);
    expect(row.address).toBe("Saved address");
    expect(row.emergency_contact).toBe("Saved contact");
  });

  test("staff editor uses shared GPS capture, real document upload and no placeholder document IDs", () => {
    const dialog = readSrc("src/components/rdash/StaffEditDialog.tsx");
    expect(dialog).toContain('captureDeviceGps({ mode: "master-location" })');
    expect(dialog).toContain("Office coordinates");
    expect(dialog).toContain("auto_absent_after_minutes");
    expect(dialog).toContain("<StaffDocumentsEditor");
    expect(dialog).not.toContain("document_ids");
    expect(dialog).not.toContain('value="contract"');

    const documents = readSrc("src/components/rdash/StaffDocumentsEditor.tsx");
    expect(documents).toContain("/api/staff-documents/upload");
    expect(documents).toContain("storageBucket");
    expect(documents).toContain("awaitServerSync");
  });

  test("legacy Staff Google Drive document route is pruned", () => {
    expect(readSrc("src/lib/uploads/upload-types.ts")).not.toContain("staff_document");
    expect(readSrc("src/lib/uploads/upload-purpose.ts")).not.toContain("staff_document");
    expect(readSrc("src/lib/rdash/server/direct-upload-workspace.ts")).not.toContain("staff_document");
    expect(readSrc("src/lib/rdash/server/drive-folder-hierarchy.ts")).not.toContain("staff_document");
  });
});
