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
              {db.visits.filter((v) => v.staff_id === s.id && (v.status === "checked_in" || v.status === "en_route")).slice(0, 2).map((v) => (<button key={v.id} type="button" onClick={() => openDetail("visit", v.id)} className="inline-flex items-center gap-1 rounded-md border border-warning/20 bg-warning/[0.06] px-2 py-0.5 text-[10px] font-medium text-warning hover:bg-warning/10">
                  <MapPin className="h-2.5 w-2.5"/> {v.location_name.slice(0, 16)}
                </button>))}
              {db.tasks.filter((t) => t.assignee_id === s.id && t.status === "todo").slice(0, 2).map((t) => (<button key={t.id} type="button" onClick={() => openDetail("task", t.id)} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent/30">
                  <Clock className="h-2.5 w-2.5"/> {t.title.slice(0, 18)}
                </button>))}
            </div>
          </div>))}
      </div>
    </div>);
}
export function HistoryViewModule({ dataSource }: {
    dataSource?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const events = React.useMemo(() => {
        const evs: {
            id: string;
            timestamp: string;
            actor: string;
            actor_role?: string;
            action: string;
            entity_type: string;
            entity_id?: string;
            entity_label?: string;
            kind: string;
        }[] = [];
        db.auditLog.forEach((e) => {
            if (dataSource === "visits" && e.entity_type !== "visit")
                return;
            if (dataSource === "workOrders" && e.entity_type !== "workOrder" && e.entity_type !== "boq" && e.entity_type !== "po" && e.entity_type !== "grn" && e.entity_type !== "dispatch")
                return;
            evs.push({ ...e });
        });
        if (dataSource === "visits") {
            db.threads.filter((t) => t.kind === "visit").forEach((t) => {
                t.messages.forEach((m) => evs.push({ id: m.id, timestamp: m.created_at, actor: m.author_name, actor_role: m.author_role, action: m.body, entity_type: "visit", entity_id: t.record_id, entity_label: t.title, kind: m.kind }));
            });
        }
        if (dataSource === "workOrders") {
            db.threads.filter((t) => t.kind === "workOrder" || t.kind === "po" || t.kind === "grn" || t.kind === "dispatch" || t.kind === "generic").forEach((t) => {
                t.messages.forEach((m) => evs.push({ id: m.id, timestamp: m.created_at, actor: m.author_name, actor_role: m.author_role, action: m.body, entity_type: t.record_type, entity_id: t.record_id, entity_label: t.title, kind: m.kind }));
            });
        }
        return evs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [db, dataSource]);
    const title = dataSource === "visits" ? "Visit Status History" : dataSource === "workOrders" ? "WorkOrder / Status History" : "History";
    const subtitle = dataSource === "visits" ? "Complete timeline of every visit status change, check-in/out and report" : "Full workOrder lifecycle: quotation → BOQ → PO → GRN → dispatch → P&L with all decisions";
    const kindColor: Record<string, string> = {
        create: "bg-success/10 text-success border-success/20",
        update: "bg-primary/10 text-primary border-primary/20",
        approve: "bg-success/10 text-success border-success/20",
        send: "bg-primary/10 text-primary border-primary/20",
        receive: "bg-primary/10 text-primary border-primary/20",
        comment: "bg-muted text-muted-foreground border-border",
        decision: "bg-warning/10 text-warning border-warning/20",
        alert: "bg-destructive/10 text-destructive border-destructive/20",
        system: "bg-primary/15 text-primary border-primary/25",
        proof: "bg-success/10 text-success border-success/20",
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total events" value={events.length} tone="primary" icon={<History className="h-4 w-4"/>}/>
        <MetricCard label="Decisions" value={events.filter((e) => e.kind === "decision" || e.kind === "approve").length} tone="warning" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="System" value={events.filter((e) => e.kind === "system").length} tone="default" icon={<Activity className="h-4 w-4"/>}/>
        <MetricCard label="Alerts" value={events.filter((e) => e.kind === "alert").length} tone="destructive" icon={<TrendingUp className="h-4 w-4"/>}/>
      </div>

      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <span className="text-[11px] text-muted-foreground">{events.length} events</span>
        </div>
        {events.length === 0 ? (<p className="py-8 text-center text-xs text-muted-foreground">No history events.</p>) : (<ol className="relative divide-y divide-border">
            {events.slice(0, 60).map((e) => (<li key={e.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/20">
                <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold", kindColor[e.kind] || "bg-muted text-muted-foreground border-border")}>
                  {e.kind === "system" ? "S" : e.kind === "decision" || e.kind === "approve" ? "✓" : e.kind === "alert" ? "!" : e.kind === "create" ? "+" : e.kind === "receive" ? "↓" : e.kind === "send" ? "↑" : "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">{e.action}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="font-medium">{e.actor}</span>
                    {e.actor_role && <span>· {e.actor_role}</span>}
                    {e.entity_label && <span>· {e.entity_label}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{relativeDay(e.timestamp)}</span>
              </li>))}
          </ol>)}
      </div>
    </div>);
}
