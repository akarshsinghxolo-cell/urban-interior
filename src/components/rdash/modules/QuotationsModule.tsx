"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { FileText, Search, Plus, Send, CheckCircle2, XCircle, CheckSquare, RefreshCw, GitBranch, ShieldAlert, } from "lucide-react";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { BulkActionBar, SelectCheckbox, type BulkAction } from "../BulkActions";
import { ContextRow, type ContextAction } from "../ContextMenuHost";
import { buildQuotationActions } from "../recordActions";
import { quotationStatusStyle, formatINR, formatINRShort, formatDate, titleCase, } from "@/lib/rdash/format";
import type { FilterPreset } from "@/lib/rdash/modules";
import type { QuotationStatus } from "@/lib/rdash/types";
import { toast } from "sonner";
import { calculateQuotationMetrics } from "@/lib/rdash/metrics";

// Provenance badge for quotation revisions — shows whether this is an original,
// a renegotiation, or a variation (post-Work-Order change order).
function QuotationRevisionBadge({ kind, reason }: { kind?: string; reason?: string }) {
    if (kind === "renegotiation") {
        return (<span title={reason || "Renegotiated after acceptance"} className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
            <RefreshCw className="h-2.5 w-2.5"/> Renegotiation
        </span>);
    }
    if (kind === "variation") {
        return (<span title={reason || "Variation after Work Order"} className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
            <GitBranch className="h-2.5 w-2.5"/> Variation
        </span>);
    }
    return null;
}
// C: pending-discount-approval badge + inline approve button.
function PendingApprovalBadge({ quotation, onApprove }: {
    quotation: { pending_approval?: boolean; approval_reason?: string; discount_pct?: number; quotation_no: string };
    onApprove: () => void;
}) {
    if (!quotation.pending_approval)
        return null;
    return (<div className="mt-2 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/[0.08] px-2 py-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning"/>
        <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase text-warning">Pending owner approval</p>
            <p className="truncate text-[10px] text-muted-foreground" title={quotation.approval_reason}>{quotation.approval_reason || "Discount exceeds policy threshold."}</p>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(); }} className="inline-flex items-center gap-1 rounded-md bg-success px-2 py-1 text-[10px] font-semibold text-success-foreground hover:bg-success/90">
            <CheckCircle2 className="h-3 w-3"/> Approve
        </button>
    </div>);
}
type StatusKey = "all" | "draft" | "sent" | "accepted" | "rejected" | "cancelled";
const STATUS_CHIPS: {
    key: StatusKey;
    label: string;
}[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "sent", label: "Sent" },
    { key: "accepted", label: "Accepted" },
    { key: "rejected", label: "Rejected / Lost" },
    { key: "cancelled", label: "Cancelled" },
];
function toStatusKey(s: string | undefined): StatusKey {
    if (!s)
        return "all";
    const first = s.split(",")[0];
    return (STATUS_CHIPS.some((c) => c.key === first) ? first : "all") as StatusKey;
}
export function QuotationsModule({ filterPresets, statusFilter, view, }: {
    filterPresets?: FilterPreset[];
    statusFilter?: string;
    view?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const approveQuotationDiscount = useRDashStore((s) => s.approveQuotationDiscount);
    const openDetail = useRDashStore((s) => s.openDetail);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const quoteDispatch = React.useMemo(() => ({ updateQuotation }), [updateQuotation]);
    const handleApproveDiscount = (id: string, label: string) => {
        try {
            approveQuotationDiscount(id);
            toast.success(`Discount approved for ${label}`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not approve discount");
        }
    };
    const [q, setQ] = React.useState("");
    const presets = filterPresets && filterPresets.length > 0 ? filterPresets : null;
    const initialStatus: StatusKey = presets
        ? toStatusKey(presets[0].filter?.status)
        : toStatusKey(statusFilter);
    const [activeStatus, setActiveStatus] = React.useState<StatusKey>(initialStatus);
    // STAGE-4-FIX: sync activeStatus from prop changes (saved-view navigation)
    React.useEffect(() => { if (statusFilter) setActiveStatus(toStatusKey(statusFilter)); }, [statusFilter]);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const currentPresetId = React.useMemo(() => {
        if (!presets)
            return undefined;
        const match = presets.find((p) => toStatusKey(p.filter?.status) === activeStatus);
        return match?.id;
    }, [presets, activeStatus]);
    const handleStatusChange = (key: StatusKey) => {
        setActiveStatus(key);
        setActiveSavedViewId(null);
    };
    const handleSearchChange = (val: string) => {
        setQ(val);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (view: SavedView) => {
        const statusKey = toStatusKey(view.presetId ? presets?.find((p) => p.id === view.presetId)?.filter?.status : view.extra?.status);
        setActiveStatus(statusKey);
        setQ(view.search || "");
        setActiveSavedViewId(view.id);
    };
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
    const bulkActions: BulkAction[] = [
        {
            label: "Send",
            icon: <Send className="h-3.5 w-3.5"/>,
            onClick: (ids) => { ids.forEach((id) => updateQuotation(id, { status: "sent" })); toast.success(`${ids.length} quotation${ids.length > 1 ? "s" : ""} sent`); clearSelection(); },
        },
        {
            label: "Reject",
            icon: <XCircle className="h-3.5 w-3.5"/>,
            variant: "destructive",
            onClick: (ids) => { ids.forEach((id) => updateQuotation(id, { status: "rejected" })); toast.warning(`${ids.length} quotation${ids.length > 1 ? "s" : ""} rejected`); clearSelection(); },
        },
    ];
    const isRevisions = view === "revisions";
    const isConversion = view === "conversion";
    const filteredQuotes = React.useMemo(() => {
        let list = db.quotations;
        if (isRevisions) {
            list = list.filter((qq) => !!qq.parent_quotation_id || qq.revision_no > 0);
        }
        else if (isConversion) {
            list = list.filter((qq) => ["draft", "sent", "rejected", "expired", "accepted"].includes(qq.status) || qq.work_order_ids.length > 0);
        }
        else {
            if (activeStatus === "rejected") {
                list = list.filter((qq) => qq.status === "rejected" || qq.status === "expired");
            }
            else if (activeStatus !== "all") {
                list = list.filter((qq) => qq.status === (activeStatus as QuotationStatus));
            }
        }
        if (q) {
            const needle = q.toLowerCase();
            list = list.filter((qq) => qq.quotation_no.toLowerCase().includes(needle) ||
                (qq.customer_name || "Customer").toLowerCase().includes(needle) ||
                qq.title.toLowerCase().includes(needle));
        }
        return list;
    }, [db.quotations, activeStatus, q, isRevisions, isConversion]);
    const quotationMetrics = React.useMemo(
        () => calculateQuotationMetrics(db.quotations),
        [db.quotations],
    );
    const totalPipeline = quotationMetrics.pipelineValue;
    const acceptedValue = quotationMetrics.acceptedValue;
    const openQuotes = quotationMetrics.openCount;
    const acceptedCount = quotationMetrics.acceptedCount;
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {isConversion ? "Quotation to Contractor Handoff" : isRevisions ? "Revision Manager" : "Quotation List"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isConversion
            ? "Customer acceptance opens contractor bidding; a work order is created only after contractor award"
            : isRevisions
                ? "Quotations with multiple revisions"
                : "Estimate register with status filters"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56 sm:max-w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <input value={q} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Search quotations…" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
          </div>
          {!isRevisions && (<>
              <button type="button" onClick={() => { setSelectMode((s) => !s); if (selectMode)
            setSelectedIds(new Set()); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", selectMode ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <CheckSquare className="h-3.5 w-3.5"/> {selectMode ? "Exit select" : "Select"}
              </button>
              {selectMode && filteredQuotes.length > 1 && (<button type="button" onClick={() => setSelectedIds(new Set(filteredQuotes.map((qq) => qq.id)))} className="text-[11px] font-medium text-primary hover:underline">
                  Select all ({filteredQuotes.length})
                </button>)}
            </>)}
          <button type="button" onClick={() => openCreateDialog({ kind: "quotation" })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5"/> New quote
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Quotations" value={quotationMetrics.totalCount} tone="primary" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Accepted" value={acceptedCount} tone="success" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Open (draft+sent)" value={openQuotes} tone="warning" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(totalPipeline)} tone="default" icon={<FileText className="h-4 w-4"/>}/>
      </div>
      {isConversion && (<div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="Awaiting decision" value={quotationMetrics.current.filter((quote) => quote.status === "sent").length} tone="warning"/>
          <MetricCard label="Accepted, awaiting contractor award" value={quotationMetrics.current.filter((quote) => quote.status === "accepted" && quote.work_order_ids.length === 0).length} tone="primary"/>
          <MetricCard label="Awarded into work orders" value={quotationMetrics.current.filter((quote) => quote.work_order_ids.length > 0).length} tone="success"/>
        </div>)}
      {!isRevisions && !isConversion && (<div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Quotation status">
          {STATUS_CHIPS.map((c) => {
                const active = c.key === activeStatus;
                return (<button key={c.key} type="button" role="tab" aria-selected={active} onClick={() => handleStatusChange(c.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
                {c.label}
              </button>);
            })}
        </div>)}
      {!isRevisions && (<SavedViewsBar workspaceKey="quotations" presets={presets} currentPresetId={currentPresetId} currentSearch={q} currentExtra={{ status: activeStatus }} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>)}

      {filteredQuotes.length === 0 ? (<EmptyState title="No quotations in this view" description="Try a different status filter or create a new quotation." icon={<FileText className="h-8 w-8"/>}/>) : (<>
          {!isRevisions && selectMode && (<BulkActionBar selectedIds={selectedArr} totalCount={filteredQuotes.length} onClear={clearSelection} actions={bulkActions}/>)}
          <div className="rd-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredQuotes.map((qq) => {
                const actions: ContextAction[] = buildQuotationActions(qq.id, quoteDispatch, {
                    onOpen: () => openDetail("quotation", qq.id),
                });
                const style = quotationStatusStyle(qq.status);
                const checked = selectedIds.has(qq.id);
                if (!isRevisions && selectMode) {
                    return (<div key={qq.id} className={cn("group flex items-start gap-3 rounded-[var(--panel-radius)] border border-border bg-card px-3.5 py-3 shadow-card transition-all", checked && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20")}>
                    <SelectCheckbox checked={checked} onToggle={toggleSelect} id={qq.id}/>
                    <Avatar name={(qq.customer_name || "Customer")} size={36}/>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{qq.quotation_no}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{(qq.customer_name || "Customer")}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <QuotationRevisionBadge kind={qq.revision_kind} reason={qq.revision_reason}/>
                          <StatusBadge label={style.label} className={style.className}/>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground" title={qq.title}>{qq.title}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-foreground">{formatINR(qq.total_amount)}</span>
                        <span className="text-muted-foreground">Rev {qq.revision_no} · valid {formatDate(qq.valid_until)}</span>
                      </div>
                      <PendingApprovalBadge quotation={qq} onApprove={() => handleApproveDiscount(qq.id, qq.quotation_no)}/>
                    </div>
                  </div>);
                }
                return (<ContextRow key={qq.id} actions={actions} className="group rounded-[var(--panel-radius)] border border-border border-l-2 border-l-transparent bg-card px-3.5 py-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-gradient-to-br hover:from-card hover:to-accent/30 hover:shadow-soft">
                <div role="button" tabIndex={0} onClick={() => openDetail("quotation", qq.id)} onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDetail("quotation", qq.id);
                        }
                    }} className="flex cursor-pointer items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-[var(--panel-radius)]">
                  <Avatar name={(qq.customer_name || "Customer")} size={36}/>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{qq.quotation_no}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{(qq.customer_name || "Customer")}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <QuotationRevisionBadge kind={qq.revision_kind} reason={qq.revision_reason}/>
                        <StatusBadge label={style.label} className={style.className}/>
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground" title={qq.title}>{qq.title}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-foreground">{formatINR(qq.total_amount)}</span>
                      <span className="text-muted-foreground">Rev {qq.revision_no} · valid {formatDate(qq.valid_until)}</span>
                    </div>
                    <PendingApprovalBadge quotation={qq} onApprove={() => handleApproveDiscount(qq.id, qq.quotation_no)}/>
                  </div>
                </div>
              </ContextRow>);
            })}
          </div>
        </>)}

      {isRevisions && acceptedValue > 0 && (<p className="text-[11px] text-muted-foreground">
          Accepted pipeline value: <span className="font-semibold text-foreground">{formatINR(acceptedValue)}</span>
        </p>)}
    </div>);
}
