import type { FileAttachmentEntityType, ID, RDashDatabase } from "./types";
export type EntityOwnerKind = "customer" | "vendor" | "contractor" | "system";
const entityTypes: readonly FileAttachmentEntityType[] = [
    "customer", "site", "room", "workRequired", "quotation", "quotation_item",
    "workOrder", "boq", "boq_item", "purchase_order", "grn", "vendor_bill",
    "dispatch", "inventory", "drawing", "execution_log", "visit", "task",
    "followup", "payment", "invoice", "vendor", "vendor_rate", "contractor",
    "contractor_bid", "contractor_settlement", "commission", "blocked", "general",
];
export function isEntityContextType(value: unknown): value is FileAttachmentEntityType {
    return typeof value === "string" && (entityTypes as readonly string[]).includes(value);
}
export type EntityContext = {
    entityType: FileAttachmentEntityType;
    entityId: ID;
    customerId?: ID;
    siteId?: ID;
    areaId?: ID;
    workRequiredId?: ID;
    quotationId?: ID;
    workOrderId?: ID;
    purchaseOrderId?: ID;
    grnId?: ID;
    vendorId?: ID;
    contractorId?: ID;
    ownerKind: EntityOwnerKind;
    ownerId?: ID;
    driveBucket: string;
};
function missing(source: string, label: string, id: ID): never {
    throw new Error(`${source}: ${label} "${id}" does not exist.`);
}
function requireRow<T extends {
    id: ID;
}>(rows: T[], id: ID, label: string, source: string): T {
    const row = rows.find((item) => item.id === id);
    if (!row)
        missing(source, label, id);
    return row;
}
function ensureSameCustomer(source: string, expected: ID, actual: ID, label: string) {
    if (expected !== actual) {
        throw new Error(`${source}: ${label} belongs to Customer "${actual}", not Customer "${expected}".`);
    }
}
function customerContext(entityType: FileAttachmentEntityType, entityId: ID, customerId: ID, driveBucket: string, fields: Partial<EntityContext> = {}): EntityContext {
    return {
        entityType,
        entityId,
        customerId,
        ownerKind: "customer",
        ownerId: customerId,
        driveBucket,
        ...fields,
    };
}
function vendorContext(entityType: FileAttachmentEntityType, entityId: ID, vendorId: ID, driveBucket: string, fields: Partial<EntityContext> = {}): EntityContext {
    return {
        entityType,
        entityId,
        vendorId,
        ownerKind: "vendor",
        ownerId: vendorId,
        driveBucket,
        ...fields,
    };
}
function contractorContext(entityType: FileAttachmentEntityType, entityId: ID, contractorId: ID, driveBucket: string, fields: Partial<EntityContext> = {}): EntityContext {
    return {
        entityType,
        entityId,
        contractorId,
        ownerKind: "contractor",
        ownerId: contractorId,
        driveBucket,
        ...fields,
    };
}
function systemContext(entityType: FileAttachmentEntityType, entityId: ID): EntityContext {
    return { entityType, entityId, ownerKind: "system", ownerId: "general", driveBucket: "General" };
}
function siteContext(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, siteId: ID, driveBucket: string, fields: Partial<EntityContext> = {}, source = "Entity context"): EntityContext {
    const site = requireRow(db.sites, siteId, "Site", source);
    requireRow(db.customers, site.customer_id, "Customer", source);
    return customerContext(entityType, entityId, site.customer_id, driveBucket, { siteId: site.id, ...fields });
}
function workOrderContext(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, workOrderId: ID, driveBucket: string, fields: Partial<EntityContext> = {}, source = "Entity context"): EntityContext {
    const workOrder = requireRow(db.workOrders, workOrderId, "Work Order", source);
    const context = siteContext(db, entityType, entityId, workOrder.site_id, driveBucket, { workOrderId: workOrder.id, ...fields }, source);
    ensureSameCustomer(source, workOrder.customer_id, context.customerId!, "Work Order");
    return context;
}
function resolveCandidates(source: string, candidates: Array<{
    label: string;
    context?: EntityContext;
}>): EntityContext {
    const available = candidates.filter((item): item is {
        label: string;
        context: EntityContext;
    } => Boolean(item.context));
    const customerIds = Array.from(new Set(available.map((item) => item.context.customerId).filter(Boolean) as ID[]));
    if (customerIds.length > 1) {
        const detail = available.map((item) => `${item.label} → ${item.context.customerId}`).join(", ");
        throw new Error(`${source}: customer relationships conflict (${detail}).`);
    }
    const primary = available.find((item) => item.context.customerId) || available[0];
    if (!primary) {
        // FIX-ANALYSIS-001 #6: Previously silently fell back to a system
        // context when no candidate resolved to a customer. This affected
        // task, followup, visit, and blocked entities — files uploaded to
        // an unlinked entity landed in a generic "General" bucket with no
        // customer association, making them unfindable later. Now we throw
        // so the caller knows the entity must be linked before uploading.
        throw new Error(`${source}: entity has no linked Customer, Site, Work Order, or other parent. Link it to a parent entity before uploading files.`);
    }
    return primary.context;
}
function maybeContext(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID | undefined, source: string) {
    return entityId ? resolveEntityContext(db, entityType, entityId, source) : undefined;
}
export function resolveEntityContext(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, source = "Entity context"): EntityContext {
    switch (entityType) {
        case "general":
            return systemContext(entityType, entityId);
        case "customer": {
            requireRow(db.customers, entityId, "Customer", source);
            return customerContext(entityType, entityId, entityId, "Documents");
        }
        case "site":
            return siteContext(db, entityType, entityId, entityId, "Documents", {}, source);
        case "room": {
            const area = requireRow(db.areas, entityId, "Area", source);
            return siteContext(db, entityType, entityId, area.site_id, "Measurements", { areaId: area.id }, source);
        }
        case "workRequired": {
            const work = requireRow(db.workRequired, entityId, "Work Required", source);
            const context = siteContext(db, entityType, entityId, work.site_id, "Documents", { workRequiredId: work.id }, source);
            ensureSameCustomer(source, work.customer_id, context.customerId!, "Work Required");
            return context;
        }
        case "quotation": {
            const quotation = requireRow(db.quotations, entityId, "Quotation", source);
            const context = siteContext(db, entityType, entityId, quotation.site_id, "Quotations", { quotationId: quotation.id }, source);
            ensureSameCustomer(source, quotation.customer_id, context.customerId!, "Quotation");
            return context;
        }
        case "quotation_item": {
            const quotation = db.quotations.find((row) => (row.scope_lines || row.items || []).some((item) => item.id === entityId));
            if (!quotation)
                missing(source, "Quotation item", entityId);
            const context = siteContext(db, entityType, entityId, quotation.site_id, "Quotations", { quotationId: quotation.id }, source);
            ensureSameCustomer(source, quotation.customer_id, context.customerId!, "Quotation");
            return context;
        }
        case "workOrder":
            return workOrderContext(db, entityType, entityId, entityId, "Work Orders", {}, source);
        case "boq": {
            const boq = requireRow(db.boqs, entityId, "BOQ", source);
            return workOrderContext(db, entityType, entityId, boq.work_order_id, "BOQ", {}, source);
        }
        case "boq_item": {
            const boq = db.boqs.find((row) => row.items.some((item) => item.id === entityId));
            if (!boq)
                missing(source, "BOQ item", entityId);
            return workOrderContext(db, entityType, entityId, boq.work_order_id, "BOQ", {}, source);
        }
        case "purchase_order": {
            const po = requireRow(db.purchaseOrders, entityId, "Purchase Order", source);
            if (!po.work_order_id) throw new Error(`${source}: Purchase Order has no linked Work Order.`);
            const context = workOrderContext(db, entityType, entityId, po.work_order_id, "Procurement", { purchaseOrderId: po.id, vendorId: po.vendor_id }, source);
            if (po.site_id && context.siteId !== po.site_id)
                throw new Error(`${source}: Purchase Order Site does not match its Work Order.`);
            return context;
        }
        case "grn": {
            const grn = requireRow(db.grns, entityId, "GRN", source);
            if (!grn.work_order_id) throw new Error(`${source}: GRN has no linked Work Order.`);
            const context = workOrderContext(db, entityType, entityId, grn.work_order_id, "Delivery", { grnId: grn.id, purchaseOrderId: grn.po_id, vendorId: grn.vendor_id }, source);
            if (grn.site_id && context.siteId !== grn.site_id)
                throw new Error(`${source}: GRN Site does not match its Work Order.`);
            return context;
        }
        case "vendor_bill": {
            const bill = requireRow(db.vendorBills, entityId, "Vendor Bill", source);
            if (!bill.work_order_id) throw new Error(`${source}: Vendor Bill has no linked Work Order.`);
            const context = workOrderContext(db, entityType, entityId, bill.work_order_id, "Finance", { purchaseOrderId: bill.po_id, grnId: bill.grn_id, vendorId: bill.vendor_id }, source);
            if (bill.site_id && context.siteId !== bill.site_id)
                throw new Error(`${source}: Vendor Bill Site does not match its Work Order.`);
            return context;
        }
        case "dispatch": {
            const dispatch = requireRow(db.dispatches, entityId, "Dispatch", source);
            const context = workOrderContext(db, entityType, entityId, dispatch.work_order_id, "Dispatch", {}, source);
            if (dispatch.site_id && context.siteId !== dispatch.site_id)
                throw new Error(`${source}: Dispatch Site does not match its Work Order.`);
            return context;
        }
        case "inventory": {
            const inventory = requireRow(db.inventory, entityId, "Inventory", source);
            if (!inventory.work_order_id)
                throw new Error(`${source}: Inventory item needs a Work Order before upload.`);
            return workOrderContext(db, entityType, entityId, inventory.work_order_id, "Inventory", {}, source);
        }
        case "drawing": {
            const drawing = requireRow(db.drawings, entityId, "Drawing", source);
            if (drawing.work_order_id) {
                const context = workOrderContext(db, entityType, entityId, drawing.work_order_id, "Drawings", { areaId: drawing.area_id }, source);
                if (drawing.site_id && context.siteId !== drawing.site_id)
                    throw new Error(`${source}: Drawing Site does not match its Work Order.`);
                return context;
            }
            if (drawing.site_id)
                return siteContext(db, entityType, entityId, drawing.site_id, "Drawings", { areaId: drawing.area_id }, source);
            // FIX-ANALYSIS-001 #6: Previously silently fell back to a system
            // context when a drawing had no site_id or work_order_id. This
            // masked missing business context — files uploaded to an unlinked
            // drawing landed in a generic "Drawings" bucket with no customer
            // association, making them unfindable later. Now we throw so the
            // caller knows the drawing must be linked before uploading.
            throw new Error(`${source}: Drawing "${entityId}" has no linked Site or Work Order. Link it to a Site or Work Order before uploading files.`);
        }
        case "execution_log": {
            const log = requireRow(db.executionLogs, entityId, "Execution Log", source);
            const context = workOrderContext(db, entityType, entityId, log.work_order_id, "Execution", {}, source);
            if (log.site_id && context.siteId !== log.site_id)
                throw new Error(`${source}: Execution Log Site does not match its Work Order.`);
            return context;
        }
        case "visit": {
            const visit = requireRow(db.visits, entityId, "Visit", source);
            const bySite = maybeContext(db, "site", visit.site_id, source);
            const byWorkOrder = maybeContext(db, "workOrder", visit.work_order_id, source);
            const byWorkRequired = maybeContext(db, "workRequired", visit.work_required_id, source);
            const context = resolveCandidates(source, [{ label: "visit Site", context: bySite }, { label: "visit Work Order", context: byWorkOrder }, { label: "visit Work Required", context: byWorkRequired }]);
            if (!context.customerId)
                throw new Error(`${source}: Visit must be linked to a Site, Work Required, or Work Order before evidence can be uploaded.`);
            ensureSameCustomer(source, visit.customer_id, context.customerId, "Visit");
            return { ...context, entityType, entityId, driveBucket: "Visits", workRequiredId: visit.work_required_id || context.workRequiredId, workOrderId: visit.work_order_id || context.workOrderId, siteId: visit.site_id || context.siteId };
        }
        case "task": {
            const task = requireRow(db.tasks, entityId, "Task", source);
            const context = resolveCandidates(source, [
                { label: "task customer", context: task.customer_id ? (requireRow(db.customers, task.customer_id, "Customer", source), customerContext(entityType, entityId, task.customer_id, "Tasks")) : undefined },
                { label: "task Site", context: maybeContext(db, "site", task.site_id, source) },
                { label: "task Work Required", context: maybeContext(db, "workRequired", task.work_required_id, source) },
                { label: "task quotation", context: maybeContext(db, "quotation", task.quotation_id, source) },
                { label: "task Work Order", context: maybeContext(db, "workOrder", task.work_order_id, source) },
                { label: "task PO", context: maybeContext(db, "purchase_order", task.po_id, source) },
                { label: "task Visit", context: maybeContext(db, "visit", task.visit_id, source) },
            ]);
            return { ...context, entityType, entityId, driveBucket: "Tasks", workRequiredId: task.work_required_id || context.workRequiredId, quotationId: task.quotation_id || context.quotationId, workOrderId: task.work_order_id || context.workOrderId, purchaseOrderId: task.po_id || context.purchaseOrderId, siteId: task.site_id || context.siteId };
        }
        case "followup": {
            const followup = requireRow(db.followups, entityId, "Follow-up", source);
            const context = resolveCandidates(source, [
                { label: "follow-up customer", context: followup.customer_id ? (requireRow(db.customers, followup.customer_id, "Customer", source), customerContext(entityType, entityId, followup.customer_id, "Follow-ups")) : undefined },
                { label: "follow-up Work Required", context: maybeContext(db, "workRequired", followup.work_required_id, source) },
                { label: "follow-up quotation", context: maybeContext(db, "quotation", followup.quotation_id, source) },
                { label: "follow-up payment", context: maybeContext(db, "payment", followup.payment_id, source) },
                { label: "follow-up visit", context: maybeContext(db, "visit", followup.visit_id, source) },
            ]);
            return { ...context, entityType, entityId, driveBucket: "Follow-ups", workRequiredId: followup.work_required_id || context.workRequiredId, quotationId: followup.quotation_id || context.quotationId };
        }
        case "payment": {
            const payment = requireRow(db.payments, entityId, "Payment", source);
            if (payment.site_id) {
                const context = siteContext(db, entityType, entityId, payment.site_id, "Finance", { workRequiredId: payment.work_required_id, quotationId: payment.quotation_id, workOrderId: payment.work_order_id }, source);
                ensureSameCustomer(source, payment.customer_id, context.customerId!, "Payment");
                return context;
            }
            requireRow(db.customers, payment.customer_id, "Customer", source);
            return customerContext(entityType, entityId, payment.customer_id, "Finance", { workRequiredId: payment.work_required_id, quotationId: payment.quotation_id, workOrderId: payment.work_order_id });
        }
        case "invoice": {
            const invoice = requireRow(db.invoices, entityId, "Invoice", source);
            if (invoice.site_id) {
                const context = siteContext(db, entityType, entityId, invoice.site_id, "Finance", { workRequiredId: invoice.work_required_id, quotationId: invoice.quotation_id, workOrderId: invoice.work_order_id }, source);
                ensureSameCustomer(source, invoice.customer_id, context.customerId!, "Invoice");
                return context;
            }
            requireRow(db.customers, invoice.customer_id, "Customer", source);
            return customerContext(entityType, entityId, invoice.customer_id, "Finance", { workRequiredId: invoice.work_required_id, quotationId: invoice.quotation_id, workOrderId: invoice.work_order_id });
        }
        case "vendor": {
            const vendor = requireRow(db.master.vendors, entityId, "Vendor", source);
            return vendorContext(entityType, entityId, vendor.id, "Documents");
        }
        case "vendor_rate": {
            const rate = requireRow(db.master.vendorRates, entityId, "Vendor rate", source);
            return vendorContext(entityType, entityId, rate.vendor_id, "Rates");
        }
        case "contractor": {
            const contractor = requireRow(db.master.contractors, entityId, "Contractor", source);
            return contractorContext(entityType, entityId, contractor.id, "Documents");
        }
        case "contractor_bid": {
            const bid = requireRow(db.contractorBids, entityId, "Contractor Bid", source);
            if (bid.work_order_id)
                return { ...workOrderContext(db, entityType, entityId, bid.work_order_id, "Contractor Bids", { contractorId: bid.contractor_id }, source), contractorId: bid.contractor_id };
            if (bid.site_id)
                return { ...siteContext(db, entityType, entityId, bid.site_id, "Contractor Bids", { contractorId: bid.contractor_id }, source), contractorId: bid.contractor_id };
            return contractorContext(entityType, entityId, bid.contractor_id, "Bids");
        }
        case "contractor_settlement": {
            const settlement = requireRow(db.contractorSettlements, entityId, "Contractor Settlement", source);
            return { ...workOrderContext(db, entityType, entityId, settlement.work_order_id, "Settlements", { contractorId: settlement.contractor_id }, source), contractorId: settlement.contractor_id };
        }
        case "commission": {
            const commission = requireRow(db.commissions, entityId, "Commission", source);
            if (commission.work_order_id)
                return workOrderContext(db, entityType, entityId, commission.work_order_id, "Commissions", { quotationId: commission.quotation_id }, source);
            if (commission.site_id)
                return siteContext(db, entityType, entityId, commission.site_id, "Commissions", { quotationId: commission.quotation_id }, source);
            if (commission.customer_id) {
                requireRow(db.customers, commission.customer_id, "Customer", source);
                return customerContext(entityType, entityId, commission.customer_id, "Commissions", { quotationId: commission.quotation_id });
            }
            throw new Error(`${source}: Commission needs a Customer, Site, or Work Order before upload.`);
        }
        case "blocked": {
            const blocked = requireRow(db.blocked, entityId, "Obstacle", source);
            const context = resolveCandidates(source, [
                { label: "obstacle customer", context: blocked.customer_id ? (requireRow(db.customers, blocked.customer_id, "Customer", source), customerContext(entityType, entityId, blocked.customer_id, "Obstacles")) : undefined },
                { label: "obstacle task", context: maybeContext(db, "task", blocked.linked_task_id, source) },
                { label: "obstacle Work Order", context: maybeContext(db, "workOrder", blocked.linked_work_order_id, source) },
                { label: "obstacle PO", context: maybeContext(db, "purchase_order", blocked.linked_po_id, source) },
                { label: "obstacle GRN", context: maybeContext(db, "grn", blocked.linked_grn_id, source) },
            ]);
            if (!context.customerId)
                throw new Error(`${source}: Obstacle needs a Customer, Task, Work Order, Purchase Order, or GRN before proof upload.`);
            return { ...context, entityType, entityId, driveBucket: "Obstacles" };
        }
        default:
            throw new Error(`${source}: unsupported entity type "${String(entityType)}".`);
    }
}
