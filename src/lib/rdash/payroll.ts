import type { PayrollLine, PayrollPeriod, RDashDatabase, SalaryAdjustment, Staff } from "./types";

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function daysInPayrollMonth(yearMonth: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error("Payroll month must use YYYY-MM format.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Payroll month is invalid.");
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function configuredStaffBaseSalary(
  staff: Pick<Staff, "monthly_salary" | "daily_wage" | "salary_type">,
  yearMonth: string,
): number {
  const salaryType = staff.salary_type || "monthly";
  const monthly = Number(staff.monthly_salary || 0);
  const daily = Number(staff.daily_wage || 0);
  if (salaryType === "daily_wage") {
    return Number.isFinite(daily) && daily > 0 ? money(daily * daysInPayrollMonth(yearMonth)) : 0;
  }
  return Number.isFinite(monthly) && monthly > 0 ? money(monthly) : 0;
}

export function hasStaffSalaryConfiguration(staff: Pick<Staff, "monthly_salary" | "daily_wage" | "salary_type">): boolean {
  const salaryType = staff.salary_type || "monthly";
  if (salaryType === "daily_wage") return Number(staff.daily_wage || 0) > 0;
  return Number(staff.monthly_salary || 0) > 0;
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
