// STAGE-3-FIX: Generate a sequence number using the current year and the
// max existing suffix (not array length, which breaks on delete).
function nextSequenceNo(prefix: string, collection: { receipt_no?: string; invoice_no?: string }[]): string {
    const year = new Date().getFullYear();
    const field = prefix.startsWith("CR") ? "receipt_no" : "invoice_no";
    let maxSeq = 0;
    for (const row of collection) {
        const no = (row as Record<string, string | undefined>)[field];
        if (!no) continue;
        const m = no.match(new RegExp(`^${prefix}-\\d{4}-(\\d+)$`));
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return `${prefix}-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}
import type { Payment, CustomerInvoice, CustomerReceipt } from "../../types";
import type { FinanceState } from "../types";
import type { StoreContext } from "../context";
import { assertRole, genId, nowIso, today } from "../helpers";
import { formatINR } from "../../format";
import {
    assertServiceFinanceContext, isPaymentChaseNeeded, upsertPaymentFollowup,
    syncInvoiceWithPayment, assertPaymentMilestoneSequence,
    findOpenLinkedFollowup, dateOnlyFrom, buildInvoiceDraftFromPayment,
} from "../finance-helpers";

/**
 * Finance slice — payment/invoice actions + config actions.
 *
 * Phase 3e extracted the 5 config actions (resolveApproval, toggle* configs,
 * default payment term). Phase 3f moved the 9 payment/invoice actions out of
 * store.ts now that the helper functions live in `../finance-helpers`.
 */
export function createFinanceSlice(ctx: StoreContext): FinanceState {
    const { commitState, get } = ctx;

    return {
        addPayment: (p) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "create payments");
            const finance_context = assertServiceFinanceContext(get().db, p, "Customer payment");
            if (p.status === "received" ||
                p.status === "partial" ||
                (p.received_amount || 0) > 0) {
                throw new Error("Create a pending collection milestone first, then record receipts against its issued invoice.");
            }
            const actor = get().currentUser();
            const payId = genId("pay");
            const threadId = get().openThreadFor("payment", payId, `Payment · ${p.milestone_label || formatINR(p.amount || 0)} · ${p.customer_name || ""}`, [actor.name, p.customer_name || ""]);
            commitState((s: any) => {
                const now = nowIso();
                const payment: Payment = {
                    id: payId,
                    finance_context,
                    customer_id: p.customer_id || "",
                    work_required_id: p.work_required_id,
                    quotation_id: p.quotation_id,
                    work_order_id: p.work_order_id,
                    area_ids: p.area_ids,
                    site_id: p.site_id,
                    amount: p.amount || 0,
                    received_amount: p.received_amount || 0,
                    status: p.status || "pending",
                    mode: p.mode || "—",
                    due_date: p.due_date ??
                        (p.schedule_state === "awaiting_event" ? "" : today()),
                    milestone_term_id: p.milestone_term_id,
                    due_event: p.due_event,
                    schedule_state: p.schedule_state || (p.due_date ? "scheduled" : "awaiting_event"),
                    due_triggered_at: p.due_triggered_at,
                    received_date: p.received_date,
                    reference: p.reference,
                    milestone_label: p.milestone_label,
                    is_advance: p.is_advance,
                    thread_id: threadId,
                    created_at: now,
                    updated_at: now,
                };
                return { db: { ...s.db, payments: [payment, ...s.db.payments] } };
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Created payment ${formatINR(p.amount || 0)} for ${p.customer_name || ""} (${p.milestone_label || "—"})`,
                entity_type: "payment",
                entity_id: payId,
                kind: "create",
                source_module: "finance",
                // Cross-post: payment creation is relevant to the Customer and Work Order threads.
                cross_post: [
                    ...(p.customer_id ? [{ entity_type: "customer", entity_id: p.customer_id as string }] : []),
                    ...(p.work_order_id ? [{ entity_type: "workOrder", entity_id: p.work_order_id as string }] : []),
                ],
            });
            const payment = get().db.payments.find((row: any) => row.id === payId);
            if (payment && isPaymentChaseNeeded(payment)) {
                upsertPaymentFollowup(get(), payment, payment.promise_date || dateOnlyFrom(payment.due_date), payment.status === "overdue"
                    ? "Payment is overdue"
                    : "Payment is due");
            }
            return payId;
        },
        triggerPaymentMilestone: (id, options = {}) => {
            assertRole(get().currentUser().role, ["Owner", "Finance", "Operations Manager"], "trigger payment milestones");
            const state = get();
            const payment = state.db.payments.find((row: any) => row.id === id);
            if (!payment)
                throw new Error("Payment milestone not found.");
            if (payment.status === "received" || payment.status === "cancelled")
                throw new Error("Closed payment milestones cannot be triggered.");
            if (payment.schedule_state !== "awaiting_event" && payment.due_date)
                throw new Error("This payment milestone is already scheduled.");
            const dueDate = options.dueDate || today();
            const actor = state.currentUser();
            const threadId = payment.thread_id ||
                state.openThreadFor("payment", id, `Payment · ${payment.milestone_label || id}`, [actor.name]);
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    payments: snapshot.db.payments.map((row: any) => row.id === id
                        ? {
                            ...row,
                            due_date: dueDate,
                            schedule_state: "triggered" as const,
                            due_triggered_at: nowIso(),
                            thread_id: row.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            const current = get().db.payments.find((row: any) => row.id === id)!;
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Milestone triggered: ${current.milestone_label || "Payment"} is due on ${dueDate}.${options.reason ? ` Reason: ${options.reason}` : ""}`,
                kind: "decision",
            });
            if (isPaymentChaseNeeded(current))
                upsertPaymentFollowup(get(), current, dueDate, "Payment milestone was triggered");
        },
        updatePayment: (id, patch) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "update payments");
            const actor = get().currentUser();
            const before = get().db.payments.find((payment: any) => payment.id === id);
            if (!before)
                throw new Error("Payment not found.");
            if (patch.status === "received" ||
                patch.status === "partial" ||
                patch.received_amount != null) {
                throw new Error("Record a customer receipt against the linked invoice instead of editing collected payment values directly.");
            }
            assertServiceFinanceContext(get().db, { ...before, ...patch }, "Customer payment");
            const threadId = before.thread_id ||
                get().openThreadFor("payment", id, `Payment · ${before?.milestone_label || id} · ${before?.customer_name || ""}`, [actor.name, before?.customer_name || ""]);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payments: s.db.payments.map((p: any) => p.id === id
                        ? {
                            ...p,
                            ...patch,
                            thread_id: p.thread_id || threadId,
                            updated_at: nowIso(),
                        }
                        : p),
                },
            }));
            const payment = get().db.payments.find((row: any) => row.id === id);
            if (before && payment) {
                const changes: string[] = [];
                if (patch.status && patch.status !== before.status)
                    changes.push(`status changed from ${before.status} to ${patch.status}`);
                if (patch.due_date && patch.due_date !== before.due_date)
                    changes.push(`due date changed from ${before.due_date} to ${patch.due_date}`);
                if (patch.promise_date && patch.promise_date !== before.promise_date)
                    changes.push(`promise date set to ${patch.promise_date}`);
                if (changes.length) {
                    get().addThreadReply(threadId, {
                        author: actor.name,
                        role: actor.role,
                        body: `Payment updated: ${changes.join("; ")}.`,
                        kind: patch.status === "cancelled" ? "decision" : "comment",
                    });
                }
                if (payment.status === "received" || payment.status === "cancelled") {
                    const followup = findOpenLinkedFollowup(get().db, {
                        payment_id: payment.id,
                        customer_id: payment.customer_id,
                        work_required_id: payment.work_required_id,
                        followup_type: "payment",
                    });
                    if (followup) {
                        get().completeFollowup(followup.id, {
                            outcome: "not_applicable",
                            note: payment.status === "received"
                                ? `Payment milestone is fully received for ${payment.milestone_label || payment.id}.`
                                : `Payment milestone was cancelled for ${payment.milestone_label || payment.id}.`,
                        });
                    }
                }
                else if (isPaymentChaseNeeded(payment)) {
                    upsertPaymentFollowup(get(), payment, payment.promise_date || dateOnlyFrom(payment.due_date), payment.status === "overdue"
                        ? "Payment is overdue"
                        : "Payment is due");
                }
                const invoice = get().db.invoices.find((row: any) => row.payment_id === payment.id || row.id === payment.invoice_id);
                if (invoice) {
                    const synced = syncInvoiceWithPayment(invoice, payment);
                    commitState((s: any) => ({
                        db: {
                            ...s.db,
                            invoices: s.db.invoices.map((row: any) => row.id === invoice.id ? synced : row),
                        },
                    }));
                }
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated payment ${id}`,
                entity_type: "payment",
                entity_id: id,
                kind: "update",
                cross_post: [
                    ...(before?.customer_id ? [{ entity_type: "customer", entity_id: before.customer_id }] : []),
                    ...(before?.work_order_id ? [{ entity_type: "workOrder", entity_id: before.work_order_id }] : []),
                    ...(before?.site_id ? [{ entity_type: "site", entity_id: before.site_id }] : []),
                    ...(before?.quotation_id ? [{ entity_type: "quotation", entity_id: before.quotation_id }] : []),
                ],
            });
        },
        recordPaymentReceived: (id, mode, reference, amount) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "record customer receipts");
            const payment = get().db.payments.find((row: any) => row.id === id);
            if (!payment)
                throw new Error("Payment milestone not found.");
            assertPaymentMilestoneSequence(payment, get().db.payments);
            const invoice = get().db.invoices.find((row: any) => row.id === payment.invoice_id || row.payment_id === payment.id);
            if (!invoice)
                throw new Error("Issue a customer invoice before recording a receipt. A payment milestone is not an invoice.");
            const remainingForMilestone = Math.max(0, Math.round((payment.amount - (payment.received_amount || 0)) * 100) /
                100);
            const receiptAmount = amount ?? remainingForMilestone;
            get().recordCustomerReceipt(invoice.id, receiptAmount, mode, reference, payment.id);
        },
        recordCustomerReceipt: (invoiceId, amount, mode, reference, paymentId) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "record customer receipts");
            // B-2: Refresh overdue statuses BEFORE applying the receipt so a
            // past-due invoice shows up correctly and the receipt can clear
            // the overdue flag atomically.
            get().refreshOverdueStatuses();
            const state = get();
            const actor = state.currentUser();
            const invoice = state.db.invoices.find((row: any) => row.id === invoiceId);
            if (!invoice)
                throw new Error("Customer invoice not found.");
            const financeContext = assertServiceFinanceContext(state.db, invoice, "Customer receipt");
            if (invoice.status === "cancelled" || invoice.status === "paid")
                throw new Error("This invoice cannot receive another receipt.");
            if (!reference.trim())
                throw new Error("A bank, UPI, cheque or cash reference is required.");
            if (!Number.isFinite(amount) || amount <= 0)
                throw new Error("Receipt amount must be greater than zero.");
            if (amount > invoice.balance_amount + 0.001)  // STAGE-3-FIX: tightened from 0.01
                throw new Error("Receipt amount cannot exceed the invoice balance.");
            const linkedPayment = paymentId
                ? state.db.payments.find((row: any) => row.id === paymentId)
                : undefined;
            if (paymentId && !linkedPayment)
                throw new Error("Linked collection milestone was not found.");
            if (linkedPayment &&
                linkedPayment.invoice_id &&
                linkedPayment.invoice_id !== invoice.id)
                throw new Error("Receipt payment milestone does not belong to this invoice.");
            if (linkedPayment) {
                const milestoneBalance = Math.max(0, linkedPayment.amount - (linkedPayment.received_amount || 0));
                if (amount > milestoneBalance + 0.001)  // STAGE-3-FIX: tightened from 0.01
                    throw new Error("Receipt amount cannot exceed the linked collection milestone balance.");
            }
            const now = nowIso();
            const receiptId = genId("receipt");
            const receiptNo = nextSequenceNo("CR", state.db.customerReceipts);
            const threadId = invoice.thread_id ||
                state.openThreadFor("invoice", invoice.id, `${invoice.invoice_no} · Customer receipt`, [actor.name]);
            const receipt: CustomerReceipt = {
                id: receiptId,
                receipt_no: receiptNo,
                finance_context: financeContext,
                customer_id: invoice.customer_id,
                site_id: invoice.site_id,
                area_ids: invoice.area_ids,
                work_required_id: invoice.work_required_id,
                quotation_id: invoice.quotation_id,
                work_order_id: invoice.work_order_id,
                invoice_id: invoice.id,
                payment_id: paymentId,
                amount: Math.round(amount * 100) / 100,
                mode,
                reference: reference.trim(),
                received_at: today(),
                created_by: actor.name,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            const nextInvoicePaid = Math.round((invoice.paid_amount + receipt.amount) * 100) / 100;
            const nextInvoiceBalance = Math.max(0, Math.round((invoice.total_amount - nextInvoicePaid) * 100) / 100);
            const nextInvoiceStatus: CustomerInvoice["status"] = nextInvoiceBalance === 0 ? "paid" : "partial";
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    customerReceipts: [receipt, ...s.db.customerReceipts],
                    invoices: s.db.invoices.map((row: any) => row.id === invoice.id
                        ? {
                            ...row,
                            paid_amount: nextInvoicePaid,
                            balance_amount: nextInvoiceBalance,
                            status: nextInvoiceStatus,
                            paid_at: nextInvoiceBalance === 0 ? today() : undefined,
                            thread_id: row.thread_id || threadId,
                            updated_at: now,
                        }
                        : row),
                    payments: paymentId
                        ? s.db.payments.map((row: any) => {
                            if (row.id !== paymentId)
                                return row;
                            const receivedAmount = Math.round(((row.received_amount || 0) + receipt.amount) * 100) / 100;
                            const balance = Math.max(0, row.amount - receivedAmount);
                            return {
                                ...row,
                                received_amount: receivedAmount,
                                status: balance === 0 ? "received" : "partial",
                                mode,
                                reference: reference.trim(),
                                received_date: today(),
                                invoice_id: invoice.id,
                                updated_at: now,
                            };
                        })
                        : s.db.payments,
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Customer receipt ${receiptNo} recorded: ${formatINR(receipt.amount)} via ${mode}. Ref: ${receipt.reference}. Invoice balance: ${formatINR(nextInvoiceBalance)}.`,
                kind: "decision",
            });
            if (paymentId && nextInvoiceBalance === 0) {
                const followup = findOpenLinkedFollowup(get().db, {
                    payment_id: paymentId,
                    customer_id: invoice.customer_id,
                    work_required_id: invoice.work_required_id,
                    followup_type: "payment",
                });
                if (followup)
                    get().completeFollowup(followup.id, { outcome: "not_applicable", note: `Payment milestone is fully received through ${receiptNo}.` });
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Recorded customer receipt ${receiptNo} for ${invoice.invoice_no}: ${formatINR(receipt.amount)}`,
                entity_type: "invoice",
                entity_id: invoice.id,
                entity_label: invoice.invoice_no,
                kind: "receive",
                cross_post: [
                    ...(invoice.customer_id ? [{ entity_type: "customer", entity_id: invoice.customer_id }] : []),
                    ...(invoice.work_order_id ? [{ entity_type: "workOrder", entity_id: invoice.work_order_id }] : []),
                    ...(invoice.site_id ? [{ entity_type: "site", entity_id: invoice.site_id }] : []),
                    ...(invoice.quotation_id ? [{ entity_type: "quotation", entity_id: invoice.quotation_id }] : []),
                    ...(paymentId ? [{ entity_type: "payment", entity_id: paymentId }] : []),
                ],
            });
            // H: Auto-pay commissions on invoice settlement. When this receipt
            // fully settles the invoice AND the invoice's work order has no
            // remaining receivable (no other open invoices), pay any accrued
            // commissions linked to that work order. If the receipt is partial
            // or other invoices remain open, commissions stay accrued.
            if (nextInvoiceBalance === 0 && invoice.work_order_id) {
                const afterState = get();
                const woId = invoice.work_order_id;
                const woInvoices = afterState.db.invoices.filter((row: any) => row.work_order_id === woId && row.status !== "cancelled");
                const woReceivable = woInvoices.reduce((sum: number, row: any) => sum + (row.balance_amount || 0), 0);
                if (woReceivable <= 0) {
                    const unpaidComms = afterState.db.commissions.filter((c: any) => c.work_order_id === woId && c.status === "accrued");
                    for (const comm of unpaidComms) {
                        try {
                            get().payCommission(comm.id);
                            get().logAudit({
                                actor: "System",
                                action: `Commission ${comm.commission_no || comm.id} auto-paid on invoice settlement (${invoice.invoice_no}) — ${formatINR(comm.amount)} to ${comm.source_partner_name || "partner"}`,
                                entity_type: "commission",
                                entity_id: comm.id,
                                entity_label: comm.commission_no,
                                kind: "system",
                                source_module: "finance",
                                cross_post: [
                                    { entity_type: "workOrder", entity_id: woId },
                                    { entity_type: "invoice", entity_id: invoice.id, entity_label: invoice.invoice_no },
                                ],
                            });
                        }
                        catch (err) {
                            console.warn("[finance] auto-pay commission failed", err);
                        }
                    }
                }
            }
            return receiptId;
        },
        recordPaymentPromise: (id, promiseDate) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "record payment promises");
            const actor = get().currentUser();
            const pay = get().db.payments.find((p: any) => p.id === id);
            if (!pay)
                return;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payments: s.db.payments.map((p: any) => p.id === id
                        ? { ...p, promise_date: promiseDate, updated_at: nowIso() }
                        : p),
                },
            }));
            const promisedPayment = { ...pay, promise_date: promiseDate };
            upsertPaymentFollowup(get(), promisedPayment, promiseDate, "Customer promised payment");
            const threadId = pay.thread_id ||
                get().openThreadFor("payment", id, `Payment · ${pay.milestone_label || id} · ${pay.customer_name || ""}`, [actor.name, pay.customer_name || ""]);
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Customer promised payment by ${promiseDate}. Payment follow-up updated.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Customer promised ${formatINR(pay.amount)} by ${promiseDate}`,
                entity_type: "payment",
                entity_id: id,
                entity_label: pay.milestone_label,
                kind: "decision",
                cross_post: [
                    ...(pay.customer_id ? [{ entity_type: "customer", entity_id: pay.customer_id }] : []),
                    ...(pay.work_order_id ? [{ entity_type: "workOrder", entity_id: pay.work_order_id }] : []),
                ],
            });
        },
        reconcilePayment: (id) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "reconcile payments");
            const actor = get().currentUser();
            const pay = get().db.payments.find((p: any) => p.id === id);
            if (!pay) throw new Error("Payment not found.");
            if (!pay.provisional) throw new Error("Payment is not provisional.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    payments: s.db.payments.map((p: any) => p.id === id
                        ? { ...p, provisional: false, reconciled_at: now, updated_at: now }
                        : p),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Reconciled provisional payment ${pay.milestone_label || id} (${formatINR(pay.amount)})`,
                entity_type: "payment",
                entity_id: id,
                entity_label: pay.milestone_label,
                kind: "decision",
                cross_post: [
                    ...(pay.customer_id ? [{ entity_type: "customer", entity_id: pay.customer_id }] : []),
                    ...(pay.work_order_id ? [{ entity_type: "workOrder", entity_id: pay.work_order_id }] : []),
                ],
            });
        },
        addInvoice: (invoice) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "create invoices");
            const finance_context = assertServiceFinanceContext(get().db, invoice, "Customer invoice");
            if (invoice.status === "paid" ||
                invoice.status === "partial" ||
                (invoice.paid_amount || 0) > 0) {
                throw new Error("Create an issued invoice first, then record customer receipts to settle it.");
            }
            const actor = get().currentUser();
            const id = invoice.id || genId("inv");
            const invoiceNo = invoice.invoice_no ||
                nextSequenceNo("INV", get().db.invoices);
            const total = invoice.total_amount ?? invoice.subtotal ?? 0;
            const paid = invoice.paid_amount ?? 0;
            const threadId = get().openThreadFor("invoice", id, `${invoiceNo} Â· ${invoice.customer_name || "Customer"}`, [actor.name, invoice.customer_name || "Customer"]);
            const now = nowIso();
            const row: CustomerInvoice = {
                id,
                invoice_no: invoiceNo,
                finance_context,
                customer_id: invoice.customer_id || "",
                work_required_id: invoice.work_required_id,
                quotation_id: invoice.quotation_id,
                work_order_id: invoice.work_order_id,
                area_ids: invoice.area_ids,
                payment_id: invoice.payment_id,
                site_id: invoice.site_id,
                title: invoice.title || "Customer invoice",
                status: invoice.status || "issued",
                subtotal: invoice.subtotal ?? total,
                tax_amount: invoice.tax_amount ?? 0,
                total_amount: total,
                paid_amount: paid,
                balance_amount: Math.max(0, total - paid),
                issued_at: invoice.issued_at || today(),
                due_date: invoice.due_date || today(),
                paid_at: invoice.paid_at,
                notes: invoice.notes,
                thread_id: threadId,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    invoices: [row, ...s.db.invoices],
                    payments: row.payment_id
                        ? s.db.payments.map((payment: any) => payment.id === row.payment_id
                            ? { ...payment, invoice_id: row.id, updated_at: nowIso() }
                            : payment)
                        : s.db.payments,
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Created invoice ${invoiceNo} for ${row.customer_name || "Customer"}`,
                entity_type: "invoice",
                entity_id: id,
                entity_label: invoiceNo,
                kind: "create",
                cross_post: [
                    ...(row.customer_id ? [{ entity_type: "customer", entity_id: row.customer_id }] : []),
                    ...(row.work_order_id ? [{ entity_type: "workOrder", entity_id: row.work_order_id }] : []),
                    ...(row.site_id ? [{ entity_type: "site", entity_id: row.site_id }] : []),
                    ...(row.quotation_id ? [{ entity_type: "quotation", entity_id: row.quotation_id }] : []),
                    ...(row.payment_id ? [{ entity_type: "payment", entity_id: row.payment_id }] : []),
                ],
            });
            return id;
        },
        updateInvoice: (id, patch) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "update invoices");
            const actor = get().currentUser();
            const before = get().db.invoices.find((invoice: any) => invoice.id === id);
            if (!before)
                throw new Error("Invoice not found.");
            if (patch.status === "paid" ||
                patch.status === "partial" ||
                patch.paid_amount != null ||
                patch.balance_amount != null) {
                throw new Error("Record a customer receipt. Invoice settlement cannot be edited directly.");
            }
            assertServiceFinanceContext(get().db, { ...before, ...patch }, "Customer invoice");
            const threadId = before.thread_id ||
                get().openThreadFor("invoice", id, `${before.invoice_no || "Invoice"} Â· ${before.customer_name || ""}`, [actor.name, before.customer_name || "Customer"]);
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    invoices: s.db.invoices.map((invoice: any) => {
                        if (invoice.id !== id)
                            return invoice;
                        const total = patch.total_amount ?? invoice.total_amount;
                        const paid = patch.paid_amount ?? invoice.paid_amount;
                        const status = patch.status ?? invoice.status;
                        return {
                            ...invoice,
                            ...patch,
                            thread_id: invoice.thread_id || threadId,
                            total_amount: total,
                            paid_amount: paid,
                            balance_amount: patch.balance_amount ??
                                (status === "paid" ? 0 : Math.max(0, total - paid)),
                            paid_at: status === "paid"
                                ? patch.paid_at || invoice.paid_at || today()
                                : patch.paid_at,
                            updated_at: nowIso(),
                        };
                    }),
                },
            }));
            const after = get().db.invoices.find((invoice: any) => invoice.id === id);
            if (before && after) {
                const changes: string[] = [];
                if (patch.status && patch.status !== before.status)
                    changes.push(`status changed from ${before.status} to ${patch.status}`);
                if (patch.due_date && patch.due_date !== before.due_date)
                    changes.push(`due date changed from ${before.due_date} to ${patch.due_date}`);
                if (changes.length) {
                    get().addThreadReply(threadId, {
                        author: actor.name,
                        role: actor.role,
                        body: `Invoice updated: ${changes.join("; ")}.`,
                        kind: patch.status === "cancelled" ? "decision" : "comment",
                    });
                }
            }
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Updated invoice ${before?.invoice_no || id}`,
                entity_type: "invoice",
                entity_id: id,
                entity_label: before?.invoice_no,
                kind: "update",
                cross_post: [
                    ...(before?.customer_id ? [{ entity_type: "customer", entity_id: before.customer_id }] : []),
                    ...(before?.work_order_id ? [{ entity_type: "workOrder", entity_id: before.work_order_id }] : []),
                    ...(before?.site_id ? [{ entity_type: "site", entity_id: before.site_id }] : []),
                    ...(before?.quotation_id ? [{ entity_type: "quotation", entity_id: before.quotation_id }] : []),
                ],
            });
        },
        issueInvoiceForPayment: (paymentId) => {
            const payment = get().db.payments.find((row: any) => row.id === paymentId);
            if (!payment)
                return "";
            const existing = get().db.invoices.find((invoice: any) => invoice.payment_id === paymentId || invoice.id === payment.invoice_id);
            if (existing) {
                const synced = syncInvoiceWithPayment(existing, payment);
                commitState((s: any) => ({
                    db: {
                        ...s.db,
                        invoices: s.db.invoices.map((invoice: any) => invoice.id === existing.id ? synced : invoice),
                        payments: s.db.payments.map((row: any) => row.id === paymentId ? { ...row, invoice_id: existing.id } : row),
                    },
                }));
                return existing.id;
            }
            const invoiceNo = nextSequenceNo("INV", get().db.invoices);
            const id = genId("inv");
            const threadId = get().openThreadFor("invoice", id, `${invoiceNo} Â· ${payment.customer_name || "Customer"}`, [payment.customer_name || "Customer", "Accounts"]);
            const invoice = buildInvoiceDraftFromPayment(payment, invoiceNo, threadId);
            const row = { ...invoice, id, thread_id: threadId };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    invoices: [row, ...s.db.invoices],
                    payments: s.db.payments.map((paymentRow: any) => paymentRow.id === paymentId
                        ? { ...paymentRow, invoice_id: id, updated_at: nowIso() }
                        : paymentRow),
                },
            }));
            get().addThreadReply(threadId, {
                author: "System",
                role: "Automation",
                body: `Invoice issued for payment milestone "${payment.milestone_label || "Payment"}" due ${payment.due_date}.`,
                kind: "system",
            });
            get().logAudit({
                actor: "System",
                action: `Issued invoice ${invoiceNo} for payment ${paymentId}`,
                entity_type: "invoice",
                entity_id: id,
                entity_label: invoiceNo,
                kind: "system",
                cross_post: [
                    ...(payment.customer_id ? [{ entity_type: "customer", entity_id: payment.customer_id }] : []),
                    ...(payment.work_order_id ? [{ entity_type: "workOrder", entity_id: payment.work_order_id }] : []),
                    { entity_type: "payment", entity_id: paymentId },
                ],
            });
            return id;
        },
        reconcileInvoice: (id) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "reconcile invoices");
            const actor = get().currentUser();
            const inv = get().db.invoices.find((i: any) => i.id === id);
            if (!inv) throw new Error("Invoice not found.");
            if (!inv.provisional) throw new Error("Invoice is not provisional.");
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    invoices: s.db.invoices.map((i: any) => i.id === id
                        ? { ...i, provisional: false, reconciled_at: now, updated_at: now }
                        : i),
                },
            }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Reconciled provisional invoice ${inv.invoice_no} (${formatINR(inv.total_amount)})`,
                entity_type: "invoice",
                entity_id: id,
                entity_label: inv.invoice_no,
                kind: "decision",
                cross_post: [
                    ...(inv.customer_id ? [{ entity_type: "customer", entity_id: inv.customer_id }] : []),
                    ...(inv.work_order_id ? [{ entity_type: "workOrder", entity_id: inv.work_order_id }] : []),
                ],
            });
        },
        resolveApproval: (id, decision) => {
            assertRole(get().currentUser().role, ["Owner"], "resolve approvals");
            const approvalBefore = get().db.actions.find((a: any) => a.id === id);
            // D: Cascade to the appropriate slice action based on the linked
            // record type. "vendor_bill" approvals/rejections route to
            // approveVendorBill / rejectVendorBill so the cost-line posting
            // and status transition happen correctly.
            // STAGE-3-FIX (3.6): Wrap ALL cascades in try/catch so a failure in one
            // doesn't leave the approval stuck in "pending" forever.
            if (approvalBefore && decision === "approved") {
                if (approvalBefore.linked_record_type === "po" && approvalBefore.linked_record_id) {
                    try { get().approvePO(approvalBefore.linked_record_id); }
                    catch (err) { console.warn("[resolveApproval] approvePO failed", err); }
                }
                if (approvalBefore.linked_record_type === "quotation" && approvalBefore.linked_record_id) {
                    try { get().updateQuotation(approvalBefore.linked_record_id, { status: "sent" }); }
                    catch (err) { console.warn("[resolveApproval] updateQuotation failed", err); }
                }
                if (approvalBefore.linked_record_type === "contractor_payment" && approvalBefore.linked_record_id) {
                    try { get().approveContractorPayment(id); }
                    catch (err) { console.warn("[resolveApproval] approveContractorPayment failed", err); }
                }
                if (approvalBefore.linked_record_type === ("vendor_bill" as any) && approvalBefore.linked_record_id) {
                    try { get().approveVendorBill(approvalBefore.linked_record_id); }
                    catch (err) { console.warn("[resolveApproval] approveVendorBill failed", err); }
                }
            }
            if (approvalBefore && decision === "rejected" &&
                approvalBefore.linked_record_type === ("vendor_bill" as any) && approvalBefore.linked_record_id) {
                try { get().rejectVendorBill(approvalBefore.linked_record_id, "Rejected via approvals module"); }
                catch (err) { console.warn("[resolveApproval] rejectVendorBill failed", err); }
            }
            // STAGE-3-FIX (3.4): Keep decided approvals in the array (don't delete history).
            // The old .filter(a => a.status === "pending") destroyed the audit trail.
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    actions: s.db.actions
                        .map((a: any) => a.id === id ? { ...a, status: decision, resolved_at: nowIso() } : a),
                },
            }));
        },

        toggleCommercialTerm: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                commercialTerms: s.db.commercialTerms.map((t: any) => t.id === id ? { ...t, enabled: !t.enabled } : t),
            },
        })),

        toggleTaxConfig: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                taxConfigs: s.db.taxConfigs.map((t: any) => t.id === id ? { ...t, enabled: !t.enabled } : t),
            },
        })),

        toggleValidityConfig: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                validityConfigs: s.db.validityConfigs.map((v: any) => v.id === id ? { ...v, enabled: !v.enabled } : v),
            },
        })),

        setDefaultPaymentTermTemplate: (id) => commitState((s: any) => ({
            db: {
                ...s.db,
                paymentTermTemplates: s.db.paymentTermTemplates.map((t: any) => ({
                    ...t,
                    is_default: t.id === id,
                })),
            },
        })),

        // B-2: Scan all invoices + payments; mark past-due open balances as
        // "overdue" so the PaymentRecoveryModule Overdue queue actually has
        // rows. Previously `status: "overdue"` was NEVER set automatically —
        // the queue was dead. Now we run this on workspace load
        // (reconcileFinance) and at the start of recordCustomerReceipt so a
        // receipt doesn't get applied against a stale "pending" status.
        refreshOverdueStatuses: () => {
            const todayStr = today();
            let invoicesChanged = 0;
            let paymentsChanged = 0;
            commitState((s: any) => {
                const invoices = s.db.invoices.map((invoice: any) => {
                    if (invoice.status === "cancelled" || invoice.status === "paid")
                        return invoice;
                    const outstanding = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0));
                    if (outstanding <= 0)
                        return invoice;
                    if (!invoice.due_date)
                        return invoice;
                    if (invoice.due_date > todayStr)
                        return invoice;
                    if (invoice.status === "overdue")
                        return invoice;
                    invoicesChanged++;
                    return { ...invoice, status: "overdue" as const, updated_at: nowIso() };
                });
                const payments = s.db.payments.map((payment: any) => {
                    if (payment.status === "received" || payment.status === "cancelled")
                        return payment;
                    if (payment.schedule_state === "awaiting_event" || !payment.due_date)
                        return payment;
                    if (payment.due_date > todayStr)
                        return payment;
                    const outstanding = Math.max(0, (payment.amount || 0) - (payment.received_amount || 0));
                    if (outstanding <= 0)
                        return payment;
                    if (payment.status === "overdue")
                        return payment;
                    paymentsChanged++;
                    return { ...payment, status: "overdue" as const, updated_at: nowIso() };
                });
                return { db: { ...s.db, invoices, payments } };
            });
            if (invoicesChanged > 0 || paymentsChanged > 0) {
                get().logAudit({
                    actor: "System",
                    action: `Refreshed overdue statuses — ${invoicesChanged} invoice(s), ${paymentsChanged} payment(s) marked overdue.`,
                    entity_type: "invoice",
                    kind: "system",
                    source_module: "finance",
                });
            }
        },
        // B-2: Workspace-load finance reconciliation. Runs refreshOverdueStatuses
        // so the Overdue queue is populated, and is the single entry point
        // future scheduled/cron jobs should call.
        reconcileFinance: () => {
            get().refreshOverdueStatuses();
        },
    };
}
