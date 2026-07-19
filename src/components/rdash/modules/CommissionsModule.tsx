"use client";
import * as React from "react";
import { HandCoins, MoreHorizontal, IndianRupee, CheckCircle2, Users, Calendar, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import type { ContextAction } from "../ContextMenuHost";
import { commissionStatusStyle, formatINRShort, formatDate, } from "@/lib/rdash/format";
import { toast } from "sonner";
import type { Commission, SourcePartner } from "@/lib/rdash/types";
export function CommissionsModule() {
    const db = useRDashStore((s) => s.db);
    const payCommission = useRDashStore((s) => s.payCommission);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [filter, setFilter] = React.useState<string>("all");
    const commissions = db.commissions;
    const accrued = commissions.filter((c) => c.status === "accrued" || c.status === "payable");
    const paid = commissions.filter((c) => c.status === "paid");
    const outstanding = accrued.reduce((n, c) => n + c.amount, 0);
    const metrics: MetricSpec[] = [
        {
            label: "Total commissions",
            value: commissions.length,
            tone: "default",
            icon: <HandCoins className="h-4 w-4"/>,
        },
        {
            label: "Accrued",
            value: accrued.length,
            tone: "warning",
            icon: <Calendar className="h-4 w-4"/>,
        },
        {
            label: "Paid",
            value: paid.length,
            tone: "success",
            icon: <CheckCircle2 className="h-4 w-4"/>,
        },
        {
            label: "Outstanding",
            value: formatINRShort(outstanding),
            tone: "primary",
            icon: <IndianRupee className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: commissions.length, active: filter === "all" },
        {
            id: "accrued",
            label: "Accrued",
            count: accrued.length,
            active: filter === "accrued",
        },
        { id: "paid", label: "Paid", count: paid.length, active: filter === "paid" },
    ];
    const showAccrued = filter === "all" || filter === "accrued";
    const showPaid = filter === "all" || filter === "paid";
    const showPartners = filter === "all";
    const buildRowActions = (c: Commission): ContextAction[] => {
        const acts: ContextAction[] = [
            {
                label: "Open",
                icon: <MoreHorizontal className="h-3.5 w-3.5"/>,
                onClick: () => openDetail("commission", c.id),
            },
        ];
        if (c.status === "accrued" || c.status === "payable") {
            acts.push({
                label: "Mark Paid",
                icon: <IndianRupee className="h-3.5 w-3.5"/>,
                onClick: () => {
                    payCommission(c.id);
                    toast.success(`Commission ${c.commission_no} marked as paid`);
                },
            });
        }
        return acts;
    };
    const commissionRow = (c: Commission): RecordRow => ({
        id: c.id,
        title: c.source_partner_name,
        subtitle: `${c.customer_name || "—"} · ${c.work_order_no || "—"}`,
        customerName: c.source_partner_name,
        amount: c.amount,
        status: commissionStatusStyle(c.status),
        meta: `${c.rate_pct}% of ${formatINRShort(c.base_amount)}${c.paid_date ? ` · paid ${formatDate(c.paid_date)}` : ""}`,
        detailKind: "commission",
        contextActions: buildRowActions(c),
    });
    const accruedRows: RecordRow[] = showAccrued ? accrued.map(commissionRow) : [];
    const paidRows: RecordRow[] = showPaid
        ? [...paid]
            .sort((a, b) => (b.paid_date || "").localeCompare(a.paid_date || ""))
            .map(commissionRow)
        : [];
    const partnerRows: RecordRow[] = showPartners
        ? db.master.sourcePartners.map((p: SourcePartner) => {
            const partnerComms = commissions.filter((c) => c.source_partner_id === p.id);
            const total = partnerComms.reduce((n, c) => n + c.amount, 0);
            const firstComm = partnerComms[0];
            const acts: ContextAction[] = firstComm
                ? [
                    {
                        label: "Open commission",
                        icon: <MoreHorizontal className="h-3.5 w-3.5"/>,
                        onClick: () => openDetail("commission", firstComm.id),
                    },
                ]
                : [];
            return {
                id: firstComm?.id || p.id,
                title: p.name,
                subtitle: `${p.type || "Partner"} · ${p.commission_pct ?? 0}% rate`,
                customerName: p.name,
                amount: total,
                status: {
                    label: `${partnerComms.length} commissions`,
                    className: "bg-muted text-muted-foreground border-border",
                },
                meta: `${p.phone || "No phone"} · ${formatINRShort(total)} total`,
                detailKind: "commission",
                contextActions: acts,
            };
        })
        : [];
    const queues: QueueSpec[] = [];
    if (showAccrued) {
        queues.push({
            title: "Accrued / Payable",
            icon: <Calendar className="h-4 w-4 text-warning"/>,
            records: accruedRows,
            emptyHint: "No outstanding commissions.",
            defaultOpen: true,
        });
    }
    if (showPaid) {
        queues.push({
            title: "Paid",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: paidRows,
            emptyHint: "No paid commissions yet.",
            defaultOpen: true,
        });
    }
    if (showPartners) {
        queues.push({
            title: "Referral Partners",
            icon: <Users className="h-4 w-4 text-primary"/>,
            records: partnerRows,
            emptyHint: "No referral partners on file.",
        });
    }
    return (<OperationsWorkspace title="Commission Ledger" description="Referral partner commissions — accrued on workOrder creation, payable on settlement" icon={<HandCoins className="h-4 w-4"/>} workflow={["Referral", "WorkOrder", "Accrue", "Payable", "Pay", "Close"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => setFilter(id)} queues={queues} searchPlaceholder="Search commissions / partners…"/>);
}
