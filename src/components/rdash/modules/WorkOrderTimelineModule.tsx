"use client";
import * as React from "react";
import {
    Calendar, HardHat, Building2, Clock, CheckCircle2, FileText, ShoppingCart,
    Package, Truck, Wrench, DollarSign, Ban, ShieldCheck, HandCoins, Gavel,
    Pencil, Camera, PhoneCall, MessageSquare, Send, MapPin, ListTodo,
    AlertTriangle, Activity, Filter, BarChart3,
} from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINRShort, formatDate, formatDateTime, relativeDay } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";
import type { AuditLogEntry } from "@/lib/rdash/types";

/**
 * Work Order Timeline — a TRUE unified timeline that aggregates events from
 * every related module for a work order: quotation, accepted scope, BOQ,
 * drawing, execution log, variation, vendor RFQ, PO, GRN, dispatch, vendor
 * bill, contractor bill, customer invoice, customer receipt, commission,
 * task, followup, thread, visit, comm send, audit log.
 *
 * Each event: {timestamp, type, label, icon, source_module, entity_id, actor, description}.
 * Sorted by timestamp desc. Rendered as a vertical timeline with filter
 * chips by event type. The original Gantt view is preserved as a secondary
 * "Schedule" tab.
 */
type TimelineEvent = {
    timestamp: string;
    type: string;            // event-type tag for filter chips
    typeLabel: string;       // human label
    label: string;           // event title
    icon: React.ReactNode;
    source_module: string;   // module id for deep-link
    entity_id?: string;
    entity_kind?: string;    // detail-panel kind
    actor?: string;
    description?: string;
};

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
    quotation: { label: "Quotation", icon: <FileText className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    acceptedScope: { label: "Accepted Scope", icon: <CheckCircle2 className="h-3.5 w-3.5"/>, tone: "bg-success/10 text-success border-success/20" },
    boq: { label: "BOQ", icon: <FileText className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    drawing: { label: "Drawing", icon: <Pencil className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    executionLog: { label: "Execution Log", icon: <Camera className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    variation: { label: "Variation", icon: <AlertTriangle className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    vendorRFQ: { label: "Vendor RFQ", icon: <ShoppingCart className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    purchaseOrder: { label: "Purchase Order", icon: <ShoppingCart className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    grn: { label: "GRN", icon: <Package className="h-3.5 w-3.5"/>, tone: "bg-success/10 text-success border-success/20" },
    dispatch: { label: "Dispatch", icon: <Truck className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    vendorBill: { label: "Vendor Bill", icon: <FileText className="h-3.5 w-3.5"/>, tone: "bg-destructive/10 text-destructive border-destructive/20" },
    contractorBill: { label: "Contractor Bill", icon: <HardHat className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    customerInvoice: { label: "Invoice", icon: <FileText className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    customerReceipt: { label: "Receipt", icon: <HandCoins className="h-3.5 w-3.5"/>, tone: "bg-success/10 text-success border-success/20" },
    commission: { label: "Commission", icon: <HandCoins className="h-3.5 w-3.5"/>, tone: "bg-success/10 text-success border-success/20" },
    task: { label: "Task", icon: <ListTodo className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    followup: { label: "Follow-up", icon: <PhoneCall className="h-3.5 w-3.5"/>, tone: "bg-warning/10 text-warning border-warning/20" },
    thread: { label: "Thread", icon: <MessageSquare className="h-3.5 w-3.5"/>, tone: "bg-muted text-muted-foreground border-border" },
    visit: { label: "Visit", icon: <MapPin className="h-3.5 w-3.5"/>, tone: "bg-primary/10 text-primary border-primary/20" },
    comm: { label: "Communication", icon: <Send className="h-3.5 w-3.5"/>, tone: "bg-success/10 text-success border-success/20" },
    audit: { label: "Audit", icon: <Activity className="h-3.5 w-3.5"/>, tone: "bg-muted text-muted-foreground border-border" },
};

export function WorkOrderTimelineModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const setReportFilter = useRDashStore((s) => s.setReportFilter);
    const [tab, setTab] = React.useState<"timeline" | "schedule">("timeline");
    const [selectedWoId, setSelectedWoId] = React.useState<string>("");
    const [activeTypes, setActiveTypes] = React.useState<Set<string>>(new Set());

    const activeWorkOrders = React.useMemo(() => {
        return (db.workOrders || []).filter((wo: any) => wo.status !== "cancelled" && wo.status !== "abandoned");
    }, [db.workOrders]);

    React.useEffect(() => {
        if (!selectedWoId && activeWorkOrders.length > 0) {
            setSelectedWoId(activeWorkOrders[0].id);
        }
    }, [selectedWoId, activeWorkOrders]);

    const workOrder = db.workOrders.find((wo: any) => wo.id === selectedWoId) || activeWorkOrders[0];

    // Build the merged event feed for the selected work order.
    const events: TimelineEvent[] = React.useMemo(() => {
        if (!workOrder) return [];
        const woId = workOrder.id;
        const out: TimelineEvent[] = [];

        // Quotation events
        db.quotations.filter((q: any) => q.work_order_id === woId || (workOrder.quotation_ids || []).includes(q.id))
            .forEach((q: any) => {
                out.push({ timestamp: q.created_at, type: "quotation", typeLabel: TYPE_META.quotation.label, label: `Quotation ${q.quotation_no} created`, icon: TYPE_META.quotation.icon, source_module: "quotationDesk", entity_id: q.id, entity_kind: "quotation", actor: q.created_by, description: q.subject || `Total ${formatINRShort(q.total_amount)}` });
                if (q.status === "accepted" && q.accepted_at) {
                    out.push({ timestamp: q.accepted_at, type: "quotation", typeLabel: "Quotation accepted", label: `Quotation ${q.quotation_no} accepted`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "quotationDesk", entity_id: q.id, entity_kind: "quotation", actor: q.accepted_by, description: `Accepted value ${formatINRShort(q.total_amount)}` });
                }
            });

        // Accepted scope events
        (workOrder.accepted_scope_ids || []).forEach((scopeId: string) => {
            const scope = db.acceptedScopes.find((s: any) => s.id === scopeId);
            if (!scope) return;
            out.push({ timestamp: scope.accepted_at || scope.created_at || workOrder.created_at, type: "acceptedScope", typeLabel: TYPE_META.acceptedScope.label, label: `Scope accepted: ${scope.title || scope.id}`, icon: TYPE_META.acceptedScope.icon, source_module: "siteExecution", entity_kind: "workOrder", entity_id: woId, description: scope.notes });
        });

        // BOQ events
        db.boqs.filter((b: any) => b.work_order_id === woId).forEach((b: any) => {
            out.push({ timestamp: b.created_at, type: "boq", typeLabel: TYPE_META.boq.label, label: `BOQ ${b.boq_no || b.id} created`, icon: TYPE_META.boq.icon, source_module: "boq", entity_kind: "boq", entity_id: b.id, description: `Total ${formatINRShort(b.total_amount)}` });
            if (b.status === "approved" && b.approved_at) {
                out.push({ timestamp: b.approved_at, type: "boq", typeLabel: "BOQ approved", label: `BOQ ${b.boq_no || b.id} approved`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "boq", entity_kind: "boq", entity_id: b.id, actor: b.approved_by });
            }
        });

        // Drawing events
        db.drawings.filter((d: any) => d.work_order_id === woId).forEach((d: any) => {
            out.push({ timestamp: d.uploaded_at || d.created_at, type: "drawing", typeLabel: TYPE_META.drawing.label, label: `Drawing ${d.drawing_no} uploaded`, icon: TYPE_META.drawing.icon, source_module: "drawings", entity_kind: "drawing" as any, entity_id: d.id, actor: d.uploaded_by, description: `${d.kind} · v${d.version} · ${d.title}` });
            if (d.status === "approved" && d.approved_at) {
                out.push({ timestamp: d.approved_at, type: "drawing", typeLabel: "Drawing approved", label: `Drawing ${d.drawing_no} approved`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "drawings", entity_id: d.id, actor: d.approved_by });
            }
        });

        // Execution log events
        db.executionLogs.filter((l: any) => l.work_order_id === woId).forEach((l: any) => {
            out.push({ timestamp: l.created_at, type: "executionLog", typeLabel: TYPE_META.executionLog.label, label: `Execution log ${l.log_no} filed`, icon: TYPE_META.executionLog.icon, source_module: "executionLogs", entity_kind: "execution_log" as any, entity_id: l.id, actor: l.filed_by, description: `${l.progress_pct}% progress${l.progress_delta ? ` (+${l.progress_delta}%)` : ""}${l.site_condition ? ` · ${l.site_condition}` : ""}` });
        });

        // Variation events
        db.variationRequests.filter((v: any) => v.work_order_id === woId).forEach((v: any) => {
            out.push({ timestamp: v.requested_at, type: "variation", typeLabel: "Variation submitted", label: `Variation ${v.variation_no} requested`, icon: TYPE_META.variation.icon, source_module: "siteExecution", entity_id: v.id, actor: v.requested_by, description: `${v.title} · ${formatINRShort(v.requested_amount)}` });
            if (v.status === "approved" && v.decided_at) {
                out.push({ timestamp: v.decided_at, type: "variation", typeLabel: "Variation approved", label: `Variation ${v.variation_no} approved`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "siteExecution", entity_id: v.id, actor: v.decided_by });
            }
            else if (v.status === "rejected" && v.decided_at) {
                out.push({ timestamp: v.decided_at, type: "variation", typeLabel: "Variation rejected", label: `Variation ${v.variation_no} rejected`, icon: <Ban className="h-3.5 w-3.5"/>, source_module: "siteExecution", entity_id: v.id, actor: v.decided_by, description: v.decision_note });
            }
        });

        // Vendor RFQ events
        db.vendorRfqs.filter((r: any) => r.work_order_id === woId).forEach((r: any) => {
            out.push({ timestamp: r.created_at, type: "vendorRFQ", typeLabel: TYPE_META.vendorRFQ.label, label: `Vendor RFQ ${r.rfq_no} created`, icon: TYPE_META.vendorRFQ.icon, source_module: "procurementInventory", description: `${r.vendor_ids?.length || 0} vendors invited` });
        });

        // Purchase order events
        db.purchaseOrders.filter((p: any) => p.work_order_id === woId).forEach((p: any) => {
            out.push({ timestamp: p.created_at, type: "purchaseOrder", typeLabel: TYPE_META.purchaseOrder.label, label: `PO ${p.po_no} created`, icon: TYPE_META.purchaseOrder.icon, source_module: "procurementInventory", entity_kind: "po", entity_id: p.id, description: `${p.vendor_name} · ${formatINRShort(p.total_amount)}` });
            if (p.status === "approved" && p.approved_at) {
                out.push({ timestamp: p.approved_at, type: "purchaseOrder", typeLabel: "PO approved", label: `PO ${p.po_no} approved`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "procurementInventory", entity_kind: "po", entity_id: p.id, actor: p.approved_by });
            }
            if (p.actual_delivery) {
                out.push({ timestamp: p.actual_delivery, type: "purchaseOrder", typeLabel: "PO delivered", label: `PO ${p.po_no} delivered`, icon: <Truck className="h-3.5 w-3.5"/>, source_module: "procurementInventory", entity_kind: "po", entity_id: p.id });
            }
        });

        // GRN events
        db.grns.filter((g: any) => g.work_order_id === woId).forEach((g: any) => {
            out.push({ timestamp: g.received_at || g.created_at, type: "grn", typeLabel: TYPE_META.grn.label, label: `GRN ${g.grn_no} received`, icon: TYPE_META.grn.icon, source_module: "grn", entity_kind: "grn", entity_id: g.id, actor: g.received_by, description: `${g.vendor_name} · ${g.items?.length || 0} items` });
        });

        // Dispatch events
        db.dispatches.filter((d: any) => d.work_order_id === woId).forEach((d: any) => {
            out.push({ timestamp: d.issued_at || d.created_at, type: "dispatch", typeLabel: TYPE_META.dispatch.label, label: `Dispatch ${d.dispatch_no} issued`, icon: TYPE_META.dispatch.icon, source_module: "dispatch", entity_kind: "dispatch", entity_id: d.id, actor: d.issued_by, description: `${d.items?.length || 0} items to site` });
        });

        // Vendor bill events
        db.vendorBills.filter((b: any) => b.work_order_id === woId).forEach((b: any) => {
            out.push({ timestamp: b.created_at, type: "vendorBill", typeLabel: TYPE_META.vendorBill.label, label: `Vendor bill ${b.bill_no} recorded`, icon: TYPE_META.vendorBill.icon, source_module: "vendorBills", entity_kind: "vendorBill", entity_id: b.id, description: `${b.vendor_name} · ${formatINRShort(b.total_amount)}` });
        });

        // Contractor bill events
        db.contractorBills.filter((b: any) => b.work_order_id === woId).forEach((b: any) => {
            out.push({ timestamp: b.created_at, type: "contractorBill", typeLabel: TYPE_META.contractorBill.label, label: `Contractor bill ${b.bill_no} submitted`, icon: TYPE_META.contractorBill.icon, source_module: "contractorPayments", entity_kind: "vendorBill" as any, entity_id: b.id, description: `${b.contractor_name} · ${formatINRShort(b.amount)} · ${b.progress_pct}%` });
        });

        // Customer invoice events
        db.invoices.filter((i: any) => i.work_order_id === woId).forEach((i: any) => {
            out.push({ timestamp: i.created_at || i.issued_at || workOrder.created_at, type: "customerInvoice", typeLabel: TYPE_META.customerInvoice.label, label: `Invoice ${i.invoice_no} issued`, icon: TYPE_META.customerInvoice.icon, source_module: "invoices", entity_kind: "invoice", entity_id: i.id, description: `${formatINRShort(i.amount)}` });
        });

        // Customer receipt events
        db.customerReceipts.filter((r: any) => r.work_order_id === woId).forEach((r: any) => {
            out.push({ timestamp: r.received_at || r.created_at, type: "customerReceipt", typeLabel: TYPE_META.customerReceipt.label, label: `Payment received ${formatINRShort(r.amount)}`, icon: TYPE_META.customerReceipt.icon, source_module: "payments", entity_kind: "payment" as any, entity_id: r.payment_id, description: `${r.mode || ""} ${r.reference || ""}` });
        });

        // Commission events
        db.commissions.filter((c: any) => c.work_order_id === woId).forEach((c: any) => {
            out.push({ timestamp: c.accrued_at || c.created_at, type: "commission", typeLabel: TYPE_META.commission.label, label: `Commission ${c.commission_no} accrued`, icon: TYPE_META.commission.icon, source_module: "commissions", entity_kind: "commission", entity_id: c.id, description: `${c.source_partner_name} · ${formatINRShort(c.amount)} @ ${c.rate_pct}%` });
        });

        // Task events
        db.tasks.filter((t: any) => t.work_order_id === woId).forEach((t: any) => {
            out.push({ timestamp: t.created_at, type: "task", typeLabel: TYPE_META.task.label, label: `Task created: ${t.title}`, icon: TYPE_META.task.icon, source_module: "tasks", entity_kind: "task", entity_id: t.id, actor: t.assignee_name, description: `Due ${t.due_date} · ${t.status}` });
            if (t.status === "completed" && t.completed_at) {
                out.push({ timestamp: t.completed_at, type: "task", typeLabel: "Task completed", label: `Task completed: ${t.title}`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "tasks", entity_kind: "task", entity_id: t.id, actor: t.completed_by });
            }
        });

        // Follow-up events
        db.followups.filter((f: any) => f.work_order_id === woId || (workOrder as any).followup_ids?.includes(f.id)).forEach((f: any) => {
            out.push({ timestamp: f.created_at, type: "followup", typeLabel: TYPE_META.followup.label, label: `Follow-up: ${f.title}`, icon: TYPE_META.followup.icon, source_module: "tasks", entity_kind: "followup", entity_id: f.id, actor: f.assigned_to, description: `Due ${f.due_date}` });
            if (f.status === "completed" && f.completed_at) {
                out.push({ timestamp: f.completed_at, type: "followup", typeLabel: "Follow-up completed", label: `Follow-up closed: ${f.title}`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "tasks", entity_kind: "followup", entity_id: f.id, actor: f.completed_by, description: `Outcome: ${f.outcome || "—"}` });
            }
        });

        // Visit events
        db.visits.filter((v: any) => v.work_order_id === woId).forEach((v: any) => {
            out.push({ timestamp: v.scheduled_at, type: "visit", typeLabel: TYPE_META.visit.label, label: `Visit scheduled: ${v.location_name}`, icon: TYPE_META.visit.icon, source_module: "fieldOperations", entity_kind: "visit", entity_id: v.id, description: `${v.visit_type} · ${v.staff_name || v.contractor_name || "Unassigned"}` });
            if (v.check_in_at) {
                out.push({ timestamp: v.check_in_at, type: "visit", typeLabel: "Visit check-in", label: `Checked in at ${v.location_name}`, icon: <MapPin className="h-3.5 w-3.5"/>, source_module: "fieldOperations", entity_kind: "visit", entity_id: v.id, actor: v.staff_name });
            }
            if (v.check_out_at) {
                out.push({ timestamp: v.check_out_at, type: "visit", typeLabel: "Visit check-out", label: `Checked out at ${v.location_name}`, icon: <CheckCircle2 className="h-3.5 w-3.5"/>, source_module: "fieldOperations", entity_kind: "visit", entity_id: v.id, actor: v.staff_name, description: v.dwell_minutes ? `Dwell ${v.dwell_minutes}m` : undefined });
            }
        });

        // Comm send events
        db.commSends.filter((c: any) => c.work_order_id === woId).forEach((c: any) => {
            out.push({ timestamp: c.sent_at, type: "comm", typeLabel: TYPE_META.comm.label, label: `${c.channel} sent: ${c.subject}`, icon: TYPE_META.comm.icon, source_module: "communicationCentre", entity_kind: "customer", entity_id: c.customer_id, actor: c.staff_name, description: c.body });
        });

        // Thread messages — for the work order thread + any thread whose record_id == woId
        const woThreads = db.threads.filter((t: any) => (t.kind === "workOrder" && t.record_id === woId) || (t.kind === "execution_log" && db.executionLogs.some((l: any) => l.id === t.record_id && l.work_order_id === woId)) || (t.kind === "drawing" && db.drawings.some((d: any) => d.id === t.record_id && d.work_order_id === woId)));
        woThreads.forEach((t: any) => {
            t.messages.forEach((m: any) => {
                out.push({ timestamp: m.created_at, type: "thread", typeLabel: TYPE_META.thread.label, label: `Thread: ${m.body?.slice(0, 80) || ""}`, icon: TYPE_META.thread.icon, source_module: "threads", entity_kind: "workOrder", entity_id: woId, actor: m.author_name, description: `${t.title} · ${m.kind || "comment"}` });
            });
        });

        // Audit log entries that reference this work order (as primary or cross-post)
        db.auditLog.filter((a: AuditLogEntry) => a.entity_id === woId || (a.entity_type === "workOrder" && a.entity_id === woId)).forEach((a: AuditLogEntry) => {
            out.push({ timestamp: a.timestamp, type: "audit", typeLabel: TYPE_META.audit.label, label: a.action, icon: TYPE_META.audit.icon, source_module: "auditLog", entity_kind: "audit" as any, entity_id: a.id, actor: a.actor, description: a.entity_label });
        });

        return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [db, workOrder]);

    const filteredEvents = React.useMemo(() => {
        if (activeTypes.size === 0) return events;
        return events.filter((e) => activeTypes.has(e.type));
    }, [events, activeTypes]);

    const typeCounts = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const e of events) m.set(e.type, (m.get(e.type) || 0) + 1);
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [events]);

    const toggleType = (type: string) => setActiveTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
    });

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20">
            <Calendar className="h-4 w-4"/>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Work Order Timeline</h2>
            <p className="text-xs text-muted-foreground">Unified event feed across every module — quotations, BOQ, drawings, execution, procurement, finance, visits, threads.</p>
          </div>
        </div>
        {/* Tabs: Timeline / Schedule */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-0.5 text-xs">
          <button type="button" onClick={() => setTab("timeline")} className={cn("rounded-full px-3 py-1 font-semibold transition-colors", tab === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Timeline</button>
          <button type="button" onClick={() => setTab("schedule")} className={cn("rounded-full px-3 py-1 font-semibold transition-colors", tab === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Schedule</button>
        </div>
      </div>

      {/* Work-order picker */}
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Work order</label>
            <select value={selectedWoId} onChange={(e) => setSelectedWoId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              {activeWorkOrders.length === 0 && <option value="">No active work orders</option>}
              {activeWorkOrders.map((wo: any) => <option key={wo.id} value={wo.id}>{wo.work_order_no} · {wo.title}</option>)}
            </select>
          </div>
          {/* I: Deep-link to P&L report for the selected work order. */}
          {workOrder && (
            <button
              type="button"
              onClick={() => { setReportFilter({ reportId: "jobPnlReport", workOrderId: workOrder.id }); setActiveModule("jobPnlReport"); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              title="Open the P&L report filtered to this work order"
            >
              <BarChart3 className="h-3.5 w-3.5"/> View P&L report
            </button>
          )}
        </div>
      </section>

      {tab === "timeline" ? (<>
        {/* Summary stats */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-center">
            <p className="text-2xl font-bold text-primary">{events.length}</p>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total events</p>
          </div>
          <div className="rounded-lg border border-success/20 bg-success/[0.04] p-3 text-center">
            <p className="text-2xl font-bold text-success">{events.filter((e) => e.typeLabel.includes("approved") || e.typeLabel.includes("accepted") || e.typeLabel.includes("completed")).length}</p>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Completed / Approved</p>
          </div>
          <div className="rounded-lg border border-warning/20 bg-warning/[0.04] p-3 text-center">
            <p className="text-2xl font-bold text-warning">{events.filter((e) => relativeDay(e.timestamp) === "Today").length}</p>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Today</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{typeCounts.length}</p>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Event types</p>
          </div>
        </section>

        {/* Filter chips */}
        <section className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><Filter className="h-3 w-3"/> Filter</span>
          {typeCounts.map(([type, count]) => {
            const meta = TYPE_META[type] || { label: type, icon: <Activity className="h-3 w-3"/>, tone: "bg-muted text-muted-foreground border-border" };
            const active = activeTypes.has(type);
            return (
              <button key={type} type="button" onClick={() => toggleType(type)} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors", active ? meta.tone : "border-border bg-card text-muted-foreground hover:bg-accent/50")}>
                {meta.icon} {meta.label} <span className="rounded-full bg-background/70 px-1 text-[9px]">{count}</span>
              </button>
            );
          })}
          {activeTypes.size > 0 && <button type="button" onClick={() => setActiveTypes(new Set())} className="text-[10px] font-medium text-primary hover:underline">Clear</button>}
        </section>

        {/* Timeline */}
        <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="text-sm font-bold">Event feed {workOrder ? `· ${workOrder.work_order_no}` : ""}</h3>
            <p className="text-xs text-muted-foreground">{filteredEvents.length} of {events.length} events · click any event to open the source record</p>
          </div>
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/30"/>
              <p className="mt-2 text-sm text-muted-foreground">{events.length === 0 ? "No events yet for this work order." : "No events match the active filters."}</p>
            </div>
          ) : (
            <ol className="relative px-4 py-3">
              {/* Vertical line */}
              <span className="absolute left-9 top-3 bottom-3 w-px bg-border" aria-hidden />
              {filteredEvents.slice(0, 200).map((e, idx) => {
                const meta = TYPE_META[e.type] || { label: e.type, icon: <Activity className="h-3 w-3"/>, tone: "bg-muted text-muted-foreground border-border" };
                const clickable = !!e.entity_kind && !!e.entity_id;
                return (
                  <li key={idx} className="relative flex gap-3 pb-3">
                    <span className={cn("z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card", meta.tone)}>{e.icon}</span>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && e.entity_kind && e.entity_id && openDetail(e.entity_kind as any, e.entity_id, "woTimeline")}
                      className={cn("min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-left transition-colors", clickable ? "hover:border-border hover:bg-accent/30" : "cursor-default")}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{e.label}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground" title={formatDateTime(e.timestamp)}>{relativeDay(e.timestamp)}</span>
                      </div>
                      {e.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{e.description}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span className={cn("rounded px-1 py-0.5 font-semibold", meta.tone)}>{e.typeLabel}</span>
                        {e.actor && <span>· {e.actor}</span>}
                        {e.timestamp && <span>· {formatDate(e.timestamp)}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
              {filteredEvents.length > 200 && (
                <p className="ml-9 text-[10px] text-muted-foreground">Showing first 200 events · refine filters to narrow further.</p>
              )}
            </ol>
          )}
        </section>
      </>) : (
        <ScheduleGantt />
      )}
    </div>);
}

/**
 * ScheduleGantt — the original Gantt view, preserved as the secondary
 * "Schedule" tab. Extracted verbatim from the previous module body so the
 * schedule visualization is still reachable.
 */
function ScheduleGantt() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const { workOrders, dateRange, totalDays } = React.useMemo(() => {
        const allWOs = (db.workOrders || []).filter((wo: any) => wo.status !== "cancelled" && wo.status !== "abandoned");
        if (!allWOs.length) return { workOrders: [], dateRange: null, totalDays: 0 };
        const dates: string[] = [];
        allWOs.forEach((wo: any) => {
            if (wo.start_date) dates.push(wo.start_date);
            if (wo.expected_end) dates.push(wo.expected_end);
            if (wo.actual_end) dates.push(wo.actual_end);
        });
        if (!dates.length) {
            const today = new Date().toISOString().slice(0, 10);
            dates.push(today);
        }
        const minDate = dates.sort()[0];
        const maxDate = dates.sort().reverse()[0];
        const min = new Date(minDate);
        const max = new Date(maxDate);
        min.setDate(min.getDate() - 3);
        max.setDate(max.getDate() + 3);
        const totalMs = max.getTime() - min.getTime();
        const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
        return { workOrders: allWOs, dateRange: { min, max }, totalDays };
    }, [db]);

    const statusColors: Record<string, string> = {
        scheduled: "bg-primary/70 border-primary",
        in_progress: "bg-warning/70 border-warning",
        on_hold: "bg-muted/50 border-muted-foreground/30",
        completed: "bg-success/70 border-success",
    };
    const axisLabels: Array<{ label: string; pct: number }> = [];
    if (dateRange) {
        const numLabels = Math.min(8, totalDays);
        for (let i = 0; i <= numLabels; i++) {
            const d = new Date(dateRange.min);
            d.setDate(d.getDate() + Math.round((totalDays * i) / numLabels));
            const pct = (i / numLabels) * 100;
            axisLabels.push({ label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), pct });
        }
    }

    return (<section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-bold">Schedule (Gantt)</h3>
        <p className="text-xs text-muted-foreground">Click a work order bar to open its detail</p>
      </div>
      {workOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/30"/>
          <p className="mt-2 text-sm text-muted-foreground">No active work orders.</p>
        </div>
      ) : (
        <div className="p-4">
          <div className="relative mb-2 ml-48 h-5 border-b border-border">
            {axisLabels.map((axis, i) => (
              <div key={i} className="absolute top-0 -translate-x-1/2 text-[9px] font-medium text-muted-foreground" style={{ left: `${axis.pct}%` }}>{axis.label}</div>
            ))}
          </div>
          <div className="space-y-1.5">
            {workOrders.map((wo: any) => {
                if (!dateRange) return null;
                const start = new Date(wo.start_date || dateRange.min);
                const end = new Date(wo.expected_end || wo.actual_end || start);
                const clampedStart = start < dateRange.min ? dateRange.min : start;
                const clampedEnd = end > dateRange.max ? dateRange.max : end;
                const startPct = ((clampedStart.getTime() - dateRange.min.getTime()) / (dateRange.max.getTime() - dateRange.min.getTime())) * 100;
                const widthPct = Math.max(2, ((clampedEnd.getTime() - clampedStart.getTime()) / (dateRange.max.getTime() - dateRange.min.getTime())) * 100);
                const statusKey = wo.status in statusColors ? wo.status : "scheduled";
                const barColor = statusColors[statusKey];
                const progress = wo.progress || 0;
                return (
                  <div key={wo.id} className="flex items-center gap-2">
                    <button type="button" onClick={() => openDetail("workOrder", wo.id)} className="w-48 shrink-0 truncate text-left text-xs hover:text-primary">
                      <p className="truncate font-semibold">{wo.work_order_no}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{wo.title}</p>
                    </button>
                    <div className="relative h-7 flex-1 rounded-md bg-muted/20">
                      <button type="button" onClick={() => openDetail("workOrder", wo.id)} className={cn("group absolute top-0.5 h-6 cursor-pointer overflow-hidden rounded-md border transition-all hover:shadow-md", barColor)} style={{ left: `${startPct}%`, width: `${widthPct}%` }} title={`${wo.work_order_no} · ${wo.title} · ${formatDate(wo.start_date)} → ${wo.expected_end ? formatDate(wo.expected_end) : "TBD"} · ${progress}%`}>
                        <div className="absolute left-0 top-0 h-full bg-white/25" style={{ width: `${progress}%` }}/>
                        <div className="relative flex h-full items-center gap-1 px-1.5 text-[10px] font-bold text-white">
                          {wo.contractor_name && <span className="truncate">{wo.contractor_name}</span>}
                          <span className="ml-auto shrink-0">{progress}%</span>
                        </div>
                      </button>
                    </div>
                  </div>
                );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-primary/70"/>Scheduled</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-warning/70"/>In Progress</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-success/70"/>Completed</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-muted/50"/>On Hold</span>
          </div>
        </div>
      )}
    </section>);
}
