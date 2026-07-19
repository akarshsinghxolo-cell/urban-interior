"use client";
import * as React from "react";
import { Package, Boxes, AlertTriangle, ArrowLeftRight, Layers, PackageX, } from "lucide-react";
import { useRDashStore, inventoryValuation, } from "@/lib/rdash/store";
import type { StockMovementType } from "@/lib/rdash/types";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import { formatINR, formatINRShort, formatDate, titleCase } from "@/lib/rdash/format";
import { toast } from "sonner";
const movementStatusStyle: Record<StockMovementType, {
    label: string;
    className: string;
}> = {
    receipt: {
        label: "Receipt",
        className: "bg-success/10 text-success border-success/20",
    },
    issue: {
        label: "Issue",
        className: "bg-primary/10 text-primary border-primary/20",
    },
    return: {
        label: "Return",
        className: "bg-warning/10 text-warning border-warning/20",
    },
    adjustment: {
        label: "Adjustment",
        className: "bg-muted text-muted-foreground border-border",
    },
    wastage: {
        label: "Wastage",
        className: "bg-destructive/10 text-destructive border-destructive/20",
    },
};
export function InventoryModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [filter, setFilter] = React.useState<"all" | "in_stock" | "exhausted">("all");
    const stockItems = db.inventory.length;
    const stockValue = inventoryValuation(db);
    const exhausted = db.inventory.filter((i) => i.quantity <= 0).length;
    const movements = db.stockMovements.length;
    const metrics: MetricSpec[] = [
        {
            label: "Stock items",
            value: stockItems,
            icon: <Layers className="h-4 w-4"/>,
        },
        {
            label: "Stock value",
            value: formatINRShort(stockValue),
            tone: "primary",
            icon: <Boxes className="h-4 w-4"/>,
        },
        {
            label: "Exhausted",
            value: exhausted,
            tone: "destructive",
            icon: <PackageX className="h-4 w-4"/>,
        },
        {
            label: "Movements",
            value: movements,
            icon: <ArrowLeftRight className="h-4 w-4"/>,
        },
    ];
    const inStockCount = db.inventory.filter((i) => i.quantity > 0).length;
    const filterChips: FilterChip[] = [
        {
            id: "all",
            label: "All",
            count: stockItems,
            active: filter === "all",
        },
        {
            id: "in_stock",
            label: "In-stock",
            count: inStockCount,
            active: filter === "in_stock",
        },
        {
            id: "exhausted",
            label: "Exhausted",
            count: exhausted,
            active: filter === "exhausted",
        },
    ];
    const onFilterChange = (id: string) => setFilter(id as typeof filter);
    const sortedInventory = [...db.inventory].sort((a, b) => (a.work_order_no || "—").localeCompare(b.work_order_no || "—"));
    const stockRows: RecordRow[] = sortedInventory
        .filter((inv) => {
        if (filter === "in_stock")
            return inv.quantity > 0;
        if (filter === "exhausted")
            return inv.quantity <= 0;
        return true;
    })
        .map((inv) => ({
        id: inv.id,
        title: inv.name,
        subtitle: `${inv.work_order_no || "—"} · ${inv.location || "Site Store"}`,
        amount: inv.rate ? inv.quantity * inv.rate : 0,
        meta: `${inv.quantity} ${inv.unit_name || ""} @ ${formatINR(inv.rate || 0)}`,
        detailKind: "inventory" as const,
        status: inv.quantity <= 0
            ? {
                label: "Exhausted",
                className: "bg-destructive/10 text-destructive border-destructive/20",
            }
            : inv.quantity <= (inv.min_qty || 0)
                ? {
                    label: "Low",
                    className: "bg-warning/10 text-warning border-warning/20",
                }
                : undefined,
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
                    useRDashStore.getState().setActiveModule("dispatch");
                    toast.info(`Site Dispatch opened — issue "${inv.name}" to a site/work order.`);
                },
                separatorBefore: true,
            },
        ],
    }));
    const recentMovements = [...db.stockMovements]
        .filter((m) => !!m.grn_id || !!m.dispatch_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8);
    const movementRows: RecordRow[] = recentMovements.map((m) => ({
        id: m.id,
        title: `${titleCase(m.type)} · ${m.name}`,
        subtitle: m.work_order_no || "—",
        amount: Math.abs(m.quantity) * (m.rate || 0),
        status: movementStatusStyle[m.type],
        meta: `${m.quantity > 0 ? "+" : ""}${m.quantity} ${m.unit_name || ""} · ${formatDate(m.created_at)}`,
        detailKind: (m.grn_id ? "grn" : "dispatch") as "grn" | "dispatch",
    }));
    const queues: QueueSpec[] = [
        {
            title: "Current Stock",
            icon: <Package className="h-4 w-4 text-primary"/>,
            records: stockRows,
            emptyHint: "No stock items. Stock is created when you file a GRN.",
            defaultOpen: true,
        },
        {
            title: "Recent Stock Movements",
            icon: <ArrowLeftRight className="h-4 w-4 text-muted-foreground"/>,
            records: movementRows,
            emptyHint: "No stock movements yet.",
            defaultOpen: true,
        },
    ];
    return (<OperationsWorkspace title="Inventory / Stock" description="Live stock by workOrder — built from GRNs, reduced by site dispatch" icon={<Package className="h-5 w-5"/>} workflow={["GRN", "Stock-in", "Reserve", "Dispatch", "Consume", "Reconcile"]} metrics={metrics} filterChips={filterChips} onFilterChange={onFilterChange} queues={queues} searchPlaceholder="Search stock / movements…"/>);
}
