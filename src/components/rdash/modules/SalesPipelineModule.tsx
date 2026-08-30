"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { SavedViewsBar } from "../SavedViewsBar";
import type { WorkRequired, Customer, WorkRequiredStatus } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, relativeDay, titleCase } from "@/lib/rdash/format";
import { TrendingUp, Users, Target, DollarSign, Phone, MapPin, Calendar, Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { calculateSalesPipelineMetrics, collectWonWorkRequiredIds } from "@/lib/rdash/metrics";
import { evaluateWorkRequiredTransition } from "@/lib/rdash/work-required-lifecycle";
import { buildProgressionPipelineEntries, type ProgressionPipelineEntry } from "@/lib/rdash/sales-pipeline-progress";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, closestCorners, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PIPELINE_STAGES: Array<{
    key: WorkRequiredStatus;
    label: string;
    color: string;
    headerBg: string;
    accent: string;
    icon: string;
}> = [
    { key: "new", label: "New", color: "border-l-primary", headerBg: "from-primary/10 to-primary/5", accent: "text-primary", icon: "✨" },
    { key: "contacted", label: "Qualified", color: "border-l-primary", headerBg: "from-primary/10 to-primary/5", accent: "text-primary", icon: "💬" },
    { key: "visit_scheduled", label: "Visit planned", color: "border-l-warning", headerBg: "from-warning/10 to-warning/5", accent: "text-warning", icon: "📍" },
    { key: "measurement_done", label: "Measured", color: "border-l-warning", headerBg: "from-warning/10 to-warning/5", accent: "text-warning", icon: "📐" },
    { key: "quotation_in_progress", label: "Quoting", color: "border-l-warning", headerBg: "from-warning/10 to-warning/5", accent: "text-warning", icon: "📝" },
    { key: "quotation_sent", label: "Quote sent", color: "border-l-primary", headerBg: "from-primary/10 to-primary/5", accent: "text-primary", icon: "📤" },
    { key: "negotiation", label: "Negotiation", color: "border-l-primary", headerBg: "from-primary/10 to-primary/5", accent: "text-primary", icon: "🤝" },
    { key: "accepted", label: "Accepted", color: "border-l-success", headerBg: "from-success/15 to-success/5", accent: "text-success", icon: "✅" },
    { key: "on_hold", label: "On hold", color: "border-l-muted", headerBg: "from-muted/20 to-muted/5", accent: "text-muted-foreground", icon: "⏸" },
    { key: "lost", label: "Lost", color: "border-l-destructive", headerBg: "from-destructive/10 to-destructive/5", accent: "text-destructive", icon: "✕" },
];

interface TransitionRequest {
    req: WorkRequired;
    target: WorkRequiredStatus;
    source: "drag" | "keyboard";
}

type PipelineBoardItem =
    | { kind: "work_required"; req: WorkRequired; customer?: Customer }
    | { kind: "progression"; entry: ProgressionPipelineEntry; customer?: Customer };

function stageLabel(status: WorkRequiredStatus): string {
    return PIPELINE_STAGES.find((stage) => stage.key === status)?.label || titleCase(status);
}

function DraggableCard({ req, customer, db, onOpen, onRequestTransition }: {
    req: WorkRequired;
    customer?: Customer;
    db: import("@/lib/rdash/types").RDashDatabase;
    onOpen: () => void;
    onRequestTransition: (request: TransitionRequest) => void;
}) {
    const movable = PIPELINE_STAGES.some((stage) => stage.key === req.status) && req.status !== "accepted";
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: req.id, disabled: !movable });
    const style: React.CSSProperties = {
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
    };
    return (<article ref={setNodeRef} style={style} className={cn("rounded-lg border border-border bg-gradient-to-br from-card to-muted/20 p-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg", isDragging && "ring-2 ring-primary/40 shadow-xl")}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {customer && <Avatar name={customer.name} size={28}/>} 
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{customer?.name || "Unknown"}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{req.title}</span>
          </span>
        </button>
        <button type="button" {...attributes} {...listeners} disabled={!movable} aria-label={movable ? `Drag ${req.title} to another stage` : `${stageLabel(req.status)} is workflow controlled`} title={movable ? "Drag to another allowed stage" : "This stage is controlled by the lifecycle workflow"} className="flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35">
          <GripVertical className="h-4 w-4"/>
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground/80">{req.budget ? formatINRShort(req.budget) : "—"}</span>
        <span>{req.source || "—"}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", req.priority === "urgent" ? "bg-destructive/10 text-destructive" : req.priority === "high" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>{titleCase(req.priority)}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{relativeDay(req.created_at)}</span>
      </div>
      <label className="mt-2 block text-[10px] font-semibold text-muted-foreground">
        Move stage
        <select disabled={!movable} value="" onChange={(event) => {
            const target = event.target.value as WorkRequiredStatus;
            if (target) onRequestTransition({ req, target, source: "keyboard" });
            event.currentTarget.value = "";
        }} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Move ${req.title} to another stage`}>
          <option value="">Choose stage…</option>
          {PIPELINE_STAGES.filter((stage) => stage.key !== req.status).map((stage) => {
              const decision = evaluateWorkRequiredTransition(db, req, stage.key);
              return <option key={stage.key} value={stage.key} disabled={!decision.allowed}>{stage.label}{decision.allowed ? "" : " — unavailable"}</option>;
          })}
        </select>
      </label>
    </article>);
}

function ProgressionCard({ entry, customer, onOpen }: {
    entry: ProgressionPipelineEntry;
    customer?: Customer;
    onOpen: () => void;
}) {
    return (<article className="rounded-lg border border-border bg-gradient-to-br from-card to-muted/20 p-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {customer && <Avatar name={customer.name} size={28}/>} 
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{customer?.name || entry.title}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{entry.source === "site_progress" ? entry.title : "Site not created yet"}</span>
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge label={entry.progress_label} className="bg-primary/10 text-primary border-primary/20"/>
        <span className="text-[10px] font-medium text-muted-foreground">{entry.source_label}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${entry.progress_label}: ${entry.progress_percent}%`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, entry.progress_percent))}%` }}/>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{entry.progress_percent}%</span>
        <span>{relativeDay(entry.created_at)}</span>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground/70">Read-only here · update the {entry.source === "site_progress" ? "Site stage" : "Customer record"} at its source.</p>
    </article>);
}

function DroppableColumn({ stageKey, children }: { stageKey: WorkRequiredStatus; children: React.ReactNode }) {
    const workflowControlled = stageKey === "accepted";
    const { setNodeRef, isOver } = useDroppable({ id: `drop-${stageKey}`, disabled: workflowControlled });
    return (<div ref={setNodeRef} aria-disabled={workflowControlled || undefined} className={cn("grid min-h-[104px] flex-1 gap-2 rounded-lg p-1 transition-all duration-150 sm:grid-cols-2 xl:grid-cols-3", isOver && !workflowControlled && "bg-primary/[0.06] ring-2 ring-primary/30 ring-offset-1", workflowControlled && "opacity-90")}>
      {children}
    </div>);
}

export function SalesPipelineModule() {
    const db = useRDashStore((state) => state.db);
    const openDetail = useRDashStore((state) => state.openDetail);
    const transitionWorkRequiredStatus = useRDashStore((state) => state.transitionWorkRequiredStatus);
    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
    const [pendingTransition, setPendingTransition] = React.useState<TransitionRequest | null>(null);
    const [transitionReason, setTransitionReason] = React.useState("");

    const commitTransition = React.useCallback((request: TransitionRequest, reason?: string) => {
        try {
            transitionWorkRequiredStatus(request.req.id, request.target, { reason, source: request.source });
            toast.success(`Moved "${request.req.title}" → ${stageLabel(request.target)}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The lifecycle transition was rejected.");
        }
    }, [transitionWorkRequiredStatus]);

    const requestTransition = React.useCallback((request: TransitionRequest) => {
        const decision = evaluateWorkRequiredTransition(db, request.req, request.target);
        if (!decision.allowed) {
            toast.error(decision.reason || "This lifecycle transition is not allowed.");
            return;
        }
        if (decision.requiresReason) {
            setTransitionReason("");
            setPendingTransition(request);
            return;
        }
        commitTransition(request);
    }, [commitTransition, db]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const dropId = String(over.id);
        if (!dropId.startsWith("drop-")) return;
        const target = dropId.replace("drop-", "") as WorkRequiredStatus;
        const req = db.workRequired.find((row) => row.id === active.id);
        if (!req || req.status === target) return;
        requestTransition({ req, target, source: "drag" });
    };

    const [priorityFilter, setPriorityFilter] = React.useState<"all" | "urgent" | "high" | "medium" | "low">("all");
    const filteredWorkRequireds = React.useMemo(() => priorityFilter === "all" ? db.workRequired : db.workRequired.filter((row) => row.priority === priorityFilter), [db.workRequired, priorityFilter]);
    const progressionEntries = React.useMemo(() => buildProgressionPipelineEntries(db), [db]);
    const visibleProgressionEntries = React.useMemo(() => priorityFilter === "all" ? progressionEntries : [], [priorityFilter, progressionEntries]);
    const byStage = React.useMemo(() => {
        const grouped = new Map<WorkRequiredStatus, PipelineBoardItem[]>();
        const add = (stage: WorkRequiredStatus, item: PipelineBoardItem) => grouped.set(stage, [...(grouped.get(stage) || []), item]);
        filteredWorkRequireds.forEach((req) => {
            const customer = db.customers.find((row) => row.id === req.customer_id);
            add(req.status, { kind: "work_required", req, customer });
        });
        visibleProgressionEntries.forEach((entry) => {
            const customer = db.customers.find((row) => row.id === entry.customer_id);
            add(entry.stage, { kind: "progression", entry, customer });
        });
        return grouped;
    }, [filteredWorkRequireds, visibleProgressionEntries, db.customers]);
    const wonWorkRequiredIds = React.useMemo(() => collectWonWorkRequiredIds(db.quotations, db.workOrders), [db.quotations, db.workOrders]);
    const salesMetrics = React.useMemo(() => calculateSalesPipelineMetrics(filteredWorkRequireds, { wonWorkRequiredIds }), [filteredWorkRequireds, wonWorkRequiredIds]);
    const progressionWonCount = visibleProgressionEntries.filter((entry) => entry.stage === "accepted").length;
    const progressionLostCount = visibleProgressionEntries.filter((entry) => entry.stage === "lost").length;
    const progressionDecidedCount = progressionWonCount + progressionLostCount;
    const combinedWonCount = salesMetrics.wonCount + progressionWonCount;
    const combinedDecidedCount = salesMetrics.decidedCount + progressionDecidedCount;
    const combinedOpenCount = salesMetrics.openCount + visibleProgressionEntries.length - progressionDecidedCount;
    const combinedWinRate = combinedDecidedCount > 0 ? Math.round((combinedWonCount / combinedDecidedCount) * 100) : 0;
    const totalLeadCount = filteredWorkRequireds.length + visibleProgressionEntries.length;
    const priorityChips: Array<{ key: typeof priorityFilter; label: string; count: number }> = [
        { key: "all", label: "All", count: db.workRequired.length + progressionEntries.length },
        { key: "urgent", label: "Urgent", count: db.workRequired.filter((row) => row.priority === "urgent").length },
        { key: "high", label: "High", count: db.workRequired.filter((row) => row.priority === "high").length },
        { key: "medium", label: "Medium", count: db.workRequired.filter((row) => row.priority === "medium").length },
        { key: "low", label: "Low", count: db.workRequired.filter((row) => row.priority === "low").length },
    ];

    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Sales Pipeline</h2><p className="text-xs text-muted-foreground">Progression-aware funnel · Work Required lifecycle, then Site or Customer progression</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total leads" value={totalLeadCount} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Won" value={combinedWonCount} tone="success" icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Win rate" value={`${combinedWinRate}%`} hint={`${combinedDecidedCount} decided`} tone="warning" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(salesMetrics.pipelineValue)} hint={`${combinedOpenCount} open`} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      <section aria-label="Priority filter" className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs font-semibold text-muted-foreground">Priority:</span>{priorityChips.map((chip) => { const active = priorityFilter === chip.key; return <button key={chip.key} type="button" aria-pressed={active} onClick={() => setPriorityFilter(chip.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all", active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>{chip.label}<span className={cn("ml-1.5 rounded px-1 text-[10px]", active ? "bg-primary-foreground/20" : "bg-muted")}>{chip.count}</span></button>; })}</section>
      <DndContext sensors={[sensor]} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-3">{PIPELINE_STAGES.map((stage) => { const items = byStage.get(stage.key) || []; const stageValue = items.reduce((sum, item) => sum + (item.kind === "work_required" ? item.req.budget || 0 : 0), 0); return <section key={stage.key} aria-label={`${stage.label} pipeline stage`} className="grid gap-2 rounded-xl border border-border bg-card/30 p-2 sm:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]"><div className={cn("rounded-lg border border-border border-l-4 bg-gradient-to-br px-3 py-2.5 shadow-sm sm:h-full", stage.color, stage.headerBg)}><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><span className="text-sm">{stage.icon}</span>{stage.label}</span><span className={cn("rounded-full bg-card/80 px-2 py-0.5 text-[10px] font-bold tabular-nums", stage.accent)}>{items.length}</span></div>{stageValue > 0 && <p className={cn("mt-1 text-[11px] font-mono font-semibold tabular-nums", stage.accent)}>{formatINRShort(stageValue)}</p>}</div><DroppableColumn stageKey={stage.key}>{items.map((item) => item.kind === "work_required" ? <DraggableCard key={item.req.id} req={item.req} customer={item.customer} db={db} onOpen={() => openDetail("workRequired", item.req.id)} onRequestTransition={requestTransition}/> : <ProgressionCard key={item.entry.id} entry={item.entry} customer={item.customer} onOpen={() => item.entry.site_id ? openDetail("site", item.entry.site_id) : openDetail("customer", item.entry.customer_id)}/>)}{items.length === 0 && <div className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-5 text-center sm:col-span-2 xl:col-span-3"><Plus className="h-4 w-4 text-muted-foreground/60"/><p className="text-[10px] font-semibold text-muted-foreground/80">No items</p><p className="text-[9px] text-muted-foreground/50">No Work Required, Site, or Customer progression at this stage</p></div>}</DroppableColumn></section>; })}</div>
      </DndContext>
      <Dialog open={pendingTransition !== null} onOpenChange={(open) => { if (!open) setPendingTransition(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Confirm lifecycle transition</DialogTitle><DialogDescription>{pendingTransition ? `Move “${pendingTransition.req.title}” from ${stageLabel(pendingTransition.req.status)} to ${stageLabel(pendingTransition.target)}.` : "Provide the required audit reason."}</DialogDescription></DialogHeader><label className="text-xs font-semibold">Reason<Textarea value={transitionReason} onChange={(event) => setTransitionReason(event.target.value)} className="mt-1 min-h-24" placeholder="Explain why this work is being held, lost, resumed, or moved backward." autoFocus/></label><DialogFooter><Button variant="outline" onClick={() => setPendingTransition(null)}>Cancel</Button><Button onClick={() => { if (!pendingTransition) return; const reason = transitionReason.trim(); if (!reason) { toast.error("A reason is required."); return; } commitTransition(pendingTransition, reason); setPendingTransition(null); }}>Confirm move</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>);
}
