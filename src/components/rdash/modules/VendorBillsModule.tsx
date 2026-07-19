"use client";
import * as React from "react";
import { Receipt, CheckCircle2, AlertTriangle, Building2, MoreHorizontal, Check, IndianRupee, ShieldCheck, X, Clock, } from "lucide-react";
import { useRDashStore, vendorBalance } from "@/lib/rdash/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import type { ContextAction } from "../ContextMenuHost";
import { vendorBillStatusStyle, formatINRShort, formatDate, } from "@/lib/rdash/format";
import { toast } from "sonner";
import type { VendorBill, Vendor, VendorInvoiceLine } from "@/lib/rdash/types";
import { applyVendorRateUpdates, vendorRateUpdatesFromVendorBill } from "@/lib/rdash/vendor-rate";
function reliabilityBadgeClass(score: number | undefined): string {
    if (score == null)
        return "bg-muted text-muted-foreground border-border";
    if (score >= 85)
        return "bg-success/10 text-success border-success/20";
    if (score >= 70)
        return "bg-warning/10 text-warning border-warning/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
}
function reliabilityLabel(score: number | undefined): string {
    if (score == null)
        return "—";
    if (score >= 85)
        return "Reliable";
    if (score >= 70)
        return "Avg";
    return "Risky";
}
export function VendorBillsModule() {
    const db = useRDashStore((s) => s.db);
    const approveVendorBill = useRDashStore((s) => s.approveVendorBill);
    const rejectVendorBill = useRDashStore((s) => s.rejectVendorBill);
    const addVendorBill = useRDashStore((s) => s.addVendorBill);
    const recordVendorPayment = useRDashStore((s) => s.recordVendorPayment);
    const openDetail = useRDashStore((s) => s.openDetail);
    const mutateMaster = useRDashStore((s) => s.mutateMaster);
    const [filter, setFilter] = React.useState<string>("all");
    const [paymentBill, setPaymentBill] = React.useState<VendorBill | null>(null);
    const [paymentAmount, setPaymentAmount] = React.useState("");
    const [paymentMode, setPaymentMode] = React.useState("bank_transfer");
    const [paymentReference, setPaymentReference] = React.useState("");
    const [createInvoiceOpen, setCreateInvoiceOpen] = React.useState(false);
    const [selectedGrnId, setSelectedGrnId] = React.useState("");
    const [vendorInvoiceNo, setVendorInvoiceNo] = React.useState("");
    const [vendorInvoiceDate, setVendorInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [vendorInvoiceDueDate, setVendorInvoiceDueDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [vendorInvoiceTax, setVendorInvoiceTax] = React.useState("0");
    const [vendorInvoiceLines, setVendorInvoiceLines] = React.useState<VendorInvoiceLine[]>([]);
    const [updateVendorRatesFromInvoice, setUpdateVendorRatesFromInvoice] = React.useState(true);
    // D: Reject dialog state — captures the rejection reason.
    const [rejectBill, setRejectBill] = React.useState<VendorBill | null>(null);
    const [rejectReason, setRejectReason] = React.useState("");
    const bills = db.vendorBills;
    const draft = bills.filter((b) => b.status === "draft");
    const pendingApproval = bills.filter((b) => b.status === "pending_approval");
    const pending = bills.filter((b) => b.status === "pending");
    const disputed = bills.filter((b) => b.status === "disputed");
    const approvedOrPaid = bills.filter((b) => b.status === "approved" || b.status === "partly_paid" || b.status === "paid");
    // CV-7: Vendor payable metric. bill.balance_amount is already reduced by recordVendorPayment
    // (which always creates a status="paid" VendorPayment immediately and decrements the balance),
    // so unlike the contractor side there is no committed-but-not-disbursed state to subtract.
    // We filter out fully-paid bills (balance_amount === 0) so the metric reflects only what is
    // still genuinely outstanding. Pending/disputed/draft bills are excluded — they cannot be paid
    // until the 3-way match is resolved and the bill is approved.
    const outstanding = approvedOrPaid
        .filter((b) => b.balance_amount > 0)
        .reduce((n, b) => n + b.balance_amount, 0);
    const openPayment = (bill: VendorBill) => {
        setPaymentBill(bill);
        setPaymentAmount(String(bill.balance_amount));
        setPaymentMode("bank_transfer");
        setPaymentReference("");
    };
    // D: Reject a pending-approval vendor bill — opens the reason dialog.
    const openReject = (bill: VendorBill) => {
        setRejectBill(bill);
        setRejectReason("");
    };
    // D: Submit the rejection reason.
    const submitReject = () => {
        if (!rejectBill)
            return;
        if (!rejectReason.trim()) {
            toast.error("A rejection reason is required for the audit trail.");
            return;
        }
        try {
            rejectVendorBill(rejectBill.id, rejectReason.trim());
            toast.success(`${rejectBill.bill_no} rejected — back to draft.`);
            setRejectBill(null);
            setRejectReason("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not reject vendor bill.");
        }
    };
    const savePayment = () => {
        if (!paymentBill)
            return;
        const amount = Number(paymentAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > paymentBill.balance_amount + 0.01) {
            toast.error("Enter a payment amount within the outstanding bill balance.");
            return;
        }
        if (!paymentReference.trim()) {
            toast.error("Add the bank, UPI, cheque or cash reference.");
            return;
        }
        try {
            const id = recordVendorPayment(paymentBill.id, amount, paymentMode, paymentReference.trim());
            toast.success(`Vendor payment ${id} recorded for ${paymentBill.bill_no}`);
            setPaymentBill(null);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Vendor payment could not be recorded");
        }
    };
    const availableGrns = db.grns.filter((grn) => !grn.bill_id);
    const linesFromGrn = (grnId: string): VendorInvoiceLine[] => {
        const grn = db.grns.find((entry) => entry.id === grnId);
        return grn?.items.map((line) => ({
            po_item_id: line.source_item_id,
            article_id: line.article_id,
            work_required_article_id: line.work_required_article_id,
            variant_id: line.variant_id,
            unit_id: line.unit_id,
            title: line.title,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
            tax_rate: line.tax_rate,
        })) || [];
    };
    const openCreateInvoice = () => {
        const first = availableGrns[0];
        if (!first) {
            toast.error("File a GRN first. A vendor invoice must be matched to one received delivery.");
            return;
        }
        setSelectedGrnId(first.id);
        setVendorInvoiceNo("");
        setVendorInvoiceDate(new Date().toISOString().slice(0, 10));
        setVendorInvoiceDueDate(new Date().toISOString().slice(0, 10));
        setVendorInvoiceTax("0");
        setVendorInvoiceLines(linesFromGrn(first.id));
        setUpdateVendorRatesFromInvoice(true);
        setCreateInvoiceOpen(true);
    };
    const updateInvoiceLine = (index: number, patch: Partial<VendorInvoiceLine>) => {
        setVendorInvoiceLines((lines) => lines.map((line, lineIndex) => {
            if (lineIndex !== index)
                return line;
            const next = { ...line, ...patch };
            return { ...next, amount: Math.round(((next.quantity || 0) * (next.rate || 0)) * 100) / 100 };
        }));
    };
    const saveVendorInvoice = () => {
        const grn = db.grns.find((entry) => entry.id === selectedGrnId);
        if (!grn) {
            toast.error("Select a GRN.");
            return;
        }
        const po = db.purchaseOrders.find((entry) => entry.id === grn.po_id);
        if (!po) {
            toast.error("The selected GRN has no purchase order.");
            return;
        }
        if (!vendorInvoiceNo.trim()) {
            toast.error("Vendor invoice number is required.");
            return;
        }
        if (!vendorInvoiceLines.length || vendorInvoiceLines.some((line) => !line.quantity || !line.rate || line.amount <= 0)) {
            toast.error("Enter an actual received quantity and rate for every invoice line.");
            return;
        }
        const taxableAmount = Math.round(vendorInvoiceLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
        const taxAmount = Number(vendorInvoiceTax || 0);
        if (!Number.isFinite(taxAmount) || taxAmount < 0) {
            toast.error("Enter a valid tax amount.");
            return;
        }
        try {
            const invoiceLines = vendorInvoiceLines.map((line) => {
                const poLine = line.po_item_id ? po.items.find((item) => item.id === line.po_item_id) : undefined;
                return {
                    ...line,
                    article_id: line.article_id || poLine?.article_id,
                    work_required_article_id: line.work_required_article_id || poLine?.work_required_article_id,
                    variant_id: line.variant_id || poLine?.variant_id,
                    unit_id: line.unit_id || poLine?.unit_id,
                };
            });
            const billDraft: Partial<VendorBill> = {
                po_id: po.id,
                grn_id: grn.id,
                vendor_invoice_no: vendorInvoiceNo.trim(),
                vendor_invoice_date: vendorInvoiceDate,
                due_date: vendorInvoiceDueDate,
                amount: taxableAmount,
                tax_amount: taxAmount,
                total_amount: taxableAmount + taxAmount,
                invoice_lines: invoiceLines,
            };
            const billId = addVendorBill(billDraft);
            if (updateVendorRatesFromInvoice) {
                const billForRateUpdate = {
                    ...billDraft,
                    id: billId,
                    bill_no: billId,
                    vendor_id: po.vendor_id,
                    vendor_name: po.vendor_name,
                    site_id: po.site_id,
                    work_order_id: po.work_order_id,
                    po_no: po.po_no,
                    grn_no: grn.grn_no,
                } as VendorBill;
                const updates = vendorRateUpdatesFromVendorBill(db.master, billForRateUpdate, po, "Vendor Invoice");
                if (updates.length) mutateMaster((master) => applyVendorRateUpdates(master, updates));
            }
            toast.success(updateVendorRatesFromInvoice ? `Vendor invoice recorded and exact vendor rates updated.` : `Vendor invoice recorded. Run the 3-way match before approval.`);
            setCreateInvoiceOpen(false);
            openDetail("vendorBill", billId);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Vendor invoice could not be recorded");
        }
    };
    const metrics: MetricSpec[] = [
        {
            label: "Total bills",
            value: bills.length,
            tone: "default",
            icon: <Receipt className="h-4 w-4"/>,
        },
        {
            label: "Pending approval",
            value: pendingApproval.length,
            tone: "warning",
            icon: <Clock className="h-4 w-4"/>,
        },
        {
            label: "Disputed (3-way mismatch)",
            value: disputed.length,
            tone: "destructive",
            icon: <AlertTriangle className="h-4 w-4"/>,
        },
        {
            label: "Outstanding",
            value: formatINRShort(outstanding),
            tone: "warning",
            icon: <IndianRupee className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: bills.length, active: filter === "all" },
        { id: "pending_approval", label: "Pending Approval", count: pendingApproval.length, active: filter === "pending_approval" },
        { id: "draft", label: "Draft", count: draft.length, active: filter === "draft" },
        { id: "pending", label: "Pending", count: pending.length, active: filter === "pending" },
        {
            id: "approved",
            label: "Approved",
            count: bills.filter((b) => b.status === "approved").length,
            active: filter === "approved",
        },
        {
            id: "disputed",
            label: "Disputed",
            count: disputed.length,
            active: filter === "disputed",
        },
        {
            id: "partly_paid",
            label: "Partly paid",
            count: bills.filter((b) => b.status === "partly_paid").length,
            active: filter === "partly_paid",
        },
        {
            id: "paid",
            label: "Paid",
            count: bills.filter((b) => b.status === "paid").length,
            active: filter === "paid",
        },
    ];
    const showPendingApproval = filter === "all" || filter === "pending_approval";
    const showDraft = filter === "all" || filter === "draft";
    const showPending = filter === "all" || filter === "pending";
    const showDisputed = filter === "all" || filter === "disputed";
    const showApprovedPaid = filter === "all" || filter === "approved" || filter === "partly_paid" || filter === "paid";
    const showVendors = filter === "all";
    const buildRowActions = (b: VendorBill): ContextAction[] => {
        const acts: ContextAction[] = [
            {
                label: "Open",
                icon: <MoreHorizontal className="h-3.5 w-3.5"/>,
                onClick: () => openDetail("vendorBill", b.id),
            },
        ];
        if (b.status === "pending_approval") {
            // D: Inline Approve + Reject actions for policy-pending bills.
            acts.push({
                label: "Approve (Owner)",
                icon: <Check className="h-3.5 w-3.5"/>,
                onClick: () => {
                    try {
                        approveVendorBill(b.id);
                        toast.success(`${b.bill_no} approved — ready for 3-way match.`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Vendor bill approval blocked");
                    }
                },
            });
            acts.push({
                label: "Reject (Owner)",
                icon: <X className="h-3.5 w-3.5"/>,
                onClick: () => openReject(b),
            });
        }
        if (b.status === "draft") {
            acts.push({
                label: "Match vendor invoice",
                icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
                onClick: () => openDetail("vendorBill", b.id),
            });
        }
        if (b.status === "pending") {
            acts.push({
                label: "Approve",
                icon: <Check className="h-3.5 w-3.5"/>,
                onClick: () => {
                    try {
                        approveVendorBill(b.id);
                        toast.success(`${b.bill_no} approved`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Vendor bill approval blocked");
                    }
                },
            });
        }
        else if (b.status === "disputed") {
            // CV-15: Previously the button was labelled "Resolve & Approve" but approveVendorBill
            // throws on disputed bills (status==="disputed" || matched !== true). The label implied
            // it did both — it did neither. For flexibility, route the user to the detail panel
            // where they can re-run the 3-way match (which clears the dispute flag and moves the
            // bill to "pending"), then approve. The label is now accurate.
            acts.push({
                label: "Open to resolve mismatch",
                icon: <AlertTriangle className="h-3.5 w-3.5"/>,
                onClick: () => openDetail("vendorBill", b.id),
            });
        }
        if (b.status === "approved" || b.status === "partly_paid") {
            acts.push({
                label: "Record payment",
                icon: <IndianRupee className="h-3.5 w-3.5"/>,
                onClick: () => openPayment(b),
            });
        }
        return acts;
    };
    const billRow = (b: VendorBill): RecordRow => {
        const st = vendorBillStatusStyle(b.status);
        const site = db.sites.find((entry) => entry.id === b.site_id);
        const workOrder = db.workOrders.find((entry) => entry.id === b.work_order_id);
        const metaParts: string[] = [`Due ${formatDate(b.due_date)}`, `Paid ${formatINRShort(b.paid_amount)} · Balance ${formatINRShort(b.balance_amount)}`];
        if (site)
            metaParts.push(site.name);
        if (workOrder)
            metaParts.push(workOrder.work_order_no);
        if (b.mismatch_amount) {
            metaParts.push(`Mismatch ${formatINRShort(b.mismatch_amount)}`);
        }
        // D: Show a "policy pending" badge on pending_approval bills.
        const badge = b.status === "pending_approval"
            ? (<span title="High-value bill — Owner approval required before matching/payment" className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <Clock className="h-2.5 w-2.5"/> Policy approval
              </span>)
            : undefined;
        return {
            id: b.id,
            title: `${b.bill_no} · ${b.vendor_name}`,
            subtitle: `Against ${b.po_no || "—"} / ${b.grn_no || "—"}`,
            customerName: b.vendor_name,
            amount: b.total_amount,
            due: b.due_date,
            status: st,
            meta: metaParts.join(" · "),
            detailKind: "vendorBill",
            contextActions: buildRowActions(b),
            badge,
        };
    };
    const pendingApprovalRows: RecordRow[] = showPendingApproval ? pendingApproval.map(billRow) : [];
    const pendingRows: RecordRow[] = showPending ? pending.map(billRow) : [];
    const disputedRows: RecordRow[] = showDisputed ? disputed.map(billRow) : [];
    const approvedRows: RecordRow[] = showApprovedPaid ? approvedOrPaid.map(billRow) : [];
    const draftRows: RecordRow[] = showDraft ? draft.map(billRow) : [];
    const vendorRows: RecordRow[] = showVendors
        ? db.master.vendors.map((v: Vendor) => {
            const bal = vendorBalance(db, v.id);
            const firstUnpaidBill = db.vendorBills.find((b) => b.vendor_id === v.id && (b.status === "approved" || b.status === "partly_paid") && b.balance_amount > 0);
            const acts: ContextAction[] = firstUnpaidBill
                ? [
                    {
                        label: "Open unpaid bill",
                        icon: <MoreHorizontal className="h-3.5 w-3.5"/>,
                        onClick: () => openDetail("vendorBill", firstUnpaidBill.id),
                    },
                ]
                : [];
            return {
                id: firstUnpaidBill?.id || v.id,
                title: v.name,
                subtitle: `${v.city || "—"} · ${v.category || "Vendor"}`,
                customerName: v.name,
                amount: bal.outstanding,
                status: {
                    label: reliabilityLabel(v.reliability_score),
                    className: reliabilityBadgeClass(v.reliability_score),
                },
                meta: `${v.on_time_pct ?? 0}% on-time · ${bal.unpaid} unpaid bills · ${bal.bills} total`,
                detailKind: "vendorBill",
                contextActions: acts,
            };
        })
        : [];
    const queues: QueueSpec[] = [];
    if (showPendingApproval) {
        queues.push({
            title: "Pending Policy Approval — Owner action required",
            icon: <Clock className="h-4 w-4 text-warning"/>,
            records: pendingApprovalRows,
            emptyHint: "No bills pending policy approval. High-value bills above the policy threshold appear here.",
            defaultOpen: true,
        });
    }
    if (showDraft) {
        queues.push({
            title: "Draft — awaiting vendor invoice (3-way match pending)",
            icon: <Receipt className="h-4 w-4 text-primary"/>,
            records: draftRows,
            emptyHint: "No draft invoices. Record the supplier invoice against a filed GRN, then run the PO–GRN–invoice match.",
            defaultOpen: true,
        });
    }
    if (showPending) {
        queues.push({
            title: "Pending Approval",
            icon: <CheckCircle2 className="h-4 w-4 text-warning"/>,
            records: pendingRows,
            emptyHint: "No bills pending approval.",
            defaultOpen: true,
        });
    }
    if (showDisputed) {
        queues.push({
            title: "Disputed (mismatch)",
            icon: <AlertTriangle className="h-4 w-4 text-destructive"/>,
            records: disputedRows,
            emptyHint: "No disputed bills.",
            defaultOpen: true,
        });
    }
    if (showApprovedPaid) {
        queues.push({
            title: "Approved / Paid",
            icon: <ShieldCheck className="h-4 w-4 text-success"/>,
            records: approvedRows,
            emptyHint: "No approved or paid bills.",
            defaultOpen: true,
        });
    }
    if (showVendors) {
        queues.push({
            title: "Vendor Exposure",
            icon: <Building2 className="h-4 w-4 text-primary"/>,
            records: vendorRows,
            emptyHint: "No vendors on file.",
        });
    }
    return (<>
    <OperationsWorkspace title="Vendor Bills / Payables" description="Record supplier invoice against GRN → PO–GRN–invoice match → approve → partial/full payment. High-value bills require Owner approval before matching." icon={<Receipt className="h-4 w-4"/>} workflow={["GRN", "Supplier Invoice", "3-way Match", "Approve", "Pay", "Close"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => setFilter(id)} queues={queues} onCreate={openCreateInvoice} createLabel="+ Record supplier invoice" searchPlaceholder="Search bills / vendors…"/>
    <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record Supplier Invoice</DialogTitle>
          <DialogDescription>Select one received GRN and enter the vendor's actual invoice lines. This creates a draft payable only; it does not approve or pay anything. High-value invoices will require Owner approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Goods received note *</span><select value={selectedGrnId} onChange={(event) => { const id = event.target.value; setSelectedGrnId(id); setVendorInvoiceLines(linesFromGrn(id)); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{availableGrns.map((grn) => <option key={grn.id} value={grn.id}>{grn.grn_no} · {grn.vendor_name} · {grn.items.length} line(s)</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Vendor invoice no. *</span><Input value={vendorInvoiceNo} onChange={(event) => setVendorInvoiceNo(event.target.value)} placeholder="INV-2026-045"/></label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Invoice date</span><Input type="date" value={vendorInvoiceDate} onChange={(event) => setVendorInvoiceDate(event.target.value)}/></label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Due date</span><Input type="date" value={vendorInvoiceDueDate} onChange={(event) => setVendorInvoiceDueDate(event.target.value)}/></label>
          </div>
          <div className="rounded-md border border-border">
            <div className="grid grid-cols-[1fr_90px_100px_110px] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"><span>Received article</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
            {vendorInvoiceLines.map((line, index) => <div key={`${line.po_item_id || line.article_id}-${index}`} className="grid grid-cols-[1fr_90px_100px_110px] items-center gap-2 px-3 py-2 text-xs"><span className="truncate">{line.title}</span><Input inputMode="decimal" value={String(line.quantity || "")} onChange={(event) => updateInvoiceLine(index, { quantity: Number(event.target.value || 0) })} className="h-8"/><Input inputMode="decimal" value={String(line.rate || "")} onChange={(event) => updateInvoiceLine(index, { rate: Number(event.target.value || 0) })} className="h-8"/><span className="font-mono">₹{line.amount.toLocaleString("en-IN")}</span></div>)}
          </div>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:max-w-xs"><span>Tax amount (₹)</span><Input inputMode="decimal" value={vendorInvoiceTax} onChange={(event) => setVendorInvoiceTax(event.target.value)}/></label>
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={updateVendorRatesFromInvoice} onChange={(event) => setUpdateVendorRatesFromInvoice(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary"/>
            <span><b className="text-foreground">Update exact vendor rates from this invoice</b><br/>Only the selected vendor + scoped material + variant + unit is updated, with a rate-history entry. Old bills and old POs stay unchanged.</span>
          </label>
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">The selected GRN supplies received-quantity context. The PO remains a contractual rate ceiling. Any quantity, rate, or value difference becomes a recorded mismatch instead of silently changing cost.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setCreateInvoiceOpen(false)}>Cancel</Button><Button onClick={saveVendorInvoice}>Create draft invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(paymentBill)} onOpenChange={(open) => { if (!open)
        setPaymentBill(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Vendor Payment</DialogTitle>
          <DialogDescription>{paymentBill ? `${paymentBill.vendor_name} · ${paymentBill.bill_no} · ${formatINRShort(paymentBill.balance_amount)} outstanding` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Amount *</span><Input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)}/></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Mode *</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Reference *</span><Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="UTR / UPI / cheque / cash voucher no."/></label>
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">This records a real payment transaction, updates the bill balance, and keeps the Site and Work Order allocation intact.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setPaymentBill(null)}>Cancel</Button><Button onClick={savePayment}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {/* D: Reject dialog — captures the rejection reason for the audit trail. */}
    <Dialog open={Boolean(rejectBill)} onOpenChange={(open) => { if (!open) { setRejectBill(null); setRejectReason(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><X className="h-4 w-4 text-destructive"/> Reject vendor bill</DialogTitle>
          <DialogDescription>{rejectBill ? `${rejectBill.bill_no} · ${rejectBill.vendor_name} · ${formatINRShort(rejectBill.total_amount)}` : ""}. The bill will revert to draft status. A rejection reason is required.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            <span>Rejection reason (audit trail) *</span>
            <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="e.g. Invoice amount exceeds PO rate; incorrect vendor invoice number; duplicate of VB-2026-014." rows={3}/>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setRejectBill(null); setRejectReason(""); }}>Cancel</Button>
          <Button variant="destructive" onClick={submitReject} disabled={!rejectReason.trim()}>
            <X className="mr-1.5 h-3.5 w-3.5"/> Reject bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>);
}
