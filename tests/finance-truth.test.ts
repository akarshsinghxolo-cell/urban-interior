import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { actualCashEntries, cashFlowDays, cashFlowForecast, contractorSettlementAmounts } from "../src/lib/rdash/store/finance-helpers";
import { contractorOutstanding, siteFinancials } from "../src/lib/rdash/store/selectors";
import { createVendorBillsSlice } from "../src/lib/rdash/store/slices/vendor-bills";
import { createMastersSlice } from "../src/lib/rdash/store/slices/masters";
import { createContractorsSlice } from "../src/lib/rdash/store/slices/contractors";
import { assertWorkspaceMutationAllowed } from "../src/lib/rdash/server/mutation-policy";
import { FINANCE_SCOPE_COLLECTIONS, WORKDESK_SCOPE_COLLECTIONS } from "../src/lib/rdash/server/module-scoped-collections";

function fixture() {
    const db = buildSeedDatabase();
    Object.assign(db, { customerReceipts: [], vendorPayments: [], contractorPayments: [], commissions: [], payrollPeriods: [], payrollLines: [], invoices: [], payments: [], vendorBills: [], contractorBills: [], contractorSettlements: [] });
    const state: any = { db, currentUser: () => ({ name: "Actual Owner", role: "Owner", staffId: "staff-owner" }), logAudit: vi.fn(), addThreadReply: vi.fn(), openThreadFor: () => "thread", requiresApproval: () => undefined, createBlocked: vi.fn() };
    const commitState = (update: any) => Object.assign(state, typeof update === "function" ? update(state) : update);
    const ctx = { get: () => state, commitState, setBase: commitState, isNestedTransaction: () => true };
    Object.assign(state, createVendorBillsSlice(ctx), createMastersSlice(ctx), createContractorsSlice(ctx));
    return state;
}

describe("recorded cash and projected dues", () => {
    test("only paid payments count, on their India payment day, never creation day", () => {
        const { db } = fixture();
        db.vendorPayments = [{ id: "paid", status: "paid", amount: 10000, paid_at: "2026-10-10T19:00:00Z", created_at: "2026-10-01" }, { id: "pending", status: "pending", amount: 9000, created_at: "2026-10-11" }, { id: "cancelled", status: "cancelled", amount: 8000, created_at: "2026-10-11" }];
        const entries = actualCashEntries(db);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ id: "paid", date: "2026-10-11", amount: 10000 });
        expect(cashFlowDays(entries, "2026-10-11", 1)[0].outflow).toBe(10000);
    });
    test("today's receipt appears exactly once and older net is only opening movement", () => {
        const { db } = fixture();
        db.customerReceipts = [{ id: "today", amount: 10000, received_at: "2026-10-11" }, { id: "old", amount: 2000, received_at: "2026-10-10" }];
        const flow = cashFlowForecast(db, "2026-10-11");
        expect(flow.totals.inflow).toBe(10000);
        expect(flow.totals.endingBalance).toBe(12000);
    });
    test("partial dues count their remainder; cancelled and awaiting-event milestones do not", () => {
        const { db } = fixture();
        db.payments = [
            { id: "partial", amount: 10000, received_amount: 4000, status: "partial", due_date: "2026-10-12" },
            { id: "cancelled", amount: 10000, status: "cancelled", due_date: "2026-10-12" },
            { id: "not-triggered", amount: 10000, schedule_state: "awaiting_event", status: "upcoming", due_date: "2026-10-12" },
        ];
        expect(cashFlowForecast(db, "2026-10-11").totals.inflow).toBe(6000);
    });
    test("bills schedule liabilities without payment requests; invoices and milestones do not double count", () => {
        const { db } = fixture();
        db.invoices = [{ id: "invoice", balance_amount: 6000, status: "partial", due_date: "2026-10-13" }];
        db.payments = [{ id: "milestone", invoice_id: "invoice", amount: 10000, received_amount: 4000, status: "partial", due_date: "2026-10-12" }];
        db.vendorBills = [{ id: "vendor", status: "approved", balance_amount: 50000, due_date: "2026-10-12" }];
        db.contractorBills = [{ id: "contractor", status: "verified", amount: 4000, balance_amount: 4000, due_date: "2026-10-10" }];
        const flow = cashFlowForecast(db, "2026-10-11");
        expect(flow.totals.inflow).toBe(6000);
        expect(flow.totals.outflow).toBe(54000);
        expect(flow.days[0].outflow).toBe(4000);
    });
    test("paid salary and commission are traceable cash outflows, not job costs", () => {
        const { db } = fixture();
        db.payrollPeriods = [{ id: "payroll", status: "paid", paid_at: "2026-10-11", month: 10, year: 2026 }];
        db.payrollLines = [{ id: "salary", payroll_period_id: "payroll", staff_id: "staff-owner", payment_status: "paid", net_payable: 30000 }];
        db.commissions = [{ id: "commission", status: "paid", paid_date: "2026-10-11", amount: 2000 }];
        expect(actualCashEntries(db).map(e => e.sourceId).sort()).toEqual(["commission", "payroll"]);
        expect(cashFlowDays(actualCashEntries(db), "2026-10-11", 1)[0].outflow).toBe(32000);
        expect(FINANCE_SCOPE_COLLECTIONS).toContain("payrollPeriods");
        expect(FINANCE_SCOPE_COLLECTIONS).toContain("payrollLines");
        expect(FINANCE_SCOPE_COLLECTIONS).toContain("commissions");
        expect(WORKDESK_SCOPE_COLLECTIONS).not.toContain("payrollLines");
    });
});

describe("financial workflow integrity", () => {
    test("accepting a genuine variance preserves the mismatch and permits one cost posting", () => {
        const state = fixture();
        state.db.vendorBills = [{ id: "bill", status: "disputed", matched: false, amount: 1200, total_amount: 1200, paid_amount: 0, balance_amount: 1200, three_way_match: { fully_matched: false, obstacle_id: "block" } }];
        state.db.workOrderCostLines = [];
        state.db.blocked = [{ id: "block", resolved: false }];
        state.resolveVendorBillMismatch("bill", "accept_as_is", "Owner accepts supplier variance");
        state.approveVendorBill("bill");
        expect(state.db.vendorBills[0]).toMatchObject({ status: "approved", matched: false, approved_by: "Actual Owner" });
        expect(state.db.vendorBills[0].three_way_match.fully_matched).toBe(false);
        expect(state.db.workOrderCostLines).toHaveLength(1);
        expect(state.db.workOrderCostLines[0].amount).toBe(1200);
        expect(() => state.approveVendorBill("bill")).toThrow("Only pending");
        expect(state.db.workOrderCostLines).toHaveLength(1);
    });
    test.each(["partial_accept", "return_to_vendor", "price_adjustment", "settlement", "hold_payment"])("%s cannot silently authorise an uncorrected invoice", resolution => {
        const state = fixture();
        state.db.vendorBills = [{ id: "bill", status: "disputed", matched: false, paid_amount: 0, three_way_match: { obstacle_id: "block" } }];
        state.db.blocked = [{ id: "block", resolved: false }];
        state.resolveVendorBillMismatch("bill", resolution, "Needs corrected invoice");
        expect(state.db.vendorBills[0].status).toBe("disputed");
        expect(state.db.blocked[0].resolved).toBe(false);
        expect(() => state.approveVendorBill("bill")).toThrow();
    });
    test("matching uses the actual actor, rejects rematching approved money", () => {
        const state = fixture();
        const po = state.db.purchaseOrders[0], grn = state.db.grns.find((g: any) => g.po_id === po.id);
        state.db.vendorBills = [{ id: "bill", po_id: po.id, grn_id: grn.id, status: "draft", paid_amount: 0, tax_amount: 0 }];
        state.matchVendorBill("bill", { invoiceAmount: grn.items.reduce((n: number, i: any) => n + i.amount, 0), invoiceLines: grn.items.map((i: any) => ({ ...i, po_item_id: i.source_item_id })) });
        expect(state.db.vendorBills[0].three_way_match.matched_by).toBe("Actual Owner");
        expect(state.logAudit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: "Actual Owner", actor_role: "Owner" }));
        state.db.vendorBills[0].status = "approved";
        expect(() => state.matchVendorBill("bill", {})).toThrow("cannot be rematched");
    });
    test("paid payroll cannot be reopened by UI action or a direct owner mutation", () => {
        const state = fixture();
        state.db.payrollPeriods = [{ id: "period", status: "paid", paid_at: "2026-10-11" }];
        state.db.payrollLines = [{ id: "line", payroll_period_id: "period", net_payable: 30000, payment_status: "paid" }];
        const before = structuredClone(state.db.payrollPeriods);
        expect(() => state.reopenPayrollPeriod("period")).toThrow("cannot be reopened");
        expect(state.db.payrollPeriods).toEqual(before);
        const owner: any = { role: "Owner", name: "Actual Owner" };
        expect(() => assertWorkspaceMutationAllowed(owner, [{ collection: "payrollPeriods", upsert: [{ id: "period", status: "generated" }] }], state.db)).toThrow("history is locked");
        expect(() => assertWorkspaceMutationAllowed(owner, [{ collection: "payrollLines", deleteIds: ["line"] }], state.db)).toThrow("cannot be deleted");
        expect(() => assertWorkspaceMutationAllowed(owner, [{ collection: "payrollLines", upsert: [{ id: "extra", payroll_period_id: "period", net_payable: 5000, payment_status: "paid" }] }], state.db)).toThrow("Paid payroll is locked");
    });
    test("an obsolete approval cannot reactivate a cancelled contractor payment", () => {
        const state = fixture();
        state.db.actions = [{ id: "approval", linked_record_type: "contractor_payment", linked_record_id: "cancelled" }];
        state.db.contractorPayments = [{ id: "cancelled", status: "cancelled" }];
        expect(() => state.approveContractorPayment("approval")).toThrow("Only a pending");
        expect(state.db.contractorPayments[0].status).toBe("cancelled");
    });
    test("settlement creates an unpaid final bill and adjusts costs without inventing a payment", () => {
        const state = fixture();
        const work = state.db.workOrders[0];
        work.status = "in_progress"; work.contractor_id = state.db.master.contractors[0].id; work.contractor_award_amount = 10000;
        state.db.executionLogs.push({ work_order_id: work.id, contractor_confirmation_attachment_id: "proof" });
        state.db.contractorBills = [{ id: "old", contractor_id: work.contractor_id, work_order_id: work.id, site_id: work.site_id, amount: 10000, paid_amount: 2000, balance_amount: 8000, status: "partly_paid" }];
        state.db.contractorPayments = [{ id: "paid", contractor_id: work.contractor_id, contractor_bill_id: "old", work_order_id: work.id, amount: 2000, status: "paid", paid_at: "2026-10-10" }];
        state.db.workOrderCostLines = [{ type: "contractor", work_order_id: work.id, source_kind: "bill", source_id: "old", amount: 10000 }];
        const contractorId = work.contractor_id;
        expect(contractorSettlementAmounts(state.db, work, 60)).toMatchObject({ paid: 2000, payable: 4000, earned: 6000 });
        const result = state.settleContractor({ workOrderId: work.id, completedPct: 60, reason: "Mutual closure" });
        const finalBill = state.db.contractorBills.find((b: any) => b.settlement_id === result.settlementId);
        expect(finalBill).toMatchObject({ amount: 4000, paid_amount: 0, balance_amount: 4000 });
        expect(state.db.contractorPayments).toHaveLength(1);
        expect(contractorOutstanding(state.db, contractorId)).toBe(4000);
        expect(siteFinancials(state.db, work.site_id).contractorPayable).toBe(4000);
        expect(state.db.workOrderCostLines.reduce((n: number, c: any) => n + c.amount, 0)).toBe(6000);
        const paymentId = state.requestContractorBillPayment(finalBill.id, 1000);
        state.recordContractorPayment(paymentId, "bank_transfer", "BANK-REFERENCE");
        expect(contractorOutstanding(state.db, contractorId)).toBe(3000);
        // The same contractor may return; another agreement adjusts accumulated
        // earned cost, rather than subtracting the original bill a second time.
        const resumed = state.db.workOrders.find((w: any) => w.id === work.id);
        resumed.contractor_id = contractorId;
        resumed.contractor_award_amount = 10000;
        state.settleContractor({ workOrderId: work.id, completedPct: 80, reason: "Final closure after return" });
        expect(state.db.workOrderCostLines.reduce((n: number, c: any) => n + c.amount, 0)).toBe(8000);
        expect(contractorOutstanding(state.db, contractorId)).toBe(5000);
    });
});
