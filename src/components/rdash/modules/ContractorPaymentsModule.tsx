"use client";
import * as React from "react";
import { CheckCircle2, Clock3, HandCoins, IndianRupee, ShieldCheck, Check, AlertCircle, XCircle, FileText, ListFilter } from "lucide-react";
import { useRDashStore, contractorOutstandingTotal } from "@/lib/rdash/store";
import { OperationsWorkspace, type FilterChip, type MetricSpec, type QueueSpec, type RecordRow } from "../OperationsWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR, formatINRShort, formatDate, titleCase } from "@/lib/rdash/format";
import { toast } from "sonner";
import type { ContractorBill, ContractorPayment } from "@/lib/rdash/types";
export function ContractorPaymentsModule() {
    const db = useRDashStore((state) => state.db);
    const recordContractorPayment = useRDashStore((state) => state.recordContractorPayment);
    const requestContractorBillPayment = useRDashStore((state) => state.requestContractorBillPayment);
    const approveContractorPayment = useRDashStore((state) => state.approveContractorPayment);
    // FIX-CONTRACTOR-BATCH2 / F.7 + F.8: wire the previously-unreachable
    // "disputed" (bill), "held" (payment), "cancelled" (payment) status
    // transitions. The store actions (disputeContractorBill,
    // resolveContractorBillDispute, holdContractorPayment,
    // cancelContractorPayment) write the status change + a thread reply +
    // an audit log entry. The actions live in the contractors slice.
    const disputeContractorBill = useRDashStore((state) => state.disputeContractorBill);
    const resolveContractorBillDispute = useRDashStore((state) => state.resolveContractorBillDispute);
    const holdContractorPayment = useRDashStore((state) => state.holdContractorPayment);
    const cancelContractorPayment = useRDashStore((state) => state.cancelContractorPayment);
    const openDetail = useRDashStore((state) => state.openDetail);
    const currentUser = useRDashStore((state) => state.currentUser);
    const isOwner = currentUser().role === "Owner";
    const [filter, setFilter] = React.useState("all");
    const [selected, setSelected] = React.useState<ContractorPayment | null>(null);
    const [mode, setMode] = React.useState("bank_transfer");
    const [reference, setReference] = React.useState("");
    const [billToRequest, setBillToRequest] = React.useState<ContractorBill | null>(null);
    const [requestAmount, setRequestAmount] = React.useState("");
    // FIX-CONTRACTOR-BATCH2 / F.7 + F.8: state for the dispute/hold/cancel
    // reason dialogs. Each action requires a reason for the audit trail.
    const [disputeTarget, setDisputeTarget] = React.useState<ContractorBill | null>(null);
    const [disputeReason, setDisputeReason] = React.useState("");
    const [holdTarget, setHoldTarget] = React.useState<ContractorPayment | null>(null);
    const [holdReason, setHoldReason] = React.useState("");
    const [cancelTarget, setCancelTarget] = React.useState<ContractorPayment | null>(null);
    const [cancelReason, setCancelReason] = React.useState("");
    // FIX-CONTRACTOR-BATCH2 / F.22: a separate "All Settlements" view that
    // shows every contractor settlement across every work order, so a
    // manager doesn't have to open each work order or contractor
    // individually. Toggled via a state switch above the queues.
    const [showSettlementsView, setShowSettlementsView] = React.useState(false);
    const paymentRows = db.contractorPayments;
    const pending = paymentRows.filter((payment) => payment.status === "pending");
    const approved = paymentRows.filter((payment) => payment.status === "approved");
    const paid = paymentRows.filter((payment) => payment.status === "paid");
    // FIX-CONTRACTOR-BATCH2 / F.4: previously this module used the CV-7 formula
    // (Σ bill.balance_amount − Σ committed payments) which answered "what's
    // still uncommitted?" — different from what the other 3 contractor modules
    // showed. Now "Contractor payable" uses the unified contractorOutstandingTotal
    // (total_billed − total_paid − total_settled) so all four modules agree.
    // `committedNotPaid` is still surfaced as a separate "Committed (pending)"
    // metric below for finance users who specifically need the uncommitted view.
    const payableBills = db.contractorBills.filter((bill) => bill.status !== "held");
    void payableBills; // retained for any future per-bill drill-down
    const committedNotPaid = db.contractorPayments
        .filter((payment) => payment.status === "pending" || payment.status === "approved")
        .reduce((total, payment) => total + payment.amount, 0);
    const outstanding = contractorOutstandingTotal(db);
    const openBills = db.contractorBills.filter((bill) => bill.status === "verified" || bill.status === "approved" || bill.status === "partly_paid");
    // FIX-CONTRACTOR-BATCH2 / F.7: include disputed bills in the metrics so
    // finance can see how many bills are frozen pending dispute resolution.
    const disputedBills = db.contractorBills.filter((bill) => bill.status === "disputed");
    const metrics: MetricSpec[] = [
        { label: "Awaiting approval", value: pending.length, tone: "warning", icon: <Clock3 className="h-4 w-4"/> },
        { label: "Ready to pay", value: formatINRShort(approved.reduce((total, payment) => total + payment.amount, 0)), tone: "primary", icon: <ShieldCheck className="h-4 w-4"/> },
        { label: "Contractor payable", value: formatINRShort(outstanding), tone: "warning", icon: <HandCoins className="h-4 w-4"/> },
        { label: "Committed (pending)", value: formatINRShort(committedNotPaid), tone: "default", icon: <Clock3 className="h-4 w-4"/> },
        { label: "Paid", value: formatINRShort(paid.reduce((total, payment) => total + payment.amount, 0)), tone: "success", icon: <CheckCircle2 className="h-4 w-4"/> },
    ];
    const chips: FilterChip[] = [
        { id: "all", label: "All", count: paymentRows.length, active: filter === "all" },
        { id: "pending", label: "Pending approval", count: pending.length, active: filter === "pending" },
        { id: "verified", label: "Verified RA bills", count: openBills.length, active: filter === "verified" },
        { id: "approved", label: "Ready to pay", count: approved.length, active: filter === "approved" },
        { id: "paid", label: "Paid", count: paid.length, active: filter === "paid" },
        // FIX-CONTRACTOR-BATCH2 / F.7: disputed bills filter chip — surfaces
        // the previously-phantom "disputed" status to the user.
        { id: "disputed", label: `Disputed bills${disputedBills.length ? ` (${disputedBills.length})` : ""}`, count: disputedBills.length, active: filter === "disputed" },
    ];
    const row = (payment: ContractorPayment): RecordRow => {
        const bill = db.contractorBills.find((entry) => entry.id === payment.contractor_bill_id);
        const site = db.sites.find((entry) => entry.id === payment.site_id);
        const workOrder = db.workOrders.find((entry) => entry.id === payment.work_order_id);
        // CV-6: Find the approval action row linked to this payment so the Owner can approve inline
        // directly from this list, instead of navigating to a separate Approvals module.
        const approvalAction = db.actions.find((entry) => entry.linked_record_type === "contractor_payment" && entry.linked_record_id === payment.id && entry.status === "pending");
        const approveInline = () => {
            if (!approvalAction) {
                toast.error("No pending approval found for this payment. It may already be approved.");
                return;
            }
            try {
                approveContractorPayment(approvalAction.id);
                toast.success(`${payment.payment_no} approved — ready to record payment`);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not approve contractor payment");
            }
        };
        return {
            id: payment.id,
            title: `${payment.payment_no} · ${payment.contractor_name || "Contractor"}`,
            subtitle: `${site?.name || "Site"} · ${workOrder?.work_order_no || "Work Order"}`,
            customerName: payment.contractor_name || "Contractor",
            amount: payment.amount,
            status: {
                label: payment.status.replaceAll("_", " "),
                className: payment.status === "paid" ? "bg-success/10 text-success border-success/20" : payment.status === "approved" ? "bg-primary/10 text-primary border-primary/20" : payment.status === "held" ? "bg-warning/10 text-warning border-warning/20" : payment.status === "cancelled" ? "bg-muted text-muted-foreground border-border line-through" : payment.status === "disputed" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20",
            },
            meta: `${bill ? `${bill.bill_no} · bill balance ${formatINRShort(bill.balance_amount)} · ` : ""}${payment.paid_at ? `Paid ${formatDate(payment.paid_at)}` : payment.status === "held" ? `Held${payment.held_by ? ` by ${payment.held_by}` : ""}` : payment.status === "cancelled" ? "Cancelled" : "Finance reference required"}`,
            // FIX-CONTRACTOR-BATCH2 / F.15: drill-through to the contractor
            // payment detail panel (was detailKind: "workOrder" — clicking
            // opened the work order, not the payment).
            detailKind: "contractorPayment",
            contextActions: [
                { label: "Open payment", icon: <HandCoins className="h-3.5 w-3.5"/>, onClick: () => openDetail("contractorPayment" as any, payment.id) },
                { label: "Open work order", icon: <FileText className="h-3.5 w-3.5"/>, onClick: () => openDetail("workOrder", payment.work_order_id) },
                // CV-6: Inline Approve action — visible only to the Owner (the role allowed by
                // approveContractorPayment). Removes the friction of navigating to a separate
                // Approvals module just to action a pending contractor payment.
                ...(payment.status === "pending" && isOwner && approvalAction ? [{ label: "Approve", icon: <Check className="h-3.5 w-3.5"/>, onClick: approveInline }] : []),
                ...(payment.status === "approved" ? [{ label: "Record payment", icon: <IndianRupee className="h-3.5 w-3.5"/>, onClick: () => { setSelected(payment); setMode(payment.mode || "bank_transfer"); setReference(""); } }] : []),
                // FIX-CONTRACTOR-BATCH2 / F.8: Hold / Cancel actions for
                // pending/approved payments. Paid payments cannot be held or
                // cancelled (the money has already left the bank).
                ...((payment.status === "pending" || payment.status === "approved") ? [
                    { label: "Hold", icon: <AlertCircle className="h-3.5 w-3.5"/>, onClick: () => { setHoldTarget(payment); setHoldReason(""); } },
                    { label: "Cancel", icon: <XCircle className="h-3.5 w-3.5"/>, onClick: () => { setCancelTarget(payment); setCancelReason(""); } },
                ] : []),
            ],
        };
    };
    const billRow = (bill: ContractorBill): RecordRow => {
        const site = db.sites.find((entry) => entry.id === bill.site_id);
        const workOrder = db.workOrders.find((entry) => entry.id === bill.work_order_id);
        const committed = db.contractorPayments.filter((entry) => entry.contractor_bill_id === bill.id && (entry.status === "pending" || entry.status === "approved")).reduce((total, entry) => total + entry.amount, 0);
        const requestable = Math.max(0, bill.balance_amount - committed);
        return {
            id: bill.id, title: `${bill.ra_no || bill.bill_no} · ${bill.contractor_name}`, subtitle: `${site?.name || "Site"} · ${workOrder?.work_order_no || "Work Order"}`,
            customerName: bill.contractor_name, amount: bill.balance_amount,
            status: { label: bill.status.replaceAll("_", " "), className: bill.status === "disputed" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20" },
            meta: `Verified ${bill.progress_pct}% · Bill balance ${formatINRShort(bill.balance_amount)} · Unrequested ${formatINRShort(requestable)}`,
            // FIX-CONTRACTOR-BATCH2 / F.15 + F.23: drill-through to the bill
            // detail panel (was detailKind: "workOrder"). Also adds an
            // explicit "Open bill" context action that opens the same panel.
            detailKind: "contractorBill",
            contextActions: [
                { label: "Open bill", icon: <FileText className="h-3.5 w-3.5"/>, onClick: () => openDetail("contractorBill" as any, bill.id) },
                { label: "Open work order", icon: <HandCoins className="h-3.5 w-3.5"/>, onClick: () => openDetail("workOrder", bill.work_order_id) },
                // FIX-CONTRACTOR-BATCH2 / F.7: Dispute / Resolve actions.
                // Disputed bills freeze payment release until resolved.
                ...(bill.status === "disputed" ? [{ label: "Resolve dispute", icon: <CheckCircle2 className="h-3.5 w-3.5"/>, onClick: () => {
                    try {
                        resolveContractorBillDispute(bill.id);
                        toast.success(`Dispute resolved on ${bill.bill_no}.`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not resolve dispute");
                    }
                } }] : []),
                ...((bill.status === "verified" || bill.status === "approved" || bill.status === "partly_paid") ? [{ label: "Dispute bill", icon: <AlertCircle className="h-3.5 w-3.5"/>, onClick: () => { setDisputeTarget(bill); setDisputeReason(""); } }] : []),
                ...(requestable > 0 && bill.status !== "disputed" ? [{ label: "Request partial payment", icon: <IndianRupee className="h-3.5 w-3.5"/>, onClick: () => { setBillToRequest(bill); setRequestAmount(String(requestable)); } }] : []),
            ],
        };
    };
    const queues: QueueSpec[] = [];
    if (filter === "all" || filter === "verified")
        queues.push({ title: "Verified RA bills — request payment release", icon: <HandCoins className="h-4 w-4 text-primary"/>, records: openBills.map(billRow), emptyHint: "No verified RA bills awaiting payment release.", defaultOpen: true });
    if (filter === "all" || filter === "pending")
        queues.push({ title: "Awaiting owner approval", icon: <Clock3 className="h-4 w-4 text-warning"/>, records: pending.map(row), emptyHint: "No contractor payments awaiting approval.", defaultOpen: true });
    if (filter === "all" || filter === "approved")
        queues.push({ title: "Approved — record actual payment", icon: <ShieldCheck className="h-4 w-4 text-primary"/>, records: approved.map(row), emptyHint: "No approved contractor payments waiting for a finance reference.", defaultOpen: true });
    if (filter === "all" || filter === "paid")
        queues.push({ title: "Paid contractor settlements", icon: <CheckCircle2 className="h-4 w-4 text-success"/>, records: paid.map(row), emptyHint: "No contractor payments recorded.", defaultOpen: true });
    // FIX-CONTRACTOR-BATCH2 / F.7: a dedicated queue for disputed bills so
    // finance can see what's frozen and resolve it.
    if (filter === "all" || filter === "disputed")
        queues.push({ title: "Disputed bills — payment release frozen", icon: <AlertCircle className="h-4 w-4 text-destructive"/>, records: disputedBills.map(billRow), emptyHint: "No disputed contractor bills.", defaultOpen: true });
    const record = () => {
        if (!selected)
            return;
        if (!reference.trim()) {
            toast.error("Add the bank, UPI, cheque or cash reference.");
            return;
        }
        try {
            recordContractorPayment(selected.id, mode, reference.trim());
            toast.success(`${selected.payment_no} recorded as paid`);
            setSelected(null);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not record contractor payment");
        }
    };
    // FIX-CONTRACTOR-BATCH2 / F.22: a global "All Settlements" view. Lists
    // every contractor settlement across every work order, with a button to
    // open the parent work order (where the full settlement details + the
    // "Settle & abandon" action live). Surfaced as a top-bar toggle so the
    // user can flip between the payments workflow and the settlements view
    // without leaving the module.
    const allSettlements = db.contractorSettlements;
    const allSettlementRows: RecordRow[] = allSettlements.map((s) => {
        const workOrder = db.workOrders.find((row) => row.id === s.work_order_id);
        const site = db.sites.find((row) => row.id === s.site_id);
        return {
            id: s.id,
            title: `${s.settlement_no} · ${s.contractor_name}`,
            subtitle: `${s.work_order_no} · ${site?.name || "Site"} · settled ${formatDate(s.settled_at)}`,
            customerName: s.contractor_name,
            amount: s.payable_amount,
            status: { label: titleCase(s.type || "abandonment").replaceAll("_", " "), className: "bg-destructive/10 text-destructive border-destructive/20" },
            meta: `${s.completed_pct}% complete · payable ${formatINRShort(s.payable_amount)} · ${s.reason.slice(0, 80)}${s.reason.length > 80 ? "…" : ""}`,
            detailKind: "workOrder",
            contextActions: [{ label: "Open work order", icon: <FileText className="h-3.5 w-3.5"/>, onClick: () => openDetail("workOrder", s.work_order_id) }],
        };
    });
    const settlementQueues: QueueSpec[] = [{
            title: `All contractor settlements (${allSettlements.length})`,
            icon: <HandCoins className="h-4 w-4 text-primary"/>,
            records: allSettlementRows,
            emptyHint: "No contractor settlements recorded. Use 'Settle & abandon' on a work order's Settlement tab when a contractor leaves mid-work.",
            defaultOpen: true,
        }];
    // When the settlements view is on, swap the queues + chips + metrics so
    // the user sees settlement-focused data instead of payment-focused data.
    const activeMetrics: MetricSpec[] = showSettlementsView ? [
        { label: "Total settlements", value: allSettlements.length, tone: "destructive", icon: <HandCoins className="h-4 w-4"/> },
        { label: "Total payable", value: formatINRShort(allSettlements.reduce((n, s) => n + s.payable_amount, 0)), tone: "warning", icon: <IndianRupee className="h-4 w-4"/> },
        { label: "Avg completion", value: allSettlements.length ? `${Math.round(allSettlements.reduce((n, s) => n + s.completed_pct, 0) / allSettlements.length)}%` : "—", tone: "default", icon: <Clock3 className="h-4 w-4"/> },
        { label: "Replacement jobs", value: allSettlements.filter((s) => s.replacement_work_order_id).length, tone: "primary", icon: <FileText className="h-4 w-4"/> },
    ] : metrics;
    const activeChips: FilterChip[] = showSettlementsView ? [
        { id: "all", label: "All settlements", count: allSettlements.length, active: true },
    ] : chips;
    const activeQueues: QueueSpec[] = showSettlementsView ? settlementQueues : queues;
    return <>
    <OperationsWorkspace title="Contractor Bills & Payments" description="Verified progress bill → owner approval → finance payment reference → settled contractor bill. Every payment stays linked to its Site and Work Order." icon={<HandCoins className="h-4 w-4"/>} workflow={["Verified progress", "Contractor bill", "Approval", "Payment reference", "Settled"]} metrics={activeMetrics} filterChips={activeChips} onFilterChange={showSettlementsView ? () => undefined : setFilter} queues={activeQueues} searchPlaceholder="Search contractor, bill, site or work order…"/>
    {/* FIX-CONTRACTOR-BATCH2 / F.22: a top-bar toggle between the payments
        workflow (the standard queues) and the global "All Settlements" view.
        Lets a manager see every settlement across every work order without
        leaving the module or opening each work order individually. */}
    <div className="flex justify-end px-4 pb-2">
      <Button size="sm" variant={showSettlementsView ? "default" : "outline"} className="h-8 text-xs" onClick={() => setShowSettlementsView((v) => !v)} title="Toggle between the payments workflow and a global list of all contractor settlements across all work orders.">
        <ListFilter className="mr-1.5 h-3.5 w-3.5"/> {showSettlementsView ? "Show payments workflow" : `Show all settlements (${allSettlements.length})`}
      </Button>
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open)
        setSelected(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Contractor Payment</DialogTitle><DialogDescription>{selected ? `${selected.contractor_name || "Contractor"} · ${selected.payment_no} · ${formatINRShort(selected.amount)}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Payment mode *</span><select value={mode} onChange={(event) => setMode(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Reference *</span><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR / UPI / cheque / cash voucher no."/></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button onClick={record}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(billToRequest)} onOpenChange={(open) => { if (!open)
        setBillToRequest(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Contractor Payment Release</DialogTitle><DialogDescription>{billToRequest ? `${billToRequest.ra_no || billToRequest.bill_no} · remaining balance ${formatINRShort(billToRequest.balance_amount)}` : ""}</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Amount to request *</span><Input type="number" min="0" step="0.01" value={requestAmount} onChange={(event) => setRequestAmount(event.target.value)}/></label>
        <DialogFooter><Button variant="outline" onClick={() => setBillToRequest(null)}>Cancel</Button><Button onClick={() => { if (!billToRequest)
        return; const amount = Number(requestAmount); try {
        const id = requestContractorBillPayment(billToRequest.id, amount);
        toast.success(`Payment release ${id} created`);
        setBillToRequest(null);
    }
    catch (error) {
        toast.error(error instanceof Error ? error.message : "Payment request could not be created");
    } }}>Request release</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {/* FIX-CONTRACTOR-BATCH2 / F.7: Dispute-bill reason dialog. */}
    <Dialog open={Boolean(disputeTarget)} onOpenChange={(open) => { if (!open) { setDisputeTarget(null); setDisputeReason(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dispute contractor bill</DialogTitle><DialogDescription>{disputeTarget ? `${disputeTarget.bill_no} · ${disputeTarget.contractor_name} · ${formatINRShort(disputeTarget.balance_amount)} balance` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">Marking this bill as disputed will freeze payment release until the dispute is resolved. The dispute reason is logged in the audit trail and the bill's thread.</p>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Dispute reason *</span><Textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="e.g. Rate mismatch on line 3 — re-measurement required." rows={3}/></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setDisputeTarget(null); setDisputeReason(""); }}>Cancel</Button>
          <Button variant="destructive" disabled={!disputeReason.trim()} onClick={() => { if (!disputeTarget) return; try { disputeContractorBill(disputeTarget.id, disputeReason.trim()); toast.success(`Bill ${disputeTarget.bill_no} marked as disputed.`); setDisputeTarget(null); setDisputeReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not dispute bill"); } }}>Confirm dispute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* FIX-CONTRACTOR-BATCH2 / F.8: Hold-payment reason dialog. */}
    <Dialog open={Boolean(holdTarget)} onOpenChange={(open) => { if (!open) { setHoldTarget(null); setHoldReason(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Hold contractor payment</DialogTitle><DialogDescription>{holdTarget ? `${holdTarget.payment_no} · ${holdTarget.contractor_name || "Contractor"} · ${formatINRShort(holdTarget.amount)}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">Holding this payment freezes it pending investigation. The hold reason is logged in the audit trail and the payment's thread. Held payments can be re-released later.</p>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Hold reason *</span><Textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="e.g. Awaiting invoice reconciliation." rows={3}/></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setHoldTarget(null); setHoldReason(""); }}>Cancel</Button>
          <Button variant="outline" disabled={!holdReason.trim()} onClick={() => { if (!holdTarget) return; try { holdContractorPayment(holdTarget.id, holdReason.trim()); toast.success(`Payment ${holdTarget.payment_no} held.`); setHoldTarget(null); setHoldReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not hold payment"); } }}>Confirm hold</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* FIX-CONTRACTOR-BATCH2 / F.8: Cancel-payment reason dialog. */}
    <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) { setCancelTarget(null); setCancelReason(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel contractor payment</DialogTitle><DialogDescription>{cancelTarget ? `${cancelTarget.payment_no} · ${cancelTarget.contractor_name || "Contractor"} · ${formatINRShort(cancelTarget.amount)}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">Cancelling this payment voids it entirely. The cancel reason is logged in the audit trail and the payment's thread. Cancelled payments cannot be re-released — a new payment request must be created if needed.</p>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>Cancel reason *</span><Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Duplicate payment — entered in error." rows={3}/></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>Cancel</Button>
          <Button variant="destructive" disabled={!cancelReason.trim()} onClick={() => { if (!cancelTarget) return; try { cancelContractorPayment(cancelTarget.id, cancelReason.trim()); toast.success(`Payment ${cancelTarget.payment_no} cancelled.`); setCancelTarget(null); setCancelReason(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel payment"); } }}>Confirm cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
