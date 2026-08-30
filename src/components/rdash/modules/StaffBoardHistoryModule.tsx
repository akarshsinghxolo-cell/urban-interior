"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, formatDateTime, relativeDay, titleCase } from "@/lib/rdash/format";
import { Users, MapPin, CheckCircle2, Clock, TrendingUp, Activity, History, } from "lucide-react";
export function StaffBoardModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const staff = React.useMemo(() => {
        const staffRows = db.master.staff.map((s) => {
            const tasks = db.tasks.filter((t) => t.assignee_id === s.id);
            const visits = db.visits.filter((v) => v.staff_id === s.id);
            const completedTasks = tasks.filter((t) => t.status === "completed").length;
            const completedVisits = visits.filter((v) => v.status === "completed").length;
            const activeVisits = visits.filter((v) => v.status === "checked_in" || v.status === "en_route").length;
            const attendance = db.attendance.filter((a) => a.staff_id === s.id);
            const presentDays = attendance.filter((a) => a.status === "present").length;
            const todayRecord = attendance.find((a) => a.date === new Date().toISOString().slice(0, 10));
            return {
                ...s,
                taskCount: tasks.length,
                completedTasks,
                taskRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
                visitCount: visits.length,
                completedVisits,
                activeVisits,
                presentDays,
                todayStatus: todayRecord?.status || "absent",
                todayCheckIn: todayRecord?.check_in,
                kind: "staff" as const,
            };
        });
        const contractorRows = db.master.contractors.map((c) => {
            const visits = db.visits.filter((v) => v.staff_id === c.id);
            const completedVisits = visits.filter((v) => v.status === "completed").length;
            const activeVisits = visits.filter((v) => v.status === "checked_in" || v.status === "en_route").length;
            return {
                id: c.id,
                name: c.name,
                role: c.trade || "Contractor",
                city: c.city,
                taskCount: 0,
                completedTasks: 0,
                taskRate: 0,
                visitCount: visits.length,
                completedVisits,
                activeVisits,
                presentDays: 0,
                todayStatus: "contractor",
                todayCheckIn: undefined,
                kind: "contractor" as const,
            };
        });
        return [...staffRows, ...contractorRows];
    }, [db]);
    const totalActive = staff.reduce((n, s) => n + s.activeVisits, 0);
    const totalTasksDone = staff.reduce((n, s) => n + s.completedTasks, 0);
    const totalVisitsDone = staff.reduce((n, s) => n + s.completedVisits, 0);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Assignee Board</h2>
          <p className="text-xs text-muted-foreground">Per-staff task load plus staff and contractor visit load</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Assignees" value={staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Active visits" value={totalActive} tone="warning" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Tasks done" value={totalTasksDone} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Visits done" value={totalVisitsDone} tone="default" icon={<Activity className="h-4 w-4"/>}/>
      </div>

      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {staff.map((s) => (<div key={s.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={s.name} size={44}/>
                <div>
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.role} · {s.city}</p>
                </div>
              </div>
              <StatusBadge label={s.kind === "contractor" ? "Contractor" : titleCase(s.todayStatus)} className={s.kind === "contractor" ? "bg-muted text-muted-foreground border-border" : s.todayStatus === "present" ? "bg-success/10 text-success border-success/20" : s.todayStatus === "half_day" ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}/>
            </div>
            {s.todayCheckIn && <p className="mt-1 text-[10px] text-muted-foreground">Checked in {formatDateTime(s.todayCheckIn)}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Tasks</p>
                <p className="text-base font-bold">{s.completedTasks}<span className="text-xs text-muted-foreground">/{s.taskCount}</span></p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${s.taskRate}%` }}/></div>
              </div>
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Visits</p>
                <p className="text-base font-bold">{s.completedVisits}<span className="text-xs text-muted-foreground">/{s.visitCount}</span></p>
                <p className="mt-1 text-[10px] text-muted-foreground">{s.activeVisits} active</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{s.kind === "contractor" ? "Type" : "Present"}</p>
                <p className="text-base font-bold">{s.kind === "contractor" ? "Ext" : s.presentDays}<span className="text-xs text-muted-foreground">{s.kind === "contractor" ? "" : "d"}</span></p>
                <p className="mt-1 text-[10px] text-muted-foreground">{s.kind === "contractor" ? "contractor" : "this period"}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {db.visits.filter((v) => v.staff_id === s.id && (v.status === "checked_in" || v.status === "en_route")).slice(0, 2).map((v) => (<button key={v.id} type="button" title={v.location_name} onClick={() => openDetail("visit", v.id)} className="inline-flex min-w-0 max-w-[45vw] items-center gap-1 rounded-md border border-warning/20 bg-warning/[0.06] px-2 py-0.5 text-[10px] font-medium text-warning hover:bg-warning/10">
                  <MapPin className="h-2.5 w-2.5 shrink-0"/><span className="truncate">{v.location_name}</span>
                </button>))}
              {db.tasks.filter((t) => t.assignee_id === s.id && t.status === "todo").slice(0, 2).map((t) => (<button key={t.id} type="button" title={t.title} onClick={() => openDetail("task", t.id)} className="inline-flex min-w-0 max-w-[45vw] items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent/30">
                  <Clock className="h-2.5 w-2.5 shrink-0"/><span className="truncate">{t.title}</span>
                </button>))}
            </div>
          </div>))}
      </div>
    </div>);
}
