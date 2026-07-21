"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { SavedViewsBar } from "../SavedViewsBar";
import type { WorkRequired, Customer, WorkRequiredStatus } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase, workRequiredStatusStyle } from "@/lib/rdash/format";
import { TrendingUp, Users, Target, DollarSign, Filter, Phone, MapPin, Calendar, Plus, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, closestCorners, DragOverlay, type DragEndEvent, type DragStartEvent, } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
const PIPELINE_STAGES: {
    key: WorkRequiredStatus;
    label: string;
    color: string;
}[] = [
    { key: "new", label: "New", color: "border-l-primary" },
    { key: "contacted", label: "Qualified", color: "border-l-primary" },
    { key: "visit_scheduled", label: "Visit planned", color: "border-l-warning" },
    { key: "measurement_done", label: "Measured", color: "border-l-warning" },
    { key: "quotation_in_progress", label: "Quoting", color: "border-l-warning" },
    { key: "quotation_sent", label: "Quote sent", color: "border-l-primary" },
    { key: "negotiation", label: "Negotiation", color: "border-l-primary" },
    { key: "accepted", label: "Accepted", color: "border-l-success" },
    { key: "on_hold", label: "On hold", color: "border-l-muted" },
    { key: "lost", label: "Lost", color: "border-l-destructive" },
];
function DraggableCard({ req, customer, onOpen, }: {
    req: WorkRequired;
    customer?: Customer;
    onOpen: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: req.id });
    const style = {
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
    };
    return (<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button type="button" onClick={onOpen} className={cn("group w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft", isDragging && "cursor-grabbing ring-2 ring-primary/40")}>
        <div className="flex items-center gap-2">
          {customer && <Avatar name={customer.name} size={28}/>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{customer?.name || "Unknown"}</p>
            <p className="truncate text-[10px] text-muted-foreground">{req.title}</p>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground/80">{req.budget ? formatINRShort(req.budget) : "—"}</span>
          <span>{req.source || "—"}</span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", req.priority === "urgent" ? "bg-destructive/10 text-destructive" : req.priority === "high" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
            {titleCase(req.priority)}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">{relativeDay(req.created_at)}</span>
        </div>
      </button>
    </div>);
}
function DroppableColumn({ stageKey, children }: {
    stageKey: WorkRequiredStatus;
    children: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `drop-${stageKey}` });
    return (<div ref={setNodeRef} className={cn("flex min-h-[120px] flex-col gap-1.5 transition-colors", isOver && "bg-primary/[0.04] rounded-lg")}>
      {children}
    </div>);
}
export function SalesPipelineModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const updateWorkRequired = useRDashStore((s) => s.updateWorkRequired);
    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const activeReq = activeId ? db.workRequired.find((r) => r.id === activeId) : null;
    const activeProfile = activeReq ? db.customers.find((p) => p.id === activeReq.customer_id) : undefined;
    const handleDragStart = (e: DragStartEvent) => {
        setActiveId(String(e.active.id));
    };
    const handleDragEnd = (e: DragEndEvent) => {
        const { active, over } = e;
        setActiveId(null);
        if (!over)
            return;
        const dropId = String(over.id);
        if (!dropId.startsWith("drop-"))
            return;
        const newStatus = dropId.replace("drop-", "") as WorkRequiredStatus;
        const req = db.workRequired.find((r) => r.id === active.id);
        if (!req || req.status === newStatus)
            return;
        updateWorkRequired(req.id, { status: newStatus });
        toast.success(`Moved "${req.title}" → ${PIPELINE_STAGES.find((s) => s.key === newStatus)?.label || newStatus}`);
    };
    const [priorityFilter, setPriorityFilter] = React.useState<"all" | "urgent" | "high" | "medium" | "low">("all");
    const filteredWorkRequireds = React.useMemo(() => {
        if (priorityFilter === "all")
            return db.workRequired;
        return db.workRequired.filter((r) => r.priority === priorityFilter);
    }, [db.workRequired, priorityFilter]);
    const byStage = React.useMemo(() => {
        const m = new Map<WorkRequiredStatus, {
            req: WorkRequired;
            customer?: Customer;
        }[]>();
        filteredWorkRequireds.forEach((r) => {
            const customer = db.customers.find((p) => p.id === r.customer_id);
            const arr = m.get(r.status) || [];
            arr.push({ req: r, customer });
            m.set(r.status, arr);
        });
        return m;
    }, [filteredWorkRequireds, db.customers]);
    const totalValue = filteredWorkRequireds.reduce((n, r) => n + (r.budget || 0), 0);
    const wonValue = filteredWorkRequireds.filter((r) => r.status === "accepted").reduce((n, r) => n + (r.budget || 0), 0);
    const wonCount = filteredWorkRequireds.filter((r) => r.status === "accepted").length;
    const winRate = filteredWorkRequireds.length ? Math.round((wonCount / filteredWorkRequireds.length) * 100) : 0;
    const priorityChips: {
        key: typeof priorityFilter;
        label: string;
        count: number;
    }[] = [
        { key: "all", label: "All", count: db.workRequired.length },
        { key: "urgent", label: "Urgent", count: db.workRequired.filter((r) => r.priority === "urgent").length },
        { key: "high", label: "High", count: db.workRequired.filter((r) => r.priority === "high").length },
        { key: "medium", label: "Medium", count: db.workRequired.filter((r) => r.priority === "medium").length },
        { key: "low", label: "Low", count: db.workRequired.filter((r) => r.priority === "low").length },
    ];
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Sales Pipeline</h2>
          <p className="text-xs text-muted-foreground">Lead-to-workOrder funnel · {filteredWorkRequireds.length} workRequired shown</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total leads" value={filteredWorkRequireds.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Won" value={wonCount} tone="success" icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Win rate" value={`${winRate}%`} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(totalValue)} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      <section aria-label="Priority filter" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-muted-foreground">Priority:</span>
        {priorityChips.map((chip) => {
            const active = priorityFilter === chip.key;
            return (<button key={chip.key} type="button" role="tab" aria-selected={active} onClick={() => setPriorityFilter(chip.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {chip.label}
              <span className={cn("ml-1.5 rounded px-1 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted")}>
                {chip.count}
              </span>
            </button>);
        })}
      </section>
      <DndContext sensors={[sensor]} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2 rd-scroll">
          {PIPELINE_STAGES.map((stage) => {
            const items = byStage.get(stage.key) || [];
            const stageValue = items.reduce((n, { req }) => n + (req.budget || 0), 0);
            return (<div key={stage.key} className="flex w-72 shrink-0 flex-col gap-2">
                <div className={cn("rounded-md border border-border border-l-4 bg-muted/30 px-3 py-2", stage.color)}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">{stage.label}</span>
                    <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{items.length}</span>
                  </div>
                  {stageValue > 0 && <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">{formatINRShort(stageValue)}</p>}
                </div>
                <DroppableColumn stageKey={stage.key}>
                  {items.map(({ req, customer }) => (<DraggableCard key={req.id} req={req} customer={customer} onOpen={() => customer && openDetail("customer", customer.id)}/>))}
                  {items.length === 0 && (<div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center">
                    <Plus className="h-4 w-4 text-muted-foreground/50" />
                    <p className="text-[10px] font-medium text-muted-foreground/80">No items</p>
                    <p className="text-[10px] text-muted-foreground/60">Drag a lead here</p>
                  </div>)}
                </DroppableColumn>
              </div>);
        })}
        </div>
      </DndContext>
    </div>);
}
export function LeadsModule({ filterPresets }: {
    filterPresets?: import("@/lib/rdash/modules").FilterPreset[];
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const presets: import("@/lib/rdash/modules").FilterPreset[] = filterPresets && filterPresets.length > 0
        ? filterPresets
        : [
            { id: "all", label: "All Leads", filter: {} },
            { id: "new", label: "New Today", filter: { lead_recency: "today" } },
            { id: "new", label: "Qualified", filter: { lead_qualified: "yes" } },
            { id: "unqualified", label: "Unqualified", filter: { lead_qualified: "no" } },
        ];
    const [presetIdx, setPresetIdx] = React.useState(0);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const active = presets[presetIdx];
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
    const allLeads = React.useMemo(() => {
        const activeLeadStatuses: WorkRequiredStatus[] = ["new", "new", "visit_scheduled", "quotation_in_progress", "quotation_sent", "on_hold"];
        return db.workRequired
            .filter((workRequired) => activeLeadStatuses.includes(workRequired.status))
            .map((workRequired) => ({ customer: db.customers.find((customer) => customer.id === workRequired.customer_id), workRequired }))
            .filter((row): row is {
            customer: Customer;
            workRequired: WorkRequired;
        } => !!row.customer)
            .sort((a, b) => b.workRequired.created_at.localeCompare(a.workRequired.created_at));
    }, [db.customers, db.workRequired]);
    const leads = allLeads.filter(({ customer, workRequired }) => {
        if (active?.filter.lead_recency === "today")
            return relativeDay(customer.created_at) === "Today";
        if (active?.filter.lead_qualified === "yes")
            return !!workRequired;
        if (active?.filter.lead_qualified === "no")
            return !workRequired;
        return true;
    });
    const leadValue = leads.reduce((n, { workRequired }) => n + (workRequired?.budget || 0), 0);
    const countFor = (preset: import("@/lib/rdash/modules").FilterPreset) => {
        if (preset.filter.lead_recency === "today")
            return allLeads.filter((l) => relativeDay(l.customer.created_at) === "Today").length;
        if (preset.filter.lead_qualified === "yes")
            return allLeads.filter((l) => l.workRequired).length;
        if (preset.filter.lead_qualified === "no")
            return allLeads.filter((l) => !l.workRequired).length;
        return allLeads.length;
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Leads</h2>
          <p className="text-xs text-muted-foreground">Unqualified prospects needing follow-up and qualification</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active leads" value={leads.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Lead value" value={formatINRShort(leadValue)} tone="warning" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="With workRequired" value={leads.filter((l) => l.workRequired).length} tone="success" icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="New today" value={leads.filter((l) => relativeDay(l.customer.created_at) === "Today").length} tone="default" icon={<Calendar className="h-4 w-4"/>}/>
      </div>

      <section aria-label="Lead filters" className="flex flex-wrap items-center gap-1.5">
        {presets.map((p, i) => {
            const isActive = i === presetIdx;
            return (<button key={p.id} type="button" role="tab" aria-selected={isActive} onClick={() => handlePresetChange(i)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {p.label}
              <span className={cn("ml-1.5 rounded px-1 text-[10px]", isActive ? "bg-primary-foreground/20" : "bg-muted")}>
                {countFor(p)}
              </span>
            </button>);
        })}
      </section>

      <SavedViewsBar workspaceKey="leads" presets={presets} currentPresetId={presets[presetIdx]?.id} currentSearch="" onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>

      {leads.length === 0 ? (<EmptyState title="No active leads" description="New enquiries will appear here once added via Customer Desk." icon={<Users className="h-8 w-8"/>}/>) : (<div className="rd-stagger grid gap-3 lg:grid-cols-2">
          {leads.map(({ customer, workRequired }) => (<button key={customer.id} type="button" onClick={() => openDetail("customer", customer.id)} className="group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
              <Avatar name={customer.name} size={42}/>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold">{customer.name}</p>
                  <StatusBadge label="Lead" className="bg-primary/10 text-primary border-primary/20"/>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3"/>{customer.phone}</span>
                  <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3"/>{db.sites.find((site) => site.customer_id === customer.id)?.city || "Site pending"}</span>
                </div>
                {workRequired ? (<div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5">
                    <p className="text-xs font-medium">{workRequired.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{workRequired.source}</span>
                      {workRequired.budget && <span className="font-mono font-semibold text-foreground/80">{formatINR(workRequired.budget)}</span>}
                      <span className="ml-auto">{relativeDay(workRequired.created_at)}</span>
                    </div>
                  </div>) : (<p className="mt-1 text-[11px] text-muted-foreground">No workRequired captured yet</p>)}
              </div>
            </button>))}
        </div>)}
    </div>);
}
