import { describe, expect, test } from "vitest";
import {
  configuredStaffBaseSalary,
  hasStaffSalaryConfiguration,
  payrollLineForStaffMonth,
  previewNetPay,
  summarizeSalaryAdjustments,
} from "@/lib/rdash/payroll";
import type { PayrollLine, PayrollPeriod, SalaryAdjustment, Staff } from "@/lib/rdash/types";
import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { testFile } from "./test-file";

describe("HR payroll consolidation", () => {
  test("uses one canonical salary configuration rule and real month length", () => {
    expect(configuredStaffBaseSalary({ salary_type: "monthly", monthly_salary: 30000, daily_wage: 900 } as Staff, "2026-02")).toBe(30000);
    expect(configuredStaffBaseSalary({ salary_type: "daily_wage", daily_wage: 900 } as Staff, "2026-02")).toBe(25200);
    expect(configuredStaffBaseSalary({ salary_type: "daily_wage", daily_wage: 900 } as Staff, "2026-03")).toBe(27900);
    expect(hasStaffSalaryConfiguration({ salary_type: "monthly", monthly_salary: 0, daily_wage: 900 } as Staff)).toBe(false);
    expect(hasStaffSalaryConfiguration({ salary_type: "daily_wage", monthly_salary: 30000, daily_wage: 0 } as Staff)).toBe(false);
  });

  test("includes only approved adjustments in payroll math", () => {
    const adjustments: SalaryAdjustment[] = [
      { id: "a1", staff_id: "s1", adjustment_date: "2026-09-05", type: "overtime", amount: 1200, reason: "OT", status: "approved" },
      { id: "a2", staff_id: "s1", adjustment_date: "2026-09-06", type: "bonus", amount: 800, reason: "Bonus", status: "approved" },
      { id: "a3", staff_id: "s1", adjustment_date: "2026-09-07", type: "advance", amount: 500, reason: "Advance", status: "approved" },
      { id: "a4", staff_id: "s1", adjustment_date: "2026-09-08", type: "deduction", amount: 250, reason: "Draft", status: "draft" },
      { id: "a5", staff_id: "s2", adjustment_date: "2026-09-09", type: "bonus", amount: 9999, reason: "Other staff", status: "approved" },
    ];
    const summary = summarizeSalaryAdjustments(adjustments, "s1", "2026-09");
    expect(summary.additions).toBe(2000);
    expect(summary.deductions).toBe(500);
    expect(summary.approved.map((row) => row.id)).toEqual(["a1", "a2", "a3"]);
    expect(previewNetPay(28000, summary)).toBe(29500);
  });

  test("resolves the persisted payroll line for the selected month", () => {
    const periods: PayrollPeriod[] = [
      { id: "p1", month: 9, year: 2026, status: "generated", generated_at: "2026-09-28T00:00:00Z" },
    ];
    const lines: PayrollLine[] = [
      {
        id: "l1",
        payroll_period_id: "p1",
        staff_id: "s1",
        base_salary: 30000,
        present_days: 25,
        absent_days: 1,
        paid_leave_days: 0,
        overtime_amount: 1000,
        advance_deduction: 0,
        other_deductions: 0,
        gross_pay: 30000,
        net_payable: 29800,
        payment_status: "pending",
      },
    ];
    const resolved = payrollLineForStaffMonth({ payrollPeriods: periods, payrollLines: lines } as any, "s1", "2026-09");
    expect(resolved.period?.id).toBe("p1");
    expect(resolved.line?.net_payable).toBe(29800);
  });

  test("HR root reuses Staff Operations instead of maintaining a second staff board", async () => {
    const router = await testFile("src/components/rdash/WorkspaceModuleRouter.tsx").text();
    expectTokens(router, ['case "staff-board": return <MastersModule submodule="staff" />;']);
    expectNoTokens(router, ["StaffBoardHistoryModule", "<StaffBoardModule"]);
  });

  test("attendance and salary expose the audited high-priority UI states without new business logic", async () => {
    const attendance = await testFile("src/components/rdash/modules/AttendancePayrollModule.tsx").text();
    const salary = await testFile("src/components/rdash/modules/StaffSalaryModule.tsx").text();

    expectTokens(attendance, [
      'aria-label="Attendance status legend"',
      'aria-label="Attendance staff member"',
      "Attendance exception",
      "Review / regularize",
      'STATUS_META[record.status]',
      'className="md:hidden"',
      'className="hidden overflow-x-auto rd-scroll md:block"',
    ]);
    expectNoTokens(attendance, ['text-[8px]">⚠</span>']);

    expectTokens(salary, [
      '"Selected payroll month"',
      'hasPersistedPayroll ? "Persisted payroll" : "Live preview"',
      '"Why pay changed"',
      '"attendance violation"',
      '"Finalized source in view"',
      '"Preview source in view"',
    ]);
    expectNoTokens(salary, ['<h3 className="text-sm font-bold">Payroll status</h3>']);
  });

  test("salary and attendance modules share payroll helpers and approval workflow", async () => {
    const salary = await testFile("src/components/rdash/modules/StaffSalaryModule.tsx").text();
    const attendance = await testFile("src/components/rdash/modules/AttendancePayrollModule.tsx").text();
    const masters = await testFile("src/lib/rdash/store/slices/masters.ts").text();

    expectTokens(salary, ["payrollLineForStaffMonth", "summarizeSalaryAdjustments", "StaffEditDialog"]);
    expectTokens(attendance, ["hasStaffSalaryConfiguration", "setSalaryAdjustmentStatus", "Salary setup required"]);
    expectTokens(masters, ["Complete salary setup before generating payroll", "existing && existing.status !== \"generated\"", "summarizeSalaryAdjustments"]);
  });
});
