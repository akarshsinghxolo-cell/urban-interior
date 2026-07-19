"use client";
import * as React from "react";
import { Wrench, Send, CheckCircle2, Boxes, Package, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import { formatINR, formatINRShort, formatDate, dispatchStatusStyle, } from "@/lib/rdash/format";
import type { LineItem, WorkOrder, InventoryItem } from "@/lib/rdash/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
function genItemId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}
export function DispatchModule({ view }: {
    view?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const acknowledgeDispatch = useRDashStore((s) => s.acknowledgeDispatch);
    const openDetail = useRDashStore((s) => s.openDetail);
    const isConsumption = view === "consumption";
    const [filter, setFilter] = React.useState<"all" | "issued" | "acknowledged">("all");
    const [createOpen, setCreateOpen] = React.useState(false);
    const [preselectInvId, setPreselectInvId] = React.useState<string | null>(null);
    const total = db.dispatches.length;
    const issued = db.dispatches.filter((d) => d.status === "issued").length;
    const acknowledged = db.dispatches.filter((d) => d.status === "acknowledged").length;
    const dispatchValue = db.dispatches.reduce((n, d) => n + d.items.reduce((m, i) => m + i.amount, 0), 0);
    const metrics: MetricSpec[] = [
        {
            label: "Total dispatches",
            value: total,
            icon: <Send className="h-4 w-4"/>,
        },
        {
            label: "Issued",
            value: issued,
            tone: "primary",
            icon: <Wrench className="h-4 w-4"/>,
        },
        {
            label: "Acknowledged",
            value: acknowledged,
            tone: "success",
            icon: <CheckCircle2 className="h-4 w-4"/>,
        },
        {
            label: "Dispatch value",
            value: formatINRShort(dispatchValue),
            tone: "primary",
            icon: <Boxes className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: total, active: filter === "all" },
        { id: "issued", label: "Issued", count: issued, active: filter === "issued" },
        {
            id: "acknowledged",
            label: "Acknowledged",
            count: acknowledged,
            active: filter === "acknowledged",
        },
    ];
    const onFilterChange = (id: string) => setFilter(id as typeof filter);
    const awaiting = db.dispatches
        .filter((d) => d.status === "issued")
        .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    const awaitingRows: RecordRow[] = awaiting.map((d) => ({
        id: d.id,
        title: `${d.dispatch_no} · ${(d.customer_name || "Customer")}`,
        subtitle: `${d.work_order_no} · ${d.items.length} items`,
        amount: d.items.reduce((n, i) => n + i.amount, 0),
        status: dispatchStatusStyle(d.status),
        meta: `Issued ${formatDate(d.issued_at)}`,
        detailKind: "dispatch" as const,
        contextActions: [
            {
                label: "Open dispatch",
                onClick: () => openDetail("dispatch", d.id),
            },
            {
                label: "Acknowledge",
                onClick: () => {
                    acknowledgeDispatch(d.id);
                    toast.success(`Dispatch ${d.dispatch_no} acknowledged`);
                },
                separatorBefore: true,
            },
        ],
    }));
    const ackd = db.dispatches
        .filter((d) => d.status === "acknowledged")
        .sort((a, b) => new Date(b.acknowledged_at || b.issued_at).getTime() -
        new Date(a.acknowledged_at || a.issued_at).getTime());
    const ackRows: RecordRow[] = ackd.map((d) => ({
        id: d.id,
        title: `${d.dispatch_no} · ${(d.customer_name || "Customer")}`,
        subtitle: `${d.work_order_no} · ${d.items.length} items`,
        amount: d.items.reduce((n, i) => n + i.amount, 0),
        status: dispatchStatusStyle(d.status),
        meta: `Acknowledged ${formatDate(d.acknowledged_at)}`,
        detailKind: "dispatch" as const,
    }));
    const availableStock = [...db.inventory]
        .filter((i) => i.quantity > 0)
        .sort((a, b) => (a.work_order_no || "—").localeCompare(b.work_order_no || "—"));
    const stockRows: RecordRow[] = availableStock.map((inv) => ({
        id: inv.id,
        title: inv.name,
        subtitle: `${inv.work_order_no || "—"} · ${inv.quantity} ${inv.unit_name || ""} available`,
        meta: `@ ${formatINR(inv.rate || 0)}`,
        detailKind: "inventory" as const,
        contextActions: [
            inv.grn_id ? {
                label: "Open source GRN",
                onClick: () => openDetail("grn", inv.grn_id!),
            } : {
                label: "Open stock item",
                onClick: () => openDetail("inventory", inv.id),
            },
            {
                label: "Issue to Site",
                onClick: () => {
                    setPreselectInvId(inv.id);
                    setCreateOpen(true);
                },
                separatorBefore: true,
            },
        ],
    }));
    const filteredAwaitingRows = filter === "all" || filter === "issued" ? awaitingRows : [];
    const filteredAckRows = filter === "all" || filter === "acknowledged" ? ackRows : [];
    const queues: QueueSpec[] = [
        {
            title: "Awaiting Acknowledgement",
            icon: <Wrench className="h-4 w-4 text-primary"/>,
            records: filteredAwaitingRows,
            emptyHint: "No dispatches awaiting acknowledgement.",
            defaultOpen: true,
        },
        {
            title: "Acknowledged",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: filteredAckRows,
            emptyHint: "No acknowledged dispatches.",
            defaultOpen: true,
        },
        {
            title: "Available Stock to Issue",
            icon: <Package className="h-4 w-4 text-muted-foreground"/>,
            records: stockRows,
            emptyHint: "No stock available to issue.",
            defaultOpen: false,
        },
    ];
    const onCreate = () => {
        setPreselectInvId(null);
        setCreateOpen(true);
    };
    if (isConsumption) {
        const consumed = db.dispatches.filter((d) => d.status === "acknowledged");
        const totalConsumedValue = consumed.reduce((n, d) => n + d.items.reduce((m, i) => m + i.amount, 0), 0);
        const byJob = new Map<string, {
            jobNo: string;
            customer: string;
            rows: typeof consumed;
            total: number;
        }>();
        for (const d of consumed) {
            const key = d.work_order_no || "Unassigned";
            const entry = byJob.get(key) || { jobNo: key, customer: (d.customer_name || "Customer"), rows: [], total: 0 };
            entry.rows.push(d);
            entry.total += d.items.reduce((n, i) => n + i.amount, 0);
            byJob.set(key, entry);
        }
        const jobGroups = Array.from(byJob.values()).sort((a, b) => b.total - a.total);
        const consumptionMetrics: MetricSpec[] = [
            { label: "Consumed dispatches", value: consumed.length, icon: <CheckCircle2 className="h-4 w-4"/>, tone: "success" },
            { label: "Total consumed value", value: formatINRShort(totalConsumedValue), icon: <Boxes className="h-4 w-4"/>, tone: "primary" },
            { label: "Work Orders with consumption", value: jobGroups.length, icon: <Package className="h-4 w-4"/>, tone: "default" },
            { label: "Avg / workOrder", value: formatINRShort(jobGroups.length ? totalConsumedValue / jobGroups.length : 0), icon: <Wrench className="h-4 w-4"/>, tone: "warning" },
        ];
        return (<OperationsWorkspace title="Material Consumption" description="Material acknowledged at site, grouped by workOrder — feeds WorkOrder P&L cost lines" icon={<Boxes className="h-5 w-5"/>} workflow={["Issued", "Acknowledged", "Consumed", "WorkOrder P&L"]} metrics={consumptionMetrics} filterChips={[]} onFilterChange={() => { }} queues={jobGroups.map((g) => ({
                title: `${g.jobNo} · ${g.customer}`,
                icon: <Package className="h-4 w-4 text-primary"/>,
                records: g.rows.map((d) => ({
                    id: d.id,
                    title: `${d.dispatch_no} · ${d.items.length} items`,
                    subtitle: d.items.map((i) => `${i.title} ×${i.quantity}`).join(", "),
                    amount: d.items.reduce((n, i) => n + i.amount, 0),
                    status: dispatchStatusStyle(d.status),
                    meta: `Ack ${formatDate(d.acknowledged_at || d.issued_at)}`,
                    detailKind: "dispatch" as const,
                    contextActions: [
                        { label: "Open dispatch", onClick: () => openDetail("dispatch", d.id) },
                        { label: "Open workOrder P&L", onClick: () => { const workOrder = db.workOrders.find((row) => row.work_order_no === d.work_order_no); if (workOrder)
                                openDetail("workOrder", workOrder.id); }, disabled: !db.workOrders.some((row) => row.work_order_no === d.work_order_no), separatorBefore: true },
                    ],
                })),
                emptyHint: "No consumption recorded.",
                defaultOpen: true,
            }))} onCreate={undefined} createLabel="" searchPlaceholder="Search consumed material…"/>);
    }
    return (<>
      {/* CV-9: Description corrected — issueDispatch reduces inventory but does NOT post a cost line. */}
      <OperationsWorkspace title="Site Dispatch" description="Issue material from stock to the workOrder site — auto-reduces inventory. Cost is posted when the vendor bill is approved." icon={<Wrench className="h-5 w-5"/>} workflow={["Stock", "Pick", "Issue", "Acknowledge", "Consume", "P&L"]} metrics={metrics} filterChips={filterChips} onFilterChange={onFilterChange} queues={queues} onCreate={onCreate} createLabel="Issue to Site" searchPlaceholder="Search dispatches / stock…"/>
      <IssueDispatchDialog open={createOpen} onOpenChange={setCreateOpen} preselectInvId={preselectInvId}/>
    </>);
}
interface IssueRow {
    inv: InventoryItem;
    selected: boolean;
    qty: number;
}
function IssueDispatchDialog({ open, onOpenChange, preselectInvId, }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    preselectInvId: string | null;
}) {
    const db = useRDashStore((s) => s.db);
    const issueDispatch = useRDashStore((s) => s.issueDispatch);
    const openDetail = useRDashStore((s) => s.openDetail);
    // CV-11: Use the actual signed-in user's name for `issued_by`, instead of the hardcoded
    // "Ravi Kumar". The store (procurement.ts issueDispatch) uses `d.issued_by || fieldUser.name`,
    // so passing the real name here ensures dispatch records are correctly attributed.
    const currentUser = useRDashStore((s) => s.currentUser);
    const issuerName = (() => { try { return currentUser().name || "Staff"; } catch { return "Staff"; } })();
    const [workOrderId, setJobId] = React.useState<string>("");
    const [rows, setRows] = React.useState<IssueRow[]>([]);
    React.useEffect(() => {
        if (open) {
            setJobId("");
            const available = db.inventory
                .filter((i) => i.quantity > 0)
                .map((inv) => ({
                inv,
                selected: preselectInvId ? inv.id === preselectInvId : false,
                qty: preselectInvId === inv.id ? Math.min(1, inv.quantity) : 0,
            }));
            setRows(available);
        }
    }, [open, preselectInvId, db.inventory]);
    const selectedJob: WorkOrder | undefined = db.workOrders.find((j) => j.id === workOrderId);
    const selectedRows = rows.filter((r) => r.selected && r.qty > 0);
    const totalAmount = selectedRows.reduce((n, r) => n + r.qty * (r.inv.rate || 0), 0);
    const toggleRow = (invId: string) => {
        setRows((rs) => rs.map((r) => r.inv.id === invId
            ? {
                ...r,
                selected: !r.selected,
                qty: !r.selected ? Math.min(1, r.inv.quantity) : 0,
            }
            : r));
    };
    const setQty = (invId: string, qty: number) => {
        setRows((rs) => rs.map((r) => r.inv.id === invId
            ? { ...r, qty: Math.max(0, Math.min(qty, r.inv.quantity)) }
            : r));
    };
    const onIssue = () => {
        if (!selectedJob) {
            toast.error("Select a workOrder to issue this dispatch against.");
            return;
        }
        if (selectedRows.length === 0) {
            toast.error("Select at least one stock item to issue.");
            return;
        }
        const items: LineItem[] = selectedRows.map((r) => ({
            id: genItemId("di"),
            title: r.inv.name,
            article_id: r.inv.article_id,
            category_id: undefined,
            quantity: r.qty,
            unit_id: r.inv.unit_id,
            unit_name: r.inv.unit_name,
            rate: r.inv.rate || 0,
            amount: r.qty * (r.inv.rate || 0),
            status: "issued",
            source_kind: "inventory",
            source_item_id: r.inv.id,
            issued_qty: r.qty,
        }));
        const id = issueDispatch({
            work_order_id: selectedJob.id,
            work_order_no: selectedJob.work_order_no,
            site_address: selectedJob.site_address,
            items,
            issued_by: issuerName,
        });
        onOpenChange(false);
        openDetail("dispatch", id);
        // CV-9: Corrected toast text — issueDispatch reduces inventory but does NOT post a cost
        // line. Material cost is posted when the vendor bill is approved (so the live P&L doesn't
        // double-count). The previous "cost posted" text misled users into thinking the P&L
        // already reflected this dispatch.
        toast.success("Dispatch issued — inventory reduced. Cost posts when the vendor bill is approved.");
    };
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue Material to Site</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pick stock to dispatch to the workOrder site. Inventory is reduced; material cost is
            posted when the vendor bill is approved.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              WorkOrder
            </label>
            <select value={workOrderId} onChange={(e) => setJobId(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select a workOrder…</option>
              {db.workOrders.map((j) => (<option key={j.id} value={j.id}>
                  {j.work_order_no} · {(j.customer_name || "Customer")}
                </option>))}
            </select>
            {selectedJob?.site_address && (<p className="text-[11px] text-muted-foreground">
                Site: {selectedJob.site_address}
              </p>)}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Available stock
            </span>
            <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border rd-scroll">
              {rows.length === 0 && (<div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No stock available to issue. File a GRN first.
                </div>)}
              {rows.map((r) => (<div key={r.inv.id} className={"flex items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-0 " +
                (r.selected ? "bg-accent/40" : "bg-card")}>
                  <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.inv.id)} className="h-4 w-4 accent-[hsl(var(--primary))]"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {r.inv.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.inv.work_order_no || "—"} · {r.inv.quantity}{" "}
                      {r.inv.unit_name || ""} available · {formatINR(r.inv.rate || 0)}
                    </p>
                  </div>
                  {r.selected && (<div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={r.inv.quantity} value={r.qty} onChange={(e) => setQty(r.inv.id, Number(e.target.value) || 0)} className="h-8 w-20 rounded border border-input bg-card px-1.5 text-right font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
                      <span className="w-20 text-right font-mono font-semibold">
                        {formatINR(r.qty * (r.inv.rate || 0))}
                      </span>
                    </div>)}
                </div>))}
            </div>
          </div>

          {selectedRows.length > 0 && (<div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {selectedRows.length} item{selectedRows.length > 1 ? "s" : ""} ·
                issued by {issuerName}
              </span>
              <span className="font-mono font-bold text-foreground">
                {formatINR(totalAmount)}
              </span>
            </div>)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onIssue} disabled={!selectedJob || selectedRows.length === 0}>
            Issue to Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
