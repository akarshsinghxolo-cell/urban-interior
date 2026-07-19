"use client";
import * as React from "react";
import { Wallet, TrendingDown, Calendar, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatDate, titleCase } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function StaffSalaryModule() {
    const db = useRDashStore((s) => s.db);
    const authUser = useRDashStore((s) => s.authUser);
    const computeStaffSalary = useRDashStore((s) => s.computeStaffSalary);

    // K2: Staff see only their own data. If the logged-in user has a staff_id,
    // default to that staff. If Owner/Manager, they can view any staff.
    // NOTE: Do NOT call s.currentUser() inside the selector — it returns a new
    // object every render and triggers "getSnapshot should be cached" infinite
    // loop. Use authUser directly (it's the raw state currentUser() wraps).
    const userRole = authUser?.role;
    const isManager = userRole === "Owner" || userRole === "Operations Manager" || userRole === "Accounts / Admin";
    const [selectedStaffId, setSelectedStaffId] = React.useState<string>(authUser?.staffId || db.master.staff[0]?.id || "");
    const [yearMonth, setYearMonth] = React.useState<string>(new Date().toISOString().slice(0, 7));

    const staff = db.master.staff.find((s: any) => s.id === selectedStaffId);
    const salary = React.useMemo(() => {
        if (!selectedStaffId || !yearMonth) return null;
        try {
            return computeStaffSalary(selectedStaffId, yearMonth);
        } catch {
            return null;
        }
    }, [selectedStaffId, yearMonth, computeStaffSalary]);

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wallet className="h-4 w-4"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{isManager ? "Staff Salary" : "My Salary"}</h2>
            <p className="text-xs text-muted-foreground">
              {isManager ? "Salary computation with attendance-based deductions" : "Your salary, deductions, and attendance violations"}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        {isManager && (<div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Staff member</label>
          <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm">
            {db.master.staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>)}
        {!isManager && staff && (<div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Staff member</label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm font-semibold">{staff.name}</div>
        </div>)}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Month</label>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm"/>
        </div>
      </div>

      {salary && staff ? (<>
        {/* Salary summary cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SalaryCard label="Base Salary" value={formatINR(salary.base_salary)} icon={<Wallet className="h-4 w-4"/>} tone="primary" subtext={`₹${salary.per_day_rate}/day`}/>
          <SalaryCard label="Total Deductions" value={formatINR(salary.total_deductions)} icon={<TrendingDown className="h-4 w-4"/>} tone="destructive" subtext={`${salary.late_days} late · ${salary.absent_days} absent · ${salary.half_days} half-day`}/>
          <SalaryCard label="Net Salary" value={formatINR(salary.net_salary)} icon={<CheckCircle2 className="h-4 w-4"/>} tone="success" subtext={`Present: ${salary.present_days} days`}/>
          <SalaryCard label="Per Day Rate" value={formatINR(salary.per_day_rate)} icon={<Calendar className="h-4 w-4"/>} tone="muted" subtext="Used for deductions"/>
        </section>

        {/* Attendance summary */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <StatCard label="Present" value={salary.present_days} tone="success"/>
          <StatCard label="Absent" value={salary.absent_days} tone="destructive"/>
          <StatCard label="Half Days" value={salary.half_days} tone="warning"/>
          <StatCard label="Late Arrivals" value={salary.late_days} tone="warning"/>
          <StatCard label="Late Deduction" value={formatINR(salary.late_deduction_total)} tone="destructive"/>
          <StatCard label="Absence Deduction" value={formatINR(salary.absence_deduction_total)} tone="destructive"/>
        </section>

        {/* Violation report */}
        <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-warning"/> Salary Deduction Report</h3>
            <p className="text-xs text-muted-foreground">Date, rule violated, and deduction amount for each violation in {yearMonth}</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {salary.violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-success/30"/>
                <p className="mt-2 text-sm font-semibold text-success">No violations this month</p>
                <p className="text-xs text-muted-foreground">Full salary with no deductions</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/20 text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Rule Violated</th>
                    <th className="px-3 py-2 text-right font-semibold">Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {salary.violations
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((v, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="px-3 py-2.5 font-mono">{formatDate(v.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            v.type === "late" ? "border-warning/30 bg-warning/10 text-warning" :
                            v.type === "absent" ? "border-destructive/30 bg-destructive/10 text-destructive" :
                            "border-warning/30 bg-warning/10 text-warning")}>
                            {v.type === "late" && <Clock className="h-2.5 w-2.5"/>}
                            {v.type === "absent" && <AlertTriangle className="h-2.5 w-2.5"/>}
                            {titleCase(v.type)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{v.rule}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-destructive">−{formatINR(v.deduction)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-muted/30 font-bold">
                  <tr className="border-t-2 border-border">
                    <td colSpan={3} className="px-3 py-2.5 text-right">Total Deductions</td>
                    <td className="px-3 py-2.5 text-right font-mono text-destructive">−{formatINR(salary.total_deductions)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </section>
      </>) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground/30"/>
          <p className="mt-2 text-sm text-muted-foreground">No salary data available for the selected staff/month.</p>
        </div>
      )}
    </div>);
}

function SalaryCard({ label, value, icon, tone, subtext }: { label: string; value: string; icon: React.ReactNode; tone: "primary" | "success" | "warning" | "destructive" | "muted"; subtext?: string }) {
    const toneClass = {
        primary: "bg-primary/10 text-primary border-primary/20",
        success: "bg-success/10 text-success border-success/20",
        warning: "bg-warning/10 text-warning border-warning/20",
        destructive: "bg-destructive/10 text-destructive border-destructive/20",
        muted: "bg-muted text-muted-foreground border-border",
    }[tone];
    return (<div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">{icon}{label}</div>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
    </div>);
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "destructive" }) {
    const toneClass = {
        success: "text-success",
        warning: "text-warning",
        destructive: "text-destructive",
    }[tone];
    return (<div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className={cn("text-xl font-bold", toneClass)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
    </div>);
}
