"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { calculateQuotationMetrics } from "@/lib/rdash/metrics";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { Repeat, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Package, Layers, Plus, Power, TrendingDown, TrendingUp, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function RecurringTasksModule() {
    const db = useRDashStore((s) => s.db);
    const toggleRecurringTask = useRDashStore((s) => s.toggleRecurringTask);
    const runRecurringTasks = useRDashStore((s) => s.runRecurringTasks);
    const recurring = db.recurringTasks;
    const enabled = recurring.filter((task) => task.enabled).length;
    const totalRuns = recurring.reduce((total, task) => total + task.runs_count, 0);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dueToday = recurring.filter((task) => task.enabled && task.next_run <= today).length;
    const runDue = () => {
        try {
            const count = runRecurringTasks();
            toast.success(count ? `${count} recurring task${count > 1 ? "s" : ""} created` : "No recurring task is due");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not run recurring schedules");
        }
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Repeat className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Recurring Tasks</h2><p className="text-xs text-muted-foreground">Schedules create normal, auditable Tasks when they become due.</p></div></div>
        <Button size="sm" onClick={runDue}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Run due schedules</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Recurring tasks" value={recurring.length} tone="primary" icon={<Repeat className="h-4 w-4"/>}/><MetricCard label="Active" value={enabled} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/><MetricCard label="Due now" value={dueToday} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/><MetricCard label="Total runs" value={totalRuns} tone="default" icon={<RefreshCw className="h-4 w-4"/>}/></div>
      <div className="rd-stagger grid gap-3 lg:grid-cols-2">{recurring.map((task) => <div key={task.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card", task.enabled ? "border-border" : "border-dashed border-border opacity-70")}><div className="flex items-start justify-between"><div className="flex items-start gap-2.5"><span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", task.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Repeat className="h-4 w-4"/></span><div><p className="text-sm font-bold">{task.title}</p><p className="text-[11px] text-muted-foreground">{task.assignee_name || "Unassigned"} · {titleCase(task.scope)} scope</p></div></div><StatusBadge label={titleCase(task.frequency)} className="bg-primary/10 text-primary border-primary/20"/></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Last run</p><p className="font-medium">{task.last_run ? relativeDay(task.last_run) : "—"}</p></div><div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Next run</p><p className="font-medium">{relativeDay(task.next_run)}</p></div><div className="rounded-md bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Runs</p><p className="font-medium">{task.runs_count}</p></div></div><Button size="sm" variant="outline" className="mt-2" onClick={() => { try {
        toggleRecurringTask(task.id);
        toast.success(task.enabled ? "Recurring task disabled" : "Recurring task enabled");
    }
    catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not change schedule");
    } }}><Power className="mr-1 h-3.5 w-3.5"/>{task.enabled ? "Disable" : "Enable"}</Button></div>)}</div>
    </div>);
}
export function LostClosedReviewModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const quotationMetrics = calculateQuotationMetrics(db.quotations);
    const lostQuotes = quotationMetrics.current.filter((q) => q.status === "rejected" || q.status === "expired");
    const lostWorkRequireds = db.workRequired.filter((r) => r.status === "lost");
    const cancelledJobs = db.workOrders.filter((j) => j.status === "cancelled");
    const lostValue = [...lostQuotes, ...lostWorkRequireds.map((r) => ({ total_amount: r.budget || 0 } as any))].reduce((n, q) => n + (q.total_amount || 0), 0);
    const winRate = quotationMetrics.conversionRate;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><TrendingDown className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Lost / Closed Review</h2>
          <p className="text-xs text-muted-foreground">Post-mortem on lost deals — learn why customers went elsewhere</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Lost quotations" value={lostQuotes.length} tone="destructive" icon={<XCircle className="h-4 w-4"/>}/>
        <MetricCard label="Lost workRequired" value={lostWorkRequireds.length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Cancelled workOrders" value={cancelledJobs.length} tone="destructive" icon={<XCircle className="h-4 w-4"/>}/>
        <MetricCard label="Lost value" value={formatINR(lostValue)} tone="destructive" icon={<TrendingDown className="h-4 w-4"/>}/>
      </div>

      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary"/>
          <p className="text-sm font-semibold text-primary">Win rate: {winRate}% — {quotationMetrics.acceptedCount} won of {quotationMetrics.decidedCount} decided</p>
        </div>
        <p className="mt-1 text-xs text-foreground/80">Review the lost deals below to identify patterns — price, timing, competitor, or scope mismatch.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="border-b border-border bg-muted/30 px-4 py-2"><h3 className="text-sm font-semibold">Lost quotations ({lostQuotes.length})</h3></div>
          {lostQuotes.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No lost quotations 🎉</p> : (<div className="divide-y divide-border">
              {lostQuotes.map((q) => (<button key={q.id} type="button" onClick={() => openDetail("quotation", q.id)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-accent/30">
                  <div>
                    <p className="text-xs font-semibold">{q.quotation_no} · {(q.customer_name || "Customer")}</p>
                    <p className="text-[10px] text-muted-foreground">{q.title} · {formatINR(q.total_amount)}</p>
                  </div>
                  <StatusBadge label={titleCase(q.status)} className={q.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}/>
                </button>))}
            </div>)}
        </div>
        <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="border-b border-border bg-muted/30 px-4 py-2"><h3 className="text-sm font-semibold">Lost workRequired ({lostWorkRequireds.length})</h3></div>
          {lostWorkRequireds.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No lost workRequired 🎉</p> : (<div className="divide-y divide-border">
              {lostWorkRequireds.map((r) => {
                const customer = db.customers.find((p) => p.id === r.customer_id);
                return (<div key={r.id} className="px-4 py-2.5">
                    <p className="text-xs font-semibold">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground">{customer?.name} · budget {formatINR(r.budget || 0)} · {r.source}</p>
                  </div>);
            })}
            </div>)}
        </div>
      </div>
    </div>);
}
interface ArticleVariant {
    id: string;
    article_id: string;
    article_name: string;
    variant_name: string;
    rate_diff: number;
    unit: string;
    enabled: boolean;
}
const SEED_VARIANTS: ArticleVariant[] = [
    { id: "av-001", article_id: "art-mod-ply", article_name: "BWP Plywood Modular", variant_name: "Marine grade (BWP+)", rate_diff: 180, unit: "sqft", enabled: true },
    { id: "av-002", article_id: "art-mod-ply", article_name: "BWP Plywood Modular", variant_name: "Commercial (MR)", rate_diff: -220, unit: "sqft", enabled: true },
    { id: "av-003", article_id: "art-mod-shutter", article_name: "Acrylic Shutter", variant_name: "Glossy finish", rate_diff: 40, unit: "sqft", enabled: true },
    { id: "av-004", article_id: "art-mod-shutter", article_name: "Acrylic Shutter", variant_name: "Matte finish", rate_diff: 0, unit: "sqft", enabled: true },
    { id: "av-005", article_id: "art-hw-hinge", article_name: "Soft-close Hinges", variant_name: "Stainless steel", rate_diff: 35, unit: "nos", enabled: true },
    { id: "av-006", article_id: "art-hw-hinge", article_name: "Soft-close Hinges", variant_name: "Standard (non-soft)", rate_diff: -120, unit: "nos", enabled: false },
    { id: "av-007", article_id: "art-paint-tex", article_name: "Texture Finish", variant_name: "Premium Italian texture", rate_diff: 22, unit: "sqft", enabled: true },
    { id: "av-008", article_id: "art-ward-ply", article_name: "Wardrobe Carcass", variant_name: "Pre-laminated (both sides)", rate_diff: 95, unit: "sqft", enabled: true },
];
export function ArticleVariantsModule() {
    const db = useRDashStore((s) => s.db);
    const [variants, setVariants] = React.useState<ArticleVariant[]>(SEED_VARIANTS);
    const toggle = (id: string) => setVariants((vs) => vs.map((v) => v.id === id ? { ...v, enabled: !v.enabled } : v));
    const enabled = variants.filter((v) => v.enabled).length;
    const byArticle = new Set(variants.map((v) => v.article_id));
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Article Variants</h2>
          <p className="text-xs text-muted-foreground">Material grade + finish options with rate differentials from base</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total variants" value={variants.length} tone="primary" icon={<Layers className="h-4 w-4"/>}/>
        <MetricCard label="Enabled" value={enabled} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Articles covered" value={byArticle.size} tone="default" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Avg rate diff" value={`±${Math.round(variants.reduce((n, v) => n + Math.abs(v.rate_diff), 0) / variants.length)}`} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
      </div>

      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {variants.map((v) => {
            const article = db.master.articles.find((a) => a.id === v.article_id);
            const finalRate = (article?.base_rate || 0) + v.rate_diff;
            return (<div key={v.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-4 shadow-card", v.enabled ? "border-border" : "border-dashed border-border opacity-70")}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold">{v.variant_name}</p>
                  <p className="text-[11px] text-muted-foreground">{v.article_name}</p>
                </div>
                <StatusBadge label={v.enabled ? "Active" : "Disabled"} className={v.enabled ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Base rate</p>
                  <p className="font-mono font-medium">{formatINR(article?.base_rate || 0)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Diff</p>
                  <p className={cn("font-mono font-medium", v.rate_diff > 0 ? "text-destructive" : v.rate_diff < 0 ? "text-success" : "text-muted-foreground")}>{v.rate_diff > 0 ? "+" : ""}{v.rate_diff}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Final/{v.unit}</p>
                  <p className="font-mono font-bold">{formatINR(finalRate)}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { toggle(v.id); toast.success("Variant toggled"); }}>
                <Power className="mr-1 h-3.5 w-3.5"/> {v.enabled ? "Disable" : "Enable"}
              </Button>
            </div>);
        })}
      </div>
    </div>);
}
