import type { LineItem, RDashDatabase } from "./types";
import { assertWorkOrderRelations, BusinessRuleError } from "./business-rules";

/** A dispatch consumes existing stock; material identity, units and value come from that stock. */
export function canonicalDispatchItems(db: RDashDatabase, workOrderId: string, siteId: string | undefined, items: LineItem[]) {
    const work = db.workOrders.find(row => row.id === workOrderId);
    if (!work) throw new BusinessRuleError("Dispatch requires an existing Work Order.");
    assertWorkOrderRelations(db, work, "Dispatch");
    if (siteId && siteId !== work.site_id) throw new BusinessRuleError("Dispatch Site and Work Order do not match.");
    if (!items.length) throw new BusinessRuleError("Dispatch requires at least one stock item.");
    const quantities = new Map<string, number>();
    return items.map(item => {
        const stock = db.inventory.find(row => row.id === item.source_item_id);
        if (!stock) throw new BusinessRuleError("Dispatch stock item was not found.");
        if (stock.work_order_id && stock.work_order_id !== work.id) throw new BusinessRuleError("Dispatch stock belongs to another Work Order.");
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new BusinessRuleError("Dispatch quantities must be positive.");
        const total = (quantities.get(stock.id) || 0) + item.quantity;
        if (total > stock.quantity + 0.000001) throw new BusinessRuleError("Dispatch exceeds available stock. Refresh the inventory and retry.");
        quantities.set(stock.id, total);
        return { ...item, title: stock.name, article_id: stock.article_id,
            work_required_article_id: stock.work_required_article_id, unit_id: stock.unit_id,
            unit_name: stock.unit_name, rate: stock.rate || 0,
            amount: Math.round(item.quantity * (stock.rate || 0) * 100) / 100,
            source_kind: "inventory" as const, source_item_id: stock.id };
    });
}

/** New events and their stock projections must commit together, including direct API writes. */
export function assertDispatchPostingChanges(before: RDashDatabase, after: RDashDatabase) {
    const existing = new Set(before.dispatches.map(row => row.id));
    for (const dispatch of after.dispatches.filter(row => existing.has(row.id))) {
        const original = before.dispatches.find(row => row.id === dispatch.id)!;
        if (dispatch.work_order_id !== original.work_order_id || dispatch.site_id !== original.site_id ||
            JSON.stringify(dispatch.items) !== JSON.stringify(original.items))
            throw new BusinessRuleError("Issued dispatch quantities and material history are locked.");
    }
    const consumed = new Map<string, number>();
    for (const dispatch of after.dispatches.filter(row => !existing.has(row.id))) {
        const canonical = canonicalDispatchItems(before, dispatch.work_order_id, dispatch.site_id, dispatch.items);
        const movements = after.stockMovements.filter(row => row.dispatch_id === dispatch.id);
        if (movements.length !== canonical.length) throw new BusinessRuleError("Dispatch must post each stock line exactly once.");
        const remaining = [...movements];
        canonical.forEach((item, index) => {
            const submitted = dispatch.items[index];
            if (submitted.article_id !== item.article_id || submitted.work_required_article_id !== item.work_required_article_id ||
                submitted.unit_id !== item.unit_id || submitted.rate !== item.rate || Math.abs(submitted.amount - item.amount) > 0.01)
                throw new BusinessRuleError("Dispatch material, unit and value must match its stock item.");
            const match = remaining.findIndex(row => row.type === "issue" && row.inventory_id === item.source_item_id &&
                row.article_id === item.article_id && row.work_required_article_id === item.work_required_article_id &&
                row.unit_id === item.unit_id && row.rate === item.rate && row.work_order_id === dispatch.work_order_id &&
                Math.abs(row.quantity + item.quantity) < 0.000001);
            if (match < 0) throw new BusinessRuleError("Dispatch stock movement must match its issued line.");
            remaining.splice(match, 1);
            consumed.set(item.source_item_id!, (consumed.get(item.source_item_id!) || 0) + item.quantity);
        });
    }
    for (const [id, quantity] of consumed) {
        const stock = before.inventory.find(row => row.id === id)!;
        const updated = after.inventory.find(row => row.id === id);
        if (quantity > stock.quantity + 0.000001 || !updated ||
            Math.abs(updated.quantity - (stock.quantity - quantity)) > 0.000001 ||
            Math.abs((updated.issued_qty || 0) - ((stock.issued_qty || 0) + quantity)) > 0.000001)
            throw new BusinessRuleError("Dispatch and available stock must update atomically without overdrawing inventory.");
    }
}
