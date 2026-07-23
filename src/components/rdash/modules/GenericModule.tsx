"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { NotificationSettings } from "../NotificationSettings";
import { Search, Wallet, FileText, MapPin, Building2, Users, Package, Wrench, BarChart3, Settings as SettingsIcon, Database, Inbox, Download, Upload, History, ShieldCheck, Workflow, ArrowLeft, CheckSquare, Play, Pause, CheckCircle2, Phone, Plus, Sun, Moon, Pencil, } from "lucide-react";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState, WorkflowChip, WorkflowConnector } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { BulkActionBar, SelectCheckbox, type BulkAction } from "../BulkActions";
import { StaffEditDialog } from "../StaffEditDialog";
import { ContextRow, type ContextAction } from "../ContextMenuHost";
import { buildQuotationActions, buildPaymentActions, buildVisitActions, buildJobActions, buildGenericActions, } from "../recordActions";
import { quotationStatusStyle, paymentStatusStyle, jobStatusStyle, visitStatusStyle, entityStatusStyle, formatINR, formatINRShort, relativeDay, formatDate, titleCase, } from "@/lib/rdash/format";
import { calculateQuotationMetrics } from "@/lib/rdash/metrics";
import { indiaDate } from "@/lib/rdash/date";
import type { DataSource, ModuleRenderer, FilterPreset } from "@/lib/rdash/modules";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
type GenericRenderer = ModuleRenderer | "workOrders" | "reports" | "payments" | "staff-visits";
interface GenericModuleProps {
    renderer: GenericRenderer;
    dataSource?: DataSource;
    filter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    moduleId: string;
    label: string;
    description?: string;
}
export function GenericModule({ renderer, dataSource, filter, filterPresets, moduleId, label, description, }: GenericModuleProps) {
    const db = useRDashStore((s) => s.db);
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const updateJob = useRDashStore((s) => s.updateJob);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const quoteDispatch = React.useMemo(() => ({ updateQuotation }), [updateQuotation]);
    const [q, setQ] = React.useState("");
    const [presetIdx, setPresetIdx] = React.useState(0);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const isJobBoard = renderer === "workOrders";
    const [selectMode, setSelectMode] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const toggleSelect = (id: string) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) {
        n.delete(id);
    }
    else {
        n.add(id);
    } return n; });
    const clearSelection = () => { setSelectedIds(new Set()); setSelectMode(false); };
    const selectedArr = Array.from(selectedIds);
    const savedViewWorkspaceKey = moduleId || renderer || dataSource || "generic";
    const handlePresetChange = (i: number) => {
        setPresetIdx(i);
        setActiveSavedViewId(null);
    };
    const handleSearchChange = (val: string) => {
        setQ(val);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        if (filterPresets && view.presetId) {
            const idx = filterPresets.findIndex((p) => p.id === view.presetId);
            if (idx >= 0)
                setPresetIdx(idx);
        }
        setQ(view.search || "");
        setActiveSavedViewId(view.id);
    };
    const jobBulkActions: BulkAction[] = isJobBoard ? [
        {
            label: "Start",
            icon: <Play className="h-3.5 w-3.5"/>,
            onClick: (ids) => { ids.forEach((id) => updateJob(id, { status: "in_progress" })); toast.success(`${ids.length} workOrder${ids.length > 1 ? "s" : ""} started`); clearSelection(); },
        },
        {
            label: "Complete",
            icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
            onClick: (ids) => { const incomplete = ids.filter((id) => (db.workOrders.find((row) => row.id === id)?.progress || 0) < 100); if (incomplete.length) {
                toast.error(`${incomplete.length} work order(s) still need verified 100% progress before completion`);
                return;
            } ids.forEach((id) => updateJob(id, { status: "completed" })); toast.success(`${ids.length} workOrder${ids.length > 1 ? "s" : ""} completed`); clearSelection(); },
        },
        {
            label: "Put on Hold",
            icon: <Pause className="h-3.5 w-3.5"/>,
            variant: "destructive",
            onClick: (ids) => { ids.forEach((id) => updateJob(id, { status: "on_hold" })); toast.warning(`${ids.length} workOrder${ids.length > 1 ? "s" : ""} put on hold`); clearSelection(); },
        },
    ] : [];
    if (renderer === "system") {
        return <SystemShell moduleId={moduleId} label={label} db={db} setActiveModule={setActiveModule}/>;
    }
    if (renderer === "reports") {
        return <ReportsShell label={label} db={db}/>;
    }
    if (renderer === "masters") {
        return <MastersShell dataSource={dataSource} db={db}/>;
    }
    const activePreset = filterPresets?.[presetIdx];
    const effectiveFilter: Record<string, string> | undefined = activePreset
        ? { ...(filter || {}), ...activePreset.filter }
        : filter;
    const records = resolveRecords(db, dataSource, effectiveFilter);
    const filtered = records.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
    const metrics = computeMetrics(renderer, db, records);
    const subtitle = description || titleCase(dataSource || "records");
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{label}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isJobBoard && (<>
              <button type="button" onClick={() => { setSelectMode((s) => !s); if (selectMode)
            setSelectedIds(new Set()); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", selectMode ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <CheckSquare className="h-3.5 w-3.5"/> {selectMode ? "Exit" : "Select"}
              </button>
              {selectMode && filtered.length > 1 && (<button type="button" onClick={() => setSelectedIds(new Set(filtered.map((r) => r.id)))} className="text-[11px] font-medium text-primary hover:underline">
                  All ({filtered.length})
                </button>)}
            </>)}
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <input value={q} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Search records…" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
          </div>
        </div>
      </div>

      {metrics.length > 0 && (<section aria-label="Module metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((m, i) => (<MetricCard key={i} {...m}/>))}
        </section>)}

      {filterPresets && filterPresets.length > 0 && (<section aria-label="Filter presets" className="flex flex-wrap items-center gap-1.5">
          {filterPresets.map((p, i) => {
                const active = i === presetIdx;
                return (<button key={p.id} type="button" role="tab" aria-selected={active} onClick={() => handlePresetChange(i)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
                {p.label}
              </button>);
            })}
        </section>)}
      <SavedViewsBar workspaceKey={savedViewWorkspaceKey} presets={filterPresets} currentPresetId={filterPresets?.[presetIdx]?.id} currentSearch={q} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>

      <section aria-label="Module workflow steps" className="flex flex-wrap items-center gap-1.5 rounded-[var(--panel-radius)] border border-border bg-card/60 p-3 shadow-card">
        <WorkflowChip index={1} label="Capture" state="done"/>
        <WorkflowConnector active/>
        <WorkflowChip index={2} label="Process" state="active"/>
        <WorkflowConnector />
        <WorkflowChip index={3} label="Review" state="pending"/>
        <WorkflowConnector />
        <WorkflowChip index={4} label="Close" state="pending"/>
      </section>

      {filtered.length === 0 ? (<EmptyState title="No records found" description="Try a different search or create a new record." icon={<Inbox className="h-8 w-8"/>} action={<Button size="sm" variant="outline" onClick={() => setActiveModule("customerDesk")}>
              + Create
            </Button>}/>) : (<>
          {isJobBoard && selectMode && (<BulkActionBar selectedIds={selectedArr} totalCount={filtered.length} onClear={clearSelection} actions={jobBulkActions}/>)}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (<RecordTile key={r.id} record={r} renderer={renderer} quoteDispatch={quoteDispatch} selectMode={isJobBoard && selectMode} checked={selectedIds.has(r.id)} onToggle={toggleSelect}/>))}
          </div>
        </>)}
    </div>);
}
interface ResolvedRecord {
    id: string;
    title: string;
    subtitle?: string;
    customerName?: string;
    amount?: number;
    due?: string;
    status?: {
        label: string;
        className: string;
    };
    priority?: import("@/lib/rdash/types").Priority;
    meta?: string;
    kind: "quotation" | "payment" | "workOrder" | "visit" | "vendor" | "contractor" | "staff" | "customer" | "generic";
}
function resolveRecords(db: import("@/lib/rdash/types").RDashDatabase, dataSource?: DataSource, filter?: Record<string, string>): ResolvedRecord[] {
    const matchStatus = (s: string) => !filter?.status ? true : filter.status.split(",").includes(s);
    const matchType = (t: string) => !filter?.visit_type ? true : filter.visit_type === t;
    switch (dataSource) {
        case "quotations":
            return db.quotations
                .filter((q) => matchStatus(q.status))
                .map((q) => ({
                id: q.id,
                title: `${q.quotation_no} · ${q.title}`,
                subtitle: (q.customer_name || "Customer"),
                customerName: (q.customer_name || "Customer"),
                amount: q.total_amount,
                due: q.valid_until,
                status: quotationStatusStyle(q.status),
                meta: `Rev ${q.revision_no}`,
                kind: "quotation" as const,
            }));
        case "payments":
            return db.payments
                .filter((p) => matchStatus(p.status))
                .map((p) => ({
                id: p.id,
                title: formatINR(p.amount),
                subtitle: (p.customer_name || "Customer"),
                customerName: (p.customer_name || "Customer"),
                amount: p.amount,
                due: p.due_date,
                status: paymentStatusStyle(p.status),
                meta: p.mode,
                kind: "payment" as const,
            }));
        case "workOrders":
            return db.workOrders
                .filter((j) => (filter?.status ? filter.status.split(",").includes(j.status) : true))
                .map((j) => ({
                id: j.id,
                title: `${j.work_order_no} · ${j.title}`,
                subtitle: (j.customer_name || "Customer"),
                customerName: (j.customer_name || "Customer"),
                amount: j.value,
                due: j.expected_end,
                status: jobStatusStyle(j.status),
                meta: `${j.progress}% · ${j.contractor_name || "Unassigned"}`,
                kind: "workOrder" as const,
            }));
        case "visits": {
            const todayStr = indiaDate();
            const weekStart = new Date();
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
            const matchScope = (scheduledAt?: string) => {
                if (!filter?.scope || filter.scope === "all")
                    return true;
                if (!scheduledAt)
                    return false;
                const d = new Date(scheduledAt);
                if (filter.scope === "today")
                    return indiaDate(scheduledAt) === todayStr;
                if (filter.scope === "week")
                    return d >= weekStart && d < weekEnd;
                if (filter.scope === "upcoming")
                    return d >= weekStart;
                if (filter.scope === "past")
                    return d < weekStart;
                return true;
            };
            return db.visits
                .filter((v) => matchStatus(v.status) && matchType(v.visit_type) && matchScope(v.scheduled_at))
                .map((v) => {
                const customer = db.customers.find((p) => p.id === v.customer_id);
                return {
                    id: v.id,
                    title: `${titleCase(v.visit_type)} · ${customer?.name ?? v.location_name}`,
                    subtitle: v.location_name,
                    customerName: customer?.name,
                    due: v.scheduled_at,
                    status: visitStatusStyle(v.status),
                    meta: v.staff_name,
                    kind: "visit" as const,
                };
            });
        }
        case "customers":
            return db.customers
                .filter((p) => (filter?.status ? filter.status.split(",").includes(p.status) : true))
                .map((p) => ({
                id: p.id,
                title: p.name,
                subtitle: db.sites.filter((site) => site.customer_id === p.id).map((site) => site.address || site.name).join(" · ") || undefined,
                customerName: p.name,
                status: entityStatusStyle(p.status),
                meta: db.sites.filter((site) => site.customer_id === p.id).map((site) => site.name).join(" · ") || undefined,
                kind: "customer" as const,
            }));
        case "vendors":
            return db.master.vendors.map((v) => ({
                id: v.id,
                title: v.name,
                subtitle: v.city,
                customerName: v.name,
                status: { label: v.category || "Vendor", className: "bg-muted text-muted-foreground border-border" },
                amount: v.outstanding,
                meta: v.phone,
                kind: "generic" as const,
            }));
        case "contractors":
            return db.master.contractors.map((c) => ({
                id: c.id,
                title: c.name,
                subtitle: c.city,
                customerName: c.name,
                status: { label: c.trade || "Contractor", className: "bg-muted text-muted-foreground border-border" },
                meta: `${c.rating ?? "—"} ★ · ${c.active_jobs ?? 0} workOrders`,
                kind: "generic" as const,
            }));
        case "staff":
            return db.master.staff.map((s) => ({
                id: s.id,
                title: s.name,
                subtitle: s.city,
                customerName: s.name,
                status: { label: s.role, className: "bg-muted text-muted-foreground border-border" },
                meta: s.phone,
                kind: "generic" as const,
            }));
        case "approvals":
            return db.actions.map((a) => ({
                id: a.id,
                title: a.title,
                customerName: (a.customer_name || "Customer"),
                amount: a.amount,
                due: a.due_date,
                status: { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" },
                meta: a.requested_by,
                kind: "generic" as const,
            }));
        case "risks":
            return db.risks.map((r) => ({
                id: r.id,
                title: r.title,
                subtitle: r.reason,
                customerName: (r.customer_name || "Customer"),
                amount: r.amount,
                priority: r.severity,
                status: { label: titleCase(r.type), className: "bg-destructive/10 text-destructive border-destructive/20" },
                kind: "generic" as const,
            }));
        case "blocked":
            return db.blocked.map((b) => ({
                id: b.id,
                title: b.title,
                subtitle: b.reason,
                customerName: (b.customer_name || "Customer"),
                status: { label: "Blocked", className: "bg-warning/10 text-warning border-warning/20" },
                kind: "generic" as const,
            }));
        case "tasks":
            return db.tasks.map((t) => {
                const customer = db.customers.find((p) => p.id === t.customer_id);
                return {
                    id: t.id,
                    title: t.title,
                    subtitle: customer?.name,
                    customerName: customer?.name,
                    due: t.due_date,
                    status: { label: titleCase(t.status), className: "bg-muted text-muted-foreground border-border" },
                    meta: t.assignee_name,
                    kind: "generic" as const,
                };
            });
        case "followups":
            return db.followups.map((f) => {
                const customer = db.customers.find((p) => p.id === f.customer_id);
                return {
                    id: f.id,
                    title: f.title,
                    subtitle: customer?.name,
                    customerName: customer?.name,
                    due: f.due_date,
                    status: { label: titleCase(f.status), className: "bg-muted text-muted-foreground border-border" },
                    meta: f.followup_type,
                    kind: "generic" as const,
                };
            });
        default:
            return [];
    }
}
function computeMetrics(renderer: GenericRenderer, db: import("@/lib/rdash/types").RDashDatabase, records: ResolvedRecord[]) {
    const totalAmount = records.reduce((n, r) => n + (r.amount || 0), 0);
    const open = records.filter((r) => r.status?.label && !["completed", "received", "accepted", "accepted", "active"].some((s) => r.status!.label.toLowerCase().includes(s.toLowerCase()))).length;
    if (renderer === "quotations") {
        const quotationMetrics = calculateQuotationMetrics(db.quotations);
        return [
            { label: "Quotations", value: quotationMetrics.totalCount },
            { label: "Accepted", value: quotationMetrics.acceptedCount, tone: "success" as const },
            { label: "Pending", value: quotationMetrics.openCount, tone: "warning" as const },
            { label: "Pipeline value", value: formatINRShort(quotationMetrics.pipelineValue), tone: "primary" as const },
        ];
    }
    if (renderer === "payments") {
        const received = db.customerReceipts.reduce((n, receipt) => n + receipt.amount, 0);
        const overdue = db.payments.filter((p) => p.status === "overdue").reduce((n, p) => n + Math.max(0, p.amount - (p.received_amount || 0)), 0);
        return [
            { label: "Payments", value: records.length },
            { label: "Received", value: formatINRShort(received), tone: "success" as const },
            { label: "Overdue", value: formatINRShort(overdue), tone: "destructive" as const },
            { label: "Total value", value: formatINRShort(totalAmount), tone: "primary" as const },
        ];
    }
    if (renderer === "workOrders") {
        return [
            { label: "Work Orders", value: records.length },
            { label: "In progress", value: db.workOrders.filter((j) => j.status === "in_progress").length, tone: "primary" as const },
            { label: "On hold", value: db.workOrders.filter((j) => j.status === "on_hold").length, tone: "warning" as const },
            { label: "WorkOrder value", value: formatINRShort(totalAmount), tone: "success" as const },
        ];
    }
    if (renderer === "staff-visits") {
        return [
            { label: "Visits", value: records.length },
            { label: "Scheduled", value: db.visits.filter((v) => v.status === "scheduled").length, tone: "primary" as const },
            { label: "Completed", value: db.visits.filter((v) => v.status === "completed").length, tone: "success" as const },
            { label: "Missed", value: db.visits.filter((v) => v.status === "missed").length, tone: "destructive" as const },
        ];
    }
    if (records.length > 0) {
        return [
            { label: "Records", value: records.length },
            { label: "Open", value: open, tone: "warning" as const },
            { label: "Value", value: formatINRShort(totalAmount), tone: "primary" as const },
        ];
    }
    return [];
}
function RecordTile({ record, renderer, quoteDispatch, selectMode, checked, onToggle, }: {
    record: ResolvedRecord;
    renderer: GenericRenderer;
    quoteDispatch: {
        updateQuotation: (id: string, patch: Record<string, unknown>) => void;
    };
    selectMode?: boolean;
    checked?: boolean;
    onToggle?: (id: string) => void;
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const detailKind = (() => {
        switch (record.kind) {
            case "quotation": return "quotation" as const;
            case "payment": return "payment" as const;
            case "workOrder": return "workOrder" as const;
            case "visit": return "visit" as const;
            case "customer": return "customer" as const;
            default: return null;
        }
    })();
    const handleClick = detailKind ? () => openDetail(detailKind, record.id) : undefined;
    let actions: ContextAction[];
    if (record.kind === "quotation") {
        actions = buildQuotationActions(record.id, quoteDispatch, { onOpen: handleClick });
    }
    else if (record.kind === "payment") {
        actions = buildPaymentActions(record.id, null, { onOpen: handleClick });
    }
    else if (record.kind === "visit") {
        actions = buildVisitActions(record.id, null, { onOpen: handleClick });
    }
    else if (record.kind === "workOrder") {
        actions = buildJobActions(record.id, { onOpen: handleClick });
    }
    else {
        actions = buildGenericActions(record.id, null, { onOpen: handleClick });
    }
    if (selectMode) {
        return (<div className={cn("group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card px-3.5 py-3 shadow-card transition-all", checked && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20")}>
        <SelectCheckbox checked={!!checked} onToggle={onToggle || (() => { })} id={record.id}/>
        {record.customerName && <Avatar name={record.customerName} size={34}/>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{record.title}</p>
          {record.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{record.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {record.due && <span>Due {relativeDay(record.due)}</span>}
            {record.amount != null && record.amount > 0 && <span className="font-semibold text-foreground/80">{formatINRShort(record.amount)}</span>}
            {record.meta && <span className="truncate">{record.meta}</span>}
          </div>
        </div>
        {record.status && <StatusBadge label={record.status.label} className={record.status.className}/>}
      </div>);
    }
    return (<ContextRow actions={actions} onSelect={handleClick} className="group rounded-[var(--panel-radius)] border border-border border-l-2 border-l-transparent bg-card px-3.5 py-3 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
      <div className={cn("flex items-start gap-3", handleClick && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-[var(--panel-radius)]")}>
        {record.customerName && <Avatar name={record.customerName} size={34}/>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{record.title}</p>
            {record.status && <StatusBadge label={record.status.label} className={record.status.className}/>}
          </div>
          {record.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{record.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {record.due && <span>Due {relativeDay(record.due)}</span>}
            {record.amount != null && record.amount > 0 && <span className="font-semibold text-foreground/80">{formatINRShort(record.amount)}</span>}
            {record.meta && <span className="truncate">{record.meta}</span>}
          </div>
        </div>
      </div>
    </ContextRow>);
}
function MastersShell({ dataSource, db, }: {
    dataSource?: DataSource;
    db: import("@/lib/rdash/types").RDashDatabase;
}) {
    const [subTab, setSubTab] = React.useState<"categories" | "subcategories">("categories");
    const showTabs = dataSource === "master-categories";
    let title = "Work & Rate Master";
    let rows: {
        id: string;
        primary: string;
        secondary?: string;
        right?: string;
    }[] = [];
    if (dataSource === "master-units") {
        title = "Units";
        rows = db.master.units.map((u) => ({ id: u.id, primary: u.name, secondary: u.symbol, right: u.symbol }));
    }
    else if (dataSource === "master-categories") {
        if (subTab === "subcategories") {
            title = "Work Subcategories";
            const catName = (id?: string) => db.master.workCategories.find((c) => c.id === id)?.name;
            rows = db.master.workSubcategories.map((s) => ({ id: s.id, primary: s.name, secondary: catName(s.category_id) ? `Under: ${catName(s.category_id)}` : undefined }));
        }
        else {
            title = "Work Categories";
            rows = db.master.workCategories.map((c) => ({ id: c.id, primary: c.name, secondary: c.description }));
        }
    }
    else if (dataSource === "master-subcategories") {
        title = "Work Subcategories";
        const catName = (id?: string) => db.master.workCategories.find((c) => c.id === id)?.name;
        rows = db.master.workSubcategories.map((s) => ({ id: s.id, primary: s.name, secondary: catName(s.category_id) ? `Under: ${catName(s.category_id)}` : undefined }));
    }
    else if (dataSource === "master-articles") {
        title = "Articles";
        rows = db.master.articles.map((a) => ({ id: a.id, primary: a.name, right: a.base_rate ? formatINR(a.base_rate) : undefined }));
    }
    return (<div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">Master records · {rows.length} entries</p>
      </div>
      {showTabs && (<div className="inline-flex w-fit gap-1 rounded-md border border-border bg-muted/40 p-1">
          <button type="button" onClick={() => setSubTab("categories")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", subTab === "categories" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Categories
          </button>
          <button type="button" onClick={() => setSubTab("subcategories")} className={cn("rounded px-3 py-1 text-xs font-semibold transition-colors", subTab === "subcategories" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Subcategories
          </button>
        </div>)}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total" value={rows.length}/>
        <MetricCard label="Categories" value={db.master.workCategories.length} tone="primary" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Articles" value={db.master.articles.length} tone="success" icon={<Wrench className="h-4 w-4"/>}/>
        <MetricCard label="Vendors" value={db.master.vendors.length} tone="warning" icon={<Building2 className="h-4 w-4"/>}/>
      </div>
      <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Name</span>
          <span>Value</span>
        </div>
        {rows.map((r) => (<ContextRow key={r.id} actions={buildGenericActions(r.id, null)} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-4 py-2.5 last:border-0 hover:bg-accent/40">
            <div>
              <p className="text-sm font-medium text-foreground">{r.primary}</p>
              {r.secondary && <p className="text-xs text-muted-foreground">{r.secondary}</p>}
            </div>
            <span className="text-sm font-semibold text-foreground/80">{r.right || "—"}</span>
          </ContextRow>))}
      </div>
    </div>);
}
function ReportsShell({ label, db, }: {
    label: string;
    db: import("@/lib/rdash/types").RDashDatabase;
}) {
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const totalRevenue = db.customerReceipts.reduce((n, receipt) => n + receipt.amount, 0);
    const quotationMetrics = calculateQuotationMetrics(db.quotations);
    const currentQuotations = quotationMetrics.current;
    const totalPipeline = quotationMetrics.pipelineValue;
    const totalJobValue = db.workOrders.reduce((n, j) => n + j.value, 0);
    const stats = [
        { label: "Revenue (received)", value: formatINRShort(totalRevenue), tone: "success" as const },
        { label: "Pipeline value", value: formatINRShort(totalPipeline), tone: "primary" as const },
        { label: "WorkOrder value", value: formatINRShort(totalJobValue), tone: "warning" as const },
        { label: "Customers", value: db.customers.length, tone: "default" as const },
    ];
    const maxQ = Math.max(...currentQuotations.map((quotation) => quotation.total_amount), 1);
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{label}</h2>
          <p className="text-xs text-muted-foreground">Business insights and exports</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setActiveModule("dataExport")}>
          <Database className="mr-1.5 h-3.5 w-3.5"/> Export data
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (<MetricCard key={i} {...s} icon={<BarChart3 className="h-4 w-4"/>}/>))}
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <h3 className="mb-3 text-sm font-semibold">Quotation value distribution</h3>
        <div className="flex flex-col gap-2">
          {currentQuotations.map((q) => (<div key={q.id} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{q.quotation_no}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(q.total_amount / maxQ) * 100}%` }}/>
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold">{formatINRShort(q.total_amount)}</span>
            </div>))}
        </div>
      </div>
    </div>);
}
function ResetWorkspaceControl() {
    const authUser = useRDashStore((s) => s.authUser);
    const resetDatabase = useRDashStore((s) => s.resetDatabase);
    const [open, setOpen] = React.useState(false);
    const [confirmation, setConfirmation] = React.useState("");
    const [resetting, setResetting] = React.useState(false);
    if (authUser?.role !== "Owner")
        return null;
    const confirmReset = async () => {
        try {
            setResetting(true);
            await resetDatabase(confirmation);
            setOpen(false);
            setConfirmation("");
            toast.success("Workspace reset to canonical seed data.");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Workspace reset was rejected.");
        }
        finally {
            setResetting(false);
        }
    };
    return (<>
      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => { setConfirmation(""); setOpen(true); }}>
        <Database className="h-3.5 w-3.5"/> Reset workspace
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!resetting)
        setOpen(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset entire workspace</DialogTitle>
            <p className="text-xs text-muted-foreground">This Owner-only action permanently replaces operational data with canonical seed data. It cannot be undone.</p>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold">Type <span className="font-mono">RESET WORKSPACE</span> to confirm</label>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET WORKSPACE" autoComplete="off"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReset} disabled={resetting || confirmation.trim() !== "RESET WORKSPACE"}>
              {resetting ? "Resetting…" : "Permanently reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
function SystemShell({ moduleId, label, db, setActiveModule, }: {
    moduleId: string;
    label: string;
    db: import("@/lib/rdash/types").RDashDatabase;
    setActiveModule: (id: string, label?: string, icon?: string) => void;
}) {
    const activeSubmoduleId = moduleId;
    const { theme, setTheme } = useTheme();
    const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
    const authUser = useRDashStore((s) => s.authUser);
    const addStaff = useRDashStore((s) => s.addStaff);
    const [editStaffId, setEditStaffId] = React.useState<string | undefined>(undefined);
    const [staffEditOpen, setStaffEditOpen] = React.useState(false);
    if (activeSubmoduleId === "systemSettings") {
        const isDark = theme === "dark";
        return (<div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Settings</h2>
          <p className="text-xs text-muted-foreground">Workspace configuration and preferences</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Customers" value={db.customers.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Quotations" value={db.quotations.length} tone="warning" icon={<FileText className="h-4 w-4"/>}/>
          <MetricCard label="Work Orders" value={db.workOrders.length} tone="success" icon={<Building2 className="h-4 w-4"/>}/>
          <MetricCard label="Tasks" value={db.tasks.length} tone="default" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{isDark ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}</span>
              <h3 className="text-sm font-semibold">Appearance</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Switch between light and dark themes.</p>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun className="h-3.5 w-3.5"/> : <Moon className="h-3.5 w-3.5"/>} {isDark ? "Light mode" : "Dark mode"}
            </Button>
          </div>
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Users className="h-4 w-4"/></span>
              <h3 className="text-sm font-semibold">Active Role</h3>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">Signed in as <span className="font-semibold text-foreground">{authUser?.name || "Authenticated user"}</span></p>
            <p className="text-xs text-muted-foreground">Server-assigned role: <span className="font-semibold text-foreground">{role}</span></p>
            <p className="mt-3 text-[11px] text-muted-foreground">Role changes are managed by the administrator in the server role registry and cannot be changed from this browser.</p>
          </div>
        </div>
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Database className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Data Management</h3>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataImport")}><Upload className="h-3.5 w-3.5"/> Import</Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataExport")}><Download className="h-3.5 w-3.5"/> Export</Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("auditLog")}><History className="h-3.5 w-3.5"/> Audit log</Button>
            <ResetWorkspaceControl />
          </div>
        </div>
      </div>);
    }
    if (activeSubmoduleId === "usersRoles") {
        return (<div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5"/></span>
            <div><h2 className="text-lg font-bold tracking-tight">Staff Directory</h2><p className="text-xs text-muted-foreground">Team records, contact and salary. Secure access is assigned in the server role registry.</p></div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => {
                const id = addStaff({ name: "New Staff", role: "Staff", status: "active" });
                setEditStaffId(id);
                setStaffEditOpen(true);
                toast.success("New staff member added — edit details below");
            }}><Plus className="h-3.5 w-3.5"/> Add Staff</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Total staff" value={db.master.staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
          <MetricCard label="Active" value={db.master.staff.filter((s) => s.status === "active").length} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
          <MetricCard label="Monthly payroll" value={formatINRShort(db.master.staff.reduce((n, s) => n + (s.monthly_salary || 0), 0))} tone="warning" icon={<Wallet className="h-4 w-4"/>}/>
          <MetricCard label="Avg salary" value={formatINRShort(db.master.staff.length ? db.master.staff.reduce((n, s) => n + (s.monthly_salary || 0), 0) / db.master.staff.length : 0)} tone="default" icon={<Wallet className="h-4 w-4"/>}/>
        </div>
        <div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {db.master.staff.map((s) => {
                const tasks = db.tasks.filter((t) => t.assignee_id === s.id);
                const visits = db.visits.filter((v) => v.staff_id === s.id);
                return (<div key={s.id} className="group relative flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                <button type="button" onClick={() => { setEditStaffId(s.id); setStaffEditOpen(true); }} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${s.name}`} title="Edit staff"><Pencil className="h-3.5 w-3.5"/></button>
                <Avatar name={s.name} size={42}/>
                <div className="min-w-0 flex-1 pr-6">
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.role} · {s.city}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-0.5"><Phone className="h-2.5 w-2.5"/>{s.phone || "—"}</span>{s.monthly_salary && <span className="font-mono">· {formatINR(s.monthly_salary)}/mo</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge label={titleCase(s.status || "active")} className="bg-success/10 text-success border-success/20"/>
                  <span className="text-[10px] text-muted-foreground">{tasks.length} tasks · {visits.length} visits</span>
                </div>
              </div>);
            })}
        </div>
        <StaffEditDialog staffId={editStaffId} open={staffEditOpen} onClose={() => { setStaffEditOpen(false); setEditStaffId(undefined); }}/>
      </div>);
    }
    return (<div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{label}</h2>
        <p className="text-xs text-muted-foreground">Workspace configuration and data management</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="group rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><SettingsIcon className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Workspace</h3>
          </div>
          <p className="text-xs text-muted-foreground">Secure server-backed workspace. Operational data is persisted only after authenticated server validation.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("systemSettings")}>
              <SettingsIcon className="h-3.5 w-3.5"/> Settings
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("controlBrainWorkflows")}>
              <Workflow className="h-3.5 w-3.5"/> Workflow builder
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("approvalPolicies")}>
              <ShieldCheck className="h-3.5 w-3.5"/> Approval policies
            </Button>
          </div>
        </div>
        <div className="group rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Database className="h-4 w-4"/></span>
            <h3 className="text-sm font-semibold">Data</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {db.customers.length} customers · {db.quotations.length} quotations · {db.workOrders.length} workOrders · {db.tasks.length} tasks
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataImport")}>
              <Upload className="h-3.5 w-3.5"/> Data import
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataExport")}>
              <Download className="h-3.5 w-3.5"/> Data export
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("auditLog")}>
              <History className="h-3.5 w-3.5"/> Audit log
            </Button>
            <ResetWorkspaceControl />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
            { id: "usersRoles", label: "Staff Directory & Access", icon: Users, desc: "Staff directory and server-managed access" },
            { id: "attendancePayroll", label: "Attendance & Payroll Rules", icon: Wallet, desc: "GPS, absence and salary rules" },
            { id: "threads", label: "Conversations", icon: FileText, desc: "Threaded discussions" },
            { id: "controlBrainWorkflows", label: "Control Brain", icon: Workflow, desc: "Automation workflows" },
            { id: "approvalPolicies", label: "Approval Policies", icon: ShieldCheck, desc: "Threshold rules" },
            { id: "auditLog", label: "Audit Log", icon: History, desc: "Full activity trace" },
            { id: "dataImport", label: "Data Import", icon: Upload, desc: "Bulk import records" },
            { id: "dataExport", label: "Data Export", icon: Download, desc: "Export to CSV/JSON" },
        ].map((item) => (<button key={item.id} type="button" onClick={() => setActiveModule(item.id)} className="group flex items-center gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <item.icon className="h-4 w-4"/>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <ArrowLeft className="h-3.5 w-3.5 shrink-0 rotate-180 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"/>
          </button>))}
      </div>
    </div>);
}
