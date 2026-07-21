"use client";
import * as React from "react";
import { Ban, BellOff, CheckCircle2, Flame, ListTodo, MapPin, PhoneCall, Plus, ShieldAlert, TrendingUp, FileText, Target, Briefcase, CalendarClock, AlertCircle, Clock, Package, ArrowRight, RefreshCw, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";
import { addDays } from "@/lib/rdash/store/helpers";
import { followupStatusStyle, taskStatusStyle, visitStatusStyle, formatINRShort } from "@/lib/rdash/format";
import { QueueSection, type QueueRecord } from "../QueueSection";
import { buildApprovalActions, buildBlockedActions, buildFollowupActions, buildRiskActions, buildTaskActions, buildVisitActions, } from "../recordActions";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { toast } from "sonner";
import { WorkspacePulseStrip } from "../WorkspacePulseStrip";
import { WorkspaceHealthWidget } from "../WorkspaceHealthWidget";
import { ActivityFeedWidget } from "../ActivityFeedWidget";
import { ConversationActivityWidget } from "../ConversationActivityWidget";
import { ExceptionDashboard } from "../ExceptionDashboard";
import { ProfitabilitySnapshot } from "../ProfitabilitySnapshot";
import { CashFlowForecast } from "../CashFlowForecast";
import { RecentActivityTimeline } from "../RecentActivityTimeline";
import { TeamPerformance } from "../TeamPerformance";
import { CustomerSatisfaction } from "../CustomerSatisfaction";
import { MaterialPriceTracker } from "../MaterialPriceTracker";
// Imported from WorkdeskDashboard (before deletion) — unique widgets not previously in DailyWork
import { FinancialPositionCard } from "../FinancialPositionCard";
import { TodaysScheduleCard } from "../TodaysScheduleCard";
import { MetricCard, WorkflowStepRich } from "../primitives";

function EmptyCta({ label, onClick }: { label: string; onClick: () => void }) {
    return (<button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      <Plus className="h-3.5 w-3.5"/>
      {label}
    </button>);
}

function DailyKpiBanner() {
    const db = useRDashStore((s) => s.db);
    const today = indiaDate();
    const weekAgo = React.useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    const weeklyRevenue = db.customerReceipts
        .filter((r) => new Date(r.received_at) >= weekAgo)
        .reduce((t, r) => t + r.amount, 0);
    const pipelineValue = db.quotations
        .filter((q) => ["sent", "draft"].includes(q.status))
        .reduce((t, q) => t + q.total_amount, 0);
    const totalQuoted = db.quotations.filter((q) => q.status !== "draft").length;
    const accepted = db.quotations.filter((q) => q.status === "accepted").length;
    const conversionRate = totalQuoted > 0 ? Math.round((accepted / totalQuoted) * 100) : 0;
    const activeJobValue = db.workOrders
        .filter((wo) => wo.status === "in_progress" || wo.status === "scheduled")
        .reduce((t, wo) => t + wo.value, 0);
    const tasksDueToday = db.tasks.filter((t) => t.due_date === today && (t.status === "todo" || t.status === "in_progress")).length;
    const overdueTasks = db.tasks.filter((t) => isDateOnlyOverdue(t.due_date) && (t.status === "todo" || t.status === "in_progress")).length;
    const visitsToday = db.visits.filter((v) => v.scheduled_at?.slice(0, 10) === today).length;
    const kpis = [
        { label: "Revenue (7d)", value: formatINRShort(weeklyRevenue), tone: "success", icon: <TrendingUp className="h-3.5 w-3.5"/> },
        { label: "Pipeline", value: formatINRShort(pipelineValue), tone: "primary", icon: <FileText className="h-3.5 w-3.5"/> },
        { label: "Conversion", value: `${conversionRate}%`, tone: "warning", icon: <Target className="h-3.5 w-3.5"/> },
        { label: "Active jobs", value: formatINRShort(activeJobValue), tone: "default", icon: <Briefcase className="h-3.5 w-3.5"/> },
    ];
    const focus = [
        { label: "Due today", value: tasksDueToday, icon: <CalendarClock className="h-3.5 w-3.5"/>, tone: tasksDueToday > 0 ? "warning" : "muted" },
        { label: "Overdue", value: overdueTasks, icon: <AlertCircle className="h-3.5 w-3.5"/>, tone: overdueTasks > 0 ? "danger" : "muted" },
        { label: "Visits today", value: visitsToday, icon: <MapPin className="h-3.5 w-3.5"/>, tone: visitsToday > 0 ? "primary" : "muted" },
    ];
    return (<section aria-label="Today at a glance" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-gradient-to-br from-card via-card to-muted/40 shadow-card">
      <div className="grid gap-0 sm:grid-cols-[1.6fr_1fr]">
        <div className="border-b border-border p-3.5 sm:border-b-0 sm:border-r">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Business health</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {kpis.map((kpi) => (<div key={kpi.label} className="group flex items-center gap-2.5 rounded-lg bg-background/60 px-2.5 py-2 transition-all hover:bg-background hover:shadow-sm">
              <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 " + (kpi.tone === "success" ? "bg-success/10 text-success" : kpi.tone === "primary" ? "bg-primary/10 text-primary" : kpi.tone === "warning" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
                {kpi.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="rd-tabular truncate text-sm font-bold text-foreground">{kpi.value}</p>
              </div>
            </div>))}
          </div>
        </div>
        <div className="bg-muted/20 p-3.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today's focus</p>
          <div className="flex flex-col gap-2">
            {focus.map((f) => (<div key={f.label} className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2.5 py-1.5">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={"flex h-6 w-6 items-center justify-center rounded-md " + (f.tone === "warning" ? "bg-warning/10 text-warning" : f.tone === "danger" ? "bg-destructive/10 text-destructive" : f.tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {f.icon}
                </span>
                {f.label}
              </span>
              <span className={"rd-tabular text-sm font-bold " + (f.tone === "danger" ? "text-destructive" : f.tone === "warning" ? "text-warning" : f.tone === "primary" ? "text-primary" : "text-foreground")}>{f.value}</span>
            </div>))}
          </div>
        </div>
      </div>
    </section>);
}
function readableLabel(value: string): string {
    return value
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
function priorityTone(p: string | undefined): "danger" | "warning" | "primary" | "muted" {
    if (p === "urgent")
        return "danger";
    if (p === "high")
        return "warning";
    if (p === "medium")
        return "primary";
    return "muted";
}
function priorityChipClass(p: string | undefined): string {
    const tone = priorityTone(p);
    if (tone === "danger")
        return "bg-destructive/10 text-destructive border-destructive/20";
    if (tone === "warning")
        return "bg-warning/10 text-warning border-warning/20";
    if (tone === "primary")
        return "bg-primary/10 text-primary border-primary/20";
    return "bg-muted text-muted-foreground border-border";
}
type PriorityItem = {
    id: string;
    kind: "task" | "visit" | "followup";
    title: string;
    customerName?: string;
    subtitle?: string;
    priority?: string;
    due?: string;
    assignee?: string;
    onClick: () => void;
};
type SnoozeDuration = "1h" | "4h" | "tomorrow" | "tomorrow_9am" | "next_monday";
function TodaysPrioritiesBanner({ items, onSnooze }: { items: PriorityItem[]; onSnooze?: (item: PriorityItem, duration: SnoozeDuration) => void }) {
    const [snoozeFor, setSnoozeFor] = React.useState<string | null>(null);
    if (items.length === 0)
        return null;
    const top = items.slice(0, 5);
    const kindIcon = {
        task: <ListTodo className="h-3.5 w-3.5"/>,
        visit: <MapPin className="h-3.5 w-3.5"/>,
        followup: <PhoneCall className="h-3.5 w-3.5"/>,
    };
    const kindLabel = { task: "Task", visit: "Visit", followup: "Follow-up" };
    const kindTone = {
        task: "bg-primary/10 text-primary",
        visit: "bg-success/10 text-success",
        followup: "bg-warning/10 text-warning",
    };
    const snoozeOptions: { dur: SnoozeDuration; label: string }[] = [
        { dur: "1h", label: "1 hour" },
        { dur: "4h", label: "4 hours" },
        { dur: "tomorrow", label: "Tomorrow" },
        { dur: "tomorrow_9am", label: "Tomorrow 9 AM" },
        { dur: "next_monday", label: "Next Monday" },
    ];
    return (<section aria-label="Today's priorities" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-transparent px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Target className="h-4 w-4"/></span>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Today's priorities</h3>
            <p className="text-[10px] text-muted-foreground">Top {top.length} merged across tasks, visits & follow-ups</p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{items.length} due</span>
      </div>
      <div className="divide-y divide-border">
        {top.map((item) => (<div key={item.id} className="group relative flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/30">
            <button type="button" onClick={item.onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md">
              <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " + kindTone[item.kind]}>{kindIcon[item.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{item.customerName ? item.customerName + " · " : ""}{item.subtitle || kindLabel[item.kind]}{item.assignee ? " · @" + item.assignee : ""}</p>
              </div>
              {item.priority ? (<span className={"shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase " + priorityChipClass(item.priority)}>{item.priority}</span>) : null}
              {item.due ? (<span className={"shrink-0 text-[10px] font-semibold " + (isDateOnlyOverdue(item.due) ? "text-destructive" : "text-muted-foreground")}>{isDateOnlyOverdue(item.due) ? "Overdue" : "Today"}</span>) : null}
            </button>
            {onSnooze ? (<button type="button" aria-label="Snooze" title="Snooze" onClick={(e) => { e.stopPropagation(); setSnoozeFor(snoozeFor === item.id ? null : item.id); }} className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-warning/10 hover:text-warning focus-visible:opacity-100 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <BellOff className="h-3.5 w-3.5"/>
              </button>) : null}
            {onSnooze && snoozeFor === item.id ? (<div className="absolute right-2 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-soft" role="menu">
                {snoozeOptions.map((opt) => (<button key={opt.dur} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setSnoozeFor(null); onSnooze(item, opt.dur); }} className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-warning/10 hover:text-warning focus-visible:outline-none focus-visible:bg-warning/10">
                    {opt.label}
                  </button>))}
              </div>) : null}
          </div>))}
      </div>
    </section>);
}
function WeeklyThroughputChart({ data, dailyTarget = 5 }: { data: { day: string; label: string; count: number; isToday: boolean }[]; dailyTarget?: number }) {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const max = Math.max(1, ...data.map((d) => d.count));
    const weeklyTarget = dailyTarget * 7;
    const goalPct = weeklyTarget > 0 ? Math.min(100, Math.round((total / weeklyTarget) * 100)) : 0;
    const goalTone = goalPct >= 100 ? "text-success" : goalPct >= 50 ? "text-warning" : "text-muted-foreground";
    const streak = React.useMemo(() => {
        let count = 0;
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].count > 0)
                count++;
            else
                break;
        }
        return count;
    }, [data]);
    const bestStreak = React.useMemo(() => {
        let best = 0;
        let run = 0;
        for (const d of data) {
            if (d.count > 0) {
                run++;
                if (run > best)
                    best = run;
            }
            else {
                run = 0;
            }
        }
        return best;
    }, [data]);
    const allTimeBestStreak = React.useMemo(() => {
        if (typeof window === "undefined")
            return Math.max(streak, bestStreak);
        try {
            const stored = parseInt(window.localStorage.getItem("rdash_all_time_best_streak") || "0", 10) || 0;
            const candidate = Math.max(streak, bestStreak, stored);
            if (candidate > stored) {
                window.localStorage.setItem("rdash_all_time_best_streak", String(candidate));
            }
            return candidate;
        }
        catch {
            return Math.max(streak, bestStreak);
        }
    }, [streak, bestStreak]);
    return (<section aria-label="Weekly throughput" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-success/5 via-transparent to-transparent px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success"><TrendingUp className="h-4 w-4"/></span>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Weekly throughput</h3>
            <p className="text-[10px] text-muted-foreground">Completed tasks, visits & follow-ups · last 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {streak > 0 ? (<span className="flex items-center gap-0.5 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400" title={`Current: ${streak}-day streak · Best (7d): ${bestStreak} days · All-time: ${allTimeBestStreak} days`}>
              <Flame className="h-3 w-3"/>{streak}d streak
              {bestStreak > streak ? <span className="ml-0.5 text-[8px] font-medium opacity-70">· best {bestStreak}d</span> : null}
            </span>) : allTimeBestStreak > 0 ? (<span className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground" title={`Best streak this week: ${bestStreak} days · All-time: ${allTimeBestStreak} days`}>
              <Flame className="h-3 w-3"/>best {allTimeBestStreak}d
            </span>) : null}
          <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + (goalPct >= 100 ? "bg-success/10 text-success" : goalPct >= 50 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>{goalPct}% of goal</span>
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">{total} done</span>
        </div>
      </div>
      <div className="p-3.5">
        {total === 0 ? (<div className="flex h-32 flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground/50"/>
            <p className="text-xs">No completions in the last 7 days yet.</p>
            <p className="text-[10px] text-muted-foreground/70">Mark a task, visit or follow-up complete to see the trend.</p>
          </div>) : (<>
            <div className="relative h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={0}/>
                  <YAxis hide domain={[0, Math.max(max, dailyTarget) + 1]}/>
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 11, padding: "6px 10px" }} labelStyle={{ fontWeight: 600, fontSize: 11 }} formatter={(value: number) => [`${value} completed`, "Throughput"]}/>
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {data.map((entry, index) => (<Cell key={index} fill={entry.isToday ? "var(--primary)" : entry.count > 0 ? "var(--success)" : "var(--muted-foreground)"} fillOpacity={entry.count > 0 ? 1 : 0.25}/>))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {(() => {
                const yMax = Math.max(max, dailyTarget) + 1;
                const targetPctFromBottom = (dailyTarget / yMax) * 100;
                return (<div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  <div className="absolute inset-x-0 flex items-center" style={{ bottom: `${targetPctFromBottom}%` }}>
                    <div className="h-px w-full border-t-2 border-dashed border-warning/60"/>
                  </div>
                  <span className="absolute right-0 rounded bg-warning/10 px-1 py-0.5 text-[8px] font-bold text-warning" style={{ bottom: `calc(${targetPctFromBottom}% + 2px)` }}>target {dailyTarget}</span>
                </div>);
              })()}
            </div>
          </>)}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span>Daily avg: <span className="font-semibold text-foreground">{(total / 7).toFixed(1)}</span></span>
          <span>Peak: <span className="font-semibold text-foreground">{max}</span></span>
          <span>Best (7d): <span className="font-semibold text-foreground">{bestStreak}d</span></span>
          <span className={goalTone}>Goal: <span className="font-semibold">{total}/{weeklyTarget}</span></span>
        </div>
      </div>
    </section>);
}
export function DailyWork() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const resolveApproval = useRDashStore((s) => s.resolveApproval);
    const resolveRisk = useRDashStore((s) => s.resolveRisk);
    const resolveBlocked = useRDashStore((s) => s.resolveBlocked);
    const updateTask = useRDashStore((s) => s.updateTask);
    const updateFollowup = useRDashStore((s) => s.updateFollowup);
    const rescheduleVisit = useRDashStore((s) => s.rescheduleVisit);
    const taskDispatch = React.useMemo(() => ({ updateTask: () => undefined }), []);
    const followupDispatch = React.useMemo(() => ({ updateFollowup: () => undefined }), []);
    const approvalDispatch = React.useMemo(() => ({ resolveApproval }), [resolveApproval]);
    const riskDispatch = React.useMemo(() => ({ resolveRisk }), [resolveRisk]);
    const blockedDispatch = React.useMemo(() => ({ resolveBlocked }), [resolveBlocked]);
    const openTasks = db.tasks.filter((task) => task.status === "todo" ||
        task.status === "in_progress" ||
        task.status === "review");
    const approvals = db.actions.filter((action) => action.status === "pending");
    const blocked = db.blocked.filter((item) => !item.resolved);
    const risks = db.risks;
    const visits = db.visits.filter((visit) => visit.status === "scheduled" ||
        visit.status === "en_route" ||
        visit.status === "checked_in");
    const followups = db.followups.filter((followup) => followup.status === "pending" ||
        followup.status === "scheduled" ||
        followup.status === "missed");
    const openApprovalContext = (approval: (typeof approvals)[number]) => {
        if (!approval.linked_record_id)
            return;
        if (approval.linked_record_type === "quotation") {
            openDetail("quotation", approval.linked_record_id);
        }
        if (approval.linked_record_type === "po") {
            openDetail("po", approval.linked_record_id);
        }
        if (approval.linked_record_type === "payment") {
            openDetail("payment", approval.linked_record_id);
        }
        if (approval.linked_record_type === "contractor_payment") {
            openDetail("workOrder", approval.linked_record_id);
        }
    };
    const openRiskContext = (risk: (typeof risks)[number]) => {
        if (risk.customer_id)
            openDetail("customer", risk.customer_id);
    };
    const queueRecords: QueueRecord[] = openTasks.map((task) => {
        const customer = db.customers.find((row) => row.id === task.customer_id);
        return {
            id: task.id,
            title: task.title,
            subtitle: task.site_id ? db.sites.find((site) => site.id === task.site_id)?.name : undefined,
            customerName: customer?.name,
            status: taskStatusStyle(task.status),
            priority: task.priority,
            due: task.due_date,
            assignee: task.assignee_name,
            tone: task.due_date < indiaDate() ? "danger" : "default",
            onClick: () => openDetail("task", task.id),
            actions: buildTaskActions(task.id, taskDispatch, { onOpen: () => openDetail("task", task.id), readOnly: true }),
        };
    });
    const approvalRecords: QueueRecord[] = approvals.map((approval) => ({
        id: approval.id,
        title: approval.title,
        customerName: (approval.customer_name || "Customer"),
        amount: approval.amount,
        due: approval.due_date,
        meta: approval.requested_by
            ? `Requested by ${approval.requested_by}`
            : undefined,
        onClick: () => openApprovalContext(approval),
        actions: buildApprovalActions(approval.id, approvalDispatch, {
            onOpen: () => openApprovalContext(approval),
        }),
    }));
    const blockedRecords: QueueRecord[] = blocked.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.reason,
        customerName: (item.customer_name || "Customer"),
        tone: "warning",
        onClick: () => openDetail("blocked", item.id),
        actions: buildBlockedActions(item.id, blockedDispatch, {
            onOpen: () => openDetail("blocked", item.id),
        }),
    }));
    const riskRecords: QueueRecord[] = risks.map((risk) => ({
        id: risk.id,
        title: risk.title,
        subtitle: risk.reason,
        customerName: (risk.customer_name || "Customer"),
        amount: risk.amount,
        priority: risk.severity,
        tone: "danger",
        onClick: () => openRiskContext(risk),
        actions: buildRiskActions(risk.id, riskDispatch, {
            onOpen: () => openRiskContext(risk),
        }),
    }));
    const visitRecords: QueueRecord[] = visits.map((visit) => {
        const customer = db.customers.find((row) => row.id === visit.customer_id);
        return {
            id: visit.id,
            title: `${readableLabel(visit.visit_type)} - ${customer?.name ?? visit.location_name}`,
            subtitle: visit.location_name,
            customerName: customer?.name,
            status: visitStatusStyle(visit.status),
            due: visit.scheduled_at,
            assignee: visit.staff_name,
            onClick: () => openDetail("visit", visit.id),
            actions: buildVisitActions(visit.id, null, {
                onOpen: () => openDetail("visit", visit.id),
            }),
        };
    });
    const followupRecords: QueueRecord[] = followups.map((followup) => {
        const customer = db.customers.find((row) => row.id === followup.customer_id);
        return {
            id: followup.id,
            title: followup.title,
            subtitle: followup.notes,
            customerName: customer?.name,
            status: followupStatusStyle(followup.status),
            priority: followup.priority,
            due: followup.due_date,
            assignee: followup.assigned_to,
            tone: followup.status === "missed" ? "danger" : "default",
            onClick: () => openDetail("followup", followup.id),
            actions: buildFollowupActions(followup.id, followupDispatch, { onOpen: () => openDetail("followup", followup.id), readOnly: true }),
        };
    });
    const completedToday: QueueRecord[] = React.useMemo(() => {
        const out: QueueRecord[] = [];
        const todayPrefix = indiaDate();
        db.tasks.filter((t) => t.status === "completed" && t.completed_at && t.completed_at.slice(0, 10) === todayPrefix).forEach((task) => {
            const customer = db.customers.find((row) => row.id === task.customer_id);
            out.push({
                id: `task-${task.id}`,
                title: task.title,
                subtitle: task.site_id ? db.sites.find((site) => site.id === task.site_id)?.name : undefined,
                customerName: customer?.name,
                status: { label: "Task done", className: "bg-success/10 text-success border-success/20" },
                assignee: task.assignee_name,
                onClick: () => openDetail("task", task.id),
                actions: buildTaskActions(task.id, taskDispatch, { onOpen: () => openDetail("task", task.id), readOnly: true }),
            });
        });
        db.visits.filter((v) => v.status === "completed" && v.scheduled_at && v.scheduled_at.slice(0, 10) === todayPrefix).forEach((visit) => {
            const customer = db.customers.find((row) => row.id === visit.customer_id);
            out.push({
                id: `visit-${visit.id}`,
                title: `${readableLabel(visit.visit_type)} - ${customer?.name ?? visit.location_name}`,
                subtitle: visit.location_name,
                customerName: customer?.name,
                status: { label: "Visit done", className: "bg-success/10 text-success border-success/20" },
                assignee: visit.staff_name,
                onClick: () => openDetail("visit", visit.id),
                actions: buildVisitActions(visit.id, null, { onOpen: () => openDetail("visit", visit.id) }),
            });
        });
        db.followups.filter((f) => f.status === "completed" && f.completed_at && f.completed_at.slice(0, 10) === todayPrefix).forEach((followup) => {
            const customer = db.customers.find((row) => row.id === followup.customer_id);
            out.push({
                id: `followup-${followup.id}`,
                title: followup.title,
                subtitle: followup.notes,
                customerName: customer?.name,
                status: { label: "Follow-up done", className: "bg-success/10 text-success border-success/20" },
                assignee: followup.assigned_to,
                onClick: () => openDetail("followup", followup.id),
                actions: buildFollowupActions(followup.id, followupDispatch, { onOpen: () => openDetail("followup", followup.id), readOnly: true }),
            });
        });
        return out;
    }, [db.tasks, db.visits, db.followups, db.customers, db.sites, openDetail]);
    const todaysPriorities: PriorityItem[] = React.useMemo(() => {
        const todayPrefix = indiaDate();
        const items: PriorityItem[] = [];
        openTasks.forEach((task) => {
            const isToday = task.due_date === todayPrefix;
            const isOverdue = isDateOnlyOverdue(task.due_date);
            if (!isToday && !isOverdue)
                return;
            const customer = db.customers.find((row) => row.id === task.customer_id);
            items.push({
                id: `p-task-${task.id}`,
                kind: "task",
                title: task.title,
                customerName: customer?.name,
                subtitle: task.site_id ? db.sites.find((site) => site.id === task.site_id)?.name : undefined,
                priority: task.priority,
                due: task.due_date,
                assignee: task.assignee_name,
                onClick: () => openDetail("task", task.id),
            });
        });
        visits.forEach((visit) => {
            const isToday = visit.scheduled_at?.slice(0, 10) === todayPrefix;
            const isOverdue = isDateOnlyOverdue(visit.scheduled_at?.slice(0, 10));
            if (!isToday && !isOverdue)
                return;
            const customer = db.customers.find((row) => row.id === visit.customer_id);
            items.push({
                id: `p-visit-${visit.id}`,
                kind: "visit",
                title: `${readableLabel(visit.visit_type)} - ${customer?.name ?? visit.location_name}`,
                customerName: customer?.name,
                subtitle: visit.location_name,
                priority: visit.status === "checked_in" ? "urgent" : "high",
                due: visit.scheduled_at?.slice(0, 10),
                assignee: visit.staff_name,
                onClick: () => openDetail("visit", visit.id),
            });
        });
        followups.forEach((followup) => {
            const isToday = followup.due_date === todayPrefix;
            const isOverdue = isDateOnlyOverdue(followup.due_date);
            if (!isToday && !isOverdue)
                return;
            const customer = db.customers.find((row) => row.id === followup.customer_id);
            items.push({
                id: `p-followup-${followup.id}`,
                kind: "followup",
                title: followup.title,
                customerName: customer?.name,
                subtitle: followup.notes,
                priority: followup.status === "missed" ? "urgent" : followup.priority,
                due: followup.due_date,
                assignee: followup.assigned_to,
                onClick: () => openDetail("followup", followup.id),
            });
        });
        return items.sort((a, b) => {
            const pa = PRIORITY_RANK[a.priority || "low"] ?? 9;
            const pb = PRIORITY_RANK[b.priority || "low"] ?? 9;
            if (pa !== pb)
                return pa - pb;
            const aOver = a.due ? isDateOnlyOverdue(a.due) ? 0 : 1 : 2;
            const bOver = b.due ? isDateOnlyOverdue(b.due) ? 0 : 1 : 2;
            return aOver - bOver;
        });
    }, [openTasks, visits, followups, db.customers, db.sites, openDetail]);
    const handleSnooze = React.useCallback((item: PriorityItem, duration: SnoozeDuration) => {
        const today = indiaDate();
        const tomorrow = addDays(today, 1);
        const now = new Date();
        const hoursToAdd = duration === "1h" ? 1 : duration === "4h" ? 4 : 0;
        const laterToday = new Date(now.getTime() + hoursToAdd * 3600000);
        const crossesToTomorrow = duration !== "tomorrow" && duration !== "tomorrow_9am" && duration !== "next_monday" && laterToday.getDate() !== now.getDate();
        let targetDate = duration === "tomorrow" || duration === "tomorrow_9am" || crossesToTomorrow ? tomorrow : today;
        let label = duration === "tomorrow" ? `to ${tomorrow}` : duration === "tomorrow_9am" ? `to ${tomorrow} 9 AM` : duration === "1h" ? "in 1 hour" : "in 4 hours";
        if (duration === "next_monday") {
            const todayDate = new Date(`${today}T12:00:00+05:30`);
            const dow = todayDate.getUTCDay();
            const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7;
            targetDate = addDays(today, daysUntilMonday === 0 ? 7 : daysUntilMonday);
            label = `to ${targetDate} (Monday)`;
        }
        if (item.kind === "task") {
            const taskId = item.id.replace(/^p-task-/, "");
            updateTask(taskId, { due_date: targetDate });
            toast.success(`Snoozed "${item.title}" ${label}`);
        }
        else if (item.kind === "followup") {
            const followupId = item.id.replace(/^p-followup-/, "");
            updateFollowup(followupId, { due_date: targetDate, status: "scheduled" });
            toast.success(`Snoozed "${item.title}" ${label}`);
        }
        else if (item.kind === "visit") {
            const visitId = item.id.replace(/^p-visit-/, "");
            const visit = db.visits.find((v) => v.id === visitId);
            if (duration === "tomorrow") {
                const baseTime = visit?.scheduled_at?.slice(11) || "11:00:00";
                rescheduleVisit(visitId, `${tomorrow}T${baseTime}`);
                toast.success(`Snoozed "${item.title}" ${label}`);
            }
            else if (duration === "tomorrow_9am") {
                rescheduleVisit(visitId, `${tomorrow}T09:00:00`);
                toast.success(`Snoozed "${item.title}" ${label}`);
            }
            else if (duration === "next_monday") {
                rescheduleVisit(visitId, `${targetDate}T09:00:00`);
                toast.success(`Snoozed "${item.title}" ${label}`);
            }
            else {
                const baseIso = visit?.scheduled_at || `${today}T11:00:00`;
                const baseDate = new Date(baseIso);
                const newDate = new Date(baseDate.getTime() + hoursToAdd * 3600000);
                const pad = (n: number) => String(n).padStart(2, "0");
                const newIso = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}:${pad(newDate.getSeconds())}`;
                rescheduleVisit(visitId, newIso);
                toast.success(`Snoozed "${item.title}" ${label}`);
            }
        }
    }, [updateTask, updateFollowup, rescheduleVisit, db.visits]);
    const weeklyThroughput = React.useMemo(() => {
        const today = indiaDate();
        const days: { day: string; label: string; count: number; isToday: boolean }[] = [];
        const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 6; i >= 0; i--) {
            const dayStr = addDays(today, -i);
            const d = new Date(`${dayStr}T12:00:00+05:30`);
            const count = db.tasks.filter((t) => t.status === "completed" && t.completed_at?.slice(0, 10) === dayStr).length +
                db.visits.filter((v) => v.status === "completed" && v.scheduled_at?.slice(0, 10) === dayStr).length +
                db.followups.filter((f) => f.status === "completed" && f.completed_at?.slice(0, 10) === dayStr).length;
            days.push({ day: dayStr, label: dayLabels[d.getUTCDay()], count, isToday: i === 0 });
        }
        return days;
    }, [db.tasks, db.visits, db.followups]);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");

    // ── Operational KPIs (imported from WorkdeskDashboard) ──
    // Reuses openTasks/approvals/blocked/risks/visits already computed above.
    const attentionCount = approvals.length + blocked.length + risks.length;

    const roleSubtitle = role === "Owner"
        ? `Role-based command center · ${db.customers.length} customers · ${db.workOrders.length} live work orders`
        : role === "Operations Manager"
            ? `Operations view · ${db.workOrders.length} live work orders · ${visits.length} field visits`
            : role === "Field Staff"
                ? `Field view · ${visits.length} visits · ${openTasks.length} assigned actions`
                : role === "Procurement Staff"
                    ? `Shop view · ${db.inventory.length} stock items · ${openTasks.length} actions`
                    : role === "Finance"
                        ? `Finance view · ${db.payments.length} payments · ${approvals.length} approvals`
                        : `Role-based command center · ${db.customers.length} customers · ${db.workOrders.length} live work orders`;

    return (<div className="flex flex-col gap-6">
      <WorkspacePulseStrip />

      {/* Role header + Refresh (imported from WorkdeskDashboard) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">Daily Work</h2>
          <p className="text-xs text-muted-foreground">{roleSubtitle}</p>
        </div>
        <button type="button" onClick={() => toast.success("Workspace refreshed")} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5"/>
          Refresh
        </button>
      </div>

      {/* Workflow steps (imported from WorkdeskDashboard) */}
      <section aria-label="Module workflow steps" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <WorkflowStepRich index="01" title="See work" description="Assigned actions and due dates" meta={`${openTasks.length} open`} state="active"/>
        <WorkflowStepRich index="02" title="Resolve risk" description="Blocker, risk, approval or collection" meta={`${attentionCount} attention`} state={attentionCount > 0 ? "pending" : "done"}/>
        <WorkflowStepRich index="03" title="Open work context" description="Go to the exact scope without re-searching" meta="context retained" state="default"/>
      </section>

      {/* Operational KPI grid (imported from WorkdeskDashboard) — 7 deep-link cards */}
      <section aria-label="Workspace KPIs" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Active WOs" value={db.workOrders.filter((w) => w.status === "in_progress" || w.status === "scheduled").length} hint="In progress + scheduled" tone="primary" icon={<Briefcase className="h-4 w-4"/>} onClick={() => setActiveModule("siteExecution")}/>
        <MetricCard label="Pending approvals" value={approvals.length} hint="PO + payment + variation" tone="success" icon={<CheckCircle2 className="h-4 w-4"/>} onClick={() => setActiveModule("approvals")}/>
        <MetricCard label="Overdue invoices" value={formatINRShort(db.invoices.filter((i) => i.status === "overdue" || (i.status === "issued" && i.due_date && isDateOnlyOverdue(i.due_date))).reduce((s, i) => s + i.amount, 0))} hint="Total value" tone="destructive" icon={<FileText className="h-4 w-4"/>} onClick={() => setActiveModule("payments")}/>
        <MetricCard label="Today's visits" value={db.visits.filter((v) => v.scheduled_at?.slice(0, 10) === indiaDate()).length} hint="Scheduled today" tone="primary" icon={<MapPin className="h-4 w-4"/>} onClick={() => setActiveModule("fieldOperations")}/>
        <MetricCard label="Follow-ups due" value={db.followups.filter((f) => f.due_date === indiaDate() && (f.status === "pending" || f.status === "scheduled")).length} hint="Due today" tone="warning" icon={<PhoneCall className="h-4 w-4"/>} onClick={() => setActiveModule("tasks")}/>
        <MetricCard label="Low-stock items" value={db.inventory.filter((i) => typeof i.min_qty === "number" && i.quantity <= (i.min_qty || 0)).length} hint="At/below min" tone="destructive" icon={<Package className="h-4 w-4"/>} onClick={() => setActiveModule("inventory")}/>
        <MetricCard label="Pending vendor bills" value={db.vendorBills.filter((b) => b.status === "pending" || b.status === "approved").length} hint="Awaiting payment" tone="warning" icon={<FileText className="h-4 w-4"/>} onClick={() => setActiveModule("vendorBills")}/>
      </section>

      <WorkspaceHealthWidget />
      <ExceptionDashboard onNavigateAudit={() => setActiveModule("auditLog")} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DailyKpiBanner />
        <ActivityFeedWidget />
      </div>
      {/* Financial position + Today's schedule (imported from WorkdeskDashboard) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <FinancialPositionCard />
        <TodaysScheduleCard />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TeamPerformance />
        <TodaysPrioritiesBanner items={todaysPriorities} onSnooze={handleSnooze}/>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ProfitabilitySnapshot />
        <CashFlowForecast />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RecentActivityTimeline onOpenInbox={() => setActiveModule("unifiedThreadInbox")} />
        <CustomerSatisfaction />
      </div>
      <MaterialPriceTracker />
      <ConversationActivityWidget onOpenInbox={() => setActiveModule("unifiedThreadInbox")}/>
      <QueueSection title="My action queue" icon={<ListTodo className="h-4 w-4 text-primary"/>} records={queueRecords} columns={3} emptyTone="primary" emptyTitle="No active tasks" emptyDescription="Assigned work that needs action will appear here. Create a task to get started." collapsible={false} emptyAction={<EmptyCta label="Create task" onClick={() => openCreateDialog({ kind: "task" })}/>}/>
      <QueueSection title="Approvals requiring decision" icon={<CheckCircle2 className="h-4 w-4 text-success"/>} records={approvalRecords} columns={3} emptyTone="success" emptyTitle="No pending approvals" emptyDescription="Approval requests that need a decision will appear here. You are all caught up." collapsible={false}/>
      <QueueSection title="Blocked work" icon={<Ban className="h-4 w-4 text-warning"/>} records={blockedRecords} columns={3} emptyTone="warning" emptyTitle="No blocked work" emptyDescription="Unresolved blockers and obstacles will appear here. Nothing is holding up delivery." collapsible={false}/>
      <QueueSection title="Risk watch" icon={<ShieldAlert className="h-4 w-4 text-destructive"/>} records={riskRecords} columns={3} emptyTone="danger" emptyTitle="No active risks" emptyDescription="Cash, margin, vendor and collection risks will appear here. No risks flagged right now." collapsible={false}/>
      <QueueSection title="Visits and field execution" icon={<MapPin className="h-4 w-4 text-primary"/>} records={visitRecords} columns={3} emptyTone="primary" emptyTitle="No active visits" emptyDescription="Scheduled, en route and checked-in visits will appear here. Schedule a visit to track field work." collapsible={false} emptyAction={<EmptyCta label="Schedule visit" onClick={() => openCreateDialog({ kind: "visit" })}/>}/>
      <QueueSection title="Follow-ups" icon={<PhoneCall className="h-4 w-4 text-warning"/>} records={followupRecords} columns={3} emptyTone="warning" emptyTitle="No open follow-ups" emptyDescription="Pending, scheduled and missed follow-ups will appear here. Log a follow-up to stay on top of customers." collapsible={false} emptyAction={<EmptyCta label="Add follow-up" onClick={() => openCreateDialog({ kind: "followup" })}/>}/>
      {completedToday.length > 0 ? <QueueSection title="Completed today" icon={<CheckCircle2 className="h-4 w-4 text-success"/>} records={completedToday} columns={3} emptyTone="success" emptyTitle="Nothing completed yet today" emptyDescription="Tasks, visits and follow-ups you close today will appear here as a daily throughput summary." collapsible={true} defaultCollapsed={true}/> : null}
      {/* Today's site executions — execution logs filed today, grouped by work order.
          Connects Daily Work to the execution/dispatch/attendance domain so this
          is a real daily command center, not just a tasks/visits/follow-ups queue. */}
      <TodaySiteExecutionsPanel />
      <TodayVisitsPanel />
      <TodayFollowupsDuePanel />
      <TodayDispatchesPanel />
      <TodayAttendancePanel />
      <TodayOverdueInvoicesPanel />
      <WeeklyThroughputChart data={weeklyThroughput}/>
    </div>);
}

/**
 * Today's site executions — execution logs filed today (or for today's date),
 * grouped by work order with progress %.
 */
function TodaySiteExecutionsPanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const todayPrefix = indiaDate();
    const records: QueueRecord[] = React.useMemo(() => {
        const logs = db.executionLogs.filter((l) => (l.date === todayPrefix) ||
            (l.created_at?.slice(0, 10) === todayPrefix));
        // Group by work order
        const byWo = new Map<string, typeof logs>();
        for (const l of logs) {
            const arr = byWo.get(l.work_order_id) || [];
            arr.push(l);
            byWo.set(l.work_order_id, arr);
        }
        const out: QueueRecord[] = [];
        for (const [woId, woLogs] of byWo) {
            const wo = db.workOrders.find((w) => w.id === woId);
            const customer = db.customers.find((c) => c.id === wo?.customer_id);
            const site = db.sites.find((s) => s.id === wo?.site_id);
            const latest = woLogs[0];
            out.push({
                id: `exec-${woId}`,
                title: `${wo?.work_order_no || woId} · ${woLogs.length} log${woLogs.length === 1 ? "" : "s"}`,
                subtitle: site?.name,
                customerName: customer?.name,
                status: { label: `${latest.progress_pct}%`, className: "bg-primary/10 text-primary border-primary/20" },
                due: latest.date,
                assignee: latest.filed_by,
                onClick: () => openDetail("workOrder", woId),
            });
        }
        return out;
    }, [db, openDetail, todayPrefix]);
    return <QueueSection title="Today's site executions" icon={<Briefcase className="h-4 w-4 text-primary"/>} records={records} columns={3} emptyTone="primary" emptyTitle="No execution logs filed today" emptyDescription="Daily progress logs filed by site staff will appear here, grouped by work order." collapsible={true} defaultCollapsed={false}/>;
}

/**
 * Today's dispatches — material issued to sites today, grouped by site.
 */
function TodayDispatchesPanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const todayPrefix = indiaDate();
    const records: QueueRecord[] = React.useMemo(() => {
        const dispatches = db.dispatches.filter((d) => (d.issued_at?.slice(0, 10) === todayPrefix) ||
            (d.created_at?.slice(0, 10) === todayPrefix));
        return dispatches.map((d) => {
            const wo = db.workOrders.find((w) => w.id === d.work_order_id);
            const customer = db.customers.find((c) => c.id === wo?.customer_id);
            const site = db.sites.find((s) => s.id === wo?.site_id);
            return {
                id: d.id,
                title: `${d.dispatch_no} · ${d.items?.length || 0} items`,
                subtitle: site?.name || d.work_order_no,
                customerName: customer?.name,
                status: { label: d.status, className: "bg-warning/10 text-warning border-warning/20" },
                due: d.issued_at?.slice(0, 10),
                assignee: d.issued_by,
                onClick: () => openDetail("dispatch", d.id),
            } as QueueRecord;
        });
    }, [db, openDetail, todayPrefix]);
    return <QueueSection title="Today's dispatches" icon={<Briefcase className="h-4 w-4 text-warning"/>} records={records} columns={3} emptyTone="warning" emptyTitle="No material dispatched today" emptyDescription="Stock issues / dispatches made today will appear here, grouped by site." collapsible={true} defaultCollapsed={false}/>;
}

/**
 * Today's attendance — staff attendance records for today with GPS ping status.
 */
function TodayAttendancePanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const todayPrefix = indiaDate();
    const records: QueueRecord[] = React.useMemo(() => {
        const att = db.attendance.filter((a) => a.date === todayPrefix);
        return att.map((a) => {
            const staff = db.master.staff.find((s) => s.id === a.staff_id);
            const hasGps = !!(a.check_in_latitude && a.check_in_longitude);
            const tone = a.status === "present" ? "bg-success/10 text-success border-success/20"
                : a.status === "absent" || a.status === "auto_absent" ? "bg-destructive/10 text-destructive border-destructive/20"
                : a.status === "half_day" ? "bg-warning/10 text-warning border-warning/20"
                : "bg-muted text-muted-foreground border-border";
            return {
                id: a.id,
                title: staff?.name || a.staff_name || a.staff_id,
                subtitle: `${a.attendance_mode || "—"}${a.location ? " · " + a.location : ""}${hasGps ? " · GPS ✓" : " · no GPS"}`,
                status: { label: a.status, className: tone },
                due: a.date,
                assignee: a.late ? `late ${a.late_minutes}m` : undefined,
                onClick: () => openDetail("staff", a.staff_id),
            } as QueueRecord;
        });
    }, [db, openDetail, todayPrefix]);
    return <QueueSection title="Today's attendance" icon={<CheckCircle2 className="h-4 w-4 text-success"/>} records={records} columns={3} emptyTone="success" emptyTitle="No attendance records today" emptyDescription="Staff check-ins (office/field/auto-absent) for today will appear here with GPS status." collapsible={true} defaultCollapsed={false}/>;
}

/**
 * Today's overdue invoices — read-only call into finance so the operations
 * team can chase stuck receivables.
 */
function TodayOverdueInvoicesPanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const records: QueueRecord[] = React.useMemo(() => {
        const overdue = db.invoices.filter((i) => i.status === "overdue" ||
            (i.status === "issued" && i.due_date && isDateOnlyOverdue(i.due_date)));
        return overdue.map((i) => {
            const customer = db.customers.find((c) => c.id === i.customer_id);
            const wo = db.workOrders.find((w) => w.id === i.work_order_id);
            return {
                id: i.id,
                title: `${i.invoice_no} · ${formatINRShort(i.amount)}`,
                subtitle: wo?.work_order_no,
                customerName: customer?.name,
                status: { label: i.status, className: "bg-destructive/10 text-destructive border-destructive/20" },
                due: i.due_date,
                tone: "danger" as const,
                onClick: () => openDetail("invoice", i.id),
            } as QueueRecord;
        });
    }, [db, openDetail]);
    const totalOverdue = records.reduce((sum, r) => {
        const inv = db.invoices.find((i) => i.id === r.id);
        return sum + (inv?.amount || 0);
    }, 0);
    return <QueueSection title={`Today's overdue invoices${totalOverdue > 0 ? ` · ${formatINRShort(totalOverdue)}` : ""}`} icon={<ShieldAlert className="h-4 w-4 text-destructive"/>} records={records} columns={3} emptyTone="danger" emptyTitle="No overdue invoices" emptyDescription="Invoices past their due date will appear here so the operations team can chase them." collapsible={true} defaultCollapsed={false} emptyAction={<EmptyCta label="Open Collections" onClick={() => setActiveModule("payments")}/>}/>;
}

/**
 * Today's visits — visits scheduled for today, with proof status. Each row
 * deep-links to the visit detail. Distinguishes "completed with proof",
 * "checked-in (in progress)", "scheduled" and "missed" via the status pill.
 */
function TodayVisitsPanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const todayPrefix = indiaDate();
    const records: QueueRecord[] = React.useMemo(() => {
        const todays = db.visits.filter((v) => (v.scheduled_at?.slice(0, 10) === todayPrefix) ||
            (v.check_in_at?.slice(0, 10) === todayPrefix));
        return todays.map((v) => {
            const customer = db.customers.find((c) => c.id === v.customer_id);
            const site = db.sites.find((s) => s.id === v.site_id);
            const proofCount = (v.proof_attachment_ids || []).length;
            let statusLabel = v.status;
            let statusClass = "bg-muted text-muted-foreground border-border";
            if (v.status === "completed") {
                statusLabel = proofCount > 0 ? `Completed · ${proofCount} proof` : "Completed · no proof";
                statusClass = proofCount > 0
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-warning/10 text-warning border-warning/20";
            }
            else if (v.status === "checked_in") {
                statusLabel = "Checked in";
                statusClass = "bg-primary/10 text-primary border-primary/20";
            }
            else if (v.status === "missed") {
                statusLabel = "Missed";
                statusClass = "bg-destructive/10 text-destructive border-destructive/20";
            }
            else if (v.status === "en_route") {
                statusLabel = "En route";
                statusClass = "bg-warning/10 text-warning border-warning/20";
            }
            return {
                id: v.id,
                title: `${readableLabel(v.visit_type)} · ${customer?.name || v.location_name}`,
                subtitle: site?.name || v.location_name,
                customerName: customer?.name,
                status: { label: statusLabel, className: statusClass },
                due: v.scheduled_at?.slice(11, 16) || undefined,
                assignee: v.staff_name || v.contractor_name,
                onClick: () => openDetail("visit", v.id),
            } as QueueRecord;
        }).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
    }, [db, openDetail, todayPrefix]);
    return <QueueSection title="Today's visits" icon={<MapPin className="h-4 w-4 text-primary"/>} records={records} columns={3} emptyTone="primary" emptyTitle="No visits scheduled today" emptyDescription="Visits scheduled for today will appear here with proof status. Schedule a visit from Field Operations." collapsible={true} defaultCollapsed={false}/>;
}

/**
 * Today's follow-ups due — follow-ups with due_date = today, deep-linking to
 * the linked customer / quotation / work order. Each row shows the linked
 * entity name so the operator knows what to chase.
 */
function TodayFollowupsDuePanel() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const todayPrefix = indiaDate();
    const records: QueueRecord[] = React.useMemo(() => {
        const due = db.followups.filter((f) => f.due_date === todayPrefix &&
            (f.status === "pending" || f.status === "scheduled" || f.status === "missed"));
        return due.map((f) => {
            const customer = db.customers.find((c) => c.id === f.customer_id);
            const quotation = db.quotations.find((q) => q.id === f.quotation_id);
            const payment = db.payments.find((p) => p.id === f.payment_id);
            const visit = db.visits.find((v) => v.id === f.visit_id);
            // Build a subtitle that names the linked entity, so the operator
            // knows what the follow-up is about without opening the detail.
            const parts: string[] = [];
            if (quotation) parts.push(`Quote ${quotation.quotation_no}`);
            if (payment) parts.push(`Payment ${payment.milestone_label || payment.id.slice(-4)}`);
            if (visit) parts.push(`Visit ${visit.location_name}`);
            const tone = f.status === "missed"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : f.priority === "urgent" || f.priority === "high"
                    ? "bg-warning/10 text-warning border-warning/20"
                    : "bg-primary/10 text-primary border-primary/20";
            return {
                id: f.id,
                title: f.title,
                subtitle: parts.join(" · ") || f.notes || f.followup_type,
                customerName: customer?.name,
                status: { label: f.status, className: tone },
                due: f.due_at?.slice(11, 16) || f.due_date,
                assignee: f.assigned_to,
                priority: f.priority,
                tone: f.status === "missed" ? "danger" as const : "default" as const,
                onClick: () => openDetail("followup", f.id),
            } as QueueRecord;
        }).sort((a, b) => {
            // Missed first, then by priority, then by due time.
            const aMissed = a.tone === "danger" ? 0 : 1;
            const bMissed = b.tone === "danger" ? 0 : 1;
            if (aMissed !== bMissed) return aMissed - bMissed;
            const pa = PRIORITY_RANK[a.priority || "low"] ?? 9;
            const pb = PRIORITY_RANK[b.priority || "low"] ?? 9;
            if (pa !== pb) return pa - pb;
            return (a.due || "").localeCompare(b.due || "");
        });
    }, [db, openDetail, todayPrefix]);
    return <QueueSection title="Today's follow-ups due" icon={<PhoneCall className="h-4 w-4 text-warning"/>} records={records} columns={3} emptyTone="warning" emptyTitle="No follow-ups due today" emptyDescription="Follow-ups scheduled for today will appear here. Each row deep-links to the linked entity (quotation / work order / payment / visit)." collapsible={true} defaultCollapsed={false}/>;
}
