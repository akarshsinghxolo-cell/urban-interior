"use client";
import * as React from "react";
import { TrendingUp, Layers, Wrench, HardHat, Building2 } from "lucide-react";
import { useRDashStore, allJobPnLs } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip } from "../OperationsWorkspace";
import { formatINRShort, formatDate, titleCase } from "@/lib/rdash/format";
import { toast } from "sonner";
import type { WorkOrderCostType, WorkOrderPnL } from "@/lib/rdash/types";
function marginTone(pct: number): "success" | "warning" | "destructive" {
    if (pct > 20)
        return "success";
    if (pct > 5)
        return "warning";
    return "destructive";
}
function marginBadgeClass(pct: number): string {
    const t = marginTone(pct);
    if (t === "success")
        return "bg-success/10 text-success border-success/20";
    if (t === "warning")
        return "bg-warning/10 text-warning border-warning/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
}
function costTypeBadgeClass(t: WorkOrderCostType): string {
    switch (t) {
        case "material":
            return "bg-primary/10 text-primary border-primary/20";
        case "contractor":
        case "subcontract":
            return "bg-warning/10 text-warning border-warning/20";
        case "labour":
            return "bg-muted text-muted-foreground border-border";
        case "overhead":
            return "bg-muted/60 text-muted-foreground border-border";
        case "tax":
            return "bg-success/10 text-success border-success/20";
        default:
            return "bg-muted text-muted-foreground border-border";
    }
}
export function JobPnLModule() {
    const db = useRDashStore((s) => s.db);
    const [filter, setFilter] = React.useState<string>("all");
    const pnls = React.useMemo(() => allJobPnLs(db) as WorkOrderPnL[], [db]);
    const totalContracted = pnls.reduce((n, p) => n + p.contracted_revenue, 0);
    const totalCollected = pnls.reduce((n, p) => n + p.collected, 0);
    const totalCost = pnls.reduce((n, p) => n + p.total_cost, 0);
    // CV-8: Committed cost (read-only display). The posted cost (pnl.total_cost) only reflects
    // approved vendor bills + verified contractor RA bills — GRNs and dispatches update inventory,
    // not P&L. To give the user the full picture mid-procurement, we also compute the committed
    // cost = open PO totals (not yet billed) + contractor_award_amount for awarded work orders
    // without a settled bill. This is a display-only indicator; it does NOT change the posted
    // cost used in margin calculations.
    const openPoCommitted = db.purchaseOrders
        .filter((po) => po.status !== "cancelled" && po.status !== "received")
        .reduce((sum, po) => sum + (po.total_amount || 0), 0);
    const awardedNotBilled = db.workOrders
        .filter((j) => j.contractor_id && j.contractor_award_amount && j.contractor_award_amount > 0)
        .reduce((sum, j) => {
            // Subtract RA bills already filed against this work order (they're in posted cost).
            const alreadyBilled = db.contractorBills
                .filter((b) => b.work_order_id === j.id && b.status !== "held")
                .reduce((n, b) => n + b.amount, 0);
            return sum + Math.max(0, (j.contractor_award_amount || 0) - alreadyBilled);
        }, 0);
    const totalCommitted = openPoCommitted + awardedNotBilled;
    const avgMargin = pnls.length
        ? Math.round(pnls.reduce((n, p) => n + p.margin_pct, 0) / pnls.length)
        : 0;
    const filteredPnls = React.useMemo(() => {
        if (filter === "profitable")
            return pnls.filter((p) => p.gross_margin >= 0);
        if (filter === "loss")
            return pnls.filter((p) => p.gross_margin < 0);
        return pnls;
    }, [pnls, filter]);
    const recentCostLines = React.useMemo(() => [...db.workOrderCostLines]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10), [db.workOrderCostLines]);
    const jobNoById = React.useMemo(() => {
        const m = new Map<string, string>();
        for (const j of db.workOrders)
            m.set(j.id, j.work_order_no);
        return m;
    }, [db.workOrders]);
    const metrics: MetricSpec[] = [
        {
            label: "Work Orders",
            value: db.workOrders.length,
            tone: "default",
            icon: <Layers className="h-4 w-4"/>,
        },
        {
            label: "Contracted revenue",
            value: formatINRShort(totalContracted),
            tone: "success",
            icon: <TrendingUp className="h-4 w-4"/>,
        },
        {
            label: "Collected",
            value: formatINRShort(totalCollected),
            tone: "success",
            icon: <TrendingUp className="h-4 w-4"/>,
        },
        {
            label: "Posted cost",
            value: formatINRShort(totalCost),
            tone: "destructive",
            icon: <Building2 className="h-4 w-4"/>,
        },
        {
            label: "Committed (open)",
            value: formatINRShort(totalCommitted),
            tone: "warning",
            icon: <Building2 className="h-4 w-4"/>,
        },
        {
            label: "Avg margin",
            value: `${avgMargin}%`,
            tone: marginTone(avgMargin),
            icon: <HardHat className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: pnls.length, active: filter === "all" },
        {
            id: "profitable",
            label: "Profitable",
            count: pnls.filter((p) => p.gross_margin >= 0).length,
            active: filter === "profitable",
        },
        {
            id: "loss",
            label: "Loss-making",
            count: pnls.filter((p) => p.gross_margin < 0).length,
            active: filter === "loss",
        },
    ];
    const pnlRows: RecordRow[] = filteredPnls.map((pnl) => {
        const badge = (<span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${marginBadgeClass(pnl.margin_pct)}`}>
        {pnl.margin_pct}% margin
      </span>);
        return {
            id: pnl.work_order_id,
            title: `${pnl.work_order_no} · ${(pnl.customer_name || "Customer")}`,
            subtitle: `Contract ${formatINRShort(pnl.contracted_revenue)} · Collected ${formatINRShort(pnl.collected)} · Cost ${formatINRShort(pnl.total_cost)}`,
            customerName: (pnl.customer_name || "Customer"),
            amount: pnl.gross_margin,
            status: {
                label: `${pnl.margin_pct}%`,
                className: marginBadgeClass(pnl.margin_pct),
            },
            meta: `Receivable ${formatINRShort(pnl.receivable)} · Gross ${formatINRShort(pnl.gross_margin)} · ${formatINRShort(pnl.material_cost)} material · ${formatINRShort(pnl.contractor_cost)} contractor`,
            detailKind: "workOrder",
            badge,
        };
    });
    const costRows: RecordRow[] = recentCostLines.map((c) => ({
        id: c.id,
        title: c.description,
        subtitle: jobNoById.get(c.work_order_id) || c.work_order_id,
        amount: c.amount,
        status: {
            label: titleCase(c.type),
            className: costTypeBadgeClass(c.type),
        },
        meta: `${formatDate(c.date)}${c.vendor_name ? ` · ${c.vendor_name}` : ""}`,
        detailKind: "workOrder",
    }));
    const queues: QueueSpec[] = [
        {
            title: "WorkOrder P&L summary",
            icon: <TrendingUp className="h-4 w-4 text-primary"/>,
            records: pnlRows,
            emptyHint: "No workOrders to summarize.",
            defaultOpen: true,
        },
        {
            title: "Recent cost postings",
            icon: <Wrench className="h-4 w-4 text-warning"/>,
            records: costRows,
            emptyHint: "No cost lines posted yet.",
            defaultOpen: true,
        },
    ];
    return (<OperationsWorkspace title="WorkOrder P&L" description="Work-order finance: contracted value, collections, receivable and actual material / contractor costs" icon={<TrendingUp className="h-4 w-4"/>} workflow={["Revenue", "Material", "Labour", "Contractor", "Overhead", "Margin"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => setFilter(id)} queues={queues} createLabel="+ Add cost line" onCreate={() => toast.info("Cost lines are auto-posted from approved vendor bills and contractor bills. GRNs and dispatches update inventory, not P&L directly. Add manual lines via the workOrder detail.")} searchPlaceholder="Search workOrders / cost lines…"/>);
}
