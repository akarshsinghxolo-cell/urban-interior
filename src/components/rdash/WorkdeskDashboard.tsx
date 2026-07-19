"use client";
import * as React from "react";
import { ArrowRight, Ban, Briefcase, CalendarDays, CheckCircle2, Clock, FileText, History, ListTodo, PhoneCall, RefreshCw, ShieldAlert, SlidersHorizontal, Target, TrendingUp, UserPlus, MapPin, Package, AlertTriangle, MessageSquare, } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatINRShort } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";
import { ActivityTimeline } from "./ActivityTimeline";
import { WorkspaceStats } from "./WorkspaceStats";
import { MetricCard, WorkflowStepRich, Avatar } from "./primitives";
import { FinancialPositionCard } from "./FinancialPositionCard";
import { TodaysScheduleCard } from "./TodaysScheduleCard";
import { WorkspacePulseStrip } from "./WorkspacePulseStrip";
import { ExceptionSummaryCard } from "./ExceptionSummaryCard";
import { CashFlowChart } from "./CashFlowChart";
type DashboardTone = "primary" | "success" | "warning" | "danger" | "default";
interface DashboardCard {
    id: string;
    label: string;
    description: string;
    count: number;
    countLabel: string;
    icon: LucideIcon;
    tone: DashboardTone;
}
const toneClass: Record<DashboardTone, string> = {
    primary: "border-primary/25 bg-primary/[0.04]",
    success: "border-success/25 bg-success/[0.04]",
    warning: "border-warning/25 bg-warning/[0.05]",
    danger: "border-destructive/25 bg-destructive/[0.04]",
    default: "border-border bg-card",
};
const iconClass: Record<DashboardTone, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    default: "bg-muted text-muted-foreground",
};
const countClass: Record<DashboardTone, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    default: "text-foreground",
};
export function WorkdeskDashboard() {
    const db = useRDashStore((s) => s.db);
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const openTasks = db.tasks.filter((task) => task.status === "todo" ||
        task.status === "in_progress" ||
        task.status === "review");
    const overdueTasks = openTasks.filter((task) => isDateOnlyOverdue(task.due_date));
    const dueTodayTasks = openTasks.filter((task) => task.due_date === indiaDate());
    const activeFollowups = db.followups.filter((followup) => followup.status === "pending" ||
        followup.status === "scheduled" ||
        followup.status === "missed");
    const pendingApprovals = db.actions.filter((action) => action.status === "pending");
    const unresolvedBlocked = db.blocked.filter((item) => !item.resolved);
    const activeVisits = db.visits.filter((visit) => visit.status === "scheduled" ||
        visit.status === "en_route" ||
        visit.status === "checked_in");
    const completedTasks = db.tasks.filter((task) => task.status === "completed" || task.status === "cancelled");
    const attentionCount = pendingApprovals.length + unresolvedBlocked.length + db.risks.length;
    const totalCurrent = openTasks.length +
        activeFollowups.length +
        pendingApprovals.length +
        unresolvedBlocked.length +
        db.risks.length +
        activeVisits.length;
    const roleSubtitle = role === "Owner"
        ? `Role-based command center - ${db.customers.length} customers - ${db.workOrders.length} live workOrders`
        : role === "Operations Manager"
            ? `Operations view - ${db.workOrders.length} live workOrders - ${activeVisits.length} field visits`
            : role === "Field Staff"
                ? `Field view - ${activeVisits.length} visits - ${openTasks.length} assigned actions`
                : role === "Procurement Staff"
                    ? `Shop view - ${db.inventory.length} stock items - ${openTasks.length} actions`
                    : role === "Finance"
                        ? `Finance view - ${db.payments.length} payments - ${pendingApprovals.length} approvals`
                        : `Role-based command center - ${db.customers.length} customers - ${db.workOrders.length} live workOrders`;
    const cards: DashboardCard[] = [
        {
            id: "today",
            label: "Today",
            description: "Focused action queues for the current operating day.",
            count: totalCurrent,
            countLabel: "current items",
            icon: ListTodo,
            tone: "primary",
        },
        {
            id: "tasks",
            label: "Tasks",
            description: "Full task workbench with saved views and scope filters.",
            count: openTasks.length,
            countLabel: "open",
            icon: CheckCircle2,
            tone: "success",
        },
        {
            id: "followups",
            label: "Follow-ups",
            description: "Calls, quotation follow-ups and payment follow-ups.",
            count: activeFollowups.length,
            countLabel: "active",
            icon: PhoneCall,
            tone: "warning",
        },
        {
            id: "approvals",
            label: "Approvals",
            description: "Pending commercial, purchase and payment decisions.",
            count: pendingApprovals.length,
            countLabel: "pending",
            icon: CheckCircle2,
            tone: "success",
        },
        {
            id: "blockedRisks",
            label: "Blocked & Risks",
            description: "Obstacles, cash exposure, margin risk and vendor watch.",
            count: unresolvedBlocked.length + db.risks.length,
            countLabel: "attention",
            icon: ShieldAlert,
            tone: "danger",
        },
        {
            id: "calendarRecurring",
            label: "Calendar & Recurring",
            description: "Schedule view, field appointments and repeating work.",
            count: activeVisits.length,
            countLabel: "scheduled",
            icon: CalendarDays,
            tone: "primary",
        },
        {
            id: "history",
            label: "Completed / History",
            description: "Closed work, completed tasks and cancelled records.",
            count: completedTasks.length,
            countLabel: "records",
            icon: History,
            tone: "default",
        },
    ];
    return (<div className="flex flex-col gap-5">
      <WorkspacePulseStrip />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">
            Owner operating workspace
          </h2>
          <p className="text-xs text-muted-foreground">{roleSubtitle}</p>
        </div>
        <button type="button" onClick={() => toast.success("Workspace refreshed")} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5"/>
          Refresh
        </button>
      </div>

      <section aria-label="Module workflow steps" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <WorkflowStepRich index="01" title="See work" description="Assigned actions and due dates" meta={`${openTasks.length} open`} state="active"/>
        <WorkflowStepRich index="02" title="Resolve risk" description="Blocker, risk, approval or collection" meta={`${attentionCount} attention`} state={attentionCount > 0 ? "pending" : "done"}/>
        <WorkflowStepRich index="03" title="Open work context" description="Go to the exact scope without re-searching" meta="context retained" state="default"/>
      </section>

      <section aria-label="Module metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="My actions" value={openTasks.length} hint="Assigned queue" tone="primary" icon={<ListTodo className="h-4 w-4"/>} onClick={() => setActiveModule("today")}/>
        <MetricCard label="Due today" value={dueTodayTasks.length} hint="Needs same-day attention" tone="warning" icon={<Clock className="h-4 w-4"/>} onClick={() => setActiveModule("today")}/>
        <MetricCard label="Overdue" value={overdueTasks.length} hint="Past due" tone="destructive" icon={<Clock className="h-4 w-4"/>} onClick={() => setActiveModule("today")}/>
        <MetricCard label="Blocked" value={unresolvedBlocked.length} hint="Exact reasons available" tone="warning" icon={<Ban className="h-4 w-4"/>} onClick={() => setActiveModule("blockedRisks")}/>
        <MetricCard label="Approvals" value={pendingApprovals.length} hint="Decision required" tone="success" icon={<CheckCircle2 className="h-4 w-4"/>} onClick={() => setActiveModule("approvals")}/>
      </section>

      {/* G: Expanded KPI grid — covers operations, finance, field, and inventory
          in one glance. Each KPI deep-links to its module. */}
      <section aria-label="Workspace KPIs" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Active WOs" value={db.workOrders.filter((w) => w.status === "in_progress" || w.status === "scheduled").length} hint="In progress + scheduled" tone="primary" icon={<Briefcase className="h-4 w-4"/>} onClick={() => setActiveModule("siteExecution")}/>
        <MetricCard label="Pending approvals" value={pendingApprovals.length} hint="PO + payment + variation" tone="success" icon={<CheckCircle2 className="h-4 w-4"/>} onClick={() => setActiveModule("approvals")}/>
        <MetricCard label="Overdue invoices" value={formatINRShort(db.invoices.filter((i) => i.status === "overdue" || (i.status === "issued" && i.due_date && isDateOnlyOverdue(i.due_date))).reduce((s, i) => s + i.amount, 0))} hint="Total value" tone="destructive" icon={<FileText className="h-4 w-4"/>} onClick={() => setActiveModule("payments")}/>
        <MetricCard label="Today's visits" value={db.visits.filter((v) => v.scheduled_at?.slice(0, 10) === indiaDate()).length} hint="Scheduled today" tone="primary" icon={<MapPin className="h-4 w-4"/>} onClick={() => setActiveModule("fieldOperations")}/>
        <MetricCard label="Follow-ups due" value={db.followups.filter((f) => f.due_date === indiaDate() && (f.status === "pending" || f.status === "scheduled")).length} hint="Due today" tone="warning" icon={<PhoneCall className="h-4 w-4"/>} onClick={() => setActiveModule("tasks")}/>
        <MetricCard label="Low-stock items" value={db.inventory.filter((i) => typeof i.min_qty === "number" && i.quantity <= (i.min_qty || 0)).length} hint="At/below min" tone="destructive" icon={<Package className="h-4 w-4"/>} onClick={() => setActiveModule("inventory")}/>
        <MetricCard label="Pending vendor bills" value={db.vendorBills.filter((b) => b.status === "pending" || b.status === "approved").length} hint="Awaiting payment" tone="warning" icon={<FileText className="h-4 w-4"/>} onClick={() => setActiveModule("vendorBills")}/>
      </section>

      {/* G: Recent activity feed — last 10 audit log entries with deep-link to
          audit detail. Lets managers see "what just happened" without leaving
          the dashboard. */}
      <RecentActivityFeed />

      <BusinessHealthBanner />

      <div className="grid gap-3 lg:grid-cols-2">
        <FinancialPositionCard />
        <TodaysScheduleCard />
      </div>

      <ExceptionSummaryCard />

      <CashFlowChart />

      <WorkspaceStats />

      <section aria-label="Workdesk dashboard" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
            const Icon = card.icon;
            return (<button key={card.id} type="button" aria-label={`Open ${card.label}`} onClick={() => setActiveModule(card.id)} className={cn("group flex min-h-[148px] flex-col justify-between rounded-[var(--panel-radius)] border p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", toneClass[card.tone])}>
              <span className="flex items-start justify-between gap-3">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-md", iconClass[card.tone])} aria-hidden>
                  <Icon className="h-5 w-5"/>
                </span>
                <span className={cn("rd-tabular text-2xl font-bold leading-none", countClass[card.tone])}>
                  {card.count}
                </span>
              </span>
              <span className="mt-4 block min-w-0">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {card.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"/>
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {card.description}
                </span>
                <span className="mt-3 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {card.countLabel}
                </span>
              </span>
            </button>);
        })}
      </section>

      <DashboardWidgets />
      <ActivityTimeline limit={6}/>
    </div>);
}

/**
 * G: Recent activity feed — last 10 audit log entries rendered as a
 * compact, clickable list. Each entry deep-links to the audit detail
 * panel. Surfaces "what just happened" without leaving the dashboard.
 */
function RecentActivityFeed() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const recent = React.useMemo(() => {
        return [...db.auditLog]
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, 10);
    }, [db.auditLog]);
    if (recent.length === 0) return null;
    return (
        <section aria-label="Recent activity" className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-4 w-4"/></span>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight">Recent activity</h3>
                        <p className="text-[10px] text-muted-foreground">Last 10 audit log entries · click to open detail</p>
                    </div>
                </div>
                <button type="button" onClick={() => setActiveModule("auditLog")} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                    Open Audit Log <ArrowRight className="h-3 w-3"/>
                </button>
            </div>
            <div className="divide-y divide-border">
                {recent.map((e) => (
                    <button key={e.id} type="button" onClick={() => openDetail("audit" as any, e.id)} className="flex w-full items-start gap-3 py-2 text-left hover:bg-accent/30">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <MessageSquare className="h-3 w-3"/>
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">{e.action}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                                {e.actor} · {e.entity_label || e.entity_type} · {new Date(e.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{e.kind}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

function BusinessHealthBanner() {
    const db = useRDashStore((s) => s.db);
    const weekAgo = React.useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        date.setHours(0, 0, 0, 0);
        return date;
    }, []);
    const weeklyRevenue = db.customerReceipts
        .filter((receipt) => new Date(receipt.received_at) >= weekAgo)
        .reduce((total, receipt) => total + receipt.amount, 0);
    const pipelineValue = db.quotations
        .filter((quote) => ["sent", "draft"].includes(quote.status))
        .reduce((total, quote) => total + quote.total_amount, 0);
    const totalQuoted = db.quotations.filter((quote) => quote.status !== "draft").length;
    const accepted = db.quotations.filter((quote) => quote.status === "accepted").length;
    const conversionRate = totalQuoted > 0 ? Math.round((accepted / totalQuoted) * 100) : 0;
    const activeJobValue = db.workOrders
        .filter((workOrder) => workOrder.status === "in_progress" || workOrder.status === "scheduled")
        .reduce((total, workOrder) => total + workOrder.value, 0);
    const kpis = [
        {
            label: "Revenue (7d)",
            value: formatINRShort(weeklyRevenue),
            tone: "success",
            icon: <TrendingUp className="h-3.5 w-3.5"/>,
        },
        {
            label: "Pipeline",
            value: formatINRShort(pipelineValue),
            tone: "primary",
            icon: <FileText className="h-3.5 w-3.5"/>,
        },
        {
            label: "Conversion",
            value: `${conversionRate}%`,
            tone: "warning",
            icon: <Target className="h-3.5 w-3.5"/>,
        },
        {
            label: "Active workOrders",
            value: formatINRShort(activeJobValue),
            tone: "default",
            icon: <Briefcase className="h-3.5 w-3.5"/>,
        },
    ];
    return (<section aria-label="Business health" className="grid grid-cols-2 gap-2.5 rounded-[var(--panel-radius)] border border-border bg-gradient-to-r from-card via-card to-muted/30 p-3 shadow-card sm:grid-cols-4">
      {kpis.map((kpi) => (<div key={kpi.label} className="flex items-center gap-2.5 rounded-lg bg-background/50 px-2.5 py-2 transition-colors hover:bg-background/80">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", kpi.tone === "success" && "bg-success/10 text-success", kpi.tone === "primary" && "bg-primary/10 text-primary", kpi.tone === "warning" && "bg-warning/10 text-warning", kpi.tone === "default" && "bg-muted text-muted-foreground")}>
            {kpi.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <p className="truncate text-sm font-bold text-foreground">
              {kpi.value}
            </p>
          </div>
        </div>))}
    </section>);
}
function DashboardWidgets() {
    const db = useRDashStore((s) => s.db);
    const [confidence, setConfidence] = React.useState({
        overdue: 100,
        pending: 70,
        accepted: 60,
        pipeline: 30,
    });
    const [showConfidence, setShowConfidence] = React.useState(false);
    const cashFlow = Array.from({ length: 7 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() - (6 - index));
        day.setHours(0, 0, 0, 0);
        const nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);
        const inflow = db.customerReceipts
            .filter((receipt) => new Date(receipt.received_at) >= day && new Date(receipt.received_at) < nextDay)
            .reduce((total, receipt) => total + receipt.amount, 0);
        const outflow = db.vendorBills
            .filter((bill) => (bill.status === "approved" || bill.status === "paid") &&
            bill.due_date &&
            new Date(bill.due_date) >= day &&
            new Date(bill.due_date) < nextDay)
            .reduce((total, bill) => total + bill.amount, 0);
        return {
            label: day.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
            inflow,
            outflow,
        };
    });
    const totalInflow = cashFlow.reduce((total, day) => total + day.inflow, 0);
    const totalOutflow = cashFlow.reduce((total, day) => total + day.outflow, 0);
    const netFlow = totalInflow - totalOutflow;
    const maxCashFlow = Math.max(...cashFlow.flatMap((day) => [day.inflow, day.outflow]), 1);
    const teamLoad = React.useMemo(() => {
        return db.master.staff
            .map((staff) => {
            const tasks = db.tasks.filter((task) => task.assignee_name === staff.name &&
                task.status !== "completed" &&
                task.status !== "cancelled").length;
            const visits = db.visits.filter((visit) => visit.staff_name === staff.name &&
                (visit.status === "scheduled" ||
                    visit.status === "en_route" ||
                    visit.status === "checked_in")).length;
            const followups = db.followups.filter((followup) => followup.assigned_to === staff.name &&
                (followup.status === "pending" ||
                    followup.status === "scheduled" ||
                    followup.status === "missed")).length;
            return {
                name: staff.name,
                role: staff.role,
                tasks,
                visits,
                followups,
                total: tasks + visits + followups,
            };
        })
            .filter((staff) => staff.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [db.followups, db.master.staff, db.tasks, db.visits]);
    const maxLoad = Math.max(...teamLoad.map((staff) => staff.total), 1);
    const forecast = React.useMemo(() => {
        const overduePayments = db.payments.filter((payment) => payment.status === "overdue");
        const pendingPayments = db.payments.filter((payment) => payment.status === "pending" || payment.status === "partial");
        const acceptedQuotes = db.quotations.filter((quote) => quote.status === "accepted");
        const pendingQuotes = db.quotations.filter((quote) => ["sent", "draft"].includes(quote.status));
        const overdueTotal = overduePayments.reduce((total, payment) => total + payment.amount, 0);
        const pendingPayTotal = pendingPayments.reduce((total, payment) => total + payment.amount, 0);
        const acceptedQuoteTotal = acceptedQuotes.reduce((total, quote) => total + quote.total_amount, 0);
        const pipelineTotal = pendingQuotes.reduce((total, quote) => total + quote.total_amount, 0);
        const expectedInflow = (overdueTotal * confidence.overdue) / 100 +
            (pendingPayTotal * confidence.pending) / 100 +
            (acceptedQuoteTotal * confidence.accepted) / 100 +
            (pipelineTotal * confidence.pipeline) / 100;
        return {
            overdue: { count: overduePayments.length, total: overdueTotal },
            pendingPayments: {
                count: pendingPayments.length,
                total: pendingPayTotal,
            },
            accepted: { count: acceptedQuotes.length, total: acceptedQuoteTotal },
            pendingQuotes: { count: pendingQuotes.length, total: pipelineTotal },
            expectedInflow,
            pipeline: pipelineTotal,
        };
    }, [confidence, db.payments, db.quotations]);
    return (<div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10 text-success">
              <TrendingUp className="h-4 w-4"/>
            </span>
            <h3 className="text-sm font-semibold">Cash flow - last 7 days</h3>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success"/>
              In {formatINRShort(totalInflow)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive"/>
              Out {formatINRShort(totalOutflow)}
            </span>
          </div>
        </div>
        <div className="flex h-32 items-end justify-between gap-1.5">
          {cashFlow.map((day) => (<div key={day.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 max-w-[16px]">
                  <div className="w-full rounded-t bg-success/80 transition-all hover:bg-success" title={`In ${formatINRShort(day.inflow)}`} style={{
                height: `${Math.max(2, (day.inflow / maxCashFlow) * 96)}px`,
            }}/>
                </div>
                <div className="w-1/2 max-w-[16px]">
                  <div className="w-full rounded-t bg-destructive/70 transition-all hover:bg-destructive" title={`Out ${formatINRShort(day.outflow)}`} style={{
                height: `${Math.max(2, (day.outflow / maxCashFlow) * 96)}px`,
            }}/>
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground">{day.label}</span>
            </div>))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
          <span className="text-muted-foreground">Net flow (7d)</span>
          <span className={cn("font-mono font-bold", netFlow >= 0 ? "text-success" : "text-destructive")}>
            {netFlow >= 0 ? "+" : ""}
            {formatINRShort(netFlow)}
          </span>
        </div>
      </section>

      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/10 text-warning">
              <UserPlus className="h-4 w-4"/>
            </span>
            <h3 className="text-sm font-semibold">Team load</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">open work / team</span>
        </div>
        <ul className="space-y-2.5">
          {teamLoad.length === 0 && (<li className="text-xs text-muted-foreground">No team assignees found.</li>)}
          {teamLoad.map((staff) => (<li key={staff.name} className="group">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Avatar name={staff.name} size={18}/>
                  <span className="truncate text-[11px] font-medium text-foreground">
                    {staff.name}
                  </span>
                  <span className="hidden shrink-0 rounded bg-muted px-1 py-0 text-[8px] font-medium text-muted-foreground sm:inline">
                    {staff.role}
                  </span>
                </div>
                <span className={cn("shrink-0 text-[10px] font-bold", staff.total >= 5
                ? "text-destructive"
                : staff.total >= 3
                    ? "text-warning"
                    : "text-muted-foreground")}>
                  {staff.total}
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span className="bg-primary/70" style={{ width: `${(staff.tasks / maxLoad) * 100}%` }} title={`${staff.tasks} tasks`}/>
                <span className="bg-success/70" style={{ width: `${(staff.visits / maxLoad) * 100}%` }} title={`${staff.visits} visits`}/>
                <span className="bg-warning/70" style={{ width: `${(staff.followups / maxLoad) * 100}%` }} title={`${staff.followups} follow-ups`}/>
              </div>
            </li>))}
        </ul>
      </section>

      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10 text-success">
              <TrendingUp className="h-4 w-4"/>
            </span>
            <h3 className="text-sm font-semibold">Cash flow forecast</h3>
          </div>
          <button type="button" onClick={() => setShowConfidence((value) => !value)} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", showConfidence
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground")} aria-expanded={showConfidence}>
            <SlidersHorizontal className="h-3 w-3"/>
            Confidence
          </button>
        </div>
        {showConfidence && (<div className="mb-3 rounded-md border border-border bg-muted/20 p-2.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {[
                { key: "overdue" as const, label: "Overdue" },
                { key: "pending" as const, label: "Pending pay" },
                { key: "accepted" as const, label: "Accepted quotes" },
                { key: "pipeline" as const, label: "Pipeline" },
            ].map((row) => (<label key={row.key} className="block">
                  <span className="mb-0.5 flex items-center justify-between text-[10px]">
                    <span className="font-medium text-muted-foreground">{row.label}</span>
                    <span className="font-mono font-bold text-foreground">
                      {confidence[row.key]}%
                    </span>
                  </span>
                  <input type="range" min="0" max="100" step="5" value={confidence[row.key]} onChange={(event) => setConfidence((previous) => ({
                    ...previous,
                    [row.key]: Number.parseInt(event.target.value, 10),
                }))} className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"/>
                </label>))}
            </div>
          </div>)}
        <div className="mb-3 rounded-md bg-success/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-success/80">
            Expected inflow
          </p>
          <p className="font-mono text-lg font-bold text-success">
            {formatINRShort(forecast.expectedInflow)}
          </p>
          <p className="text-[9px] text-muted-foreground">
            overdue + pending + accepted quotes
          </p>
        </div>
        <ul className="space-y-2 text-[11px]">
          <ForecastRow label="Overdue" value={forecast.overdue.total} count={forecast.overdue.count} tone="danger"/>
          <ForecastRow label="Pending payments" value={forecast.pendingPayments.total} count={forecast.pendingPayments.count} tone="warning"/>
          <ForecastRow label="Accepted quotes" value={forecast.accepted.total} count={forecast.accepted.count} tone="success"/>
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
          <span className="text-muted-foreground">
            Pipeline ({forecast.pendingQuotes.count})
          </span>
          <span className="font-mono font-bold text-primary">
            {formatINRShort(forecast.pipeline)}
          </span>
        </div>
      </section>
    </div>);
}
function ForecastRow({ label, value, count, tone, }: {
    label: string;
    value: number;
    count: number;
    tone: "danger" | "warning" | "success";
}) {
    const color = tone === "danger"
        ? "bg-destructive text-destructive"
        : tone === "warning"
            ? "bg-warning text-warning"
            : "bg-success text-success";
    return (<li>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", color.split(" ")[0])}/>
          <span className="text-foreground/80">{label}</span>
          <span className="text-muted-foreground">({count})</span>
        </span>
        <span className={cn("font-mono font-semibold", color.split(" ")[1])}>
          {formatINRShort(value)}
        </span>
      </div>
    </li>);
}
