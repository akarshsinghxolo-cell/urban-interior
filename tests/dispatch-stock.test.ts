import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { canonicalDispatchItems, assertDispatchPostingChanges } from "../src/lib/rdash/dispatch-stock";
import { createProcurementSlice } from "../src/lib/rdash/store/slices/procurement";
import type { LineItem } from "../src/lib/rdash/types";

function fixture() {
    const db = buildSeedDatabase();
    const stock = db.inventory[0], work = db.workOrders.find(row => row.id === stock.work_order_id)!;
    const line = { id: "dispatch-line", source_item_id: stock.id, quantity: 1, article_id: "forged", rate: 9999, amount: 9999 } as LineItem;
    const state: any = { db, currentUser: () => ({ name: "Actual issuer", role: "Owner" }), openThreadFor: vi.fn(() => "thread"), logAudit: vi.fn() };
    const commitState = (update: any) => Object.assign(state, typeof update === "function" ? update(state) : update);
    Object.assign(state, createProcurementSlice({ get: () => state, commitState, setBase: commitState, isNestedTransaction: () => true }));
    return { state, stock, work, line };
}

describe("dispatch consumes one canonical stock record", () => {
    test("takes material identity/unit/value from stock and commits the same issue movement once", () => {
        const { state, stock, work, line } = fixture();
        const before = structuredClone(state.db);
        const id = state.issueDispatch({ work_order_id: work.id, items: [line] });
        const dispatch = state.db.dispatches.find((row: any) => row.id === id);
        expect(dispatch).toMatchObject({ site_id: work.site_id, issued_by: "Actual issuer" });
        expect(dispatch.items[0]).toMatchObject({ article_id: stock.article_id, work_required_article_id: stock.work_required_article_id, unit_id: stock.unit_id, rate: stock.rate, amount: stock.rate });
        expect(state.db.inventory.find((row: any) => row.id === stock.id).quantity).toBe(stock.quantity - 1);
        expect(() => assertDispatchPostingChanges(before, state.db)).not.toThrow();
        const forged = structuredClone(state.db);
        forged.inventory.find((row: any) => row.id === stock.id).quantity = stock.quantity;
        expect(() => assertDispatchPostingChanges(before, forged)).toThrow("atomically");
    });
    test("rejects negative, missing, duplicate overdraw and cross-job sources before side effects", () => {
        const { state, stock, work, line } = fixture();
        for (const items of [[{ ...line, quantity: -1 }], [{ ...line, source_item_id: "missing" }],
            [{ ...line, quantity: stock.quantity }, { ...line, id: "duplicate", quantity: 1 }]]) {
            expect(() => state.issueDispatch({ work_order_id: work.id, items })).toThrow();
        }
        state.db.inventory[0].work_order_id = "another-job";
        expect(() => canonicalDispatchItems(state.db, work.id, work.site_id, [line])).toThrow("another Work Order");
        expect(state.openThreadFor).not.toHaveBeenCalled();
    });
    test("issued material history is immutable while acknowledgement remains allowed", () => {
        const { state } = fixture();
        const before = structuredClone(state.db), after = structuredClone(before);
        after.dispatches[0].status = "acknowledged";
        expect(() => assertDispatchPostingChanges(before, after)).not.toThrow();
        after.dispatches[0].items[0].quantity++;
        expect(() => assertDispatchPostingChanges(before, after)).toThrow("history are locked");
    });
});
