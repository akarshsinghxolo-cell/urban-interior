"use client";
import * as React from "react";
import { ShoppingCart, CheckCircle2, Send, Plus, Trash2, AlertTriangle, FileText, Clock, Search, Zap, Trophy, Gavel, Paperclip, } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import type { LineItem, Master, VendorBidLine } from "@/lib/rdash/types";
import { searchCatalogOptions, type CatalogSearchOption } from "@/lib/rdash/catalog-search";
import { applyVendorRateUpdates } from "@/lib/rdash/vendor-rate";
import { resolveArticleRateConfig } from "@/lib/rdash/article-rate-config";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import type { ContextAction } from "../ContextMenuHost";
import { LineItemTable } from "../ThreadPanel";
import { EntityFilesCard } from "../EntityFilesCard";
import { formatINR, formatINRShort, formatDate, poStatusStyle, } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
type FilterId = "all" | "pending_approval" | "approved" | "sent" | "received" | "direct_award" | "competitive" | "rfq_bids";
interface BuilderRow {
    id: string;
    work_required_article_id: string;
    quantity: number;
    rate: number | null;
}
interface PoFormState {
    vendor_id: string;
    work_order_id: string;
    expected_delivery: string;
    rows: BuilderRow[];
}
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
function newBuilderRow(): BuilderRow {
    return {
        id: `br-${Math.random().toString(36).slice(2, 8)}`,
        work_required_article_id: "",
        quantity: 1,
        rate: null,
    };
}
function procurementArticleId(master: Master, line: Pick<LineItem, "article_id" | "work_required_article_id">) {
    return line.article_id || (line.work_required_article_id ? master.subcategoryArticleMap.find((row) => row.id === line.work_required_article_id)?.article_id : undefined);
}
export function ProcurementModule() {
    const db = useRDashStore((s) => s.db);
    const createPO = useRDashStore((s) => s.createPO);
    const createDirectAwardPO = useRDashStore((s) => s.createDirectAwardPO);
    const approvePO = useRDashStore((s) => s.approvePO);
    const sendPO = useRDashStore((s) => s.sendPO);
    const openDetail = useRDashStore((s) => s.openDetail);
    const mutateMaster = useRDashStore((s) => s.mutateMaster);
    // E: Vendor RFQ bid dialog state — opens when the user records a bid for
    // a specific RFQ + vendor. The bid rate field is pre-filled with the
    // vendor's existing vendorRate for the article (from master.vendorRates).
    const addVendorBid = useRDashStore((s) => s.addVendorBid);
    const createPOFromLowestBid = useRDashStore((s) => s.createPOFromLowestBid);
    const [bidRfqId, setBidRfqId] = React.useState<string | null>(null);
    const [rfqFilesId, setRfqFilesId] = React.useState<string | null>(null);
    const [bidVendorId, setBidVendorId] = React.useState<string>("");
    const [bidRates, setBidRates] = React.useState<Record<string, string>>({});
    const [bidDeliveryDays, setBidDeliveryDays] = React.useState<string>("");
    const [filter, setFilter] = React.useState<FilterId>("all");
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [form, setForm] = React.useState<PoFormState>({
        vendor_id: "",
        work_order_id: "",
        expected_delivery: todayStr(),
        rows: [newBuilderRow()],
    });
    // Direct Award state — audited exception path that skips formal RFQ/bidding.
    const [directAwardOpen, setDirectAwardOpen] = React.useState(false);
    const [directAwardForm, setDirectAwardForm] = React.useState<{
        vendor_id: string;
        work_order_id: string;
        expected_delivery: string;
        rows: BuilderRow[];
        award_reason: string;
        note: string;
    }>({
        vendor_id: "",
        work_order_id: "",
        expected_delivery: todayStr(),
        rows: [newBuilderRow()],
        award_reason: "",
        note: "",
    });
    const pos = db.purchaseOrders;
    const pendingApproval = React.useMemo(() => pos.filter((p) => p.status === "pending_approval"), [pos]);
    const approvedOrSent = React.useMemo(() => pos.filter((p) => p.status === "approved" || p.status === "sent"), [pos]);
    const received = React.useMemo(() => pos.filter((p) => p.status === "partially_received" || p.status === "received"), [pos]);
    const drafts = React.useMemo(() => pos.filter((p) => p.status === "draft"), [pos]);
    const totalPoValue = React.useMemo(() => pos.reduce((n, p) => n + p.total_amount, 0), [pos]);
    const metrics: MetricSpec[] = [
        {
            label: "Total POs",
            value: pos.length,
            icon: <ShoppingCart className="h-4 w-4"/>,
        },
        {
            label: "Pending approval",
            value: pendingApproval.length,
            tone: "warning",
            icon: <Clock className="h-4 w-4"/>,
        },
        {
            label: "Open",
            value: approvedOrSent.length,
            tone: "primary",
            icon: <Send className="h-4 w-4"/>,
        },
        {
            label: "PO value",
            value: formatINRShort(totalPoValue),
            tone: "success",
            icon: <FileText className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: pos.length, active: filter === "all" },
        {
            id: "pending_approval",
            label: "Pending Approval",
            count: pendingApproval.length,
            active: filter === "pending_approval",
        },
        {
            id: "approved",
            label: "Approved",
            count: pos.filter((p) => p.status === "approved").length,
            active: filter === "approved",
        },
        {
            id: "sent",
            label: "Sent",
            count: pos.filter((p) => p.status === "sent").length,
            active: filter === "sent",
        },
        {
            id: "received",
            label: "Received",
            count: received.length,
            active: filter === "received",
        },
        {
            id: "direct_award",
            label: "⚡ Direct Award",
            count: pos.filter((p) => p.direct_award || p.award_basis === "direct").length,
            active: filter === "direct_award",
        },
        {
            id: "competitive",
            label: "Competitive",
            count: pos.filter((p) => p.award_basis === "competitive").length,
            active: filter === "competitive",
        },
        // E: New filter chip for the RFQ/bid queue — surfaces vendor RFQs that
        // need bid recording or are ready for the Lowest-bid→PO quick action.
        {
            id: "rfq_bids",
            label: "RFQs & Bids",
            count: db.vendorRfqs.filter((r) => r.status !== "closed").length,
            active: filter === "rfq_bids",
        },
    ];
    const buildPoRow = (p: (typeof pos)[number], extraActions: ContextAction[] = []): RecordRow => {
        const actions: ContextAction[] = [
            {
                label: "Open PO",
                onClick: () => openDetail("po", p.id),
            },
            ...extraActions,
        ];
        if (p.work_order_id) {
            actions.push({
                label: "Open workOrder",
                onClick: () => openDetail("workOrder", p.work_order_id!),
                separatorBefore: true,
            });
        }
        // Provenance badge: show how this PO was awarded.
        let badge: React.ReactNode | undefined;
        if (p.direct_award || p.award_basis === "direct") {
            badge = (<span title={p.award_reason || "Direct award (no formal RFQ/bid round)"} className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Zap className="h-2.5 w-2.5"/> Direct Award
            </span>);
        }
        else if (p.award_basis === "competitive") {
            badge = (<span title="Competitive bid (formal RFQ + vendor bid round)" className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                Competitive
            </span>);
        }
        return {
            id: p.id,
            title: `${p.po_no} · ${p.vendor_name}`,
            subtitle: [p.work_order_no, (p.customer_name || "Customer")].filter(Boolean).join(" · ") ||
                "No workOrder linked",
            amount: p.total_amount,
            status: poStatusStyle(p.status),
            meta: `Due ${formatDate(p.expected_delivery)} · ${p.items.length} items`,
            detailKind: "po",
            contextActions: actions,
            badge,
        };
    };
    const handleApprove = (id: string) => {
        try {
            approvePO(id);
            toast.success("PO approved — ready to send to vendor.");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "PO approval blocked");
        }
    };
    const handleSend = (id: string) => {
        sendPO(id);
        toast.success("PO marked as sent to vendor.");
    };
    const queues: QueueSpec[] = [];
    if (filter === "all" || filter === "pending_approval") {
        queues.push({
            title: "Pending Approval",
            icon: <Clock className="h-4 w-4 text-warning"/>,
            records: pendingApproval.map((p) => buildPoRow(p, [
                {
                    label: "Approve",
                    icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
                    onClick: () => handleApprove(p.id),
                },
            ])),
            emptyHint: "No POs awaiting approval.",
            defaultOpen: true,
        });
    }
    if (filter === "all" || filter === "approved" || filter === "sent") {
        queues.push({
            title: "Approved / Sent",
            icon: <Send className="h-4 w-4 text-primary"/>,
            records: approvedOrSent.map((p) => buildPoRow(p, [
                ...(p.status === "approved"
                    ? [
                        {
                            label: "Send to vendor",
                            icon: <Send className="h-3.5 w-3.5"/>,
                            onClick: () => handleSend(p.id),
                        },
                    ]
                    : []),
            ])),
            emptyHint: "No approved or sent POs.",
            defaultOpen: true,
        });
    }
    if (filter === "all" || filter === "received") {
        queues.push({
            title: "Partially Received / Received",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: received.map((p) => buildPoRow(p)),
            emptyHint: "No POs with deliveries yet.",
            defaultOpen: received.length > 0,
        });
    }
    if (filter === "all") {
        queues.push({
            title: "Drafts",
            icon: <FileText className="h-4 w-4 text-muted-foreground"/>,
            records: drafts.map((p) => buildPoRow(p)),
            emptyHint: "No draft POs.",
            defaultOpen: drafts.length > 0,
        });
    }
    if (filter === "direct_award") {
        const directAwardPOs = pos.filter((p) => p.direct_award || p.award_basis === "direct");
        queues.push({
            title: "Direct Award POs",
            icon: <Zap className="h-4 w-4 text-warning"/>,
            records: directAwardPOs.map((p) => buildPoRow(p)),
            emptyHint: "No direct-award POs. Use the Direct Award button to create one without a formal RFQ.",
            defaultOpen: true,
        });
    }
    if (filter === "competitive") {
        const competitivePOs = pos.filter((p) => p.award_basis === "competitive");
        queues.push({
            title: "Competitive Bid POs",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: competitivePOs.map((p) => buildPoRow(p)),
            emptyHint: "No competitive-bid POs. Create a PO from a vendor bid to see it here.",
            defaultOpen: true,
        });
    }
    // E: Vendor RFQ & Bid queue — surfaces open RFQs with the count of received
    // bids, lowest bid amount, and quick actions: Record Bid, Lowest bid → PO.
    if (filter === "all" || filter === "rfq_bids") {
        const rfqRows: RecordRow[] = db.vendorRfqs
            .filter((r) => r.status !== "closed")
            .map((rfq) => {
            const boq = db.boqs.find((b) => b.id === rfq.boq_id);
            const workOrder = db.workOrders.find((wo) => wo.id === rfq.work_order_id);
            const bids = db.vendorBids.filter((b) => b.rfq_id === rfq.id);
            const lowestBid = bids.length
                ? [...bids].sort((a, b) => (a.quoted_amount || 0) - (b.quoted_amount || 0))[0]
                : undefined;
            const expectedVendors = rfq.vendor_ids.length;
            const receivedVendors = bids.length;
            const allBidsIn = receivedVendors >= expectedVendors && expectedVendors > 0;
            const acts: ContextAction[] = [
                {
                    label: "Record bid",
                    icon: <Gavel className="h-3.5 w-3.5"/>,
                    onClick: () => openBidDialog(rfq.id),
                },
                {
                    label: "RFQ & bid files",
                    icon: <Paperclip className="h-3.5 w-3.5"/>,
                    onClick: () => setRfqFilesId(rfq.id),
                },
            ];
            // E-3: Lowest bid → PO quick action. Only enabled when at least one
            // bid is received. The store action selects the lowest bid and
            // creates a PO from it.
            if (bids.length > 0) {
                acts.push({
                    label: allBidsIn ? "Lowest bid → PO" : `Lowest bid → PO (${receivedVendors}/${expectedVendors} bids)`,
                    icon: <Trophy className="h-3.5 w-3.5"/>,
                    onClick: () => handleLowestBidToPO(rfq.id),
                    separatorBefore: true,
                });
            }
            return {
                id: rfq.id,
                title: `${rfq.rfq_no} · ${workOrder?.work_order_no || "—"}`,
                subtitle: `${boq?.title || "BOQ"} · ${boq?.items.filter((i) => rfq.item_ids.includes(i.id)).length || 0} items`,
                amount: lowestBid?.quoted_amount,
                status: {
                    label: rfq.status.replaceAll("_", " "),
                    className: rfq.status === "awarded"
                        ? "bg-success/10 text-success border-success/20"
                        : rfq.status === "responses_received"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-warning/10 text-warning border-warning/20",
                },
                meta: `${receivedVendors}/${expectedVendors} bids${lowestBid ? ` · lowest ${formatINRShort(lowestBid.quoted_amount)} (${lowestBid.vendor_name})` : " · no bids yet"}`,
                detailKind: "po",
                contextActions: acts,
                badge: lowestBid ? (<span title={`Lowest bid: ${lowestBid.vendor_name} · ${formatINR(lowestBid.quoted_amount)}`} className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0 text-[10px] font-semibold text-success">
                        <Trophy className="h-2.5 w-2.5"/> Lowest: {formatINRShort(lowestBid.quoted_amount)}
                      </span>) : undefined,
            };
        });
        queues.push({
            title: "Vendor RFQs & Bids",
            icon: <Gavel className="h-4 w-4 text-primary"/>,
            records: rfqRows,
            emptyHint: "No open vendor RFQs. Generate one from the BOQ module (Approve BOQ → Generate vendor RFQ).",
            defaultOpen: filter === "rfq_bids" || rfqRows.length > 0,
        });
    }
    // E: Open the bid dialog for a specific RFQ + vendor. Pre-fills the bid
    // rate field with the vendor's existing vendorRate for each article.
    const openBidDialog = (rfqId: string) => {
        const rfq = db.vendorRfqs.find((r) => r.id === rfqId);
        if (!rfq) {
            toast.error("Vendor RFQ not found.");
            return;
        }
        const firstVendor = rfq.vendor_ids.find((id) => !db.vendorBids.some((b) => b.rfq_id === rfqId && b.vendor_id === id)) || rfq.vendor_ids[0] || "";
        const boq = db.boqs.find((b) => b.id === rfq.boq_id);
        // E-2: Pre-fill rates with the vendor's existing vendorRate for each
        // requested BOQ article (from master.vendorRates). Falls back to empty.
        const prefilledRates: Record<string, string> = {};
        if (boq && firstVendor) {
            for (const itemId of rfq.item_ids) {
                const boqItem = boq.items.find((it) => it.id === itemId);
                if (!boqItem)
                    continue;
                const articleId = procurementArticleId(db.master, boqItem);
                const vendorRate = articleId ? db.master.vendorRates.find((vr) => vr.vendor_id === firstVendor && vr.article_id === articleId && (vr.variant_id || "") === (boqItem.variant_id || "")) : undefined;
                prefilledRates[itemId] = vendorRate ? String(vendorRate.quoted_rate) : "";
            }
        }
        setBidRfqId(rfqId);
        setBidVendorId(firstVendor);
        setBidRates(prefilledRates);
        setBidDeliveryDays("");
    };
    // E: When the vendor select changes, re-pre-fill rates from that vendor's
    // existing vendorRates for the requested articles.
    const onBidVendorChange = (vendorId: string) => {
        if (!bidRfqId)
            return;
        const rfq = db.vendorRfqs.find((r) => r.id === bidRfqId);
        const boq = rfq ? db.boqs.find((b) => b.id === rfq.boq_id) : undefined;
        const prefilledRates: Record<string, string> = {};
        if (boq && rfq && vendorId) {
            for (const itemId of rfq.item_ids) {
                const boqItem = boq.items.find((it) => it.id === itemId);
                if (!boqItem)
                    continue;
                const articleId = procurementArticleId(db.master, boqItem);
                const vendorRate = articleId ? db.master.vendorRates.find((vr) => vr.vendor_id === vendorId && vr.article_id === articleId && (vr.variant_id || "") === (boqItem.variant_id || "")) : undefined;
                prefilledRates[itemId] = vendorRate ? String(vendorRate.quoted_rate) : "";
            }
        }
        setBidVendorId(vendorId);
        setBidRates(prefilledRates);
    };
    // E: Save the recorded bid. Validates that every requested BOQ article has
    // a positive rate. Delegates to addVendorBid in the procurement slice.
    const saveVendorBid = () => {
        if (!bidRfqId || !bidVendorId) {
            toast.error("Select a vendor for this RFQ.");
            return;
        }
        const rfq = db.vendorRfqs.find((r) => r.id === bidRfqId);
        const boq = rfq ? db.boqs.find((b) => b.id === rfq.boq_id) : undefined;
        if (!rfq || !boq) {
            toast.error("The RFQ or its BOQ is unavailable.");
            return;
        }
        const lines: VendorBidLine[] = boq.items
            .filter((item) => rfq.item_ids.includes(item.id))
            .map((item) => {
            const rate = Number(bidRates[item.id]);
            return {
                boq_item_id: item.id,
                article_id: item.article_id,
                title: item.title,
                quantity: item.quantity,
                unit_id: item.unit_id,
                unit_name: item.unit_name,
                rate,
                amount: Math.round(item.quantity * rate),
                tax_rate: item.tax_rate,
            };
        });
        if (!lines.length || lines.some((l) => !Number.isFinite(l.rate) || l.rate <= 0)) {
            toast.error("Enter a positive rate for every requested BOQ article.");
            return;
        }
        try {
            const days = bidDeliveryDays.trim() ? Number(bidDeliveryDays) : undefined;
            const id = addVendorBid({
                rfq_id: bidRfqId,
                vendor_id: bidVendorId,
                lines,
                delivery_days: days && Number.isFinite(days) ? days : undefined,
            });
            if (!id) {
                toast.error("Vendor bid could not be recorded.");
                return;
            }
            toast.success("Vendor bid recorded.");
            setBidRfqId(null);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Vendor bid could not be recorded.");
        }
    };
    // E-3: Lowest bid → PO quick action. Delegates to the store action.
    const handleLowestBidToPO = (rfqId: string) => {
        try {
            const poId = createPOFromLowestBid(rfqId);
            toast.success(`PO ${poId} created from the lowest bid.`);
            openDetail("po", poId);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create PO from lowest bid.");
        }
    };
    const openCreate = () => {
        setForm({
            vendor_id: db.master.vendors[0]?.id || "",
            work_order_id: "",
            expected_delivery: todayStr(),
            rows: [newBuilderRow()],
        });
        setDialogOpen(true);
    };
    const openDirectAward = () => {
        setDirectAwardForm({
            vendor_id: db.master.vendors[0]?.id || "",
            work_order_id: "",
            expected_delivery: todayStr(),
            rows: [newBuilderRow()],
            award_reason: "",
            note: "",
        });
        setDirectAwardOpen(true);
    };
    const handleCreateDirectAward = () => {
        const vendor = db.master.vendors.find((v) => v.id === directAwardForm.vendor_id);
        if (!vendor) {
            toast.error("Select a vendor for the direct award.");
            return;
        }
        if (!directAwardForm.award_reason.trim()) {
            toast.error("A reason is required for a direct award (audit trail).");
            return;
        }
        const validRows = directAwardForm.rows.filter((r) => r.work_required_article_id && r.quantity > 0 && r.rate !== null);
        if (!validRows.length) {
            toast.error("Add at least one line item with quantity and rate.");
            return;
        }
        const items: LineItem[] = validRows.map((r, idx) => {
            const scope = db.master.subcategoryArticleMap.find((s) => s.id === r.work_required_article_id);
            const article = scope ? db.master.articles.find((a) => a.id === scope.article_id) : undefined;
            const unit = scope ? db.master.units.find((u) => u.id === scope.unit_id) : undefined;
            return {
                id: `poi-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                title: article?.name || "Material",
                article_id: article?.id,
                work_required_article_id: r.work_required_article_id,
                quantity: r.quantity,
                unit_id: scope?.unit_id,
                unit_name: unit?.name,
                rate: r.rate!,
                amount: r.quantity * r.rate!,
                tax_rate: 18,
                status: "active",
                source_kind: "po",
                ordered_qty: 0,
                received_qty: 0,
                issued_qty: 0,
                consumed_qty: 0,
            };
        });
        const workOrder = directAwardForm.work_order_id
            ? db.workOrders.find((j) => j.id === directAwardForm.work_order_id)
            : undefined;
        try {
            const id = createDirectAwardPO({
                vendor_id: vendor.id,
                vendor_name: vendor.name,
                work_order_id: workOrder?.id,
                site_id: workOrder?.site_id,
                expected_delivery: directAwardForm.expected_delivery,
                items,
                award_reason: directAwardForm.award_reason,
                note: directAwardForm.note,
            });
            if (!id) {
                toast.error("Could not create direct-award PO.");
                return;
            }
            setDirectAwardOpen(false);
            openDetail("po", id);
            toast.success(`Direct-award PO created to ${vendor.name} — reason recorded in audit log.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Direct-award PO could not be created.");
        }
    };
    const updateRow = (rowId: string, patch: Partial<BuilderRow>) => {
        setForm((f) => ({
            ...f,
            rows: f.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
        }));
    };
    const addRow = () => {
        setForm((f) => ({ ...f, rows: [...f.rows, newBuilderRow()] }));
    };
    const removeRow = (rowId: string) => {
        setForm((f) => ({
            ...f,
            rows: f.rows.length > 1 ? f.rows.filter((r) => r.id !== rowId) : f.rows,
        }));
    };
    const resolvedRows = React.useMemo(() => {
        const vendorRates = form.vendor_id
            ? db.master.vendorRates.filter((vr) => vr.vendor_id === form.vendor_id)
            : [];
        return form.rows.map((row) => {
            const scope = db.master.subcategoryArticleMap.find((entry) => entry.id === row.work_required_article_id);
            const article = scope ? db.master.articles.find((entry) => entry.id === scope.article_id) : undefined;
            const work = scope ? db.master.workSubcategories.find((entry) => entry.id === scope.work_required_id) : undefined;
            const category = work ? db.master.workCategories.find((entry) => entry.id === work.category_id) : undefined;
            const vendorRate = article ? vendorRates.find((rate) => rate.article_id === article.id && !rate.variant_id) : undefined;
            const rateConfig = article ? resolveArticleRateConfig({ articleId: article.id, variantId: vendorRate?.variant_id, articles: db.master.articles, variants: db.master.articleVariants }) : undefined;
            const unitId = rateConfig?.rateUnit || scope?.unit_id || article?.default_unit_id || article?.unit_id;
            const rate = row.rate ?? vendorRate?.quoted_rate ?? 0;
            const unit = db.master.units.find((entry) => entry.id === unitId)?.name || unitId || "";
            return {
                row,
                scope,
                article,
                work,
                category,
                vendorRate,
                unitId,
                rate,
                unit,
                amount: Math.round((row.quantity || 0) * rate),
                missingVendorRate: !!scope && rate <= 0,
                willUpdateVendorRate: !!scope && !!form.vendor_id && row.rate !== null && row.rate > 0 && row.rate !== vendorRate?.quoted_rate,
            };
        });
    }, [form, db.master]);
    const totalAmount = resolvedRows.reduce((n, r) => n + r.amount, 0);
    const hasMissingVendorRate = resolvedRows.some((r) => r.missingVendorRate && r.article);
    const previewItems: LineItem[] = React.useMemo(() => resolvedRows
        .filter((r) => r.article)
        .map((r, idx) => ({
        id: `preview-${idx}`,
        title: r.article!.name,
        article_id: r.article!.id,
        category_id: r.category?.id,
        work_required_article_id: r.scope?.id,
        quantity: r.row.quantity || 0,
        unit_id: r.unitId,
        unit_name: r.unit,
        rate: r.rate,
        amount: r.amount,
        source_kind: "po" as const,
    })), [resolvedRows]);
    const handleCreatePO = () => {
        const vendor = db.master.vendors.find((v) => v.id === form.vendor_id);
        if (!vendor) {
            toast.error("Please select a vendor.");
            return;
        }
        const validRows = resolvedRows.filter((r) => r.article && r.row.quantity > 0);
        if (validRows.length === 0) {
            toast.error("Add at least one article with a quantity.");
            return;
        }
        if (validRows.some((row) => !row.scope || row.rate <= 0)) {
            toast.error("Enter a positive exact rate for every PO material before creating the purchase order.");
            return;
        }
        const boqForJob = form.work_order_id
            ? db.boqs.find((b) => b.work_order_id === form.work_order_id)
            : undefined;
        const items: LineItem[] = validRows.map((r, idx) => {
            const matchedBoqItem = boqForJob?.items.find((item) => r.scope?.id ? item.work_required_article_id === r.scope.id : item.article_id === r.article!.id);
            return {
                id: `poi-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                title: r.article!.name,
                article_id: r.article!.id,
                category_id: r.category?.id,
                work_required_id: matchedBoqItem?.work_required_id,
                work_required_article_id: r.scope?.id,
                quantity: r.row.quantity,
                unit_id: r.unitId,
                unit_name: r.unit,
                rate: r.rate,
                amount: r.amount,
                tax_rate: 18,
                status: "active",
                source_kind: "po",
                source_item_id: matchedBoqItem?.id,
                ordered_qty: 0,
                received_qty: 0,
                issued_qty: 0,
                consumed_qty: 0,
            };
        });
        const workOrder = form.work_order_id
            ? db.workOrders.find((j) => j.id === form.work_order_id)
            : undefined;
        const id = createPO({
            vendor_id: vendor.id,
            vendor_name: vendor.name,
            work_order_id: workOrder?.id,
            work_order_no: workOrder?.work_order_no,
            site_id: workOrder?.site_id,
            expected_delivery: form.expected_delivery,
            items,
        });
        if (!id) {
            toast.error("Could not create PO.");
            return;
        }
        const vendorRateUpdates = validRows
            .filter((row) => row.scope && row.article && row.willUpdateVendorRate)
            .map((row) => ({
            vendorId: vendor.id,
            articleId: row.article!.id,
            articleName: row.article!.name,
            workRequiredArticleId: row.scope!.id,
            variantId: row.vendorRate?.variant_id,
            quotedRate: row.rate,
            sourceType: "PO" as const,
            sourceId: id,
            sourceNo: id,
            changedBy: "Purchase Order",
            notes: `Updated from purchase order ${id}.`,
        }));
        if (vendorRateUpdates.length) {
            mutateMaster((master) => applyVendorRateUpdates(master, vendorRateUpdates));
        }
        setDialogOpen(false);
        openDetail("po", id);
        toast.success(vendorRateUpdates.length
            ? `PO created — ${vendorRateUpdates.length} vendor material rate${vendorRateUpdates.length === 1 ? "" : "s"} updated.`
            : "PO created — approval task generated.");
    };
    return (<>
      <OperationsWorkspace title="Procurement / Purchase Orders" description="Vendor POs raised against BOQs — approval, dispatch, delivery tracking" icon={<ShoppingCart className="h-4 w-4"/>} workflow={["BOQ", "PO Raise", "Approve", "Send", "Delivery", "GRN"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => setFilter(id as FilterId)} queues={queues} onCreate={openCreate} createLabel="+ Create PO" searchPlaceholder="Search POs…" secondaryActions={[{ label: "Direct Award", icon: <Zap className="mr-1 h-3.5 w-3.5"/>, onClick: openDirectAward, variant: "outline" }]}/>

      <CreatePODialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} setForm={setForm} resolvedRows={resolvedRows} previewItems={previewItems} totalAmount={totalAmount} hasMissingVendorRate={hasMissingVendorRate} hasVendorRateUpdates={resolvedRows.some((row) => row.willUpdateVendorRate && row.article)} onAddRow={addRow} onUpdateRow={updateRow} onRemoveRow={removeRow} onCreate={handleCreatePO} vendors={db.master.vendors} workOrders={db.workOrders} catalogOptions={db.master.subcategoryArticleMap.map((scope) => {
            const article = db.master.articles.find((entry) => entry.id === scope.article_id);
            const work = db.master.workSubcategories.find((entry) => entry.id === scope.work_required_id);
            const category = work ? db.master.workCategories.find((entry) => entry.id === work.category_id) : undefined;
            const unit = db.master.units.find((entry) => entry.id === scope.unit_id);
            return {
                id: scope.id,
                label: `${category?.name || "Unassigned"} › ${work?.name || "Submodule"} — ${article?.name || "Material"} · ${unit?.symbol || scope.unit_id}`,
                articleName: article?.name || "Material",
                categoryName: category?.name,
                submoduleName: work?.name,
                unitLabel: unit?.symbol || scope.unit_id,
            };
        })}/>

      <DirectAwardPODialog open={directAwardOpen} onOpenChange={setDirectAwardOpen} form={directAwardForm} setForm={setDirectAwardForm} vendors={db.master.vendors} workOrders={db.workOrders} catalogOptions={db.master.subcategoryArticleMap.map((scope) => {
            const article = db.master.articles.find((entry) => entry.id === scope.article_id);
            const work = db.master.workSubcategories.find((entry) => entry.id === scope.work_required_id);
            const category = work ? db.master.workCategories.find((entry) => entry.id === work.category_id) : undefined;
            const unit = db.master.units.find((entry) => entry.id === scope.unit_id);
            return {
                id: scope.id,
                label: `${category?.name || "Unassigned"} › ${work?.name || "Submodule"} — ${article?.name || "Material"} · ${unit?.symbol || scope.unit_id}`,
                unitSymbol: unit?.symbol || scope.unit_id,
                referenceRate: scope.reference_rate,
            };
        })} onCreate={handleCreateDirectAward}/>

      {/* E: Vendor Bid dialog — pre-fills the bid rate with the vendor's
          existing vendorRate for each requested BOQ article. */}
      <VendorBidDialog open={bidRfqId !== null} onOpenChange={(v) => { if (!v) setBidRfqId(null); }} rfqId={bidRfqId} vendorId={bidVendorId} onVendorChange={onBidVendorChange} rates={bidRates} onRatesChange={setBidRates} deliveryDays={bidDeliveryDays} onDeliveryDaysChange={setBidDeliveryDays} db={db} onSave={saveVendorBid}/>
      <Dialog open={Boolean(rfqFilesId)} onOpenChange={(open) => { if (!open) setRfqFilesId(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>RFQ & vendor bid files</DialogTitle></DialogHeader>
          {rfqFilesId && (() => {
            const rfq = db.vendorRfqs.find((row) => row.id === rfqFilesId);
            if (!rfq) return <p className="text-xs text-muted-foreground">RFQ not found.</p>;
            const bids = db.vendorBids.filter((row) => row.rfq_id === rfq.id);
            return <div className="max-h-[65vh] space-y-3 overflow-y-auto rd-scroll">
              <EntityFilesCard entityType="vendor_rfq" entityId={rfq.id} title={`${rfq.rfq_no} files`} manage showEmpty />
              {bids.map((bid) => <div key={bid.id} className="rounded-lg border border-border bg-muted/10 p-3">
                <p className="text-xs font-semibold">{bid.vendor_name} · {formatINRShort(bid.quoted_amount || 0)}</p>
                <EntityFilesCard entityType="vendor_bid" entityId={bid.id} title="Vendor quotation / bid files" manage showEmpty />
              </div>)}
              {!bids.length ? <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No vendor bids recorded yet.</p> : null}
            </div>;
          })()}
        </DialogContent>
      </Dialog>
    </>);
}

// ─── Vendor Bid Dialog (E) ──────────────────────────────────────────────────
// Pre-fills the bid rate field with the vendor's existing vendorRate for each
// requested BOQ article (from master.vendorRates). Shows a "last rate" hint
// beside each line so the user knows the vendor's prior negotiated rate.
function VendorBidDialog({ open, onOpenChange, rfqId, vendorId, onVendorChange, rates, onRatesChange, deliveryDays, onDeliveryDaysChange, db, onSave }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    rfqId: string | null;
    vendorId: string;
    onVendorChange: (vendorId: string) => void;
    rates: Record<string, string>;
    onRatesChange: (rates: Record<string, string>) => void;
    deliveryDays: string;
    onDeliveryDaysChange: (v: string) => void;
    db: any;
    onSave: () => void;
}) {
    if (!rfqId)
        return null;
    const rfq = db.vendorRfqs.find((r: any) => r.id === rfqId);
    const boq = rfq ? db.boqs.find((b: any) => b.id === rfq.boq_id) : undefined;
    if (!rfq || !boq)
        return null;
    const bidItems = boq.items.filter((item: any) => rfq.item_ids.includes(item.id));
    const total = bidItems.reduce((sum: number, item: any) => sum + (Number(rates[item.id]) || 0) * item.quantity, 0);
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gavel className="h-4 w-4 text-primary"/> Record vendor bid</DialogTitle>
          <p className="text-xs text-muted-foreground">{rfq.rfq_no} · {boq.title} · {bidItems.length} items. Bid rates are pre-filled from the vendor's existing price matrix — adjust if the vendor has quoted differently.</p>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            <span>Vendor *</span>
            <select value={vendorId} onChange={(e) => onVendorChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select vendor…</option>
              {rfq.vendor_ids.map((id: string) => {
                    const v = db.master.vendors.find((vendor: any) => vendor.id === id);
                    const alreadyBid = db.vendorBids.some((b: any) => b.rfq_id === rfq.id && b.vendor_id === id);
                    return (<option key={id} value={id}>
                        {v?.name || id}{alreadyBid ? " (already bid)" : ""}
                      </option>);
                })}
            </select>
          </label>
          <div className="rounded-md border border-border">
            <div className="grid grid-cols-[1fr_72px_92px_92px_120px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>BOQ article</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Last rate</span>
              <span className="text-right">Bid rate</span>
              <span className="text-right">Amount</span>
            </div>
            {bidItems.map((item: any) => {
                    const itemArticleId = procurementArticleId(db.master, item);
                    const vendorRate = vendorId && itemArticleId
                        ? db.master.vendorRates.find((vr) => vr.vendor_id === vendorId && vr.article_id === itemArticleId && (vr.variant_id || "") === (item.variant_id || ""))
                        : undefined;
                    const rate = Number(rates[item.id]) || 0;
                    return (<div key={item.id} className="grid grid-cols-[1fr_72px_92px_92px_120px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0">
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="text-right font-mono">{item.quantity} {item.unit_name || ""}</span>
                      <span className="text-right font-mono text-muted-foreground" title={vendorRate ? `Last rate: ${vendorRate.quoted_rate} (updated ${vendorRate.updated_at.slice(0, 10) || "—"})` : "No prior rate on file"}>
                        {vendorRate ? formatINR(vendorRate.quoted_rate) : "—"}
                      </span>
                      <Input inputMode="decimal" value={rates[item.id] || ""} onChange={(e) => onRatesChange({ ...rates, [item.id]: e.target.value })} placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"} className="h-8 text-right font-mono"/>
                      <span className="text-right font-mono font-semibold">{formatINR(rate * item.quantity)}</span>
                    </div>);
                })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              <span>Delivery days (optional)</span>
              <Input inputMode="numeric" value={deliveryDays} onChange={(e) => onDeliveryDaysChange(e.target.value)} placeholder="e.g. 3"/>
            </label>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Bid total</p>
              <p className="font-mono text-sm font-bold">{formatINR(total)}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Each requested BOQ article needs the vendor's actual bid rate. The "Last rate" column shows the vendor's most recent negotiated rate from the price matrix — pre-filled into the bid rate field for convenience.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!vendorId}><Gavel className="mr-1.5 h-3.5 w-3.5"/> Record bid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}

// ─── Direct Award PO Dialog ─────────────────────────────────────────────────
// An audited exception path: create a PO straight to a trusted vendor without
// running a formal RFQ/bid round. A reason is REQUIRED so the exception is
// traceable in the audit log. The resulting PO carries direct_award=true,
// award_basis="direct", award_reason, and award_approved_by.
interface DirectAwardFormState {
    vendor_id: string;
    work_order_id: string;
    expected_delivery: string;
    rows: BuilderRow[];
    award_reason: string;
    note: string;
}
function DirectAwardPODialog({ open, onOpenChange, form, setForm, vendors, workOrders, catalogOptions, onCreate }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    form: DirectAwardFormState;
    setForm: React.Dispatch<React.SetStateAction<DirectAwardFormState>>;
    vendors: import("@/lib/rdash/types").Vendor[];
    workOrders: import("@/lib/rdash/types").WorkOrder[];
    catalogOptions: Array<{ id: string; label: string; unitSymbol: string; referenceRate?: number }>;
    onCreate: () => void;
}) {
    const addRow = () => setForm((f) => ({ ...f, rows: [...f.rows, newBuilderRow()] }));
    const updateRow = (rowId: string, patch: Partial<BuilderRow>) => setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }));
    const removeRow = (rowId: string) => setForm((f) => ({ ...f, rows: f.rows.length > 1 ? f.rows.filter((r) => r.id !== rowId) : f.rows }));
    const total = form.rows.reduce((sum, r) => sum + (r.quantity && r.rate ? r.quantity * r.rate : 0), 0);
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-warning"/> Direct Award PO</DialogTitle>
          <p className="text-xs text-muted-foreground">Award a PO straight to a trusted vendor <strong>without</strong> running a formal RFQ/bid round. A reason is required so the exception is recorded in the audit log.</p>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Vendor</label>
              <select value={form.vendor_id} onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Work Order (optional)</label>
              <select value={form.work_order_id} onChange={(e) => setForm((f) => ({ ...f, work_order_id: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option value="">No work order</option>
                {workOrders.map((j) => <option key={j.id} value={j.id}>{j.work_order_no}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Expected delivery</label>
            <input type="date" value={form.expected_delivery} onChange={(e) => setForm((f) => ({ ...f, expected_delivery: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"/>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Line items</label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRow}><Plus className="mr-1 h-3 w-3"/> Add row</Button>
            </div>
            <div className="space-y-2">
              {form.rows.map((row) => {
                const option = catalogOptions.find((o) => o.id === row.work_required_article_id);
                return (<div key={row.id} className="flex items-end gap-2 rounded-md border border-border bg-background p-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Material</label>
                    <select value={row.work_required_article_id} onChange={(e) => {
                        const opt = catalogOptions.find((o) => o.id === e.target.value);
                        updateRow(row.id, { work_required_article_id: e.target.value, rate: opt?.referenceRate ?? null });
                    }} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
                      <option value="">Select material…</option>
                      {catalogOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="w-20 space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Qty</label>
                    <input type="number" min={0} step="0.01" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) })} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"/>
                  </div>
                  <div className="w-20 space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Rate</label>
                    <input type="number" min={0} step="0.01" value={row.rate ?? ""} onChange={(e) => updateRow(row.id, { rate: e.target.value ? Number(e.target.value) : null })} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"/>
                  </div>
                  <div className="w-24 space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Amount</label>
                    <div className="flex h-8 items-center font-mono text-xs text-muted-foreground">{formatINR(row.quantity && row.rate ? row.quantity * row.rate : 0)}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                </div>);
              })}
            </div>
            <div className="flex justify-end pt-1">
              <div className="rounded-md bg-muted/40 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-mono font-bold">{formatINR(total)}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-warning">Reason (required for audit trail)</label>
            <Textarea value={form.award_reason} onChange={(e) => setForm((f) => ({ ...f, award_reason: e.target.value }))} placeholder="e.g. Trusted vendor with established pricing; urgent delivery needed before RFQ round could complete; repeat order from same vendor at same rate." rows={2} className="text-sm"/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Note (optional)</label>
            <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Any additional context for the thread." rows={2} className="text-sm"/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onCreate} disabled={!form.award_reason.trim()}>
            <Zap className="mr-1.5 h-3.5 w-3.5"/> Create direct-award PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
interface CreatePODialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    form: PoFormState;
    setForm: React.Dispatch<React.SetStateAction<PoFormState>>;
    resolvedRows: Array<{
        row: BuilderRow;
        scope: import("@/lib/rdash/types").WorkRequiredArticle | undefined;
        article: import("@/lib/rdash/types").Article | undefined;
        work: import("@/lib/rdash/types").WorkSubcategory | undefined;
        category: import("@/lib/rdash/types").WorkCategory | undefined;
        unitId: string | undefined;
        vendorRate: import("@/lib/rdash/types").VendorRate | undefined;
        rate: number;
        unit: string;
        amount: number;
        missingVendorRate: boolean;
        willUpdateVendorRate: boolean;
    }>;
    previewItems: LineItem[];
    totalAmount: number;
    hasMissingVendorRate: boolean;
    hasVendorRateUpdates: boolean;
    onAddRow: () => void;
    onUpdateRow: (id: string, patch: Partial<BuilderRow>) => void;
    onRemoveRow: (id: string) => void;
    onCreate: () => void;
    vendors: import("@/lib/rdash/types").Vendor[];
    workOrders: import("@/lib/rdash/types").WorkOrder[];
    catalogOptions: CatalogSearchOption[];
}
function CreatePODialog(props: CreatePODialogProps) {
    const { open, onOpenChange, form, setForm, resolvedRows, previewItems, totalAmount, hasMissingVendorRate, hasVendorRateUpdates, onAddRow, onUpdateRow, onRemoveRow, onCreate, vendors, workOrders, catalogOptions, } = props;
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary"/>
            Create Purchase Order
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormSelect label="Vendor" value={form.vendor_id} onChange={(v) => setForm((f) => ({
            ...f,
            vendor_id: v,
            rows: f.rows.map((row) => ({ ...row, rate: null })),
        }))}>
              <option value="">Select vendor…</option>
              {vendors.map((v) => (<option key={v.id} value={v.id}>
                  {v.name} ({v.category || "Vendor"})
                </option>))}
            </FormSelect>

            <FormSelect label="Work Order (optional)" value={form.work_order_id} onChange={(v) => setForm((f) => ({ ...f, work_order_id: v }))}>
              <option value="">Select awarded work order…</option>
              {workOrders.map((j) => (<option key={j.id} value={j.id}>
                  {j.work_order_no} · {j.title}
                </option>))}
            </FormSelect>

            <FormField label="Expected delivery">
              <input type="date" value={form.expected_delivery} onChange={(e) => setForm((f) => ({ ...f, expected_delivery: e.target.value }))} className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none ring-ring focus-visible:ring-2"/>
            </FormField>
          </div>

          {hasMissingVendorRate && (<div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
              <span>
                Missing vendor price. Enter the exact rate in this PO row. Creating the PO saves that exact material rate to the selected vendor’s price matrix with history.
              </span>
            </div>)}
          {hasVendorRateUpdates && (<p className="-mt-2 text-[11px] text-primary">
              Edited rates will be saved to the selected vendor’s exact material price matrix with a PO source history entry.
            </p>)}
          <div className="overflow-x-auto rd-scroll rounded-lg border border-border">
            <div className="min-w-[560px]">
            <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_auto] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Submodule material</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Amount</span>
              <span className="text-center">—</span>
            </div>
            {resolvedRows.map((r) => (<div key={r.row.id} className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0">
                <SearchableMaterialPicker value={r.row.work_required_article_id} options={catalogOptions} onChange={(workRequiredArticleId) => onUpdateRow(r.row.id, {
                work_required_article_id: workRequiredArticleId,
                rate: null,
            })}/>
                <input type="number" min={0} step="any" value={r.row.quantity} onChange={(e) => onUpdateRow(r.row.id, {
                quantity: Number(e.target.value) || 0,
            })} className="h-8 w-full rounded-md border border-input bg-card px-2 text-right font-mono text-xs outline-none ring-ring focus-visible:ring-2"/>
                <input aria-label={`${r.article?.name || "Material"} exact vendor rate`} type="number" min={0} step="0.01" disabled={!form.vendor_id || !r.scope} value={r.row.rate ?? (r.vendorRate?.quoted_rate ?? "")} onChange={(event) => {
                const input = event.target.value;
                const next = Number(input);
                onUpdateRow(r.row.id, {
                    rate: input === "" || !Number.isFinite(next) ? null : Math.max(0, next),
                });
            }} placeholder={form.vendor_id ? "Enter rate" : "Select vendor"} className="h-8 w-full rounded-md border border-input bg-card px-2 text-right font-mono text-xs outline-none ring-ring focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"/>
                <span className="text-right font-mono font-semibold">
                  {formatINR(r.amount)}
                </span>
                <button type="button" onClick={() => onRemoveRow(r.row.id)} className="mx-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40" disabled={resolvedRows.length === 1} title="Remove row">
                  <Trash2 className="h-3.5 w-3.5"/>
                </button>
              </div>))}
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
                <Plus className="mr-1 h-3.5 w-3.5"/> Add row
              </Button>
              <span className="text-sm font-bold">
                Total: {formatINR(totalAmount)}
              </span>
            </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </p>
            <LineItemTable items={previewItems}/>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onCreate}>
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5"/> {hasVendorRateUpdates ? "Create PO & update rates" : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
function SearchableMaterialPicker({ value, options, onChange, }: {
    value: string;
    options: CatalogSearchOption[];
    onChange: (value: string) => void;
}) {
    const selected = options.find((option) => option.id === value);
    const [query, setQuery] = React.useState(selected?.label || "");
    const [open, setOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const results = React.useMemo(() => searchCatalogOptions(options, query), [options, query]);
    React.useEffect(() => {
        if (!open) {
            setQuery(selected?.label || "");
            setHighlightedIndex(-1);
        }
    }, [open, selected?.label]);
    React.useEffect(() => {
        const closeOnOutsidePointer = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", closeOnOutsidePointer);
        return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
    }, []);
    const choose = (option: CatalogSearchOption) => {
        onChange(option.id);
        setQuery(option.label);
        setOpen(false);
        setHighlightedIndex(-1);
    };
    return (<div ref={rootRef} className="relative min-w-0">
      <Search className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
      <input aria-label="Search submodule material" aria-autocomplete="list" aria-controls="po-material-results" aria-expanded={open} role="combobox" value={query} placeholder="Search material…" onFocus={() => setOpen(true)} onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
        }} onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setHighlightedIndex((index) => Math.min(results.length - 1, Math.max(0, index + 1)));
            }
            else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(0, index - 1));
            }
            else if (event.key === "Enter" && open && results[highlightedIndex]) {
                event.preventDefault();
                choose(results[highlightedIndex]);
            }
            else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
            }
        }} className="h-8 w-full rounded-md border border-input bg-card py-1 pl-7 pr-2 text-xs outline-none ring-ring focus-visible:ring-2"/>
      {open && (<div id="po-material-results" role="listbox" className="absolute left-0 top-full z-[80] mt-1 max-h-72 w-[min(38rem,calc(100vw-4rem))] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.length ? results.map((option, index) => (<button key={option.id} type="button" role="option" aria-selected={option.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={cn("block w-full rounded-sm px-2.5 py-2 text-left text-xs hover:bg-accent focus:bg-accent", index === highlightedIndex && "bg-accent", option.id === value && "bg-primary/10 text-primary")}>
              <span className="block font-medium text-foreground">{option.articleName}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {[option.categoryName, option.submoduleName, option.unitLabel].filter(Boolean).join(" › ")}
              </span>
            </button>)) : (<p className="px-2.5 py-3 text-xs text-muted-foreground">No material matches “{query}”.</p>)}
        </div>)}
    </div>);
}
function FormField({ label, children, }: {
    label: string;
    children: React.ReactNode;
}) {
    return (<div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>);
}
function FormSelect({ label, value, onChange, children, }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (<FormField label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none ring-ring focus-visible:ring-2")}>
        {children}
      </select>
    </FormField>);
}
