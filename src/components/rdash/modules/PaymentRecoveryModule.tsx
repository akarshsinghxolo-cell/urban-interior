"use client";
import * as React from "react";
import { Wallet, AlertTriangle, CalendarClock, CheckCircle2, MoreHorizontal, IndianRupee, Calendar, Handshake, Send, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import type { ContextAction } from "../ContextMenuHost";
import { paymentStatusStyle, formatINR, formatINRShort, formatDate, relativeDay, } from "@/lib/rdash/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Payment } from "@/lib/rdash/types";
function isWithinDays(iso: string, days: number): boolean {
    if (!iso)
        return false;
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return false;
    const ms = d.getTime() - Date.now();
    return ms >= 0 && ms <= days * 86400000;
}
function isThisMonth(iso?: string): boolean {
    if (!iso)
        return false;
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
/** B-3: Days overdue for a past-due payment (0 if not past due). */
function daysOverdue(dueDate?: string): number {
    if (!dueDate)
        return 0;
    const d = new Date(dueDate);
    if (isNaN(d.getTime()))
        return 0;
    const ms = Date.now() - d.getTime();
    return ms > 0 ? Math.floor(ms / 86400000) : 0;
}
/** B-3: Aging bucket label for a payment. */
function agingBucket(dueDate?: string): "0-30" | "31-60" | "61-90" | "90+" | null {
    const days = daysOverdue(dueDate);
    if (days <= 0)
        return null;
    if (days <= 30)
        return "0-30";
    if (days <= 60)
        return "31-60";
    if (days <= 90)
        return "61-90";
    return "90+";
}
export function PaymentRecoveryModule() {
    const db = useRDashStore((s) => s.db);
    const recordPaymentPromise = useRDashStore((s) => s.recordPaymentPromise);
    const triggerPaymentMilestone = useRDashStore((s) => s.triggerPaymentMilestone);
    const reconcileFinance = useRDashStore((s) => s.reconcileFinance);
    const sendComm = useRDashStore((s) => s.sendComm);
    const addTask = useRDashStore((s) => s.addTask);
    const openDetail = useRDashStore((s) => s.openDetail);
    const openActionDialog = useRDashStore((s) => s.openActionDialog);
    const [filter, setFilter] = React.useState<string>("all");
    const [promiseFor, setPromiseFor] = React.useState<Payment | null>(null);
    const [promiseDate, setPromiseDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
    const [reminderFor, setReminderFor] = React.useState<Payment | null>(null);
    const [reminderNote, setReminderNote] = React.useState("");
    // B-2: On mount, refresh overdue statuses so the Overdue queue is populated.
    React.useEffect(() => {
        try { reconcileFinance(); }
        catch (err) { console.warn("[PaymentRecovery] reconcileFinance failed", err); }
    }, [reconcileFinance]);
    const payments = db.payments;
    const overdue = payments.filter((p) => p.status === "overdue");
    const overdueValue = overdue.reduce((sum, payment) => sum + Math.max(0, payment.amount - (payment.received_amount || 0)), 0);
    const promisedCount = db.followups.filter((f) => f.promise_date).length;
    const receivedThisMonth = db.customerReceipts.filter((receipt) => isThisMonth(receipt.received_at));
    const receivedThisMonthAmount = receivedThisMonth.reduce((sum, receipt) => sum + receipt.amount, 0);
    const awaitingEvent = payments.filter((p) => p.schedule_state === "awaiting_event");
    const pending = payments.filter((p) => (p.status === "pending" || p.status === "partial") && p.schedule_state !== "awaiting_event");
    const pendingSoon = pending.filter((p) => isWithinDays(p.due_date, 7));
    const received = payments
        .filter((p) => (p.received_amount || 0) > 0)
        .sort((a, b) => (b.received_date || "").localeCompare(a.received_date || ""))
        .slice(0, 5);
    // B-3: Aging buckets — count + value of overdue payments grouped by age.
    // Computed inline (no useMemo) so the React Compiler can preserve
    // optimization across the rest of the component.
    const agingBuckets = (() => {
        const buckets = { "0-30": { count: 0, value: 0 }, "31-60": { count: 0, value: 0 }, "61-90": { count: 0, value: 0 }, "90+": { count: 0, value: 0 } };
        for (const p of overdue) {
            const bucket = agingBucket(p.due_date);
            if (!bucket)
                continue;
            const outstanding = Math.max(0, p.amount - (p.received_amount || 0));
            buckets[bucket].count++;
            buckets[bucket].value += outstanding;
        }
        return buckets;
    })();
    const [agingFilter, setAgingFilter] = React.useState<"0-30" | "31-60" | "61-90" | "90+" | null>(null);
    const metrics: MetricSpec[] = [
        {
            label: "Overdue",
            value: overdue.length,
            tone: "destructive",
            icon: <AlertTriangle className="h-4 w-4"/>,
        },
        {
            label: "Overdue value",
            value: formatINRShort(overdueValue),
            tone: "destructive",
            icon: <IndianRupee className="h-4 w-4"/>,
        },
        {
            label: "Awaiting event",
            value: awaitingEvent.length,
            tone: "warning",
            icon: <CalendarClock className="h-4 w-4"/>,
        },
        {
            label: "Promised",
            value: promisedCount,
            tone: "warning",
            icon: <Handshake className="h-4 w-4"/>,
        },
        {
            label: "Receipts (mo)",
            value: formatINRShort(receivedThisMonthAmount),
            tone: "success",
            icon: <CheckCircle2 className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: payments.length, active: filter === "all" },
        {
            id: "overdue",
            label: "Overdue",
            count: overdue.length,
            active: filter === "overdue",
        },
        {
            id: "pending",
            label: "Pending",
            count: pending.length,
            active: filter === "pending",
        },
        { id: "awaiting_event", label: "Awaiting event", count: awaitingEvent.length, active: filter === "awaiting_event" },
        {
            id: "received",
            label: "With receipt",
            count: payments.filter((p) => (p.received_amount || 0) > 0).length,
            active: filter === "received",
        },
    ];
    const showOverdue = filter === "all" || filter === "overdue";
    const showPending = filter === "all" || filter === "pending";
    const showReceived = filter === "all" || filter === "received";
    const showAwaitingEvent = filter === "all" || filter === "awaiting_event";
    // B-4: Send reminder — creates a commSend (if customer is linked) and a
    // task linked to the payment so collectors have an audited trail.
    const handleSendReminder = () => {
        if (!reminderFor)
            return;
        try {
            if (reminderFor.customer_id) {
                try {
                    sendComm({
                        channel: "email",
                        customer_id: reminderFor.customer_id,
                        staff_name: "Accounts",
                        subject: `Payment reminder · ${(reminderFor.customer_name || "Customer")} · ${formatINR(reminderFor.amount)}`,
                        body: `This is a reminder that payment of ${formatINR(reminderFor.amount)} (milestone: ${reminderFor.milestone_label || "—"}) due on ${formatDate(reminderFor.due_date)} is now ${daysOverdue(reminderFor.due_date)} days overdue. ${reminderNote.trim()}`.trim(),
                        status: "sent",
                    });
                }
                catch (err) {
                    console.warn("[PaymentRecovery] sendComm failed", err);
                }
            }
            addTask({
                title: `Send payment reminder to ${(reminderFor.customer_name || "Customer")} — ${formatINR(reminderFor.amount)} (${daysOverdue(reminderFor.due_date)} days overdue)`,
                customer_id: reminderFor.customer_id,
                payment_id: reminderFor.id,
                site_id: reminderFor.site_id,
                work_order_id: reminderFor.work_order_id,
                task_scope: "office",
                task_type: "followup_call",
                assignee_name: "Accounts",
                due_date: new Date().toISOString().slice(0, 10),
                notes: reminderNote.trim() || undefined,
            } as any);  // STAGE-6-FIX: payment_id not on Task type
            toast.success(`Reminder task created for ${(reminderFor.customer_name || "Customer")}${reminderFor.customer_id ? " and email sent" : ""}.`);
            setReminderFor(null);
            setReminderNote("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send reminder.");
        }
    };
    const buildRowActions = (p: Payment): ContextAction[] => [
        {
            label: "Open",
            icon: <MoreHorizontal className="h-3.5 w-3.5"/>,
            onClick: () => openDetail("payment", p.id),
        },
        ...(p.schedule_state === "awaiting_event" ? [{
                label: "Trigger milestone",
                icon: <CalendarClock className="h-3.5 w-3.5"/>,
                onClick: () => { triggerPaymentMilestone(p.id, { reason: "Manual business event confirmation" }); toast.success(`${p.milestone_label || "Payment milestone"} triggered`); },
            }] : []),
        {
            label: "Record Promise",
            icon: <Handshake className="h-3.5 w-3.5"/>,
            onClick: () => {
                setPromiseFor(p);
                setPromiseDate(new Date().toISOString().slice(0, 10));
            },
        },
        // B-4: Send reminder action — available on every overdue payment.
        ...(p.status === "overdue" ? [{
                label: "Send reminder",
                icon: <Send className="h-3.5 w-3.5"/>,
                onClick: () => {
                    setReminderFor(p);
                    setReminderNote("");
                },
            }] : []),
        {
            label: "Record Receipt",
            icon: <IndianRupee className="h-3.5 w-3.5"/>,
            onClick: () => openDetail("payment", p.id),
        },
    ];
    const paymentRow = (p: Payment): RecordRow => ({
        id: p.id,
        title: `${formatINR(p.amount)} · ${(p.customer_name || "Customer")}`,
        subtitle: p.milestone_label || "Payment",
        customerName: (p.customer_name || "Customer"),
        amount: p.amount,
        due: p.due_date || undefined,
        status: paymentStatusStyle(p.status),
        meta: p.schedule_state === "awaiting_event"
            ? `Awaiting ${p.due_event || "business event"}`
            : `Due ${formatDate(p.due_date)} · ${relativeDay(p.due_date)}${p.received_date ? ` · received ${formatDate(p.received_date)}` : ""}${p.status === "overdue" ? ` · ${daysOverdue(p.due_date)} days overdue` : ""}`,
        detailKind: "payment",
        contextActions: buildRowActions(p),
    });
    // B-3: When an aging filter is active, narrow the overdue rows to that
    // specific bucket; otherwise show all overdue.
    const filteredOverdue = agingFilter
        ? overdue.filter((p) => agingBucket(p.due_date) === agingFilter)
        : overdue;
    const overdueRows: RecordRow[] = showOverdue ? filteredOverdue.map(paymentRow) : [];
    const pendingRows: RecordRow[] = showPending ? pendingSoon.map(paymentRow) : [];
    const receivedRows: RecordRow[] = showReceived ? received.map(paymentRow) : [];
    const awaitingRows: RecordRow[] = showAwaitingEvent ? awaitingEvent.map(paymentRow) : [];
    const queues: QueueSpec[] = [];
    if (showOverdue) {
        queues.push({
            title: agingFilter ? `Overdue — ${agingFilter} days` : "Overdue — escalate now",
            icon: <AlertTriangle className="h-4 w-4 text-destructive"/>,
            records: overdueRows,
            emptyHint: agingFilter ? `No overdue payments in the ${agingFilter}-day bucket.` : "No overdue payments — cash flow healthy.",
            defaultOpen: true,
        });
    }
    if (showAwaitingEvent) {
        queues.push({
            title: "Awaiting business event",
            icon: <CalendarClock className="h-4 w-4 text-warning"/>,
            records: awaitingRows,
            emptyHint: "No payment milestones are waiting for an event.",
            defaultOpen: true,
        });
    }
    if (showPending) {
        queues.push({
            title: "Pending — due soon",
            icon: <CalendarClock className="h-4 w-4 text-warning"/>,
            records: pendingRows,
            emptyHint: "No payments due in the next 7 days.",
            defaultOpen: true,
        });
    }
    if (showReceived) {
        queues.push({
            title: "Recently Received",
            icon: <CheckCircle2 className="h-4 w-4 text-success"/>,
            records: receivedRows,
            emptyHint: "No payments received yet.",
        });
    }
    const submitPromise = () => {
        if (!promiseFor)
            return;
        if (!promiseDate) {
            toast.error("Please choose a promise date");
            return;
        }
        recordPaymentPromise(promiseFor.id, promiseDate);
        toast.success(`Recovery task scheduled for ${formatDate(promiseDate)}`);
        setPromiseFor(null);
    };
    return (<>
      {/* B-3: Aging buckets summary — each bucket deep-links to a filtered
          overdue list so collectors can prioritise by age. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["0-30", "31-60", "61-90", "90+"] as const).map((bucket) => {
            const data = agingBuckets[bucket];
            const isActive = agingFilter === bucket;
            const tone = bucket === "0-30" ? "border-warning/30 bg-warning/[0.04] text-warning" : bucket === "31-60" ? "border-warning/40 bg-warning/[0.08] text-warning" : bucket === "61-90" ? "border-destructive/40 bg-destructive/[0.06] text-destructive" : "border-destructive/50 bg-destructive/[0.10] text-destructive";
            return (<button key={bucket} type="button" onClick={() => { setFilter("overdue"); setAgingFilter(isActive ? null : bucket); }} className={`rounded-lg border p-3 text-left transition-all hover:shadow-md ${tone} ${isActive ? "ring-2 ring-offset-1" : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{bucket} days</p>
                <p className="mt-1 text-lg font-bold text-foreground">{data.count}</p>
                <p className="text-[10px] text-muted-foreground">{formatINRShort(data.value)}</p>
              </button>);
        })}
      </section>
      {agingFilter && (<div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Filtered by aging bucket <strong className="text-foreground">{agingFilter} days</strong></span>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAgingFilter(null)}>Clear filter</Button>
        </div>)}
      <OperationsWorkspace title="Payment Recovery" description="Track promises, schedule recovery tasks, escalate overdue — the daily cash-flow command center" icon={<Wallet className="h-4 w-4"/>} workflow={["Promise", "Follow-up", "Recovery Task", "Escalation", "Receipt", "Close"]} metrics={metrics} filterChips={filterChips} onFilterChange={(id) => { setFilter(id); setAgingFilter(null); }} queues={queues} createLabel="+ Add collection milestone" onCreate={() => {
            // B-13: Open the existing RecordPaymentDialog (no preselected customer) so the user
            // can create a standalone recovery milestone and pick the customer inline. The dialog
            // is rendered globally by ActionDialogsHost and supports a customer picker when no
            // customerId is passed. This replaces the previous dead-end toast.
            try {
                openActionDialog("record-payment");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not open the collection milestone dialog.");
            }
        }} searchPlaceholder="Search payments / customers…"/>

      <Dialog open={promiseFor !== null} onOpenChange={(v) => !v && setPromiseFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary"/> Record customer promise
            </DialogTitle>
            <DialogDescription>
              {promiseFor
            ? `${formatINR(promiseFor.amount)} · ${(promiseFor.customer_name || "Customer")} — a recovery task will be created for this date.`
            : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="promise-date" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Promise date
            </label>
            <input id="promise-date" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring focus-visible:ring-2"/>
            <p className="text-[11px] text-muted-foreground">
              An automatic follow-up task will appear in Daily Work assigned to Accounts.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromiseFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitPromise}>
              <Calendar className="mr-1.5 h-3.5 w-3.5"/> Schedule recovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* B-4: Send reminder dialog — captures an optional note and creates a
          comm send + task linked to the overdue payment. */}
      <Dialog open={reminderFor !== null} onOpenChange={(v) => !v && setReminderFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary"/> Send payment reminder
            </DialogTitle>
            <DialogDescription>
              {reminderFor
                ? `${formatINR(reminderFor.amount)} · ${(reminderFor.customer_name || "Customer")} — ${daysOverdue(reminderFor.due_date)} days overdue (due ${formatDate(reminderFor.due_date)}). A reminder task will be created${reminderFor.customer_id ? " and an email comm recorded" : ""}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="reminder-note" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reminder note (optional)
            </label>
            <Textarea id="reminder-note" value={reminderNote} onChange={(e) => setReminderNote(e.target.value)} placeholder="e.g. Second reminder — please confirm payment date by EOD." rows={3}/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderFor(null)}>Cancel</Button>
            <Button onClick={handleSendReminder}>
              <Send className="mr-1.5 h-3.5 w-3.5"/> Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
