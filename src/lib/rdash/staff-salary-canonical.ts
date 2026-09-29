import type { Staff } from "./types";
import { staffCompensationForMonth } from "./payroll";

type SalaryViolation = {
  date: string;
  type: "late" | "absent" | "half_day";
  late_minutes?: number;
  rule: string;
  deduction: number;
};

export type BaseStaffSalaryComputation = {
  staff_id: string;
  staff_name: string;
  year_month: string;
  base_salary: number;
  per_day_rate: number;
  present_days: number;
  absent_days: number;
  half_days: number;
  late_days: number;
  late_deduction_total: number;
  absence_deduction_total: number;
  total_deductions: number;
  net_salary: number;
  violations: SalaryViolation[];
};

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * The attendance engine produces deduction events; this projection applies the
 * selected compensation model and the real calendar length of the payroll month.
 * One month-aware compensation helper is shared by Staff Salary and payroll.
 */
export function canonicalizeStaffSalaryComputation(
  raw: BaseStaffSalaryComputation,
  staff: Pick<Staff, "salary_type" | "monthly_salary" | "daily_wage">,
  yearMonth: string,
) {
  const compensation = staffCompensationForMonth(staff, yearMonth);
  const factor = raw.per_day_rate > 0 ? compensation.dailyRate / raw.per_day_rate : 0;
  const violations = raw.violations.map((violation) => ({
    ...violation,
    deduction: money(violation.deduction * factor),
    rule: `${violation.type === "late" ? "Late attendance" : violation.type === "half_day" ? "Half day" : "Absent"} deduction at ₹${compensation.dailyRate}/day for a ${compensation.daysInMonth}-day month.`,
  }));
  const lateDeductionTotal = money(
    violations.filter((row) => row.type === "late").reduce((sum, row) => sum + row.deduction, 0),
  );
  const absenceDeductionTotal = money(
    violations.filter((row) => row.type !== "late").reduce((sum, row) => sum + row.deduction, 0),
  );
  const totalDeductions = money(lateDeductionTotal + absenceDeductionTotal);

  return {
    ...raw,
    salary_type: compensation.salaryType,
    days_in_month: compensation.daysInMonth,
    base_salary: compensation.baseSalary,
    per_day_rate: compensation.dailyRate,
    late_deduction_total: lateDeductionTotal,
    absence_deduction_total: absenceDeductionTotal,
    total_deductions: totalDeductions,
    net_salary: money(compensation.baseSalary - totalDeductions),
    violations,
  };
}
