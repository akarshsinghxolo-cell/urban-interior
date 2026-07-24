"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type DetailPanelKind } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState, WorkflowChip, WorkflowConnector } from "./primitives";
import { ContextRow, type ContextAction } from "./ContextMenuHost";
import { formatINRShort, relativeDay } from "@/lib/rdash/format";
import { Search, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUEUE_PAGE_SIZE = 25;

export interface MetricSpec {
    label: string;
    value: React.ReactNode;
    tone?: "default" | "primary" | "warning" | "destructive" | "success";
    icon?: React.ReactNode;
    onClick?: () => void;
}
export interface QueueSpec {
    title: string;
    icon?: React.ReactNode;
    records: RecordRow[];
    emptyHint?: string;
    defaultOpen?: boolean;
}
export interface RecordRow {
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
    meta?: string;
    detailKind: DetailPanelKind;
    contextActions?: ContextAction[];
    badge?: React.ReactNode;
}
export interface FilterChip {
    id: string;
    label: string;
    count?: number;
    active?: boolean;
}
export function OperationsWorkspace({ title, description, icon, workflow, metrics, filterChips, onFilterChange, queues, onCreate, createLabel = "+ Create", searchPlaceholder = "Search records…", searchFilter, secondaryActions, }: {
    title: string;
    description: string;
    icon?: React.ReactNode;
    workflow?: string[];
    metrics: MetricSpec[];
    filterChips?: FilterChip[];
    onFilterChange?: (id: string) => void;
    queues: QueueSpec[];
    onCreate?: () => void;
    createLabel?: string;
    searchPlaceholder?: string;
    searchFilter?: (q: string) => void;
    /** Additional action buttons rendered next to the primary Create button
     *  (e.g. "Direct Award PO" — an audited exception path that skips formal bidding). */
    secondaryActions?: Array<{ label: string; icon?: React.ReactNode; onClick: () => void; variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"; }>;
}) {
    const [q, setQ] = React.useState("");
    React.useEffect(() => {
        searchFilter?.(q);
    }, [q, searchFilter]);
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>}
          <div>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 max-w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
          </div>
          {secondaryActions?.map((action, i) => (<Button key={i} size="sm" variant={action.variant || "outline"} onClick={action.onClick}>
              {action.icon}{action.label}
            </Button>))}
          {onCreate && (<Button size="sm" onClick={onCreate}>
              <Plus className="mr-1 h-3.5 w-3.5"/> {createLabel.replace("+ ", "")}
            </Button>)}
        </div>
      </div>

      {metrics.length > 0 && (<section aria-label="Module metrics" className="rd-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((m, i) => (<MetricCard key={i} {...m}/>))}
        </section>)}

      {workflow && workflow.length > 0 && (<section aria-label="Module workflow steps" className="flex flex-wrap items-center gap-1.5 rounded-[var(--panel-radius)] border border-border bg-card/60 p-3 shadow-card">
          {workflow.map((step, i) => (<React.Fragment key={i}>
              <WorkflowChip index={i + 1} label={step} state={i === 0 ? "done" : i === 1 ? "active" : "pending"}/>
              {i < workflow.length - 1 && (<WorkflowConnector active={i === 0}/>)}
            </React.Fragment>))}
        </section>)}

      {filterChips && filterChips.length > 0 && (<div className="flex flex-wrap items-center gap-1.5">
          <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground"/>
          {filterChips.map((c) => (<button key={c.id} type="button" onClick={() => onFilterChange?.(c.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", c.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
              {c.label}
              {c.count != null && (<span className={cn("rounded-full px-1.5 text-[10px]", c.active ? "bg-primary-foreground/20" : "bg-muted")}>
                  {c.count}
                </span>)}
            </button>))}
        </div>)}

      <div className="rd-stagger space-y-4">
        {queues.map((queue, qi) => (<QueueBlock key={`${queue.title}-${qi}`} queue={queue}/>))}
      </div>
    </div>);
}
function QueueBlock({ queue }: {
    queue: QueueSpec;
}) {
    const [open, setOpen] = React.useState(queue.defaultOpen !== false);
    const [visibleCount, setVisibleCount] = React.useState(QUEUE_PAGE_SIZE);
    React.useEffect(() => {
        setVisibleCount(QUEUE_PAGE_SIZE);
    }, [queue.title, queue.records.length]);
    const visibleRecords = queue.records.slice(0, visibleCount);
    const remaining = Math.max(0, queue.records.length - visibleRecords.length);
    return (<div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5 text-left">
        <div className="flex items-center gap-2">
          {queue.icon}
          <h3 className="text-sm font-semibold text-foreground">{queue.title}</h3>
          <span className="rounded-full bg-muted px-2 py-0 text-[11px] font-medium text-muted-foreground">
            {queue.records.length}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (<div className="p-2">
          {queue.records.length === 0 ? (<EmptyState tone="default" title={queue.emptyHint || "No records yet"} description="Records will appear here as they are created." icon={queue.icon}/>) : (<>
            <div className="space-y-1.5">
              {visibleRecords.map((r) => (<RecordRowItem key={r.id} row={r}/>))}
            </div>
            {remaining > 0 && (<div className="mt-2 flex justify-center border-t border-border/70 px-2 pt-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setVisibleCount((count) => count + QUEUE_PAGE_SIZE)}>
                Show {Math.min(QUEUE_PAGE_SIZE, remaining)} more · {remaining} remaining
              </Button>
            </div>)}
          </>)}
        </div>)}
    </div>);
}
function RecordRowItem({ row }: {
    row: RecordRow;
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const actions = row.contextActions || [
        {
            label: "Open",
            icon: "eye",
            onSelect: () => openDetail(row.detailKind, row.id),
        },
    ];
    return (<ContextRow actions={actions} className="group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all hover:border-border hover:bg-accent/30">
      <div role="button" tabIndex={0} onClick={() => openDetail(row.detailKind, row.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(row.detailKind, row.id);
    } }} className="flex flex-1 cursor-pointer items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md">
        {row.customerName && <Avatar name={row.customerName} size={34}/>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {row.badge}
              {row.status && <StatusBadge label={row.status.label} className={row.status.className}/>}
            </div>
          </div>
          {row.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.subtitle}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {row.due && <span>Due {relativeDay(row.due)}</span>}
            {row.amount != null && row.amount > 0 && (<span className="font-semibold text-foreground/80">{formatINRShort(row.amount)}</span>)}
            {row.meta && <span className="truncate">{row.meta}</span>}
          </div>
        </div>
      </div>
    </ContextRow>);
}
