"use client";
import * as React from "react";
import { Users, CheckCircle2, Clock, MapPin, TrendingUp, ArrowRight, UserCircle2 } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { indiaDate } from "@/lib/rdash/date";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface StaffPerf {
  id: string;
  name: string;
  role: string;
  tasksCompleted: number;
  tasksActive: number;
  visitsToday: number;
  presentToday: boolean;
  checkInTime?: string;
  avatarColor: string;
  initials: string;
}

/**
 * TeamPerformance — a compact widget showing staff productivity at a glance.
 * Surfaces tasks completed, active tasks, visits today, and attendance status
 * for each active staff member.
 */
export function TeamPerformance() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const staff = React.useMemo<StaffPerf[]>(() => {
    const today = indiaDate();
    return db.master.staff
      .filter((s) => s.status === "active")
      .map((s) => {
        const tasksCompleted = db.tasks.filter(
          (t) => t.assignee_id === s.id && t.status === "completed" && t.completed_at?.slice(0, 10) === today,
        ).length;
        const tasksActive = db.tasks.filter(
          (t) => t.assignee_id === s.id && (t.status === "todo" || t.status === "in_progress"),
        ).length;
        const visitsToday = db.visits.filter(
          (v) => v.staff_id === s.id && v.scheduled_at?.slice(0, 10) === today,
        ).length;
        const attendance = db.attendance.find(
          (a) => a.staff_id === s.id && a.date === today,
        );
        const presentToday = !!attendance?.check_in;
        const checkInTime = attendance?.check_in;

        // Generate avatar color from name
        const colors = [
          "bg-blue-500/15 text-blue-700 dark:text-blue-300",
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          "bg-purple-500/15 text-purple-700 dark:text-purple-300",
          "bg-rose-500/15 text-rose-700 dark:text-rose-300",
          "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
        ];
        const colorIdx = s.name.charCodeAt(0) % colors.length;
        const initials = s.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

        return {
          id: s.id,
          name: s.name,
          role: s.role,
          tasksCompleted,
          tasksActive,
          visitsToday,
          presentToday,
          checkInTime,
          avatarColor: colors[colorIdx],
          initials,
        };
      })
      .sort((a, b) => b.tasksCompleted + b.tasksActive - a.tasksCompleted - a.tasksActive);
  }, [db.master.staff, db.tasks, db.visits, db.attendance]);

  const totals = React.useMemo(() => {
    const present = staff.filter((s) => s.presentToday).length;
    const totalTasksCompleted = staff.reduce((s, x) => s + x.tasksCompleted, 0);
    const totalActive = staff.reduce((s, x) => s + x.tasksActive, 0);
    const totalVisits = staff.reduce((s, x) => s + x.visitsToday, 0);
    return { present, total: staff.length, totalTasksCompleted, totalActive, totalVisits };
  }, [staff]);

  if (staff.length === 0) return null;

  return (
    <section aria-label="Team performance" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Team Performance</h3>
            <p className="text-[11px] text-muted-foreground">Staff productivity &amp; attendance today</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule("attendancePayroll")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Details <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <UserCircle2 className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Present</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-foreground">
            {totals.present}<span className="text-muted-foreground">/{totals.total}</span>
          </p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Done</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-success">{totals.totalTasksCompleted}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-warning">{totals.totalActive}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visits</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-foreground">{totals.totalVisits}</p>
        </div>
      </div>

      {/* CRON-7: Tasks completed bar chart */}
      <div className="border-b border-border/60 px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tasks Completed (today)</p>
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={staff.map((s) => ({ name: s.initials, completed: s.tasksCompleted, label: s.name }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }}
                content={({ active, payload }: any) => active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                    <p className="text-[10px] font-bold">{payload[0].payload.label}</p>
                    <p className="text-[10px] text-muted-foreground">{payload[0].value} tasks completed</p>
                  </div>
                ) : null}
              />
              <Bar dataKey="completed" radius={[3, 3, 0, 0]} animationDuration={600}>
                {staff.map((s, i) => (
                  <Cell key={i} fill={s.tasksCompleted > 0 ? "var(--success, #22c55e)" : "var(--muted, #e5e7eb)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Staff list */}
      <div className="max-h-72 overflow-y-auto rd-scroll">
        {staff.map((s) => (
          <div key={s.id} className="group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40">
            {/* Avatar */}
            <div className="relative shrink-0">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold", s.avatarColor)}>
                {s.initials}
              </span>
              {/* Presence dot */}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                  s.presentToday ? "bg-success" : "bg-muted-foreground/30",
                )}
                title={s.presentToday ? `Checked in at ${s.checkInTime?.slice(11, 16) || ""}` : "Not checked in"}
              />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-foreground">{s.name}</p>
                {s.checkInTime && (
                  <span className="shrink-0 rounded bg-success/10 px-1 py-0.5 text-[10px] font-medium text-success">
                    {s.checkInTime.slice(11, 16)}
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-muted-foreground">{s.role}</p>
            </div>

            {/* Stats */}
            <div className="flex shrink-0 items-center gap-2.5">
              {s.tasksCompleted > 0 && (
                <div className="flex flex-col items-center">
                  <span className="rd-tabular text-xs font-bold text-success">{s.tasksCompleted}</span>
                  <CheckCircle2 className="h-2.5 w-2.5 text-success/60" />
                </div>
              )}
              {s.tasksActive > 0 && (
                <div className="flex flex-col items-center">
                  <span className="rd-tabular text-xs font-bold text-warning">{s.tasksActive}</span>
                  <Clock className="h-2.5 w-2.5 text-warning/60" />
                </div>
              )}
              {s.visitsToday > 0 && (
                <div className="flex flex-col items-center">
                  <span className="rd-tabular text-xs font-bold text-primary">{s.visitsToday}</span>
                  <MapPin className="h-2.5 w-2.5 text-primary/60" />
                </div>
              )}
              {s.tasksCompleted === 0 && s.tasksActive === 0 && s.visitsToday === 0 && (
                <span className="text-[10px] italic text-muted-foreground/50">No activity</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
