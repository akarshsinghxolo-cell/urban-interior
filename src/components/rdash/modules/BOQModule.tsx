"use client";
import * as React from "react";
import { ClipboardList, CheckCircle2, FileEdit, Plus, ArrowRightCircle, FileText, Gavel, RefreshCw, ShoppingCart, Pencil, MessageSquare, } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import type { ContextAction } from "../ContextMenuHost";
import { formatINR, formatINRShort, boqStatusStyle, formatDate, } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkOrderBOQ, LineItem } from "@/lib/rdash/types";

export function BOQModule() {
    const db = useRDashStore((s) => s.db);
    const createBOQ = useRDashStore((s) => s.createBOQ);
    const updateBOQItemRate = useRDashStore((s) => s.updateBOQItemRate);
    const syncBOQFromQuotation = useRDashStore((s) => s.syncBOQFromQuotation);
    const approveBOQ = useRDashStore((s) => s.approveBOQ);
    const createVendorRFQ = useRDashStore((s) => s.createVendorRFQ);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [filter, setFilter] = React.useState<"all" | "draft" | "approved">("all");
    // A-3: Inline-edit state for BOQ rates.
    const [editRateFor, setEditRateFor] = React.useState<{ boq: WorkOrderBOQ; item: LineItem } | null>(null);
    const [editRate, setEditRate] = React.useState("");
    const [editReason, setEditReason] = React.useState("");
    // A-3: Quick "sync from quotation" action targets a specific BOQ.
    const handleSyncFromQuotation = (boq: WorkOrderBOQ) => {
        try {
            syncBOQFromQuotation(boq.id);
            toast.success(`Synced BOQ rates from the linked quotation.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not sync BOQ rates.");
        }
    };
    // F: Generate a vendor RFQ from an approved BOQ.
    const handleGenerateRFQ = (boq: WorkOrderBOQ) => {
        try {
            const rfqId = createVendorRFQ(boq.work_order_id);
            if (!rfqId) {
                toast.error("Could not create vendor RFQ.");
                return;
            }
            toast.success(`Vendor RFQ created from ${boq.title} — opening Procurement.`);
            setActiveModule("procurementInventory");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create vendor RFQ.");
        }
    };
    // F: Quick approve BOQ inline.
    const handleApprove = (boq: WorkOrderBOQ) => {
        try {
            approveBOQ(boq.id);
            toast.success(`BOQ ${boq.title} approved — ready for procurement.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "BOQ approval blocked.");
        }
    };
    // A-3: Save the inline-edited rate.
    const saveEditedRate = () => {
        if (!editRateFor)
            return;
        const newRate = Number(editRate);
        if (!Number.isFinite(newRate) || newRate < 0) {
            toast.error("Rate must be a non-negative number.");
            return;
        }
        try {
            updateBOQItemRate(editRateFor.boq.id, editRateFor.item.id, newRate, editReason.trim() || undefined);
            toast.success(`Rate updated to ${formatINR(newRate)} for "${editRateFor.item.title}".`);
            setEditRateFor(null);
            setEditRate("");
            setEditReason("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update BOQ rate.");
        }
    };
    const boqs = db.boqs;
    const approvedBoqs = React.useMemo(() => boqs.filter((b) => b.status === "approved"), [boqs]);
    const draftBoqs = React.useMemo(() => boqs.filter((b) => b.status === "draft"), [boqs]);
    const jobsWithoutBoq = React.useMemo(() => db.workOrders.filter((j) => !boqs.some((b) => b.work_order_id === j.id)), [db.workOrders, boqs]);
    const acceptedScopesAwaitingAward = React.useMemo(() => db.acceptedScopes.filter((scope) => scope.status === "contractor_bidding"), [db.acceptedScopes]);
    const materialValue = React.useMemo(() => boqs.reduce((n, b) => n + b.total_amount, 0), [boqs]);
    // F: Approved BOQs that don't yet have a vendor RFQ — show a callout.
    const approvedWithoutRFQ = React.useMemo(() => approvedBoqs.filter((b) => !db.vendorRfqs.some((r) => r.boq_id === b.id && r.status !== "closed")), [approvedBoqs, db.vendorRfqs]);
    const metrics: MetricSpec[] = [
        { label: "Total BOQs", value: boqs.length, icon: <ClipboardList className="h-4 w-4"/> },
        {
            label: "Approved",
            value: approvedBoqs.length,
            tone: "success",
            icon: <CheckCircle2 className="h-4 w-4"/>,
        },
        {
            label: "Draft",
            value: draftBoqs.length,
            tone: "warning",
            icon: <FileEdit className="h-4 w-4"/>,
        },
        {
            label: "Material value",
            value: formatINRShort(materialValue),
            tone: "primary",
            icon: <FileText className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: boqs.length, active: filter === "all" },
        {
            id: "draft",
            label: "Draft",
            count: draftBoqs.length,
            active: filter === "draft",
        },
        {
            id: "approved",
            label: "Approved",
            count: approvedBoqs.length,
            active: filter === "approved",
        },
    ];
    const buildBoqRow = (b: (typeof boqs)[number]): RecordRow => {
        const hasRFQ = db.vendorRfqs.some((r) => r.boq_id === b.id && r.status !== "closed");
        const actions: ContextAction[] = [
            {
                label: "Open BOQ",
                onClick: () => openDetail("boq", b.id),
            },
            // A-4: Re-pull rates from the linked quotation.
            {
                label: "Sync rates from quotation",
                icon: <RefreshCw className="h-3.5 w-3.5"/>,
                onClick: () => handleSyncFromQuotation(b),
                separatorBefore: true,
            },
            {
                label: "Open workOrder",
                onClick: () => openDetail("workOrder", b.work_order_id),
            },
        ];
        // F: Approved BOQs get a "Generate vendor RFQ" action when no open RFQ exists.
        if (b.status === "approved" && !hasRFQ) {
            actions.push({
                label: "Generate vendor RFQ",
                icon: <ShoppingCart className="h-3.5 w-3.5"/>,
                onClick: () => handleGenerateRFQ(b),
                separatorBefore: true,
            });
        }
        // Draft BOQs get an inline "Approve" quick action.
        if (b.status === "draft") {
            actions.push({
                label: "Approve BOQ",
                icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
                onClick: () => handleApprove(b),
            });
        }
        // A-3: Inline-edit rate badge on each row indicating the BOQ has at
        // least one editable rate.
        const editableBadge = (<span title="Click an item rate to edit inline" className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0 text-[10px] font-semibold text-primary">
            <Pencil className="h-2.5 w-2.5"/> Rates editable
        </span>);
        return {
            id: b.id,
            title: b.title,
            subtitle: `${b.work_order_no} · ${(b.customer_name || "Customer")}`,
            amount: b.total_amount,
            status: boqStatusStyle(b.status),
            meta: `${b.items.length} items · ${formatINRShort(b.total_amount)}`,
            detailKind: "boq",
            contextActions: actions,
            badge: editableBadge,
        };
    };
    const handleCreateBOQForJob = (workOrderId: string) => {
        const id = createBOQ(workOrderId);
        if (!id) {
            toast.error("Could not create BOQ — workOrder not found.");
            return;
        }
        openDetail("boq", id);
        toast.success("BOQ created for the awarded work order — rates carried from the quotation.");
    };
    const openContractorBidding = () => {
        setActiveModule("siteExecution");
        toast.info("Select the site, then compare contractor bids before creating a work order.");
    };
    const jobsWithoutBoqRows: RecordRow[] = jobsWithoutBoq.map((j) => ({
        id: j.id,
        title: `${j.work_order_no} · ${j.title}`,
        subtitle: (j.customer_name || "Customer"),
        meta: "No BOQ yet",
        detailKind: "workOrder",
        badge: (<Button type="button" size="sm" variant="outline" className="h-6 rounded-full border-primary/30 px-2 py-0 text-[10px] font-semibold text-primary hover:bg-primary/10" onClick={(e) => {
                e.stopPropagation();
                handleCreateBOQForJob(j.id);
            }}>
        <Plus className="mr-1 h-3 w-3"/> Create BOQ
      </Button>),
        contextActions: [
            {
                label: "Create BOQ",
                icon: <Plus className="h-3.5 w-3.5"/>,
                onClick: () => handleCreateBOQForJob(j.id),
            },
            {
                label: "Open workOrder",
                onClick: () => openDetail("workOrder", j.id),
            },
        ],
    }));
    const queues: QueueSpec[] = [];
    if (filter === "all" || filter === "approved") {
        queues.push({
            title: "Approved BOQs",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: approvedBoqs.map(buildBoqRow),
            emptyHint: "No approved BOQs yet — approve a draft to begin procurement.",
            defaultOpen: true,
        });
    }
    if (filter === "all" || filter === "draft") {
        queues.push({
            title: "Draft BOQs",
            icon: <FileEdit className="h-4 w-4 text-warning"/>,
            records: draftBoqs.map(buildBoqRow),
            emptyHint: "No draft BOQs. Award a contractor bid, then create the work-order material plan.",
            defaultOpen: true,
        });
    }
    if (filter === "all") {
        queues.push({
            title: "Work Orders without BOQ",
            icon: <ArrowRightCircle className="h-4 w-4 text-primary"/>,
            records: jobsWithoutBoqRows,
            emptyHint: "Every workOrder has a material plan — nice work.",
            defaultOpen: jobsWithoutBoqRows.length > 0,
        });
    }
    const onCreate = () => {
        if (jobsWithoutBoq.length > 0) {
            handleCreateBOQForJob(jobsWithoutBoq[0].id);
            return;
        }
        if (acceptedScopesAwaitingAward.length > 0) {
            openContractorBidding();
            return;
        }
        toast.info("Award a contractor bid before creating a material BOQ.");
    };
    return (<div className="flex flex-col gap-4">
      {acceptedScopesAwaitingAward.length > 0 && (<AwaitingAwardCallout count={acceptedScopesAwaitingAward.length} onOpen={openContractorBidding}/>)}
      {/* F: Banner — approved BOQs without an open RFQ */}
      {approvedWithoutRFQ.length > 0 && (<ApprovedAwaitingRFQCallout boqs={approvedWithoutRFQ} onGenerate={handleGenerateRFQ} onOpen={(b) => openDetail("boq", b.id)}/>)}
      <OperationsWorkspace title="BOQ / Material Plan" description="Material planning for awarded work orders — rates carry from the quotation and are editable inline for negotiation" icon={<ClipboardList className="h-4 w-4"/>} workflow={["Accepted scope", "Contractor award", "Work Order", "BOQ", "PO", "GRN", "Vendor payment"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => setFilter(id as typeof filter)} queues={queues} onCreate={onCreate} createLabel="+ Create BOQ" searchPlaceholder="Search BOQs…"/>
      {/* A-3: Inline rate edit dialog */}
      <Dialog open={editRateFor !== null} onOpenChange={(v) => { if (!v) { setEditRateFor(null); setEditRate(""); setEditReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary"/> Edit BOQ rate
            </DialogTitle>
            <DialogDescription>
              {editRateFor ? `${editRateFor.item.title} · ${editRateFor.item.quantity} ${editRateFor.item.unit_name || ""} — current rate ${formatINR(editRateFor.item.rate)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>New rate (₹) *</span>
              <Input type="number" min={0} step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder="0.00" autoFocus/>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>Negotiation reason (audit trail)</span>
              <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g. Vendor negotiated 5% discount on bulk order; revised quotation dated 2026-07-15." rows={2}/>
            </label>
            {editRateFor && editRateFor.item.rate_change_reason && (<div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold">Last rate change:</span> {editRateFor.item.rate_change_reason}
                {editRateFor.item.rate_last_changed_by ? ` · by ${editRateFor.item.rate_last_changed_by}` : ""}
                {editRateFor.item.rate_last_changed_at ? ` · ${formatDate(editRateFor.item.rate_last_changed_at)}` : ""}
              </div>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRateFor(null); setEditRate(""); setEditReason(""); }}>Cancel</Button>
            <Button onClick={saveEditedRate} disabled={!editRate}>
              <Pencil className="mr-1.5 h-3.5 w-3.5"/> Save rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* A-3: BOQ line-items inspector — lets the user open any BOQ and edit
          its rates inline. */}
      <BOQRateEditor boqs={boqs} onEditRate={(boq, item) => { setEditRateFor({ boq, item }); setEditRate(String(item.rate || "")); setEditReason(""); }} onSync={handleSyncFromQuotation} onApprove={handleApprove} onGenerateRFQ={handleGenerateRFQ}/>
    </div>);
}

/**
 * A-3: Compact inspector showing every BOQ and its line items, with the rate
 * column editable inline (click pencil). Reveals the rate-negotiation tooltip
 * showing the last-changed reason. Hosts "Sync from quotation", "Approve", and
 * "Generate vendor RFQ" actions per BOQ.
 */
function BOQRateEditor({ boqs, onEditRate, onSync, onApprove, onGenerateRFQ }: {
    boqs: WorkOrderBOQ[];
    onEditRate: (boq: WorkOrderBOQ, item: LineItem) => void;
    onSync: (boq: WorkOrderBOQ) => void;
    onApprove: (boq: WorkOrderBOQ) => void;
    onGenerateRFQ: (boq: WorkOrderBOQ) => void;
}) {
    const [expandedBoqId, setExpandedBoqId] = React.useState<string | null>(boqs[0]?.id || null);
    React.useEffect(() => {
        if (!boqs.some((b) => b.id === expandedBoqId))
            setExpandedBoqId(boqs[0]?.id || null);
    }, [boqs, expandedBoqId]);
    if (!boqs.length)
        return null;
    return (<section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Pencil className="h-4 w-4 text-primary"/> BOQ line items &amp; rate negotiation</h3>
        <p className="text-xs text-muted-foreground">Click a rate to edit it inline (rate-negotiation audit trail). Use "Sync from quotation" to re-pull negotiated rates.</p>
      </div>
      <div className="divide-y divide-border">
        {boqs.map((boq) => {
            const isExpanded = expandedBoqId === boq.id;
            const hasRFQ = false; // (caller decides whether to show RFQ action)
            return (<div key={boq.id}>
              <button type="button" onClick={() => setExpandedBoqId(isExpanded ? null : boq.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{boq.title}</p>
                  <p className="text-[11px] text-muted-foreground">{boq.work_order_no} · {boq.items.length} items · {formatINRShort(boq.total_amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${boq.status === "approved" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>
                    {boq.status}
                  </span>
                </div>
              </button>
              {isExpanded && (<div className="px-4 pb-4">
                <div className="overflow-x-auto rd-scroll">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Last change</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {boq.items.map((item) => {
                        const lastChange = (item as any).rate_change_reason
                            ? `${(item as any).rate_change_reason}${(item as any).rate_last_changed_by ? ` · ${(item as any).rate_last_changed_by}` : ""}${(item as any).rate_last_changed_at ? ` · ${formatDate((item as any).rate_last_changed_at)}` : ""}`
                            : "—";
                        return (<tr key={item.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <p className="truncate font-medium text-foreground">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground">{item.unit_name || ""}{item.work_required_article_id ? ` · scoped` : ""}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            <button type="button" onClick={() => onEditRate(boq, item)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-primary/10 hover:text-primary" title="Click to edit this rate">
                              {formatINR(item.rate || 0)}
                              <Pencil className="h-2.5 w-2.5 opacity-60"/>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{formatINR(item.amount || 0)}</td>
                          <td className="px-3 py-2 text-right text-[10px] text-muted-foreground" title={lastChange}>
                            <span className="inline-flex max-w-[220px] truncate items-center gap-1">
                              <MessageSquare className="h-2.5 w-2.5 shrink-0"/>
                              {lastChange}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onEditRate(boq, item)}>
                              <Pencil className="mr-1 h-3 w-3"/> Edit
                            </Button>
                          </td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => onSync(boq)}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5"/> Sync from quotation
                  </Button>
                  {boq.status === "draft" && (<Button size="sm" variant="outline" onClick={() => onApprove(boq)}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Approve BOQ
                  </Button>)}
                  {boq.status === "approved" && !hasRFQ && (<Button size="sm" onClick={() => onGenerateRFQ(boq)}>
                    <ShoppingCart className="mr-1.5 h-3.5 w-3.5"/> Generate vendor RFQ
                  </Button>)}
                </div>
              </div>)}
            </div>);
        })}
      </div>
    </section>);
}

function AwaitingAwardCallout({ count, onOpen }: {
    count: number;
    onOpen: () => void;
}) {
    return (<div className="rounded-[var(--panel-radius)] border border-warning/25 bg-warning/[0.04] p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Gavel className="h-4 w-4 text-warning"/>
        <h3 className="text-sm font-semibold text-foreground">Contractor award required before BOQ</h3>
        <span className="rounded-full bg-warning/15 px-2 py-0 text-[11px] font-medium text-warning">{count} accepted scope{count === 1 ? "" : "s"}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Customer-approved work is waiting for contractor comparison. Award the contractor first; only then does the work order own the material BOQ.
      </p>
      <Button type="button" size="sm" onClick={onOpen}>
        <Gavel className="mr-1.5 h-3.5 w-3.5"/> Open contractor bidding
      </Button>
    </div>);
}

/**
 * F: Banner that surfaces approved BOQs that are ready for procurement but
 * don't yet have a vendor RFQ. Each row has a "Generate vendor RFQ" button
 * that calls createVendorRFQ(workOrderId) and deep-links to Procurement.
 */
function ApprovedAwaitingRFQCallout({ boqs, onGenerate, onOpen }: {
    boqs: WorkOrderBOQ[];
    onGenerate: (boq: WorkOrderBOQ) => void;
    onOpen: (boq: WorkOrderBOQ) => void;
}) {
    return (<div className="rounded-[var(--panel-radius)] border border-success/25 bg-success/[0.04] p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-success"/>
        <h3 className="text-sm font-semibold text-foreground">This BOQ is ready for procurement</h3>
        <span className="rounded-full bg-success/15 px-2 py-0 text-[11px] font-medium text-success">{boqs.length} approved BOQ{boqs.length === 1 ? "" : "s"} without RFQ</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Approved BOQs have negotiated rates — issue a vendor RFQ to start the procurement flow. The RFQ will pre-fill from the BOQ items.
      </p>
      <div className="flex flex-col gap-1.5">
        {boqs.slice(0, 5).map((b) => (<div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium">{b.title}</p>
              <p className="text-[10px] text-muted-foreground">{b.work_order_no} · {b.items.length} items · {formatINRShort(b.total_amount)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onOpen(b)}>Open</Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={() => onGenerate(b)}>
                <ShoppingCart className="mr-1 h-3 w-3"/> Generate vendor RFQ
              </Button>
            </div>
          </div>))}
      </div>
    </div>);
}
