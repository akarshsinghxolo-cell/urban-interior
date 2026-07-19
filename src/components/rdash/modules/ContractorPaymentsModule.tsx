"use client";
import * as React from "react";
import { CheckCircle2, Clock3, HandCoins, IndianRupee, ShieldCheck, Check } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { OperationsWorkspace, type FilterChip, type MetricSpec, type QueueSpec, type RecordRow } from "../OperationsWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINRShort, formatDate } from "@/lib/rdash/format";
import { toast } from "sonner";
import type { ContractorBill, ContractorPayment } from "@/lib/rdash/types";
export function ContractorPaymentsModule() {
    const db = useRDashStore((state) => state.db);
    const recordContractorPayment = useRDashStore((state) => state.recordContractorPayment);
    const requestContractorBillPayment = useRDashStore((state) => state.requestContractorBillPayment);
    const approveContractorPayment = useRDashStore((state) => state.approveContractorPayment);
    const openDetail = useRDashStore((state) => state.openDetail);
    const currentUser = useRDashStore((state) => state.currentUser);
    const isOwner = currentUser().role === "Owner";
    const [filter, setFilter] = React.useState("all");
    const [selected, setSelected] = React.useState<ContractorPayment | null>(null);
    const [mode, setMode] = React.useState("bank_transfer");
    const [reference, setReference] = React.useState("");
    const [billToRequest, setBillToRequest] = React.useState<ContractorBill | null>(null);
    const [requestAmount, setRequestAmount] = React.useState("");
    const paymentRows = db.contractorPayments;
    const pending = paymentRows.filter((payment) => payment.status === "pending");
    const approved = paymentRows.filter((payment) => payment.status === "approved");
    const paid = paymentRows.filter((payment) => payment.status === "paid");
    // CV-7: Contractor payable metric must subtract committed-but-not-yet-disbursed payments.
    // bill.balance_amount only decreases when recordContractorPayment is called (status="paid"), so
    // summing bill balances alone overstates the true payable by the sum of pending+approved
    // contractor payments. We compute: payable = Σ(bill.balance_amount for non-held bills)
    //                                          − Σ(payment.amount for payments in pending/approved).
    // This gives the actually-uncommitted payable the owner can still act on. A separate metric
    // shows the committed (pending approval / approved) amount for transparency.
    const payableBills = db.contractorBills.filter((bill) => bill.status !== "held");
    const billBalances = payableBills.reduce((total, bill) => total + bill.balance_amount, 0);
    const committedNotPaid = db.contractorPayments
        .filter((payment) => payment.status === "pending" || payment.status === "approved")
        .reduce((total, payment) => total + payment.amount, 0);
    const outstanding = Math.max(0, billBalances - committedNotPaid);
    const openBills = db.contractorBills.filter((bill) => bill.status === "verified" || bill.status === "approved" || bill.status === "partly_paid");
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
                className: payment.status === "paid" ? "bg-success/10 text-success border-success/20" : payment.status === "approved" ? "bg-primary/10 text-primary border-primary/20" : "bg-warning/10 text-warning border-warning/20",
            },
            meta: `${bill ? `${bill.bill_no} · bill balance ${formatINRShort(bill.balance_amount)} · ` : ""}${payment.paid_at ? `Paid ${formatDate(payment.paid_at)}` : "Finance reference required"}`,
            detailKind: "workOrder",
            contextActions: [
                { label: "Open work order", icon: <HandCoins className="h-3.5 w-3.5"/>, onClick: () => openDetail("workOrder", payment.work_order_id) },
                // CV-6: Inline Approve action — visible only to the Owner (the role allowed by
                // approveContractorPayment). Removes the friction of navigating to a separate
                // Approvals module just to action a pending contractor payment.
                ...(payment.status === "pending" && isOwner && approvalAction ? [{ label: "Approve", icon: <Check className="h-3.5 w-3.5"/>, onClick: approveInline }] : []),
                ...(payment.status === "approved" ? [{ label: "Record payment", icon: <IndianRupee className="h-3.5 w-3.5"/>, onClick: () => { setSelected(payment); setMode(payment.mode || "bank_transfer"); setReference(""); } }] : []),
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
            status: { label: bill.status.replaceAll("_", " "), className: "bg-primary/10 text-primary border-primary/20" },
            meta: `Verified ${bill.progress_pct}% · Bill balance ${formatINRShort(bill.balance_amount)} · Unrequested ${formatINRShort(requestable)}`,
            detailKind: "workOrder",
            contextActions: [{ label: "Open work order", icon: <HandCoins className="h-3.5 w-3.5"/>, onClick: () => openDetail("workOrder", bill.work_order_id) }, ...(requestable > 0 ? [{ label: "Request partial payment", icon: <IndianRupee className="h-3.5 w-3.5"/>, onClick: () => { setBillToRequest(bill); setRequestAmount(String(requestable)); } }] : [])],
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
    return <>
    <OperationsWorkspace title="Contractor Bills & Payments" description="Verified progress bill → owner approval → finance payment reference → settled contractor bill. Every payment stays linked to its Site and Work Order." icon={<HandCoins className="h-4 w-4"/>} workflow={["Verified progress", "Contractor bill", "Approval", "Payment reference", "Settled"]} metrics={metrics} filterChips={chips} onFilterChange={setFilter} queues={queues} searchPlaceholder="Search contractor, bill, site or work order…"/>
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
  </>;
}
