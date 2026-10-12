import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { normalizeReceiptItems, receivedQuantities, validateBusinessData } from "../src/lib/rdash/business-rules";
import { createProcurementSlice } from "../src/lib/rdash/store/slices/procurement";
import { createFilesSlice } from "../src/lib/rdash/store/slices/files";
import { createThreadsSlice } from "../src/lib/rdash/store/slices/threads";
import { createVendorBillsSlice } from "../src/lib/rdash/store/slices/vendor-bills";
import { createFinanceSlice } from "../src/lib/rdash/store/slices/finance";
import { createTasksSlice } from "../src/lib/rdash/store/slices/tasks";
import type { ProcurementState } from "../src/lib/rdash/store/types";
import { PROCUREMENT_SCOPE_COLLECTIONS } from "../src/lib/rdash/server/module-scoped-collections";
import { assertWorkspaceMutationAllowed } from "../src/lib/rdash/server/mutation-policy";

function fixture(role = "Owner", projectLinked = false) {
    const db: any = structuredClone(buildSeedDatabase());
    const mapping = db.master.subcategoryArticleMap[0];
    const workOrder = db.workOrders[0];
    const line = {
        id: "po-line-a", title: "Same article", article_id: mapping.article_id,
        work_required_article_id: mapping.id, unit_id: mapping.unit_id, unit_name: "unit",
        quantity: 10, rate: 100, amount: 1000,
    };
    const po = {
        id: "po-integration", po_no: "PO-2026-900", vendor_id: db.master.vendors[0].id,
        vendor_name: db.master.vendors[0].name, status: "sent", grn_ids: [], bill_ids: [],
        work_order_id: projectLinked ? workOrder.id : undefined,
        site_id: projectLinked ? workOrder.site_id : undefined,
        items: [line, { ...line, id: "po-line-b", rate: 250, amount: 2500 }],
    };
    db.purchaseOrders = [po]; db.grns = []; db.inventory = []; db.stockMovements = [];
    db.vendorBills = []; db.vendorPayments = [];
    db.payments = [{ id: "milestone", work_order_id: po.work_order_id, schedule_state: "awaiting_event", due_event: "material_delivery" }];
    for (const id of ["receiving", "challan"]) {
        db.master.fileAssets.push({ id: `asset-${id}`, sync_status: "uploaded", file_name: `${id}.jpg` });
        db.entityFileAttachments.push({ id, file_asset_id: `asset-${id}`, entity_type: "purchase_order", entity_id: po.id, role: "proof", created_at: new Date().toISOString() });
    }
    const state: any = {
        db, currentUser: () => ({ name: "Actual receiver", role, staffId: "staff-receiver" }),
        logAudit: vi.fn(), createBlocked: vi.fn(), triggerPaymentMilestone: vi.fn(), requiresApproval: () => undefined,
    };
    const commitState = vi.fn((update: any) => Object.assign(state, typeof update === "function" ? update(state) : update));
    const ctx = { get: () => state, commitState, setBase: commitState, isNestedTransaction: () => true };
    Object.assign(state, createProcurementSlice(ctx), createFilesSlice(ctx), createThreadsSlice(ctx), createVendorBillsSlice(ctx));
    state.recomputeVendorPerformance = vi.fn();
    const input: Parameters<ProcurementState["fileGRN"]>[0] = {
        id: "grn-first", po_id: po.id, inspection_status: "accepted", delivery_challan_no: "DC-1",
        receiving_files: [{ attachment_id: "receiving", file_name: "receiving.jpg" }],
        delivery_challan_file: { attachment_id: "challan", file_name: "challan.jpg" },
        items: [{ ...line, id: "received-b", source_item_id: "po-line-b", quantity: 4 }],
    };
    return { state, po, input, commitState, ctx };
}

describe("PO → GRN → stock → payment integration", () => {
    test("procurement loads its downstream payment and exception records", () => {
        expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("payments");
        expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("blocked");
        expect(PROCUREMENT_SCOPE_COLLECTIONS).toContain("followups");
    });
    test("same-article lines retain the exact PO rate and reuse uploaded assets", () => {
        const { state, input } = fixture();
        const assetsBefore = state.db.master.fileAssets.length;
        state.fileGRN(input);
        expect(state.db.grns).toHaveLength(1);
        expect(state.db.grns[0].items[0]).toMatchObject({ source_item_id: "po-line-b", rate: 250, amount: 1000 });
        expect(state.db.inventory[0]).toMatchObject({ quantity: 4, rate: 250 });
        expect(state.db.stockMovements).toHaveLength(1);
        expect(state.db.master.fileAssets).toHaveLength(assetsBefore);
        for (const id of [...state.db.grns[0].receiving_proof_attachment_ids, state.db.grns[0].delivery_challan_attachment_id]) {
            expect(state.db.entityFileAttachments.find((row: any) => row.id === id)).toMatchObject({ entity_type: "grn", entity_id: input.id });
        }
        expect(state.db.purchaseOrders[0].status).toBe("partially_received");
        expect(state.triggerPaymentMilestone).not.toHaveBeenCalled();
        expect(validateBusinessData(state.db).filter((issue: string) => /^(GRN|Inventory|Stock Movement)/.test(issue))).toEqual([]);
    });

    test("duplicate source lines and article-only identities are rejected before posting", () => {
        const { state, input } = fixture();
        expect(() => state.fileGRN({ ...input, items: [input.items![0], { ...input.items![0], id: "duplicate" }] })).toThrow("Duplicate receipt line");
        expect(() => state.fileGRN({ ...input, items: [{ ...input.items![0], source_item_id: undefined }] })).toThrow("exact item");
        expect(state.db.grns).toHaveLength(0);
        expect(state.db.stockMovements).toHaveLength(0);
    });

    test("two partial receipts consume only remaining quantities and complete the PO", () => {
        const { state, input, po } = fixture();
        state.fileGRN(input);
        expect(() => state.fileGRN({ ...input, id: "too-many", items: [{ ...input.items![0], quantity: 7 }] })).toThrow("remaining PO quantity (6)");
        state.fileGRN({ ...input, id: "second", items: [
            { ...po.items[0], id: "received-a", source_item_id: "po-line-a", quantity: 10 },
            { ...input.items![0], quantity: 6 },
        ] });
        expect(state.db.purchaseOrders[0].status).toBe("received");
        expect(state.db.stockMovements.reduce((sum: number, row: any) => sum + row.quantity, 0)).toBe(20);
        expect(receivedQuantities(po.id, state.db.grns)).toEqual({ "po-line-a": 10, "po-line-b": 10 });
    });

    test("retrying the same receipt queues its save without duplicate stock, links or audit", () => {
        const { state, input, commitState } = fixture();
        state.fileGRN(input);
        const before = structuredClone(state.db);
        const audits = state.logAudit.mock.calls.length;
        commitState.mockClear();
        expect(state.fileGRN(input)).toBe(input.id);
        expect(state.db).toEqual(before);
        expect(commitState).toHaveBeenCalledOnce();
        expect(state.logAudit).toHaveBeenCalledTimes(audits);
        expect(() => state.fileGRN({ ...input, inspection_status: "rejected" })).toThrow("different details");
    });

    test("unuploaded or wrong-PO evidence cannot file a receipt", () => {
        const { state, input } = fixture();
        const asset = state.db.master.fileAssets.find((row: any) => row.id === "asset-receiving");
        asset.sync_status = "pending";
        expect(() => state.fileGRN(input)).toThrow("finish uploading");
        asset.sync_status = "uploaded";
        state.db.entityFileAttachments.find((row: any) => row.id === "receiving").entity_id = "another-po";
        expect(() => state.fileGRN(input)).toThrow("this Purchase Order");
        expect(state.db.grns).toHaveLength(0);
    });

    test("staff submission reserves no stock; owner verification posts exactly once", () => {
        const { state, input, po } = fixture("Field Staff", true);
        state.fileGRN(input);
        expect(state.db.grns[0].status).toBe("pending_receipt_verification");
        expect(state.db.inventory).toHaveLength(0);
        expect(receivedQuantities(po.id, state.db.grns)).toEqual({});
        expect(state.triggerPaymentMilestone).not.toHaveBeenCalled();
        state.currentUser = () => ({ name: "Verifier", role: "Owner" });
        state.verifyGRNReceipt(input.id);
        expect(state.db.inventory).toHaveLength(1);
        expect(state.triggerPaymentMilestone).toHaveBeenCalledTimes(1);
        expect(() => state.verifyGRNReceipt(input.id)).toThrow("pending receipt verification");
        expect(state.db.stockMovements).toHaveLength(1);
    });

    test.each(["Owner", "Field Staff"])("%s rejection records evidence but never posts stock, bills or milestones", (role) => {
        const { state, input, po } = fixture(role, true);
        state.fileGRN({ ...input, inspection_status: "rejected", inspection_notes: "Broken on arrival" });
        if (role === "Field Staff") {
            state.currentUser = () => ({ name: "Verifier", role: "Owner" });
            state.verifyGRNReceipt(input.id);
        }
        expect(state.db.grns[0].status).toBe("mismatched");
        expect(state.db.purchaseOrders[0].status).toBe("sent");
        expect(state.db.inventory).toHaveLength(0);
        expect(state.db.stockMovements).toHaveLength(0);
        expect(state.triggerPaymentMilestone).not.toHaveBeenCalled();
        expect(receivedQuantities(po.id, state.db.grns)).toEqual({});
        expect(() => state.addVendorBill({ po_id: po.id, grn_id: input.id })).toThrow("verified and accepted");
        state.db.vendorBills.push({ id: "forged-bill", status: "draft", po_id: po.id, grn_id: input.id });
        expect(() => state.matchVendorBill("forged-bill", {})).toThrow("verified and accepted");
    });

    test("canonical receipt normalization never trusts caller material or rate overrides", () => {
        const { po, input } = fixture();
        const result = normalizeReceiptItems(po, [{ ...input.items![0], article_id: "wrong", unit_id: "wrong", rate: 1 }], {});
        expect(result[0]).toMatchObject({ article_id: po.items[1].article_id, unit_id: po.items[1].unit_id, rate: 250 });
    });

    test("the shared server validator rejects forged quantities and material changes", () => {
        const { state, input } = fixture();
        state.fileGRN(input);
        state.db.grns[0].items[0].quantity = 99;
        expect(validateBusinessData(state.db).some((issue: string) => issue.includes("remaining PO quantity"))).toBe(true);
        state.db.grns[0].items[0].quantity = 4;
        state.db.grns[0].items[0].rate = 1;
        expect(validateBusinessData(state.db).some((issue: string) => issue.includes("exact PO line"))).toBe(true);
    });

    test("the shared server validator rejects duplicate stock posting and missing evidence", () => {
        const { state, input } = fixture();
        state.fileGRN(input);
        state.db.stockMovements.push({ ...state.db.stockMovements[0], id: "duplicate-stock" });
        expect(validateBusinessData(state.db).some((issue: string) => issue.includes("exactly once"))).toBe(true);
        state.db.grns[0].receiving_proof_attachment_ids = [];
        expect(validateBusinessData(state.db).some((issue: string) => issue.includes("inspection outcome are required"))).toBe(true);
    });

    test("server rejects a field-staff forged verification, and attachment audit uses the real role", () => {
        const { state, input } = fixture("Field Staff");
        const before = structuredClone(state.db);
        state.fileGRN(input);
        const user: any = { userId: "user", email: "field@urban.test", name: "Actual receiver", role: "Field Staff", staffId: "staff-receiver" };
        const pending = state.db.grns[0];
        expect(() => assertWorkspaceMutationAllowed(user, [{ collection: "grns", upsert: [pending] }], before)).not.toThrow();
        expect(() => assertWorkspaceMutationAllowed(user, [{ collection: "grns", upsert: [{ ...pending, status: "received_pending_invoice_match" }] }], before)).toThrow("Only Owner or Operations Manager");
        expect(state.logAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: user.name, actor_role: user.role, action: expect.stringMatching(/^Attached existing Drive file/) }));
    });

    test("Finance may match a verified receipt but cannot rewrite its physical quantities", () => {
        const { state, input } = fixture();
        state.fileGRN(input);
        const user: any = { userId: "finance-user", email: "finance@urban.test", name: "Finance", role: "Finance" };
        const receipt = state.db.grns[0];
        expect(() => assertWorkspaceMutationAllowed(user, [
            { collection: "grns", upsert: [{ ...receipt, status: "matched", bill_id: "bill" }] },
            { collection: "vendorBills", upsert: [{ id: "bill", po_id: receipt.po_id, grn_id: receipt.id, status: "draft" }] },
        ], state.db)).not.toThrow();
        expect(() => assertWorkspaceMutationAllowed(user, [{ collection: "grns", upsert: [{ ...receipt, items: [] }] }], state.db)).toThrow("Only Owner or Operations Manager");
    });

    test("a real receiving action activates its payment and creates one linked chase", () => {
        const { state, input, po, ctx } = fixture("Owner", true);
        Object.assign(state, createFinanceSlice(ctx), createTasksSlice(ctx));
        const wo = state.db.workOrders.find((row: any) => row.id === po.work_order_id);
        state.db.followups = [];
        Object.assign(state.db.payments[0], { customer_id: wo.customer_id, work_required_id: wo.work_required_id, status: "pending", amount: 1000, received_amount: 0 });
        state.db.payments.push({ ...state.db.payments[0], id: "closed", status: "cancelled" });
        state.fileGRN(input);
        expect(state.db.payments[0].schedule_state).toBe("triggered");
        expect(state.db.payments[1].schedule_state).toBe("awaiting_event");
        expect(state.db.followups).toHaveLength(1);
        expect(state.db.followups[0]).toMatchObject({ payment_id: "milestone", customer_id: wo.customer_id, followup_type: "payment" });
        state.fileGRN(input);
        expect(state.db.followups).toHaveLength(1);
    });
});
