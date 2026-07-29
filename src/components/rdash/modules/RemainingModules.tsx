"use client";

import * as React from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  Layers,
  ListChecks,
  MapPin,
  Plus,
  Printer,
  ShieldCheck,
  TrendingDown,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isDateOnlyOverdue } from "@/lib/rdash/date";
import {
  formatDate,
  formatINR,
  formatINRShort,
  relativeDay,
  taskStatusStyle,
  titleCase,
  visitStatusStyle,
  workRequiredStatusStyle,
} from "@/lib/rdash/format";
import {
  calculateQuotationMetrics,
  calculateSalesPipelineMetrics,
  collectWonWorkRequiredIds,
  isOpenSalesStatus,
  isWonSalesStatus,
} from "@/lib/rdash/metrics";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import type { DetailPanelKind } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";

export function ApprovalsModule() {
  const db = useRDashStore((state) => state.db);
  const resolveApproval = useRDashStore((state) => state.resolveApproval);
  const pending = db.actions.filter((action) => action.status === "pending");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Approvals</h2>
          <p className="text-xs text-muted-foreground">
            All pending decisions — POs, quotations, contractor payments, vendor bills
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Pending" value={pending.length} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="Total value" value={formatINRShort(pending.reduce((sum, action) => sum + (action.amount || 0), 0))} tone="primary" icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="PO approvals" value={pending.filter((action) => action.type === "po").length} tone="default" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="Contractor pay" value={pending.filter((action) => action.type === "contractor_payment").length} tone="destructive" icon={<DollarSign className="h-4 w-4" />} />
      </div>
      {pending.length === 0 ? (
        <EmptyState title="No pending approvals 🎉" icon={<CheckCircle2 className="h-8 w-8" />} />
      ) : (
        <div className="space-y-2">
          {pending.map((action) => (
            <div key={action.id} className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-warning/25 bg-card p-3 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{action.title}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{action.customer_name || "Customer"}</span>
                  {action.amount != null ? <span className="font-mono font-semibold text-foreground/80">{formatINR(action.amount)}</span> : null}
                  {action.requested_by ? <span>· by {action.requested_by}</span> : null}
                  {action.due_date ? <span>· due {relativeDay(action.due_date)}</span> : null}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 text-xs" onClick={() => {
                  try {
                    resolveApproval(action.id, "approved");
                    toast.success("Approved");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Approval blocked");
                  }
                }}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => {
                  try {
                    resolveApproval(action.id, "rejected");
                    toast.info("Rejected");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Approval blocked");
                  }
                }}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CashMarginRiskModule() {
  const db = useRDashStore((state) => state.db);
  const resolveRisk = useRDashStore((state) => state.resolveRisk);
  const risks = db.risks;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <TrendingDown className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Cash &amp; Margin Risk</h2>
          <p className="text-xs text-muted-foreground">Financial exposure — overdue payments, margin erosion, vendor risk</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total risks" value={risks.length} tone="destructive" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="Urgent" value={risks.filter((risk) => risk.severity === "urgent").length} tone="destructive" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="High" value={risks.filter((risk) => risk.severity === "high").length} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard label="Risk value" value={formatINRShort(risks.reduce((sum, risk) => sum + (risk.amount || 0), 0))} tone="destructive" icon={<DollarSign className="h-4 w-4" />} />
      </div>
      {risks.length === 0 ? (
        <EmptyState title="No active risks 🎉" icon={<CheckCircle2 className="h-8 w-8" />} />
      ) : (
        <div className="space-y-2">
          {risks.map((risk) => (
            <div key={risk.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-3 shadow-card", risk.severity === "urgent" ? "border-destructive/30" : "border-warning/25")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", risk.severity === "urgent" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-bold">{risk.title}</p>
                    <div className="flex items-center gap-2">
                      {risk.amount != null ? <span className="font-mono text-sm font-bold text-destructive">{formatINR(risk.amount)}</span> : null}
                      <StatusBadge label={titleCase(risk.severity)} className={risk.severity === "urgent" ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-warning/20 bg-warning/10 text-warning"} />
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{risk.reason}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Customer: {risk.customer_name || "Customer"}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => {
                  resolveRisk(risk.id);
                  toast.success("Risk resolved");
                }}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteVisitsModule() {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const activeStaff = db.master.staff.filter((member) => member.status === "active");
  const visits = db.visits.filter((visit) => visit.visit_type === "site_visit");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
          <div><h2 className="text-lg font-bold tracking-tight">Site Visits</h2><p className="text-xs text-muted-foreground">All site inspection and supervision visits</p></div>
        </div>
        <Button type="button" size="sm" onClick={() => openCreateDialog({ kind: "visit" })} className="h-8 gap-1.5 shadow-sm"><Plus className="h-3.5 w-3.5" />Schedule visit</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total visits" value={visits.length} tone="primary" icon={<MapPin className="h-4 w-4" />} />
        <MetricCard label="Completed" value={visits.filter((visit) => visit.status === "completed").length} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricCard label="Scheduled" value={visits.filter((visit) => visit.status === "scheduled").length} tone="warning" icon={<Calendar className="h-4 w-4" />} />
        <MetricCard label="With proof" value={visits.filter((visit) => visit.proof_attachment_ids.length > 0).length} tone="default" icon={<FileText className="h-4 w-4" />} />
      </div>
      {visits.length === 0 ? (
        <EmptyState tone="primary" title="No site visits yet" description="Schedule site inspection and supervision visits to track field execution and capture proof." icon={<MapPin className="h-6 w-6" />} action={<Button type="button" size="sm" onClick={() => openCreateDialog({ kind: "visit" })} className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" />Schedule visit</Button>} />
      ) : (
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {visits.map((visit) => {
            const customer = db.customers.find((row) => row.id === visit.customer_id);
            const status = visitStatusStyle(visit.status);
            const unassigned = !visit.staff_id || visit.staff_name === "Unassigned";
            return (
              <div key={visit.id} className="group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
                <button type="button" onClick={() => openDetail("visit", visit.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <Avatar name={customer?.name || visit.location_name} size={36} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{customer?.name || visit.location_name}</p><p className="truncate text-[11px] text-muted-foreground">{visit.location_name} · {visit.staff_name}</p><div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{formatDate(visit.scheduled_at)}</span>{visit.proof_attachment_ids.length > 0 ? <span className="inline-flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{visit.proof_attachment_ids.length} proofs</span> : null}</div></div>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge label={status.label} className={status.className} />
                  {unassigned ? activeStaff.length > 0 ? (
                    <button type="button" onClick={() => openDetail("visit", visit.id)} className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-inset ring-warning/20 hover:bg-warning/20"><UserPlus className="h-3 w-3" />Assign staff</button>
                  ) : (
                    <button type="button" onClick={() => setActiveModule("staff")} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/20"><UserPlus className="h-3 w-3" />Add staff</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerDeskExtrasModule({ submodule, filterPresets }: { submodule: string; filterPresets?: import("@/lib/rdash/modules").FilterPreset[] }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);

  if (submodule === "requests") {
    return <RequestsView reqs={db.workRequired} customers={db.customers} quotations={db.quotations} workOrders={db.workOrders} openDetail={openDetail} filterPresets={filterPresets} />;
  }
  if (submodule === "pendingActionsCust") {
    const tasks = db.tasks.filter((task) => task.status === "todo" || task.status === "in_progress");
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning"><ListChecks className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">Pending Actions</h2><p className="text-xs text-muted-foreground">Open tasks across all customers</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Open tasks" value={tasks.length} tone="warning" icon={<ListChecks className="h-4 w-4" />} />
          <MetricCard label="Overdue" value={tasks.filter((task) => isDateOnlyOverdue(task.due_date)).length} tone="destructive" icon={<AlertTriangle className="h-4 w-4" />} />
          <MetricCard label="In progress" value={tasks.filter((task) => task.status === "in_progress").length} tone="primary" icon={<CheckCircle2 className="h-4 w-4" />} />
          <MetricCard label="Blocked" value={tasks.filter((task) => task.status === "blocked").length} tone="destructive" icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
        <div className="space-y-2">
          {tasks.map((task) => {
            const customer = db.customers.find((row) => row.id === task.customer_id);
            const status = taskStatusStyle(task.status);
            return <button key={task.id} type="button" onClick={() => openDetail("task", task.id)} className="flex w-full items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card hover:bg-accent/20"><Avatar name={customer?.name || "?"} size={32} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="text-[10px] text-muted-foreground">{customer?.name} · {task.assignee_name} · due {relativeDay(task.due_date)}</p></div><StatusBadge label={status.label} className={status.className} /></button>;
          })}
        </div>
      </div>
    );
  }
  if (submodule === "workRequiredReview") {
    const wonIds = collectWonWorkRequiredIds(db.quotations, db.workOrders);
    const requests = db.workRequired.filter((row) => isOpenSalesStatus(row.status) && !wonIds.has(row.id));
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">WorkRequired Review</h2><p className="text-xs text-muted-foreground">Active workRequired needing qualification and follow-up</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Active" value={requests.length} tone="primary" icon={<ClipboardList className="h-4 w-4" />} />
          <MetricCard label="New" value={requests.filter((row) => row.status === "new").length} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
          <MetricCard label="Quoting" value={requests.filter((row) => row.status === "quotation_in_progress" || row.status === "quotation_sent").length} tone="primary" icon={<FileText className="h-4 w-4" />} />
          <MetricCard label="Value" value={formatINRShort(requests.reduce((sum, row) => sum + (row.budget || 0), 0))} tone="default" icon={<DollarSign className="h-4 w-4" />} />
        </div>
        <div className="space-y-2">
          {requests.map((request) => {
            const customer = db.customers.find((row) => row.id === request.customer_id);
            const status = workRequiredStatusStyle(request.status);
            return <button key={request.id} type="button" onClick={() => customer && openDetail("customer", customer.id)} className="flex w-full items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card hover:bg-accent/20"><Avatar name={customer?.name || "?"} size={32} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.title}</p><div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground"><span>{customer?.name}</span><span>· {request.source}</span>{request.budget ? <span className="font-mono font-semibold text-foreground/80">· {formatINR(request.budget)}</span> : null}</div></div><StatusBadge label={status.label} className={status.className} /></button>;
          })}
        </div>
      </div>
    );
  }
  return null;
}

export function QuotationExtrasModule({ submodule }: { submodule: string }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);

  if (submodule === "workRequiredBoq") {
    const quotations = calculateQuotationMetrics(db.quotations).current;
    const totalItems = quotations.reduce((sum, quotation) => sum + quotation.scope_lines.length, 0);
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">Work Requirement BOQ</h2><p className="text-xs text-muted-foreground">Article-level material breakdown for awarded work orders</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Quotations" value={quotations.length} tone="primary" icon={<FileText className="h-4 w-4" />} /><MetricCard label="Total items" value={totalItems} tone="default" icon={<Layers className="h-4 w-4" />} /><MetricCard label="Total value" value={formatINRShort(quotations.reduce((sum, quotation) => sum + quotation.total_amount, 0))} tone="success" icon={<DollarSign className="h-4 w-4" />} /><MetricCard label="Avg items/quote" value={quotations.length ? Math.round(totalItems / quotations.length) : 0} tone="warning" icon={<Layers className="h-4 w-4" />} /></div>
        <div className="space-y-3">
          {quotations.map((quotation) => <div key={quotation.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card"><button type="button" onClick={() => openDetail("quotation", quotation.id)} className="flex w-full items-center justify-between text-left hover:text-primary"><div><p className="text-sm font-bold">{quotation.quotation_no} · {quotation.customer_name || "Customer"}</p><p className="text-[10px] text-muted-foreground">{quotation.title} · {quotation.scope_lines.length} items</p></div><span className="font-mono text-sm font-bold">{formatINR(quotation.total_amount)}</span></button><div className="mt-2 overflow-hidden rounded-md border border-border"><div className="grid grid-cols-[1.5fr_0.4fr_0.4fr_0.5fr] gap-1 border-b border-border bg-muted/40 px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span></div>{quotation.scope_lines.map((item) => <div key={item.id} className="grid grid-cols-[1.5fr_0.4fr_0.4fr_0.5fr] gap-1 border-b border-border px-2 py-1 text-[10px] last:border-0"><span className="truncate">{item.title}</span><span className="text-right font-mono">{item.quantity}</span><span className="text-right font-mono text-muted-foreground">{formatINR(item.rate)}</span><span className="text-right font-mono font-semibold">{formatINR(item.amount)}</span></div>)}</div></div>)}
        </div>
      </div>
    );
  }

  if (submodule === "quotationPrintExport") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Printer className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">Print / Export</h2><p className="text-xs text-muted-foreground">Generate PDF or print quotations for customers</p></div></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Quotations" value={db.quotations.length} tone="primary" icon={<FileText className="h-4 w-4" />} /><MetricCard label="Ready to print" value={db.quotations.filter((quotation) => quotation.status !== "draft").length} tone="success" icon={<Printer className="h-4 w-4" />} /><MetricCard label="Drafts" value={db.quotations.filter((quotation) => quotation.status === "draft").length} tone="warning" icon={<FileText className="h-4 w-4" />} /><MetricCard label="Total value" value={formatINRShort(db.quotations.reduce((sum, quotation) => sum + quotation.total_amount, 0))} tone="default" icon={<DollarSign className="h-4 w-4" />} /></div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {db.quotations.map((quotation) => <div key={quotation.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><Avatar name={quotation.customer_name || "Customer"} size={36} /><div><p className="text-sm font-bold">{quotation.quotation_no}</p><p className="text-[11px] text-muted-foreground">{quotation.customer_name || "Customer"} · {formatINR(quotation.total_amount)}</p></div></div><StatusBadge label={titleCase(quotation.status)} className={quotation.status === "accepted" ? "border-success/20 bg-success/10 text-success" : "border-primary/20 bg-primary/10 text-primary"} /></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" className="text-xs" onClick={() => { openDetail("quotation", quotation.id); setTimeout(() => window.print(), 500); }}><Printer className="mr-1 h-3.5 w-3.5" /> Print</Button><Button size="sm" variant="outline" className="text-xs" onClick={() => openDetail("quotation", quotation.id)}><FileText className="mr-1 h-3.5 w-3.5" /> Open</Button></div></div>)}
        </div>
      </div>
    );
  }
  return null;
}

function RequestsView({ reqs, customers, quotations, workOrders, openDetail, filterPresets }: {
  reqs: import("@/lib/rdash/types").WorkRequired[];
  customers: import("@/lib/rdash/types").Customer[];
  quotations: import("@/lib/rdash/types").Quotation[];
  workOrders: import("@/lib/rdash/types").WorkOrder[];
  openDetail: (kind: DetailPanelKind, id: string) => void;
  filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
}) {
  const presets = filterPresets?.length ? filterPresets : [
    { id: "all", label: "All", filter: {} },
    { id: "active", label: "Active", filter: { req_status: "active" } },
    { id: "accepted", label: "Won", filter: { req_status: "accepted" } },
    { id: "lost", label: "Lost", filter: { req_status: "lost" } },
  ];
  const [presetIndex, setPresetIndex] = React.useState(0);
  const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
  const wonIds = React.useMemo(() => collectWonWorkRequiredIds(quotations, workOrders), [quotations, workOrders]);
  const metrics = React.useMemo(() => calculateSalesPipelineMetrics(reqs, { wonWorkRequiredIds: wonIds }), [reqs, wonIds]);
  const isWon = React.useCallback((row: import("@/lib/rdash/types").WorkRequired) => isWonSalesStatus(row.status) || wonIds.has(row.id), [wonIds]);
  const isActive = React.useCallback((row: import("@/lib/rdash/types").WorkRequired) => isOpenSalesStatus(row.status) && !isWon(row), [isWon]);
  const activeStatus = presets[presetIndex]?.filter.req_status;
  const filtered = !activeStatus ? reqs : activeStatus === "active" ? reqs.filter(isActive) : activeStatus === "accepted" ? reqs.filter(isWon) : activeStatus === "lost" ? reqs.filter((row) => row.status === "lost" && !isWon(row)) : reqs.filter((row) => row.status === activeStatus);
  const countFor = (status: string) => !status ? reqs.length : status === "active" ? metrics.openCount : status === "accepted" ? metrics.wonCount : status === "lost" ? metrics.lostCount : reqs.filter((row) => row.status === status).length;
  const applySavedView = (view: SavedView) => {
    if (view.presetId) {
      const nextIndex = presets.findIndex((preset) => preset.id === view.presetId);
      if (nextIndex >= 0) setPresetIndex(nextIndex);
    }
    setActiveSavedViewId(view.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">Requests</h2><p className="text-xs text-muted-foreground">All customer workRequired with status tracking · {filtered.length} shown</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Total" value={metrics.totalLeads} tone="primary" icon={<ClipboardList className="h-4 w-4" />} /><MetricCard label="Won" value={metrics.wonCount} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} /><MetricCard label="Active" value={metrics.openCount} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} /><MetricCard label="Pipeline value" value={formatINRShort(metrics.pipelineValue)} tone="primary" icon={<DollarSign className="h-4 w-4" />} /></div>
      <section aria-label="Request status filters" className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset, index) => {
          const active = index === presetIndex;
          return <button key={preset.id} type="button" role="tab" aria-selected={active} onClick={() => { setPresetIndex(index); setActiveSavedViewId(null); }} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>{preset.label}<span className={cn("ml-1.5 rounded px-1 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted")}>{countFor(preset.filter.req_status || "")}</span></button>;
        })}
      </section>
      <SavedViewsBar workspaceKey="requests" presets={presets} currentPresetId={presets[presetIndex]?.id} currentSearch="" currentExtra={activeStatus ? { req_status: activeStatus } : undefined} onApply={applySavedView} activeSavedViewId={activeSavedViewId} />
      <div className="rd-stagger grid gap-3 lg:grid-cols-2">
        {filtered.length === 0 ? <div className="col-span-full rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-4 py-10 text-center text-sm text-muted-foreground">No requests match this filter.</div> : filtered.map((request) => {
          const customer = customers.find((row) => row.id === request.customer_id);
          const status = workRequiredStatusStyle(request.status);
          return <button key={request.id} type="button" onClick={() => customer && openDetail("customer", customer.id)} className="group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-card hover:to-accent/30 hover:shadow-soft"><Avatar name={customer?.name || "?"} size={36} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.title}</p><p className="truncate text-[11px] text-muted-foreground">{customer?.name} · {request.source}</p><div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">{request.budget ? <span className="font-mono font-semibold text-foreground/80">{formatINR(request.budget)}</span> : null}<span>· {relativeDay(request.created_at)}</span></div></div><StatusBadge label={status.label} className={status.className} /></button>;
        })}
      </div>
    </div>
  );
}
