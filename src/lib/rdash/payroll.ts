import type { LeaveRequest, PayrollLine, PayrollPeriod, RDashDatabase, SalaryAdjustment, Staff } from "./types";

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PayrollSalaryType = "monthly" | "daily_wage";

type CompensationStaff = Pick<Staff, "salary_type" | "monthly_salary" | "daily_wage">;

export function payrollMonthCalendarDays(yearMonth: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error("Payroll month must use YYYY-MM.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || month < 1 || month > 12) {
    throw new Error("Payroll month is invalid.");
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function currentPayrollYearMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function resolvedStaffSalaryType(staff: CompensationStaff): PayrollSalaryType {
  if (staff.salary_type === "daily_wage") return "daily_wage";
  if (staff.salary_type === "monthly") return "monthly";
  const monthly = Number(staff.monthly_salary || 0);
  const daily = Number(staff.daily_wage || 0);
  return monthly > 0 || daily <= 0 ? "monthly" : "daily_wage";
}

export interface StaffMonthCompensation {
  salaryType: PayrollSalaryType;
  daysInMonth: number;
  baseSalary: number;
  dailyRate: number;
}

export function staffCompensationForMonth(
  staff: CompensationStaff,
  yearMonth: string,
): StaffMonthCompensation {
  const daysInMonth = payrollMonthCalendarDays(yearMonth);
  const salaryType = resolvedStaffSalaryType(staff);
  if (salaryType === "daily_wage") {
    const dailyRate = Number(staff.daily_wage || 0);
    const validDailyRate = Number.isFinite(dailyRate) && dailyRate > 0 ? money(dailyRate) : 0;
    return {
      salaryType,
      daysInMonth,
      dailyRate: validDailyRate,
      baseSalary: money(validDailyRate * daysInMonth),
    };
  }

  const monthly = Number(staff.monthly_salary || 0);
  const baseSalary = Number.isFinite(monthly) && monthly > 0 ? money(monthly) : 0;
  return {
    salaryType,
    daysInMonth,
    baseSalary,
    dailyRate: baseSalary > 0 ? money(baseSalary / daysInMonth) : 0,
  };
}

export function configuredStaffBaseSalary(staff: CompensationStaff, yearMonth: string): number {
  return staffCompensationForMonth(staff, yearMonth).baseSalary;
}

export function hasStaffSalaryConfiguration(staff: CompensationStaff): boolean {
  const salaryType = resolvedStaffSalaryType(staff);
  const amount = salaryType === "daily_wage"
    ? Number(staff.daily_wage || 0)
    : Number(staff.monthly_salary || 0);
  return Number.isFinite(amount) && amount > 0;
}

function monthBounds(yearMonth: string): { first: string; last: string } {
  const days = payrollMonthCalendarDays(yearMonth);
  return { first: `${yearMonth}-01`, last: `${yearMonth}-${String(days).padStart(2, "0")}` };
}

function eachDateInclusive(start: string, end: string): string[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const result: string[] = [];
  for (let cursor = startDate.getTime(); cursor <= endDate.getTime(); cursor += 86_400_000) {
    result.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return result;
}

export function approvedLeaveDatesForMonth(
  leaveRequests: LeaveRequest[],
  staffId: string,
  yearMonth: string,
): { paid: Set<string>; unpaid: Set<string> } {
  const bounds = monthBounds(yearMonth);
  const paid = new Set<string>();
  const unpaid = new Set<string>();
  for (const request of leaveRequests) {
    if (request.staff_id !== staffId || request.status !== "approved") continue;
    const start = request.start_date < bounds.first ? bounds.first : request.start_date;
    const end = request.end_date > bounds.last ? bounds.last : request.end_date;
    if (end < bounds.first || start > bounds.last) continue;
    const target = request.leave_type === "unpaid" ? unpaid : paid;
    for (const date of eachDateInclusive(start, end)) target.add(date);
  }
  return { paid, unpaid };
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
