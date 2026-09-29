"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Pencil,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, formatINR, titleCase } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";
import {
  hasStaffSalaryConfiguration,
  payrollLineForStaffMonth,
  previewNetPay,
  summarizeSalaryAdjustments,
} from "@/lib/rdash/payroll";
import { Button } from "@/components/ui/button";
import { StaffEditDialog } from "../StaffEditDialog";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function adjustmentTone(type: string) {
  return type === "overtime" || type === "bonus"
    ? "border-success/20 bg-success/10 text-success"
    : type === "hold"
      ? "border-border bg-muted text-muted-foreground"
      : "border-destructive/20 bg-destructive/10 text-destructive";
}

function payrollTone(status?: string) {
  if (status === "paid") return "border-success/20 bg-success/10 text-success";
  if (status === "approved") return "border-primary/20 bg-primary/10 text-primary";
  if (status === "generated" || status === "pending") return "border-warning/20 bg-warning/10 text-warning";
  return "border-border bg-muted text-muted-foreground";
}

export function StaffSalaryModule() {
  const db = useRDashStore((state) => state.db);
  const authUser = useRDashStore((state) => state.authUser);
  const computeStaffSalary = useRDashStore((state) => state.computeStaffSalary);

  const userRole = authUser?.role;
  const isManager = userRole === "Owner" || userRole === "Operations Manager" || userRole === "Accounts / Admin";
  const ownStaffId = authUser?.staffId || "";
  const firstStaffId = db.master.staff.find((staff) => staff.status === "active")?.id || db.master.staff[0]?.id || "";

  const [selectedStaffId, setSelectedStaffId] = React.useState(
    isManager ? (ownStaffId || firstStaffId) : ownStaffId,
  );
  const [yearMonth, setYearMonth] = React.useState(currentMonth());
  const [staffEditOpen, setStaffEditOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isManager) {
      if (selectedStaffId !== ownStaffId) setSelectedStaffId(ownStaffId);
      return;
    }
    if (!db.master.staff.some((staff) => staff.id === selectedStaffId)) {
      setSelectedStaffId(firstStaffId);
    }
  }, [db.master.staff, firstStaffId, isManager, ownStaffId, selectedStaffId]);

  const staff = db.master.staff.find((row) => row.id === selectedStaffId);
  const salaryConfigured = Boolean(staff && hasStaffSalaryConfiguration(staff));

  const salary = React.useMemo(() => {
    if (!selectedStaffId || !yearMonth || !salaryConfigured) return null;
    try {
      return computeStaffSalary(selectedStaffId, yearMonth);
    } catch {
      return null;
    }
  }, [computeStaffSalary, salaryConfigured, selectedStaffId, yearMonth]);

  const monthAdjustments = React.useMemo(
    () => (db.salaryAdjustments || [])
      .filter((adjustment) =>
        adjustment.staff_id === selectedStaffId
        && adjustment.adjustment_date.startsWith(yearMonth))
      .sort((a, b) => b.adjustment_date.localeCompare(a.adjustment_date)),
    [db.salaryAdjustments, selectedStaffId, yearMonth],
  );

  const adjustmentSummary = React.useMemo(
    () => summarizeSalaryAdjustments(db.salaryAdjustments || [], selectedStaffId, yearMonth),
    [db.salaryAdjustments, selectedStaffId, yearMonth],
  );
  const payroll = React.useMemo(
    () => payrollLineForStaffMonth(db, selectedStaffId, yearMonth),
    [db, selectedStaffId, yearMonth],
  );
  const previewPayable = salary ? previewNetPay(salary.net_salary, adjustmentSummary) : 0;
  const finalPayable = payroll.line?.net_payable ?? previewPayable;
  const payrollStatus = payroll.line?.payment_status || payroll.period?.status || "preview";

  if (!staff) {
    return (
      <EmptyState
        title={isManager ? "No staff salary profile available" : "Your staff profile is not linked"}
        description={isManager
          ? "Create a Staff Operations profile in HR & Staff before configuring salary."
          : "Ask an administrator to link your signed-in account to the canonical Staff profile."}
        icon={<Wallet className="h-8 w-8"/>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5"/>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{isManager ? "Staff Salary" : "My Salary"}</h2>
            <p className="text-xs text-muted-foreground">
              One salary view from canonical Staff, attendance, approved adjustments and payroll lines.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {isManager && (
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Staff</span>
              <select
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
                className="h-9 min-w-48 rounded-md border border-input bg-card px-3 text-sm"
              >
                {db.master.staff.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Month</span>
            <input
              type="month"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
            />
          </label>
          {isManager && (
            <Button size="sm" variant="outline" onClick={() => setStaffEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5"/> Edit salary setup
            </Button>
          )}
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--panel-radius)] border border-border bg-card px-4 py-3 shadow-card">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={staff.name} size={42}/>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{staff.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {staff.role} · {staff.department || "No department"} · {titleCase(staff.salary_type || "monthly")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={salaryConfigured ? "Salary configured" : "Salary setup required"} className={salaryConfigured ? "border-success/20 bg-success/10 text-success" : "border-warning/20 bg-warning/10 text-warning"}/>
          <StatusBadge label={titleCase(payrollStatus)} className={payrollTone(payrollStatus)}/>
        </div>
      </section>

      {!salaryConfigured ? (
        <section className="rounded-[var(--panel-radius)] border border-warning/30 bg-warning/[0.06] p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h3 className="flex items-center gap-2 text-sm font-bold text-warning">
                <AlertTriangle className="h-4 w-4"/> Compensation is not configured
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                This Staff profile has neither a monthly salary nor a daily wage. Payroll generation now blocks incomplete Staff profiles instead of silently creating ₹0 salary lines.
              </p>
            </div>
            {isManager && (
              <Button size="sm" onClick={() => setStaffEditOpen(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5"/> Configure salary
              </Button>
            )}
          </div>
        </section>
      ) : salary ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Base salary" value={formatINR(salary.base_salary)} tone="primary" icon={<Wallet className="h-4 w-4"/>}/>
            <MetricCard label="Attendance deductions" value={formatINR(salary.total_deductions)} tone={salary.total_deductions > 0 ? "destructive" : "default"} icon={<TrendingDown className="h-4 w-4"/>}/>
            <MetricCard label="Approved additions" value={formatINR(adjustmentSummary.additions)} tone={adjustmentSummary.additions > 0 ? "success" : "default"} icon={<TrendingUp className="h-4 w-4"/>}/>
            <MetricCard label="Other deductions" value={formatINR(adjustmentSummary.deductions)} tone={adjustmentSummary.deductions > 0 ? "warning" : "default"} icon={<TrendingDown className="h-4 w-4"/>}/>
            <MetricCard label={payroll.line ? "Payroll payable" : "Preview payable"} value={formatINR(finalPayable)} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold">Attendance impact</h3>
                  <p className="text-[11px] text-muted-foreground">The same computation used when payroll lines are generated.</p>
                </div>
                <span className="text-xs font-mono font-semibold">{formatINR(salary.net_salary)} after attendance</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
                {[
                  ["Present", salary.present_days, "text-success"],
                  ["Paid leave", salary.paid_leave_days, "text-primary"],
                  ["Absent / unpaid", salary.absent_days, "text-destructive"],
                  ["Half days", salary.half_days, "text-warning"],
                  ["Late arrivals", salary.late_days, "text-warning"],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="bg-card p-3 text-center">
                    <p className={cn("text-xl font-bold", tone)}>{value}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Late deduction</p>
                  <p className="mt-1 font-mono text-sm font-bold text-destructive">−{formatINR(salary.late_deduction_total)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Absence deduction</p>
                  <p className="mt-1 font-mono text-sm font-bold text-destructive">−{formatINR(salary.absence_deduction_total)}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-bold">Payroll status</h3>
                <p className="text-[11px] text-muted-foreground">Persisted monthly payroll takes priority over the live preview.</p>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Period</span>
                  <span className="text-xs font-semibold">{payroll.period ? `${payroll.period.month}/${payroll.period.year}` : "Not generated"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <StatusBadge label={titleCase(payrollStatus)} className={payrollTone(payrollStatus)}/>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Approved additions</span>
                  <span className="font-mono text-xs font-semibold text-success">+{formatINR(adjustmentSummary.additions)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Approved deductions</span>
                  <span className="font-mono text-xs font-semibold text-destructive">−{formatINR(adjustmentSummary.deductions)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-sm font-bold">{payroll.line ? "Final payable" : "Current preview"}</span>
                  <span className="font-mono text-base font-bold">{formatINR(finalPayable)}</span>
                </div>
                {payroll.period?.generated_at && (
                  <p className="text-[10px] text-muted-foreground">Generated {formatDate(payroll.period.generated_at)}</p>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle className="h-4 w-4 text-warning"/> Deduction details
                </h3>
                <p className="text-[11px] text-muted-foreground">Date and rule behind every attendance deduction in {yearMonth}.</p>
              </div>
              <span className="text-[11px] text-muted-foreground">{salary.violations.length} violation{salary.violations.length === 1 ? "" : "s"}</span>
            </div>
            {salary.violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-success/30"/>
                <p className="mt-2 text-sm font-semibold text-success">No attendance deductions</p>
                <p className="text-xs text-muted-foreground">No late, absent or half-day deduction was calculated for this month.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rd-scroll">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-muted/20 text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold">Date</th>
                      <th className="px-3 py-2 text-left font-semibold">Type</th>
                      <th className="px-3 py-2 text-left font-semibold">Rule</th>
                      <th className="px-3 py-2 text-right font-semibold">Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salary.violations.slice().sort((a, b) => a.date.localeCompare(b.date)).map((violation, index) => (
                      <tr key={`${violation.date}-${index}`} className="border-b border-border/60 hover:bg-muted/10">
                        <td className="px-3 py-2.5 font-mono">{formatDate(violation.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                            {violation.type === "late" ? <Clock className="h-2.5 w-2.5"/> : <AlertTriangle className="h-2.5 w-2.5"/>}
                            {titleCase(violation.type)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{violation.rule}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-destructive">−{formatINR(violation.deduction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold">Salary adjustments</h3>
                <p className="text-[11px] text-muted-foreground">Draft adjustments do not affect payroll until the Owner approves them.</p>
              </div>
              <span className="text-[11px] text-muted-foreground">{monthAdjustments.length} this month</span>
            </div>
            {monthAdjustments.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">No overtime, bonus, advance, deduction or hold for this month.</p>
            ) : (
              <div className="divide-y divide-border">
                {monthAdjustments.map((adjustment) => (
                  <div key={adjustment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{titleCase(adjustment.type)} · {formatDate(adjustment.adjustment_date)}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{adjustment.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", adjustmentTone(adjustment.type))}>
                        {adjustment.type === "overtime" || adjustment.type === "bonus" ? "+" : "−"}{formatINR(adjustment.amount)}
                      </span>
                      <StatusBadge label={titleCase(adjustment.status)} className={adjustment.status === "approved" ? "border-success/20 bg-success/10 text-success" : adjustment.status === "rejected" ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-warning/20 bg-warning/10 text-warning"}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title="Salary could not be computed"
          description="The Staff profile is configured, but this month could not be calculated. Review attendance data and try again."
          icon={<CalendarDays className="h-8 w-8"/>}
        />
      )}

      {isManager && (
        <StaffEditDialog
          staffId={staff.id}
          open={staffEditOpen}
          onClose={() => setStaffEditOpen(false)}
        />
      )}
    </div>
  );
}
