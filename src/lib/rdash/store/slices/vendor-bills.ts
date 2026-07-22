// STAGE-3-FIX: Generate vendor bill/payment number using current year + max suffix.
function nextVendorBillNo(bills: { bill_no?: string }[]): string {
    const year = new Date().getFullYear();
    let maxSeq = 0;
    for (const b of bills) {
        if (!b.bill_no) continue;
        const m = b.bill_no.match(/^VB-\d{4}-(\d+)$/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return `VB-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}
function nextVendorPaymentNo(payments: { payment_no?: string }[]): string {
    const year = new Date().getFullYear();
    let maxSeq = 0;
    for (const p of payments) {
        if (!p.payment_no) continue;
        const m = p.payment_no.match(/^VP-\d{4}-(\d+)$/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }
    return `VP-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
}
/**
 * Vendor-bills slice — vendor invoice (bill) lifecycle: create, approve,
 * pay, three-way PO–GRN–invoice matching, and mismatch resolution.
 *
 * Phase 3g moved the 5 vendor-bills actions out of store.ts now that the
 * `userForRole`/`userForAnyRole` helpers live in `../helpers`.
 */
import type { VendorBill, WorkOrderCostLine, VendorPayment } from "../../types";
import type { VendorBillsState } from "../types";
import type { StoreContext } from "../context";
import { assertRole, genId, nowIso, today, userForRole, userForAnyRole } from "../helpers";
import { formatINR } from "../../format";

export function createVendorBillsSlice(ctx: StoreContext): VendorBillsState {
    const { commitState, get } = ctx;

    return {
        addVendorBill: (b) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "create vendor invoices");
            const state = get();
            const financeUser = userForAnyRole(state.db, ["Finance", "Accounts"], "Finance");
            const po = state.db.purchaseOrders.find((row: any) => row.id === b.po_id);
            const grn = state.db.grns.find((row: any) => row.id === b.grn_id);
            if (!po || !grn || grn.po_id !== po.id)
                throw new Error("Vendor invoice must be created from one matching PO and GRN.");
            if (!b.vendor_invoice_no?.trim())
                throw new Error("Vendor invoice number is required. A GRN is not a vendor bill.");
            if (!b.invoice_lines?.length)
                throw new Error("Enter the actual vendor invoice lines before matching the bill.");
            const duplicate = state.db.vendorBills.find((row: any) => row.vendor_id === po.vendor_id &&
                row.vendor_invoice_no?.trim().toLowerCase() ===
                    b.vendor_invoice_no?.trim().toLowerCase());
            if (duplicate)
                throw new Error(`Vendor invoice ${b.vendor_invoice_no} is already recorded as ${duplicate.bill_no}.`);
            const taxableAmount = b.amount ?? b.invoice_lines.reduce((sum, line: any) => sum + line.amount, 0);
            const taxAmount = b.tax_amount ?? 0;
            const totalAmount = b.total_amount ?? Math.round((taxableAmount + taxAmount) * 100) / 100;
            if (totalAmount <= 0)
                throw new Error("Vendor invoice total must be greater than zero.");
            const id = genId("vbill");
            const billNo = b.bill_no ||
                nextVendorBillNo(state.db.vendorBills);
            const threadId = get().openThreadFor("vendor_bill", id, `${billNo} · ${po.vendor_name}`, [financeUser.name, po.vendor_name]);
            // D: Enforce vendor_bill approval policy. If a matching approval
            // policy exists for the trigger "vendor_bill" at this amount,
            // create the bill in "pending_approval" status (instead of "draft")
            // and create a pending ApprovalAction so the Owner must approve
            // before the bill can be matched/paid. Previously the
            // "vendor_bill" trigger was declared in the policy UI but never
            // called — high-value bills were always created as "draft".
            const policy = state.requiresApproval("vendor_bill", totalAmount);
            const initialStatus: VendorBill["status"] = policy ? "pending_approval" : "draft";
            const bill: VendorBill = {
                id,
                bill_no: billNo,
                vendor_id: po.vendor_id,
                vendor_name: po.vendor_name,
                site_id: po.site_id,
                work_order_id: po.work_order_id,
                po_id: po.id,
                po_no: po.po_no,
                grn_id: grn.id,
                grn_no: grn.grn_no,
                amount: taxableAmount,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                paid_amount: 0,
                balance_amount: totalAmount,
                status: initialStatus,
                due_date: b.due_date || today(),
                matched: false,
                vendor_invoice_no: b.vendor_invoice_no.trim(),
                vendor_invoice_date: b.vendor_invoice_date || today(),
                invoice_lines: b.invoice_lines,
                thread_id: threadId,
                created_at: nowIso(),
                updated_at: nowIso(),
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorBills: [bill, ...s.db.vendorBills],
                    purchaseOrders: s.db.purchaseOrders.map((row: any) => row.id === po.id
                        ? {
                            ...row,
                            bill_ids: [...row.bill_ids, id],
                            updated_at: nowIso(),
                        }
                        : row),
                    grns: s.db.grns.map((row: any) => row.id === grn.id
                        ? { ...row, bill_id: id, updated_at: nowIso() }
                        : row),
                    ...(policy ? {
                        actions: [
                            {
                                id: genId("appr"),
                                title: `Approve vendor bill ${billNo} · ${po.vendor_name} (${formatINR(totalAmount)})`,
                                type: "vendor_bill",
                                status: "pending",
                                amount: totalAmount,
                                requested_by: financeUser.name,
                                due_date: today(),
                                linked_record_id: id,
                                linked_record_type: "vendor_bill" as any,
                                created_at: nowIso(),
                            } as any,
                            ...s.db.actions,
                        ],
                    } : {}),
                },
            }));
            get().addThreadReply(threadId, {
                author: financeUser.name,
                role: financeUser.role,
                body: policy
                    ? `Vendor invoice ${bill.vendor_invoice_no} recorded as ${billNo}. It requires Owner approval (policy "${policy.name}" matched) before matching/payment.`
                    : `Vendor invoice ${bill.vendor_invoice_no} recorded. Run PO–GRN–invoice matching before approval or payment.`,
                kind: "decision",
            });
            get().logAudit({
                actor: financeUser.name,
                actor_role: financeUser.role,
                action: `Vendor invoice ${bill.vendor_invoice_no} recorded as ${bill.bill_no} for ${po.po_no}/${grn.grn_no}${policy ? ` — pending approval (policy "${policy.name}")` : ""}`,
                entity_type: "vendorBill",
                entity_id: bill.id,
                entity_label: bill.bill_no,
                kind: "create",
                cross_post: [
                    { entity_type: "po", entity_id: po.id, entity_label: po.po_no },
                    { entity_type: "grn", entity_id: grn.id, entity_label: grn.grn_no },
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                    ...(bill.site_id ? [{ entity_type: "site", entity_id: bill.site_id }] : []),
                ],
            });
            return id;
        },
        approveVendorBill: (id) => {
            assertRole(get().currentUser().role, ["Owner"], "approve vendor bills");
            const actor = get().currentUser();
            const bill = get().db.vendorBills.find((row: any) => row.id === id);
            if (!bill)
                throw new Error("Vendor bill not found.");
            // D: Bills pending policy-approval can be approved without a 3-way
            // match (the match will run after approval). Otherwise require the
            // 3-way match to be resolved (matched=true, not disputed) before
            // financial approval.
            if (bill.status !== "pending_approval" && (bill.status === "disputed" || bill.matched !== true))
                throw new Error("Resolve the PO–GRN–invoice match before approving this vendor bill.");
            const threadId = bill.thread_id ||
                get().openThreadFor("vendor_bill", id, `${bill.bill_no} · ${bill.vendor_name}`, [actor.name, bill.vendor_name]);
            const alreadyPosted = get().db.workOrderCostLines.some((line: any) => line.source_kind === "bill" && line.source_id === bill.id);
            const now = nowIso();
            // For pending_approval bills, the 3-way match hasn't run yet — only
            // post the cost line after the match is complete (matched=true).
            const canPostCost = bill.matched === true && !alreadyPosted;
            const costLine: WorkOrderCostLine | null = canPostCost
                ? {
                    id: genId("jcl"),
                    work_order_id: bill.work_order_id,
                    type: "material",
                    description: `${bill.vendor_name} — approved vendor invoice ${bill.vendor_invoice_no || bill.bill_no}`,
                    amount: bill.total_amount,
                    date: now,
                    source_kind: "bill",
                    source_id: bill.id,
                    vendor_id: bill.vendor_id,
                    vendor_name: bill.vendor_name,
                    created_at: now,
                }
                : null;
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    // D: For pending_approval bills, move to "draft" so the
                    // standard 3-way match flow can take over. For matched
                    // bills, move to "approved" and post the cost line.
                    vendorBills: s.db.vendorBills.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: bill.status === "pending_approval"
                                ? "draft"
                                : (row.balance_amount > 0 && row.paid_amount > 0
                                    ? "partly_paid"
                                    : "approved"),
                            thread_id: row.thread_id || threadId,
                            posted_to_cost_at: costLine ? (row.posted_to_cost_at || now) : row.posted_to_cost_at,
                            approved_at: now,
                            approved_by: actor.name,
                            updated_at: now,
                        }
                        : row),
                    // D: Resolve the pending vendor_bill approval action.
                    actions: s.db.actions.filter((a: any) => !(a.type === "vendor_bill" && a.linked_record_id === id && a.status === "pending")),
                    workOrderCostLines: costLine
                        ? [costLine, ...s.db.workOrderCostLines]
                        : s.db.workOrderCostLines,
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: bill.status === "pending_approval"
                    ? `Vendor bill ${bill.bill_no} approved — ready to run the PO–GRN–invoice match.`
                    : `Vendor invoice ${bill.bill_no} approved for payment${costLine ? " and posted once to Work Order actual material cost" : ""}.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: bill.status === "pending_approval"
                    ? `Approved pending vendor bill ${bill.bill_no} — moved to draft for 3-way match`
                    : `Approved vendor bill ${bill.bill_no}`,
                entity_type: "vendorBill",
                entity_id: id,
                entity_label: bill.bill_no,
                kind: "approve",
                cross_post: [
                    ...(bill.po_id ? [{ entity_type: "po", entity_id: bill.po_id, entity_label: bill.po_no }] : []),
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                    ...(bill.site_id ? [{ entity_type: "site", entity_id: bill.site_id }] : []),
                ],
            });
        },
        // D: Reject a pending_approval vendor bill. Reverts status to "draft"
        // (so the bill can be corrected/re-issued) and clears the pending
        // approval action. Records the rejection reason in the audit log.
        rejectVendorBill: (id, reason) => {
            assertRole(get().currentUser().role, ["Owner"], "reject vendor bills");
            const actor = get().currentUser();
            const bill = get().db.vendorBills.find((row: any) => row.id === id);
            if (!bill)
                throw new Error("Vendor bill not found.");
            if (bill.status !== "pending_approval")
                throw new Error("Only vendor bills pending policy approval can be rejected from this action.");
            const trimmedReason = (reason || "").trim();
            if (!trimmedReason)
                throw new Error("A rejection reason is required for the audit trail.");
            const threadId = bill.thread_id ||
                get().openThreadFor("vendor_bill", id, `${bill.bill_no} · ${bill.vendor_name}`, [actor.name, bill.vendor_name]);
            const now = nowIso();
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorBills: s.db.vendorBills.map((row: any) => row.id === id
                        ? {
                            ...row,
                            status: "draft" as const,
                            rejection_reason: trimmedReason,
                            rejected_at: now,
                            rejected_by: actor.name,
                            updated_at: now,
                        }
                        : row),
                    actions: s.db.actions.filter((a: any) => !(a.type === "vendor_bill" && a.linked_record_id === id && a.status === "pending")),
                },
            }));
            get().addThreadReply(threadId, {
                author: actor.name,
                role: actor.role,
                body: `Vendor bill ${bill.bill_no} rejected. Reason: "${trimmedReason}". The bill is back in draft status — correct it and re-issue, or delete it.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Rejected vendor bill ${bill.bill_no} — reason: ${trimmedReason}`,
                entity_type: "vendorBill",
                entity_id: id,
                entity_label: bill.bill_no,
                kind: "decision",
                reason: trimmedReason,
                cross_post: [
                    ...(bill.po_id ? [{ entity_type: "po", entity_id: bill.po_id, entity_label: bill.po_no }] : []),
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                ],
            });
        },
        recordVendorPayment: (billId, amount, mode, reference) => {
            assertRole(get().currentUser().role, ["Owner", "Finance"], "record vendor payments");
            const state = get();
            const actor = state.currentUser();
            const bill = state.db.vendorBills.find((row: any) => row.id === billId);
            if (!bill)
                throw new Error("Vendor bill not found.");
            if (bill.status !== "approved" && bill.status !== "partly_paid")
                throw new Error("Vendor bill must be matched and approved before payment.");
            if (!Number.isFinite(amount) ||
                amount <= 0 ||
                amount > bill.balance_amount)
                throw new Error("Payment amount must be greater than zero and not exceed the approved bill balance.");
            if (!reference.trim())
                throw new Error("A bank/UPI/cash reference is required for vendor payment.");
            const id = genId("vpay");
            const now = nowIso();
            const nextPaid = Math.round((bill.paid_amount + amount) * 100) / 100;
            const balance = Math.max(0, Math.round((bill.total_amount - nextPaid) * 100) / 100);
            const status: VendorBill["status"] = balance === 0 ? "paid" : "partly_paid";
            const payment: VendorPayment = {
                id,
                payment_no: nextVendorPaymentNo(state.db.vendorPayments),
                vendor_bill_id: bill.id,
                vendor_id: bill.vendor_id,
                vendor_name: bill.vendor_name,
                site_id: bill.site_id,
                work_order_id: bill.work_order_id,
                amount,
                mode,
                reference: reference.trim(),
                status: "paid",
                paid_at: today(),
                created_by: actor.name,
                approved_by: actor.role === "Owner" ? actor.name : undefined,
                thread_id: bill.thread_id,
                created_at: now,
                updated_at: now,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorPayments: [payment, ...s.db.vendorPayments],
                    vendorBills: s.db.vendorBills.map((row: any) => row.id === bill.id
                        ? {
                            ...row,
                            paid_amount: nextPaid,
                            balance_amount: balance,
                            status,
                            paid_date: balance === 0 ? today() : undefined,
                            updated_at: now,
                        }
                        : row),
                },
            }));
            get().addThreadReply(bill.thread_id || "", {
                author: actor.name,
                role: actor.role,
                body: `Vendor payment ${payment.payment_no} recorded: ${formatINR(amount)} via ${mode}. Ref: ${payment.reference}. Balance: ${formatINR(balance)}.`,
                kind: "decision",
            });
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Recorded vendor payment ${payment.payment_no} for ${bill.bill_no} (${formatINR(amount)})`,
                entity_type: "vendorBill",
                entity_id: bill.id,
                entity_label: bill.bill_no,
                kind: "receive",
                cross_post: [
                    { entity_type: "vendorPayment", entity_id: id, entity_label: payment.payment_no },
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.po_id ? [{ entity_type: "po", entity_id: bill.po_id, entity_label: bill.po_no }] : []),
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                    ...(bill.site_id ? [{ entity_type: "site", entity_id: bill.site_id }] : []),
                ],
            });
            return id;
        },
        matchVendorBill: (billId, params) => {
            const state = get();
            const financeUser = userForAnyRole(state.db, ["Finance", "Accounts"], "Finance");
            const matchedBy = params.matchedBy || financeUser.name;
            const bill = state.db.vendorBills.find((row: any) => row.id === billId);
            if (!bill)
                return { matched: false };
            const po = state.db.purchaseOrders.find((row: any) => row.id === bill.po_id);
            const grn = state.db.grns.find((row: any) => row.id === bill.grn_id);
            if (!po || !grn || grn.po_id !== po.id)
                return { matched: false };
            const invoiceLines = params.invoiceLines?.length
                ? params.invoiceLines
                : bill.invoice_lines || [];
            if (!invoiceLines.length)
                throw new Error("Actual vendor invoice lines are required for a PO–GRN–invoice match.");
            const invoiceAmount = Math.round(params.invoiceAmount * 100) / 100;
            if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0)
                throw new Error("A valid taxable vendor invoice amount is required.");
            const poAmount = po.items.reduce((sum: any, line: any) => sum + line.amount, 0);
            const grnAmount = grn.items.reduce((sum: any, line: any) => sum + line.amount, 0);
            const lineDiffs: import("../../types").VendorBillMatch["line_diffs"] = [];
            const matchedInvoiceIndexes = new Set<number>();
            const receivedForPoLine = (poItemId: string) => grn.items.filter((line: any) => line.source_item_id === poItemId);
            grn.items.forEach((grnLine: any) => {
                const poLine = po.items.find((line: any) => line.id === grnLine.source_item_id);
                const exactIndex = invoiceLines.findIndex((line: any, index: any) => !matchedInvoiceIndexes.has(index) && line.po_item_id === poLine?.id);
                const uniqueArticleIndex = exactIndex >= 0
                    ? exactIndex
                    : invoiceLines.findIndex((line: any, index: any) => {
                        if (matchedInvoiceIndexes.has(index) ||
                            line.article_id !== grnLine.article_id)
                            return false;
                        return receivedForPoLine(poLine?.id || "").length === 1;
                    });
                const invoiceLine = uniqueArticleIndex >= 0
                    ? invoiceLines[uniqueArticleIndex]
                    : undefined;
                if (uniqueArticleIndex >= 0)
                    matchedInvoiceIndexes.add(uniqueArticleIndex);
                const title = poLine?.title ||
                    grnLine.title ||
                    invoiceLine?.title ||
                    "Unknown article";
                const invoiceQuantity = invoiceLine?.quantity;
                const diff = Math.round(((invoiceLine?.amount || 0) - grnLine.amount) * 100) / 100;
                let issue: import("../../types").VendorBillMatch["line_diffs"][number]["issue"];
                if (!invoiceLine)
                    issue = "missing_in_invoice";
                else if (invoiceQuantity != null &&
                    Math.abs(invoiceQuantity - grnLine.quantity) > 0.0001)
                    issue =
                        invoiceQuantity < grnLine.quantity
                            ? "short_delivery"
                            : "over_delivery";
                else if (poLine &&
                    invoiceLine.rate != null &&
                    Math.abs(invoiceLine.rate - poLine.rate) > 0.01)
                    issue = "rate_mismatch";
                if (issue || Math.abs(diff) > 0.5) {
                    lineDiffs.push({
                        article_id: grnLine.article_id,
                        title,
                        po_qty: poLine?.quantity,
                        grn_qty: grnLine.quantity,
                        invoice_qty: invoiceQuantity,
                        po_rate: poLine?.rate,
                        invoice_rate: invoiceLine?.rate,
                        diff,
                        issue,
                    });
                }
            });
            invoiceLines.forEach((invoiceLine: any, index: any) => {
                if (matchedInvoiceIndexes.has(index))
                    return;
                lineDiffs.push({
                    article_id: invoiceLine.article_id,
                    title: invoiceLine.title,
                    invoice_qty: invoiceLine.quantity,
                    invoice_rate: invoiceLine.rate,
                    diff: invoiceLine.amount,
                    issue: "extra_in_invoice",
                });
            });
            const fullyMatched = lineDiffs.length === 0 && Math.abs(invoiceAmount - grnAmount) < 0.5;
            const match: import("../../types").VendorBillMatch = {
                po_amount: poAmount,
                grn_amount: grnAmount,
                invoice_amount: invoiceAmount,
                invoice_vs_po: Math.round((invoiceAmount - poAmount) * 100) / 100,
                invoice_vs_grn: Math.round((invoiceAmount - grnAmount) * 100) / 100,
                grn_vs_po: Math.round((grnAmount - poAmount) * 100) / 100,
                fully_matched: fullyMatched,
                line_diffs: lineDiffs,
                matched_at: nowIso(),
                matched_by: matchedBy,
            };
            let obstacleId: string | undefined;
            if (!fullyMatched) {
                obstacleId = genId("blk");
                get().createBlocked({
                    id: obstacleId,
                    title: `Vendor invoice ${bill.vendor_invoice_no || bill.bill_no} mismatch — needs resolution`,
                    reason: `Invoice ₹${invoiceAmount} vs received GRN ₹${grnAmount}; ${lineDiffs.length} invoice line difference(s).`,
                    linked_po_id: po.id,
                    linked_grn_id: grn.id,
                });
                match.obstacle_id = obstacleId;
            }
            const billThreadId = bill.thread_id ||
                state.openThreadFor("vendor_bill", billId, `${bill.bill_no} · ${bill.vendor_name}`, [matchedBy, bill.vendor_name]);
            const taxAmount = bill.tax_amount || 0;
            const totalAmount = Math.round((invoiceAmount + taxAmount) * 100) / 100;
            commitState((snapshot: any) => ({
                db: {
                    ...snapshot.db,
                    vendorBills: snapshot.db.vendorBills.map((row: any) => row.id === billId
                        ? {
                            ...row,
                            amount: invoiceAmount,
                            total_amount: totalAmount,
                            balance_amount: Math.max(0, Math.round((totalAmount - row.paid_amount) * 100) / 100),
                            status: fullyMatched ? "pending" : "disputed",
                            matched: fullyMatched,
                            mismatch_amount: fullyMatched
                                ? undefined
                                : Math.abs(match.invoice_vs_grn),
                            three_way_match: match,
                            vendor_invoice_no: params.vendorInvoiceNo?.trim() || row.vendor_invoice_no,
                            vendor_invoice_date: params.vendorInvoiceDate || row.vendor_invoice_date,
                            invoice_lines: invoiceLines,
                            thread_id: row.thread_id || billThreadId,
                            updated_at: nowIso(),
                        }
                        : row),
                    grns: snapshot.db.grns.map((row: any) => row.id === grn.id
                        ? {
                            ...row,
                            status: fullyMatched && row.status !== "mismatched"
                                ? "matched"
                                : "mismatched",
                            updated_at: nowIso(),
                        }
                        : row),
                },
            }));
            get().addThreadReply(billThreadId, {
                author: matchedBy,
                role: financeUser.role,
                body: fullyMatched
                    ? `PO–GRN–vendor invoice match completed at ${formatINR(invoiceAmount)}. This invoice can now be approved.`
                    : `PO–GRN–vendor invoice mismatch recorded. Invoice ${formatINR(invoiceAmount)} vs GRN ${formatINR(grnAmount)}. Obstacle ${obstacleId || "created"} requires a recorded resolution.`,
                kind: fullyMatched ? "decision" : "comment",
            });
            get().logAudit({
                actor: matchedBy,
                actor_role: financeUser.role,
                action: fullyMatched
                    ? `Matched vendor invoice ${bill.vendor_invoice_no || bill.bill_no} against ${po.po_no}/${grn.grn_no}`
                    : `Flagged mismatch for vendor invoice ${bill.vendor_invoice_no || bill.bill_no}`,
                entity_type: "vendorBill",
                entity_id: bill.id,
                entity_label: bill.bill_no,
                kind: fullyMatched ? "approve" : "alert",
                cross_post: [
                    { entity_type: "po", entity_id: po.id, entity_label: po.po_no },
                    { entity_type: "grn", entity_id: grn.id, entity_label: grn.grn_no },
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                    ...(bill.site_id ? [{ entity_type: "site", entity_id: bill.site_id }] : []),
                ],
            });
            return { matched: fullyMatched, obstacleId };
        },
        resolveVendorBillMismatch: (billId, resolution, notes) => {
            const state = get();
            const bill = state.db.vendorBills.find((b: any) => b.id === billId);
            if (!bill || !bill.three_way_match)
                return;
            const updatedMatch: import("../../types").VendorBillMatch = {
                ...bill.three_way_match,
                resolution,
                resolution_notes: notes,
            };
            commitState((s: any) => ({
                db: {
                    ...s.db,
                    vendorBills: s.db.vendorBills.map((b: any) => b.id === billId
                        ? {
                            ...b,
                            three_way_match: updatedMatch,
                            status: resolution === "hold_payment" ? "disputed" : "pending",
                            updated_at: nowIso(),
                        }
                        : b),
                    blocked: s.db.blocked.map((bl: any) => bill.three_way_match?.obstacle_id &&
                        bl.id === bill.three_way_match.obstacle_id &&
                        resolution !== "hold_payment"
                        ? { ...bl, resolved: true }
                        : bl),
                },
            }));
            get().logAudit({
                actor: get().currentUser().name,
                actor_role: get().currentUser().role,
                action: `Vendor bill ${bill.bill_no} mismatch resolved as ${resolution}: ${notes}`,
                entity_type: "vendorBill",
                entity_id: billId,
                entity_label: bill.bill_no,
                kind: "decision",
                cross_post: [
                    { entity_type: "vendor", entity_id: bill.vendor_id, entity_label: bill.vendor_name },
                    ...(bill.po_id ? [{ entity_type: "po", entity_id: bill.po_id, entity_label: bill.po_no }] : []),
                    ...(bill.grn_id ? [{ entity_type: "grn", entity_id: bill.grn_id, entity_label: bill.grn_no }] : []),
                    ...(bill.work_order_id ? [{ entity_type: "workOrder", entity_id: bill.work_order_id }] : []),
                ],
            });
        },
    };
}
