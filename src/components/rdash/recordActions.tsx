"use client";
import * as React from "react";
import { useRDashStore, type CreateDialogRequest } from "@/lib/rdash/store";
import { MoreHorizontal, Pencil, CheckCircle2, XCircle, CalendarClock, Phone, MessageSquare, FileText, Ban, ArrowRightCircle, AlertTriangle, Wallet, MapPin, Send, } from "lucide-react";
import type { ContextAction } from "./ContextMenuHost";
import { toast } from "sonner";
import { formatINR } from "@/lib/rdash/format";
import { promptDialog } from "./PromptDialog";
export function buildTaskActions(taskId: string, _dispatch: {
    updateTask: (id: string, patch: Record<string, unknown>) => void;
}, opts?: {
    onOpen?: () => void;
    onEdit?: () => void;
    readOnly?: boolean;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("task", taskId));
    if (opts?.readOnly)
        return [{ label: "Open in Tasks & Follow-ups", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open }];
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Edit details", icon: <Pencil className="h-4 w-4"/>, onClick: opts?.onEdit || (() => { useRDashStore.getState().openEditDialog?.({ type: "task", entityId: taskId }); }) },
        { label: "Complete with note", icon: <CheckCircle2 className="h-4 w-4"/>, onClick: async () => {
                const state = useRDashStore.getState();
                const note = await promptDialog({
                    title: "Complete Task",
                    description: "Record what was done. A completion note is required.",
                    label: "Completion note",
                    placeholder: "e.g. Installed 4 gypsum boards, jointing pending",
                    required: true,
                    multiline: true,
                    confirmLabel: "Complete task",
                });
                if (note === null || !note.trim()) {
                    return;
                }
                try {
                    state.completeTask(taskId, { note: note.trim() });
                    toast.success("Task completed");
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Task could not be completed");
                }
            } },
        { label: "Start progress", icon: <ArrowRightCircle className="h-4 w-4"/>, onClick: () => { try {
                useRDashStore.getState().updateTask(taskId, { status: "in_progress" });
                toast.success("Task moved to in progress");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Task could not be updated");
            } } },
        { label: "Reschedule", icon: <CalendarClock className="h-4 w-4"/>, separatorBefore: true, onClick: async () => {
                const task = useRDashStore.getState().db.tasks.find((row) => row.id === taskId);
                const date = await promptDialog({
                    title: "Reschedule Task",
                    description: "Enter the new due date in YYYY-MM-DD format.",
                    label: "New due date",
                    placeholder: "2026-07-25",
                    defaultValue: task?.due_date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
                    required: true,
                    validate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? null : "Invalid date format — use YYYY-MM-DD",
                    confirmLabel: "Reschedule",
                });
                if (date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
                    try {
                        useRDashStore.getState().updateTask(taskId, { due_date: date.trim() });
                        toast.success(`Task rescheduled to ${date.trim()}`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Task could not be rescheduled");
                    }
                }
            } },
        { label: "Add note", icon: <MessageSquare className="h-4 w-4"/>, onClick: open },
        { label: "Block with reason", icon: <Ban className="h-4 w-4"/>, danger: true, separatorBefore: true, onClick: async () => {
                const reason = await promptDialog({
                    title: "Block Task",
                    description: "Record why this task is blocked. A recovery record will be created.",
                    label: "Blocker reason",
                    placeholder: "e.g. Waiting for customer to confirm paint brand",
                    required: true,
                    multiline: true,
                    confirmLabel: "Block task",
                });
                if (reason === null || !reason.trim()) {
                    return;
                }
                try {
                    useRDashStore.getState().blockTask(taskId, reason.trim());
                    toast.warning("Task moved to Blocked work with a recovery record");
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Task could not be blocked");
                }
            } },
    ];
}
export function buildFollowupActions(followupId: string, _dispatch: {
    updateFollowup: (id: string, patch: Record<string, unknown>) => void;
}, opts?: {
    onOpen?: () => void;
    onEdit?: () => void;
    readOnly?: boolean;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("followup", followupId));
    if (opts?.readOnly)
        return [{ label: "Open in Tasks & Follow-ups", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open }];
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Edit details", icon: <Pencil className="h-4 w-4"/>, onClick: opts?.onEdit || (() => { useRDashStore.getState().openEditDialog({ type: "followup", entityId: followupId }); }) },
        { label: "Complete with outcome", icon: <CheckCircle2 className="h-4 w-4"/>, onClick: async () => {
                const state = useRDashStore.getState();
                const outcome = await promptDialog({
                    title: "Follow-up Outcome",
                    description: "Choose: contacted, not_reached, callback_scheduled, promise_received, converted, lost, or not_applicable",
                    label: "Outcome",
                    placeholder: "contacted",
                    defaultValue: "contacted",
                    required: true,
                    validate: (v) => ["contacted", "not_reached", "callback_scheduled", "promise_received", "converted", "lost", "not_applicable"].includes(v.trim()) ? null : "Choose a valid outcome",
                    confirmLabel: "Next",
                });
                if (!outcome) return;
                const note = await promptDialog({
                    title: "Outcome Note",
                    description: "Add a note about this outcome (optional).",
                    label: "Note",
                    placeholder: "e.g. Customer confirmed they will decide by Friday",
                    multiline: true,
                    confirmLabel: "Save outcome",
                });
                if (note === null) return;
                const valid = ["contacted", "not_reached", "callback_scheduled", "promise_received", "converted", "lost", "not_applicable"] as const;
                try {
                    state.completeFollowup(followupId, { outcome: outcome.trim() as typeof valid[number], note: note.trim() });
                    toast.success("Follow-up outcome recorded");
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Follow-up could not be completed");
                }
            } },
        { label: "Call now", icon: <Phone className="h-4 w-4"/>, separatorBefore: true, onClick: () => {
                const state = useRDashStore.getState();
                const followup = state.db.followups.find((row) => row.id === followupId);
                const customer = followup?.customer_id ? state.db.customers.find((customer) => customer.id === followup.customer_id) : undefined;
                const phone = customer?.phone?.replace(/\s+/g, "");
                if (!phone) {
                    toast.error("No phone number is available for this follow-up.");
                    return;
                }
                window.location.href = `tel:${phone}`;
                if (followup?.thread_id)
                    state.addThreadReply(followup.thread_id, { author: state.currentUser().name, role: state.currentUser().role, body: `Call initiated to ${customer?.name || "customer"} (${phone}). Record the outcome before closing this follow-up.`, kind: "comment" });
            } },
        { label: "Reschedule", icon: <CalendarClock className="h-4 w-4"/>, onClick: async () => {
                const followup = useRDashStore.getState().db.followups.find((row) => row.id === followupId);
                const current = followup?.due_at?.slice(0, 16) || `${followup?.due_date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}T10:00`;
                const next = await promptDialog({
                    title: "Reschedule Follow-up",
                    description: "Enter new date and time in YYYY-MM-DDTHH:mm format.",
                    label: "New date & time",
                    placeholder: "2026-07-25T10:00",
                    defaultValue: current,
                    required: true,
                    validate: (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.trim()) ? null : "Use YYYY-MM-DDTHH:mm format",
                    confirmLabel: "Reschedule",
                });
                if (next && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(next.trim())) {
                    try {
                        useRDashStore.getState().rescheduleFollowup(followupId, new Date(next.trim()).toISOString());
                        toast.success(`Follow-up rescheduled`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not reschedule follow-up");
                    }
                }
            } },
        { label: "Close as not applicable", icon: <XCircle className="h-4 w-4"/>, danger: true, separatorBefore: true, onClick: async () => {
                const note = await promptDialog({
                    title: "Close Follow-up",
                    description: "Record why this follow-up is not applicable.",
                    label: "Closure reason",
                    placeholder: "e.g. Customer cancelled the enquiry",
                    required: true,
                    multiline: true,
                    confirmLabel: "Close follow-up",
                });
                if (note === null || !note.trim()) {
                    return;
                }
                try {
                    useRDashStore.getState().completeFollowup(followupId, { outcome: "not_applicable", note: note.trim() });
                    toast.success("Follow-up closed with outcome");
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Follow-up could not be closed");
                }
            } },
    ];
}
export function buildVisitActions(visitId: string, _dispatch: unknown, opts?: {
    onOpen?: () => void;
    onEdit?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("visit", visitId));
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Edit details", icon: <Pencil className="h-4 w-4"/>, onClick: opts?.onEdit || (() => { useRDashStore.getState().openEditDialog({ type: "visit", entityId: visitId }); }) },
        { label: "Open Field Mode to check in", icon: <MapPin className="h-4 w-4"/>, onClick: () => {
                useRDashStore.getState().setActiveModule("fieldMode");
                toast.info("Field check-in requires live device GPS and geofence verification.");
            } },
        { label: "Open Field Mode to check out", icon: <CheckCircle2 className="h-4 w-4"/>, onClick: () => {
                useRDashStore.getState().setActiveModule("fieldMode");
                toast.info("Field check-out requires live device GPS and geofence verification.");
            } },
        { label: "Open visit thread to add Drive proof", icon: <FileText className="h-4 w-4"/>, onClick: () => { useRDashStore.getState().openDetail("visit", visitId); toast.info("Open the Thread tab to upload durable Google Drive evidence."); }, separatorBefore: true },
        { label: "Reschedule", icon: <CalendarClock className="h-4 w-4"/>, onClick: async () => {
                const v = useRDashStore.getState().db.visits.find((x) => x.id === visitId);
                const newDate = await promptDialog({
                    title: "Reschedule Visit",
                    description: "Enter the new scheduled date in YYYY-MM-DD format.",
                    label: "New date",
                    placeholder: "2026-07-25",
                    defaultValue: (v?.scheduled_at || new Date().toISOString()).slice(0, 10),
                    required: true,
                    validate: (val) => /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) ? null : "Invalid date format — use YYYY-MM-DD",
                    confirmLabel: "Reschedule",
                });
                if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate.trim())) {
                    const time = v?.scheduled_at ? new Date(v.scheduled_at).toTimeString().slice(0, 5) : "10:00";
                    try {
                        useRDashStore.getState().rescheduleVisit(visitId, `${newDate.trim()}T${time}`);
                        toast.success(`Visit rescheduled to ${newDate.trim()}`);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Visit could not be rescheduled");
                    }
                }
            } },
    ];
}
export function buildQuotationActions(quoteId: string, dispatch: {
    updateQuotation: (id: string, patch: Record<string, unknown>) => void;
}, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("quotation", quoteId));
    const quote = useRDashStore.getState().db.quotations.find((row) => row.id === quoteId);
    const actions: ContextAction[] = [
        { label: "Open details", icon: <FileText className="h-4 w-4"/>, onClick: open },
        { label: "Print / Export", icon: <FileText className="h-4 w-4"/>, onClick: () => { useRDashStore.getState().openDetail("quotation", quoteId); setTimeout(() => window.print(), 300); } },
    ];
    if (quote?.status === "draft") {
        actions.push({ label: "Mark sent", icon: <Send className="h-4 w-4"/>, onClick: () => { dispatch.updateQuotation(quoteId, { status: "sent" }); toast.success("Quotation marked as sent"); } });
    }
    if (quote && ["draft", "sent", "rejected", "expired", "accepted"].includes(quote.status) && quote.work_order_ids.length === 0) {
        actions.push({ label: "Accept selected scope", icon: <CheckCircle2 className="h-4 w-4"/>, separatorBefore: true, onClick: () => useRDashStore.getState().openQuotationAcceptanceDialog(quoteId) });
    }
    if (quote?.status === "accepted" && quote.work_order_ids.length === 0) {
        actions.push({ label: "Open contractor bidding", icon: <ArrowRightCircle className="h-4 w-4"/>, separatorBefore: true, onClick: () => {
                useRDashStore.getState().setActiveModule("siteExecution");
            } });
    }
    if (quote?.work_order_ids.length)
        actions.push({ label: "Open workOrder", icon: <ArrowRightCircle className="h-4 w-4"/>, onClick: () => useRDashStore.getState().openDetail("workOrder", quote.work_order_ids[0]) });
    if (quote && ["sent", "accepted", "rejected", "expired"].includes(quote.status) && quote.work_order_ids.length === 0)
        actions.push({ label: "Create editable revision", icon: <Pencil className="h-4 w-4"/>, onClick: () => useRDashStore.getState().openDetail("quotation", quoteId) });
    if (quote && quote.work_order_ids.length === 0 && quote.status !== "accepted")
        actions.push({ label: "Reject", icon: <XCircle className="h-4 w-4"/>, danger: true, separatorBefore: true, onClick: () => { dispatch.updateQuotation(quoteId, { status: "rejected" }); toast.warning("Quotation rejected"); } });
    return actions;
}
export function buildPaymentActions(paymentId: string, _dispatch: unknown, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("payment", paymentId));
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Issue / open invoice", icon: <FileText className="h-4 w-4"/>, onClick: () => { const state = useRDashStore.getState(); const payment = state.db.payments.find((row) => row.id === paymentId); if (!payment)
                return; const invoice = state.db.invoices.find((row) => row.id === payment.invoice_id || row.payment_id === payment.id); const invoiceId = invoice?.id || state.issueInvoiceForPayment(payment.id); if (invoiceId)
                state.openDetail("invoice", invoiceId); } },
        { label: "Send reminder", icon: <Send className="h-4 w-4"/>, onClick: () => {
                const state = useRDashStore.getState();
                const p = state.db.payments.find((x) => x.id === paymentId);
                if (p?.thread_id) {
                    const actor = state.currentUser();
                    state.addThreadReply(p.thread_id, {
                        author: actor.name,
                        role: actor.role,
                        body: `Reminder sent to ${(p.customer_name || "Customer")} for payment of ${formatINR(p.amount)} (${p.milestone_label || p.mode || "—"}) — due ${p.due_date}.`,
                        kind: "comment",
                    });
                    toast.success(`Reminder logged in payment thread & sent to ${(p.customer_name || "Customer")}`);
                }
                else {
                    toast.success(`Reminder sent to ${p?.customer_name || "customer"}`);
                }
            } },
        { label: "View invoice", icon: <FileText className="h-4 w-4"/>, onClick: () => {
                const p = useRDashStore.getState().db.payments.find((x) => x.id === paymentId);
                const invoice = p ? useRDashStore.getState().db.invoices.find((row) => row.payment_id === p.id || row.id === p.invoice_id) : undefined;
                if (invoice) {
                    useRDashStore.getState().openDetail("invoice", invoice.id);
                }
                else if (p?.quotation_id) {
                    useRDashStore.getState().openDetail("quotation", p.quotation_id);
                }
                else {
                    useRDashStore.getState().openDetail("payment", paymentId);
                }
            }, separatorBefore: true },
    ];
}
export function buildJobActions(workOrderId: string, opts?: {
    onOpen?: () => void;
    onEdit?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("workOrder", workOrderId));
    const workOrder = useRDashStore.getState().db.workOrders.find((x) => x.id === workOrderId);
    const boq = useRDashStore.getState().db.boqs.find((x) => x.work_order_id === workOrderId);
    return [
        { label: "Open workOrder", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Edit details", icon: <Pencil className="h-4 w-4"/>, onClick: opts?.onEdit || (() => { useRDashStore.getState().openEditDialog({ type: "workOrder", entityId: workOrderId }); }) },
        {
            label: "Open customer",
            icon: <FileText className="h-4 w-4"/>,
            disabled: !(workOrder?.customer_id || workOrder?.customer_id),
            onClick: () => {
                const current = useRDashStore.getState().db.workOrders.find((x) => x.id === workOrderId);
                const profileId = current?.customer_id || current?.customer_id;
                if (profileId)
                    useRDashStore.getState().openDetail("customer", profileId);
            },
        },
        {
            label: "Contractor matching",
            icon: <ArrowRightCircle className="h-4 w-4"/>,
            onClick: () => {
                useRDashStore.getState().setActiveModule("siteExecution");
                useRDashStore.getState().openDetail("workOrder", workOrderId);
            },
            separatorBefore: true,
        },
        {
            label: "BOQ / material plan",
            icon: <FileText className="h-4 w-4"/>,
            onClick: () => {
                const currentBoq = useRDashStore.getState().db.boqs.find((x) => x.work_order_id === workOrderId);
                if (currentBoq) {
                    useRDashStore.getState().openDetail("boq", currentBoq.id);
                }
                else {
                    useRDashStore.getState().setActiveModule("boq");
                    toast.info("Open the BOQ board to create the material plan for this workOrder");
                }
            },
        },
        {
            label: "Schedule site visit",
            icon: <MapPin className="h-4 w-4"/>,
            onClick: () => {
                const current = useRDashStore.getState().db.workOrders.find((x) => x.id === workOrderId);
                useRDashStore.getState().openCreateDialog({
                    kind: "visit",
                    customerId: current?.customer_id,
                    siteId: current?.site_id,
                    visitType: "site_visit",
                });
            },
            separatorBefore: !boq,
        },
        {
            label: "WorkOrder P&L",
            icon: <Wallet className="h-4 w-4"/>,
            onClick: () => {
                useRDashStore.getState().setActiveModule("workOrderPnl");
                useRDashStore.getState().openDetail("workOrder", workOrderId);
            },
        },
    ];
}
export function buildApprovalActions(approvalId: string, dispatch: {
    resolveApproval: (id: string, d: "approved" | "rejected") => void;
}, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen;
    const approval = useRDashStore.getState().db.actions.find((row) => row.id === approvalId);
    const actions: ContextAction[] = [
        { label: "Open details", icon: <FileText className="h-4 w-4"/>, onClick: open },
    ];
    if (approval?.linked_record_type === "quotation" && approval.linked_record_id) {
        actions.push({ label: "Review / revise quotation", icon: <Pencil className="h-4 w-4"/>, onClick: () => useRDashStore.getState().openDetail("quotation", approval.linked_record_id!) });
    }
    actions.push({
        label: "Approve",
        icon: <CheckCircle2 className="h-4 w-4"/>,
        onClick: () => {
            try {
                dispatch.resolveApproval(approvalId, "approved");
                toast.success("Approved");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Approval blocked");
            }
        },
    }, {
        label: "Reject",
        icon: <XCircle className="h-4 w-4"/>,
        onClick: () => {
            try {
                dispatch.resolveApproval(approvalId, "rejected");
                toast.warning("Rejected");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Approval blocked");
            }
        },
        danger: true,
        separatorBefore: true,
    });
    return actions;
}
export function buildRiskActions(riskId: string, dispatch: {
    resolveRisk: (id: string) => void;
}, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen;
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Escalate", icon: <AlertTriangle className="h-4 w-4"/>, onClick: () => {
                const r = useRDashStore.getState().db.risks.find((x) => x.id === riskId);
                useRDashStore.getState().logAudit({
                    actor: "Owner",
                    actor_role: "Owner",
                    action: `Risk escalated: ${r?.title || riskId}`,
                    entity_type: "risk",
                    entity_id: riskId,
                    entity_label: r?.title || riskId,
                    kind: "alert",
                });
                toast.warning("Risk escalated to owner — logged in audit trail");
            } },
        {
            label: "Mark resolved",
            icon: <CheckCircle2 className="h-4 w-4"/>,
            onClick: () => {
                dispatch.resolveRisk(riskId);
                toast.success("Risk resolved");
            },
            separatorBefore: true,
        },
    ];
}
export function buildBlockedActions(blockedId: string, dispatch: {
    resolveBlocked: (id: string) => void;
}, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen || (() => useRDashStore.getState().openDetail("blocked", blockedId));
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Add obstacle note", icon: <MessageSquare className="h-4 w-4"/>, onClick: async () => {
                const b = useRDashStore.getState().db.blocked.find((x) => x.id === blockedId);
                if (b?.thread_id) {
                    const state = useRDashStore.getState();
                    const note = await promptDialog({
                        title: "Add Obstacle Note",
                        description: "Add a note to this obstacle's thread.",
                        label: "Note",
                        placeholder: "e.g. Spoke to vendor — replacement arriving tomorrow",
                        required: true,
                        multiline: true,
                        confirmLabel: "Add note",
                    });
                    if (note && note.trim()) {
                        const actor = state.currentUser();
                        useRDashStore.getState().addThreadReply(b.thread_id, {
                            author: actor.name,
                            role: actor.role,
                            body: note.trim(),
                            kind: "comment",
                        });
                        toast.success("Obstacle note added to thread");
                    }
                }
                else {
                    useRDashStore.getState().openDetail("blocked", blockedId);
                    toast.info("Opening obstacle — add note in the Thread tab");
                }
            } },
        {
            label: "Unblock",
            icon: <CheckCircle2 className="h-4 w-4"/>,
            onClick: () => {
                dispatch.resolveBlocked(blockedId);
                toast.success("Item unblocked");
            },
            separatorBefore: true,
        },
    ];
}
export function buildCustomerActions(_customerId: string, dispatch: {
    setActiveModule: (id: string, label?: string, icon?: string) => void;
    openActionDialog: (type: "record-payment" | "send-catalogue" | "send-reference" | "send-pinterest" | "send-material", customerId?: string) => void;
    openCreateDialog: (request: CreateDialogRequest) => void;
}, opts?: {
    onOpen?: () => void;
    onEdit?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen;
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Create quotation", icon: <FileText className="h-4 w-4"/>, onClick: () => dispatch.openCreateDialog({ kind: "quotation", customerId: _customerId }) },
        { label: "Schedule visit", icon: <MapPin className="h-4 w-4"/>, onClick: () => dispatch.openCreateDialog({ kind: "visit", customerId: _customerId }), separatorBefore: true },
        // B-6: This action only creates a pending collection milestone (not an actual receipt).
        // The label now reflects what the dialog actually does to avoid misleading users.
        { label: "Add collection milestone", icon: <Wallet className="h-4 w-4"/>, onClick: () => dispatch.openActionDialog("record-payment", _customerId) },
        { label: "Add follow-up", icon: <Phone className="h-4 w-4"/>, onClick: () => dispatch.openCreateDialog({ kind: "followup", customerId: _customerId }), separatorBefore: true },
        { label: "Add task", icon: <CalendarClock className="h-4 w-4"/>, onClick: () => dispatch.openCreateDialog({ kind: "task", customerId: _customerId }) },
        { label: "Send catalogue", icon: <Send className="h-4 w-4"/>, onClick: () => dispatch.openActionDialog("send-catalogue", _customerId), separatorBefore: true },
        { label: "Send reference media", icon: <FileText className="h-4 w-4"/>, onClick: () => dispatch.openActionDialog("send-reference", _customerId) },
        { label: "Send Pinterest board", icon: <Send className="h-4 w-4"/>, onClick: () => dispatch.openActionDialog("send-pinterest", _customerId) },
        { label: "Send material options", icon: <Send className="h-4 w-4"/>, onClick: () => dispatch.openActionDialog("send-material", _customerId) },
        { label: "Open sites & execution", icon: <ArrowRightCircle className="h-4 w-4"/>, onClick: () => {
                dispatch.setActiveModule("siteExecution");
            }, separatorBefore: true },
        // B-19: Edit now opens the EntityFormDialog in edit mode when an onEdit handler is provided
        // (CustomerDesk wires this to its local edit dialog state). Otherwise, fall back to opening
        // the detail panel so the user can use the in-context Edit button.
        { label: "Edit", icon: <Pencil className="h-4 w-4"/>, onClick: () => {
                if (opts?.onEdit) {
                    opts.onEdit();
                    return;
                }
                useRDashStore.getState().openDetail("customer", _customerId);
                toast.info("Opening customer details — use the Edit button in the panel to edit fields");
            } },
    ];
}
export function buildGenericActions(_id: string, _dispatch: unknown, opts?: {
    onOpen?: () => void;
}): ContextAction[] {
    const open = opts?.onOpen;
    return [
        { label: "Open details", icon: <MoreHorizontal className="h-4 w-4"/>, onClick: open },
        { label: "Edit", icon: <Pencil className="h-4 w-4"/>, onClick: open },
        { label: "Archive", icon: <Ban className="h-4 w-4"/>, onClick: () => toast.warning("Archive is not yet implemented for this record type"), danger: true, separatorBefore: true },
    ];
}
