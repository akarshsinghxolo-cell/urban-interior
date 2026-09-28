import type { PayrollLine, PayrollPeriod, RDashDatabase, SalaryAdjustment, Staff } from "./types";

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function configuredStaffBaseSalary(staff: Pick<Staff, "monthly_salary" | "daily_wage">): number {
  const monthly = Number(staff.monthly_salary || 0);
  if (Number.isFinite(monthly) && monthly > 0) return money(monthly);
  const daily = Number(staff.daily_wage || 0);
  return Number.isFinite(daily) && daily > 0 ? money(daily * 30) : 0;
}

export function hasStaffSalaryConfiguration(staff: Pick<Staff, "monthly_salary" | "daily_wage">): boolean {
  return configuredStaffBaseSalary(staff) > 0;
}

export interface SalaryAdjustmentSummary {
  approved: SalaryAdjustment[];
  additions: number;
  deductions: number;
  overtime: number;
  bonus: number;
  advance: number;
  otherDeductions: number;
}

export function summarizeSalaryAdjustments(
  adjustments: SalaryAdjustment[],
  staffId: string,
  yearMonth: string,
): SalaryAdjustmentSummary {
  const approved = adjustments.filter((adjustment) =>
    adjustment.staff_id === staffId
    && adjustment.status === "approved"
    && adjustment.adjustment_date.startsWith(yearMonth));

  const overtime = money(approved
    .filter((adjustment) => adjustment.type === "overtime")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const bonus = money(approved
    .filter((adjustment) => adjustment.type === "bonus")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const advance = money(approved
    .filter((adjustment) => adjustment.type === "advance")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const otherDeductions = money(approved
    .filter((adjustment) => adjustment.type === "deduction" || adjustment.type === "hold")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));

  return {
    approved,
    overtime,
    bonus,
    advance,
    otherDeductions,
    additions: money(overtime + bonus),
    deductions: money(advance + otherDeductions),
  };
}

export function payrollPeriodForMonth(
  db: Pick<RDashDatabase, "payrollPeriods">,
  yearMonth: string,
): PayrollPeriod | undefined {
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return undefined;
  return (db.payrollPeriods || [])
    .filter((period) => period.year === year && period.month === month && period.status !== "cancelled")
    .sort((a, b) => (b.generated_at || "").localeCompare(a.generated_at || ""))[0];
}

export function payrollLineForStaffMonth(
  db: Pick<RDashDatabase, "payrollPeriods" | "payrollLines">,
  staffId: string,
  yearMonth: string,
): { period?: PayrollPeriod; line?: PayrollLine } {
  const period = payrollPeriodForMonth(db, yearMonth);
  const line = period
    ? (db.payrollLines || []).find((candidate) =>
        candidate.payroll_period_id === period.id && candidate.staff_id === staffId)
    : undefined;
  return { period, line };
}

export function previewNetPay(attendanceNet: number, summary: SalaryAdjustmentSummary): number {
  return money(attendanceNet + summary.additions - summary.deductions);
}
