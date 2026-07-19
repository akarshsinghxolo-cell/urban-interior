"use client";
import { indiaDate, isDateOnlyOverdue } from "@/lib/rdash/date";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import type { DetailPanelKind } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase, workRequiredStatusStyle, visitStatusStyle, taskStatusStyle } from "@/lib/rdash/format";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, MapPin, TrendingDown, FileText, ListChecks, ClipboardList, Download, Printer, Layers, Settings, Phone, Calendar, DollarSign, Plus, UserPlus, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function ApprovalsModule() {
    const db = useRDashStore((s) => s.db);
    const resolveApproval = useRDashStore((s) => s.resolveApproval);
    const openDetail = useRDashStore((s) => s.openDetail);
    const pending = db.actions.filter((a) => a.status === "pending");
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><ShieldCheck className="h-5 w-5"/></span>
        <div><h2 className="text-lg font-bold tracking-tight">Approvals</h2><p className="text-xs text-muted-foreground">All pending decisions — POs, quotations, contractor payments, vendor bills</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Pending" value={pending.length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Total value" value={formatINRShort(pending.reduce((n, a) => n + (a.amount || 0), 0))} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="PO approvals" value={pending.filter((a) => a.type === "po").length} tone="default" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Contractor pay" value={pending.filter((a) => a.type === "contractor_payment").length} tone="destructive" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      {pending.length === 0 ? <EmptyState title="No pending approvals 🎉" icon={<CheckCircle2 className="h-8 w-8"/>}/> : (<div className="space-y-2">
          {pending.map((a) => (<div key={a.id} className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-warning/25 bg-card p-3 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning"><ShieldCheck className="h-4 w-4"/></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {(a.customer_name || "Customer") && <span>{(a.customer_name || "Customer")}</span>}
                  {a.amount != null && <span className="font-mono font-semibold text-foreground/80">{formatINR(a.amount)}</span>}
                  {a.requested_by && <span>· by {a.requested_by}</span>}
                  {a.due_date && <span>· due {relativeDay(a.due_date)}</span>}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 text-xs" onClick={() => { try {
                resolveApproval(a.id, "approved");
                toast.success("Approved");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Approval blocked");
            } }}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Approve</Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { try {
                resolveApproval(a.id, "rejected");
                toast.info("Rejected");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Approval blocked");
            } }}><XCircle className="mr-1 h-3.5 w-3.5"/> Reject</Button>
              </div>
            </div>))}
        </div>)}
    </div>);
}
export function CashMarginRiskModule() {
    const db = useRDashStore((s) => s.db);
    const resolveRisk = useRDashStore((s) => s.resolveRisk);
    const openDetail = useRDashStore((s) => s.openDetail);
    const risks = db.risks;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><TrendingDown className="h-5 w-5"/></span>
        <div><h2 className="text-lg font-bold tracking-tight">Cash & Margin Risk</h2><p className="text-xs text-muted-foreground">Financial exposure — overdue payments, margin erosion, vendor risk</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total risks" value={risks.length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Urgent" value={risks.filter((r) => r.severity === "urgent").length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="High" value={risks.filter((r) => r.severity === "high").length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Risk value" value={formatINRShort(risks.reduce((n, r) => n + (r.amount || 0), 0))} tone="destructive" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      {risks.length === 0 ? <EmptyState title="No active risks 🎉" icon={<CheckCircle2 className="h-8 w-8"/>}/> : (<div className="space-y-2">
          {risks.map((r) => (<div key={r.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-3 shadow-card", r.severity === "urgent" ? "border-destructive/30" : "border-warning/25")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", r.severity === "urgent" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}><AlertTriangle className="h-4 w-4"/></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-bold">{r.title}</p>
                    <div className="flex items-center gap-2">
                      {r.amount != null && <span className="font-mono text-sm font-bold text-destructive">{formatINR(r.amount)}</span>}
                      <StatusBadge label={titleCase(r.severity)} className={r.severity === "urgent" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}/>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>
                  {(r.customer_name || "Customer") && <p className="mt-0.5 text-[10px] text-muted-foreground">Customer: {(r.customer_name || "Customer")}</p>}
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => { resolveRisk(r.id); toast.success("Risk resolved"); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Resolve</Button>
              </div>
            </div>))}
        </div>)}
    </div>);
}
export function SiteVisitsModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const activeStaff = db.master.staff.filter((m: any) => m.status === "active");
    const visits = db.visits.filter((v) => v.visit_type === "site_visit");
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="h-5 w-5"/></span>
          <div><h2 className="text-lg font-bold tracking-tight">Site Visits</h2><p className="text-xs text-muted-foreground">All site inspection and supervision visits</p></div>
        </div>
        <Button type="button" size="sm" onClick={() => openCreateDialog({ kind: "visit" })} className="h-8 gap-1.5 shadow-sm">
          <Plus className="h-3.5 w-3.5"/>
          Schedule visit
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total visits" value={visits.length} tone="primary" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Completed" value={visits.filter((v) => v.status === "completed").length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Scheduled" value={visits.filter((v) => v.status === "scheduled").length} tone="warning" icon={<Calendar className="h-4 w-4"/>}/>
        <MetricCard label="With proof" value={visits.filter((v) => v.proof_attachment_ids.length > 0).length} tone="default" icon={<FileText className="h-4 w-4"/>}/>
      </div>
      {visits.length === 0 ? (<EmptyState tone="primary" title="No site visits yet" description="Schedule site inspection and supervision visits to track field execution and capture proof." icon={<MapPin className="h-6 w-6"/>} action={<Button type="button" size="sm" onClick={() => openCreateDialog({ kind: "visit" })} className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5"/>Schedule visit</Button>}/>) : (<div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {visits.map((v) => {
            const customer = db.customers.find((p) => p.id === v.customer_id);
            const st = visitStatusStyle(v.status);
            const isUnassigned = !v.staff_id || v.staff_name === "Unassigned";
            return (<div key={v.id} className="group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
              <button type="button" onClick={() => openDetail("visit", v.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <Avatar name={customer?.name || v.location_name} size={36}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{customer?.name || v.location_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{v.location_name} · {v.staff_name}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5"/>{formatDate(v.scheduled_at)}</span>
                    {v.proof_attachment_ids.length > 0 && <span className="inline-flex items-center gap-0.5"><FileText className="h-2.5 w-2.5"/>{v.proof_attachment_ids.length} proofs</span>}
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge label={st.label} className={st.className}/>
                {isUnassigned && (activeStaff.length > 0
                  ? <button type="button" onClick={(e) => { e.stopPropagation(); openDetail("visit", v.id); }} className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-inset ring-warning/20 transition-all hover:bg-warning/20 hover:ring-warning/40"><UserPlus className="h-3 w-3"/>Assign staff</button>
                  : <button type="button" onClick={(e) => { e.stopPropagation(); setActiveModule("staff"); }} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-all hover:bg-primary/20 hover:ring-primary/40"><UserPlus className="h-3 w-3"/>Add staff</button>)}
              </div>
            </div>);
        })}
      </div>)}
    </div>);
}
export function CustomerDeskExtrasModule({ submodule, filterPresets, }: {
    submodule: string;
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    if (submodule === "requests") {
        return (<RequestsView reqs={db.workRequired} customers={db.customers} openDetail={openDetail} filterPresets={filterPresets}/>);
    }
    if (submodule === "pendingActionsCust") {
        const tasks = db.tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><ListChecks className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Pending Actions</h2><p className="text-xs text-muted-foreground">Open tasks across all customers</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Open tasks" value={tasks.length} tone="warning" icon={<ListChecks className="h-4 w-4"/>}/>
          <MetricCard label="Overdue" value={tasks.filter((t) => isDateOnlyOverdue(t.due_date)).length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
          <MetricCard label="In progress" value={tasks.filter((t) => t.status === "in_progress").length} tone="primary" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Blocked" value={tasks.filter((t) => t.status === "blocked").length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        </div>
        <div className="space-y-2">
          {tasks.map((t) => {
                const customer = db.customers.find((p) => p.id === t.customer_id);
                const st = taskStatusStyle(t.status);
                return (<button key={t.id} type="button" onClick={() => openDetail("task", t.id)} className="flex w-full items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card hover:bg-accent/20">
                <Avatar name={customer?.name || "?"} size={32}/>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-[10px] text-muted-foreground">{customer?.name} · {t.assignee_name} · due {relativeDay(t.due_date)}</p></div>
                <StatusBadge label={st.label} className={st.className}/>
              </button>);
            })}
        </div>
      </div>);
    }
    if (submodule === "workRequiredReview") {
        const reqs = db.workRequired.filter((r) => r.status !== "accepted" && r.status !== "lost");
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">WorkRequired Review</h2><p className="text-xs text-muted-foreground">Active workRequired needing qualification and follow-up</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Active" value={reqs.length} tone="primary" icon={<ClipboardList className="h-4 w-4"/>}/>
          <MetricCard label="New" value={reqs.filter((r) => r.status === "new").length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
          <MetricCard label="Quoting" value={reqs.filter((r) => r.status === "quotation_in_progress" || r.status === "quotation_sent").length} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Value" value={formatINRShort(reqs.reduce((n, r) => n + (r.budget || 0), 0))} tone="default" icon={<DollarSign className="h-4 w-4"/>}/>
        </div>
        <div className="space-y-2">
          {reqs.map((r) => {
                const customer = db.customers.find((p) => p.id === r.customer_id);
                const st = workRequiredStatusStyle(r.status);
                return (<button key={r.id} type="button" onClick={() => customer && openDetail("customer", customer.id)} className="flex w-full items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card hover:bg-accent/20">
                <Avatar name={customer?.name || "?"} size={32}/>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{r.title}</p><div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground"><span>{customer?.name}</span><span>· {r.source}</span>{r.budget && <span className="font-mono font-semibold text-foreground/80">· {formatINR(r.budget)}</span>}</div></div>
                <StatusBadge label={st.label} className={st.className}/>
              </button>);
            })}
        </div>
      </div>);
    }
    return null;
}
export function QuotationExtrasModule({ submodule }: {
    submodule: string;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    if (submodule === "workRequiredBoq") {
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Work Requirement BOQ</h2><p className="text-xs text-muted-foreground">Article-level material breakdown for awarded work orders</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Quotations" value={db.quotations.length} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Total items" value={db.quotations.reduce((n, q) => n + q.scope_lines.length, 0)} tone="default" icon={<Layers className="h-4 w-4"/>}/>
          <MetricCard label="Total value" value={formatINRShort(db.quotations.reduce((n, q) => n + q.total_amount, 0))} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
          <MetricCard label="Avg items/quote" value={db.quotations.length ? Math.round(db.quotations.reduce((n, q) => n + q.scope_lines.length, 0) / db.quotations.length) : 0} tone="warning" icon={<Layers className="h-4 w-4"/>}/>
        </div>
        <div className="space-y-3">
          {db.quotations.map((q) => (<div key={q.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
              <button type="button" onClick={() => openDetail("quotation", q.id)} className="flex w-full items-center justify-between text-left hover:text-primary">
                <div><p className="text-sm font-bold">{q.quotation_no} · {(q.customer_name || "Customer")}</p><p className="text-[10px] text-muted-foreground">{q.title} · {q.scope_lines.length} items</p></div>
                <span className="font-mono text-sm font-bold">{formatINR(q.total_amount)}</span>
              </button>
              <div className="mt-2 overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-[1.5fr_0.4fr_0.4fr_0.5fr] gap-1 border-b border-border bg-muted/40 px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span></div>
                {q.scope_lines.map((it) => (<div key={it.id} className="grid grid-cols-[1.5fr_0.4fr_0.4fr_0.5fr] gap-1 border-b border-border px-2 py-1 text-[10px] last:border-0"><span className="truncate">{it.title}</span><span className="text-right font-mono">{it.quantity}</span><span className="text-right font-mono text-muted-foreground">{formatINR(it.rate)}</span><span className="text-right font-mono font-semibold">{formatINR(it.amount)}</span></div>))}
              </div>
            </div>))}
        </div>
      </div>);
    }
    if (submodule === "quotationPrintExport") {
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Printer className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Print / Export</h2><p className="text-xs text-muted-foreground">Generate PDF or print quotations for customers</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Quotations" value={db.quotations.length} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Ready to print" value={db.quotations.filter((q) => q.status !== "draft").length} tone="success" icon={<Printer className="h-4 w-4"/>}/>
          <MetricCard label="Drafts" value={db.quotations.filter((q) => q.status === "draft").length} tone="warning" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Total value" value={formatINRShort(db.quotations.reduce((n, q) => n + q.total_amount, 0))} tone="default" icon={<DollarSign className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {db.quotations.map((q) => (<div key={q.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5"><Avatar name={(q.customer_name || "Customer")} size={36}/><div><p className="text-sm font-bold">{q.quotation_no}</p><p className="text-[11px] text-muted-foreground">{(q.customer_name || "Customer")} · {formatINR(q.total_amount)}</p></div></div>
                <StatusBadge label={titleCase(q.status)} className={q.status === "accepted" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20"}/>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => { openDetail("quotation", q.id); setTimeout(() => window.print(), 500); }}><Printer className="mr-1 h-3.5 w-3.5"/> Print</Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => { openDetail("quotation", q.id); }}><FileText className="mr-1 h-3.5 w-3.5"/> Open</Button>
              </div>
            </div>))}
        </div>
      </div>);
    }
    return null;
}
export function MastersExtrasModule({ submodule }: {
    submodule: string;
}) {
    const db = useRDashStore((s) => s.db);
    if (submodule === "rateConfig" || submodule === "workOptions" || submodule === "customerRateSuggestions") {
        return <RateConfigView db={db}/>;
    }
    if (submodule === "contractorReferralIncome") {
        const referrals = db.workOrders.filter((j) => j.contractor_id).map((j) => {
            const contractor = db.master.contractors.find((c) => c.id === j.contractor_id);
            const referralFee = Math.round(j.value * 0.02);
            return { workOrder: j, contractor, referralFee };
        });
        const totalIncome = referrals.reduce((n, r) => n + r.referralFee, 0);
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success"><DollarSign className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Contractor Referral Income</h2><p className="text-xs text-muted-foreground">2% referral commission on workOrders assigned to contractors</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Work Orders with contractor" value={referrals.length} tone="primary" icon={<Layers className="h-4 w-4"/>}/>
          <MetricCard label="Total workOrder value" value={formatINRShort(referrals.reduce((n, r) => n + r.workOrder.value, 0))} tone="default" icon={<DollarSign className="h-4 w-4"/>}/>
          <MetricCard label="Referral income" value={formatINR(totalIncome)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
          <MetricCard label="Avg per workOrder" value={formatINRShort(referrals.length ? totalIncome / referrals.length : 0)} tone="warning" icon={<DollarSign className="h-4 w-4"/>}/>
        </div>
        <div className="space-y-2">
          {referrals.map(({ workOrder, contractor, referralFee }) => (<div key={workOrder.id} className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
              <Avatar name={(workOrder.customer_name || "Customer")} size={32}/>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{workOrder.work_order_no} · {(workOrder.customer_name || "Customer")}</p><p className="text-[10px] text-muted-foreground">Contractor: {contractor?.name} · WorkOrder value: {formatINR(workOrder.value)}</p></div>
              <div className="text-right"><p className="font-mono text-sm font-bold text-success">{formatINR(referralFee)}</p><p className="text-[9px] text-muted-foreground">2% referral</p></div>
            </div>))}
        </div>
      </div>);
    }
    return null;
}
function RequestsView({ reqs, customers, openDetail, filterPresets, }: {
    reqs: import("@/lib/rdash/types").WorkRequired[];
    customers: import("@/lib/rdash/types").Customer[];
    openDetail: (kind: DetailPanelKind, id: string) => void;
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
}) {
    const presets: import("@/lib/rdash/modules").FilterPreset[] = filterPresets && filterPresets.length > 0
        ? filterPresets
        : [
            { id: "all", label: "All", filter: {} },
            { id: "active", label: "Active", filter: { req_status: "active" } },
            { id: "accepted", label: "Won", filter: { req_status: "accepted" } },
            { id: "lost", label: "Lost", filter: { req_status: "lost" } },
        ];
    const [presetIdx, setPresetIdx] = React.useState(0);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const activeStatus = presets[presetIdx]?.filter.req_status;
    const filtered = !activeStatus
        ? reqs
        : activeStatus === "active"
            ? reqs.filter((r) => !["accepted", "lost"].includes(r.status))
            : reqs.filter((r) => r.status === activeStatus);
    const handlePresetChange = (i: number) => {
        setPresetIdx(i);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        if (view.presetId) {
            const idx = presets.findIndex((p) => p.id === view.presetId);
            if (idx >= 0)
                setPresetIdx(idx);
        }
        setActiveSavedViewId(view.id);
    };
    const countFor = (status: string) => !status ? reqs.length : status === "active" ? reqs.filter((r) => !["accepted", "lost"].includes(r.status)).length : reqs.filter((r) => r.status === status).length;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Requests</h2><p className="text-xs text-muted-foreground">All customer workRequired with status tracking · {filtered.length} shown</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total" value={reqs.length} tone="primary" icon={<ClipboardList className="h-4 w-4"/>}/>
        <MetricCard label="Won" value={reqs.filter((r) => r.status === "accepted").length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Active" value={reqs.filter((r) => !["accepted", "lost"].includes(r.status)).length} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(reqs.reduce((n, r) => n + (r.budget || 0), 0))} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      <section aria-label="Request status filters" className="flex flex-wrap items-center gap-1.5">
        {presets.map((p, i) => {
            const active = i === presetIdx;
            return (<button key={p.id} type="button" role="tab" aria-selected={active} onClick={() => handlePresetChange(i)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {p.label}
              <span className={cn("ml-1.5 rounded px-1 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted")}>
                {countFor(p.filter.req_status || "")}
              </span>
            </button>);
        })}
      </section>
      <SavedViewsBar workspaceKey="requests" presets={presets} currentPresetId={presets[presetIdx]?.id} currentSearch="" currentExtra={activeStatus ? { req_status: activeStatus } : undefined} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>
      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {filtered.length === 0 ? (<div className="col-span-full rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-4 py-10 text-center text-sm text-muted-foreground">No requests match this filter.</div>) : (filtered.map((r) => {
            const customer = customers.find((p) => p.id === r.customer_id);
            const st = workRequiredStatusStyle(r.status);
            return (<button key={r.id} type="button" onClick={() => customer && openDetail("customer", customer.id)} className="group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-card hover:to-accent/30 hover:shadow-soft">
                <Avatar name={customer?.name || "?"} size={36}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{customer?.name} · {r.source}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {r.budget && <span className="font-mono font-semibold text-foreground/80">{formatINR(r.budget)}</span>}
                    <span>· {relativeDay(r.created_at)}</span>
                  </div>
                </div>
                <StatusBadge label={st.label} className={st.className}/>
              </button>);
        }))}
      </div>
    </div>);
}
function RateConfigView({ db }: {
    db: import("@/lib/rdash/types").RDashDatabase;
}) {
    const [tab, setTab] = React.useState<"options" | "suggestions">("options");
    const groups = [
        { id: "wog-1", name: "Finish Type", values: ["Glossy", "Matte", "Texture", "Laminate"] },
        { id: "wog-2", name: "Hardware Brand", values: ["Hettich", "Hafele", "EBCO", "Godrej"] },
        { id: "wog-3", name: "Plywood Grade", values: ["BWP (Marine)", "BWR (Exterior)", "MR (Commercial)"] },
        { id: "wog-4", name: "Shutter Material", values: ["Acrylic", "PU Paint", "Membrane", "Veneer"] },
    ];
    const suggestions = db.master.articles.map((a) => ({
        article: a,
        suggestedRate: Math.round((a.base_rate || 0) * 1.1),
        variance: 10,
    }));
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {tab === "options" ? <Settings className="h-5 w-5"/> : <DollarSign className="h-5 w-5"/>}
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Rate Configuration</h2>
          <p className="text-xs text-muted-foreground">
            {tab === "options"
            ? "Configurable option groups for quotation line items"
            : "Suggested customer-facing rates (base + margin)"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Rate config view">
        <button type="button" role="tab" aria-selected={tab === "options"} onClick={() => setTab("options")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", tab === "options"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
          <Settings className="mr-1 inline h-3 w-3"/> Work Options
        </button>
        <button type="button" role="tab" aria-selected={tab === "suggestions"} onClick={() => setTab("suggestions")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", tab === "suggestions"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
          <DollarSign className="mr-1 inline h-3 w-3"/> Rate Suggestions
        </button>
      </div>
      {tab === "options" && (<>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Groups" value={groups.length} tone="primary" icon={<Settings className="h-4 w-4"/>}/>
            <MetricCard label="Total values" value={groups.reduce((n, g) => n + g.values.length, 0)} tone="default" icon={<Layers className="h-4 w-4"/>}/>
            <MetricCard label="Avg values/group" value={Math.round(groups.reduce((n, g) => n + g.values.length, 0) / groups.length)} tone="warning" icon={<Layers className="h-4 w-4"/>}/>
            <MetricCard label="Categories" value={db.master.workCategories.length} tone="default" icon={<Layers className="h-4 w-4"/>}/>
          </div>
          <div className="rd-stagger grid gap-3 lg:grid-cols-2">
            {groups.map((g) => (<div key={g.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <p className="text-sm font-bold">{g.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.values.map((v) => (<span key={v} className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium">{v}</span>))}
                </div>
              </div>))}
          </div>
        </>)}
      {tab === "suggestions" && (<>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Articles" value={suggestions.length} tone="primary" icon={<Layers className="h-4 w-4"/>}/>
            <MetricCard label="Avg base rate" value={formatINRShort(suggestions.length ? suggestions.reduce((n, s) => n + (s.article.base_rate || 0), 0) / suggestions.length : 0)} tone="default" icon={<DollarSign className="h-4 w-4"/>}/>
            <MetricCard label="Avg suggested" value={formatINRShort(suggestions.length ? suggestions.reduce((n, s) => n + s.suggestedRate, 0) / suggestions.length : 0)} tone="success" icon={<TrendingDown className="h-4 w-4"/>}/>
            <MetricCard label="Margin" value="+10%" tone="warning" icon={<DollarSign className="h-4 w-4"/>}/>
          </div>
          <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
            <div className="grid grid-cols-[1.5fr_0.5fr_0.5fr_0.3fr] gap-2 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-bold uppercase text-muted-foreground">
              <span>Article</span><span className="text-right">Base</span><span className="text-right">Suggested</span><span className="text-right">+%</span>
            </div>
            {suggestions.map((s) => (<div key={s.article.id} className="grid grid-cols-[1.5fr_0.5fr_0.5fr_0.3fr] gap-2 border-b border-border px-4 py-2.5 text-sm last:border-0 hover:bg-accent/20">
                <span className="truncate font-medium">{s.article.name}</span>
                <span className="text-right font-mono text-muted-foreground">{formatINR(s.article.base_rate || 0)}</span>
                <span className="text-right font-mono font-bold text-success">{formatINR(s.suggestedRate)}</span>
                <span className="text-right font-mono text-warning">+{s.variance}%</span>
              </div>))}
          </div>
        </>)}
    </div>);
}
