import type { FileAttachmentEntityType, ID, RDashDatabase } from "./types";
export type EntityOwnerKind = "customer" | "vendor" | "contractor" | "system";
const entityTypes: readonly FileAttachmentEntityType[] = [
    "customer", "site", "room", "workRequired", "measurement_revision", "quotation", "quotation_item", "accepted_scope",
    "workOrder", "boq", "boq_item", "variation_request", "vendor_rfq", "vendor_bid", "purchase_order", "grn", "stock_movement", "vendor_bill", "vendor_payment",
    "dispatch", "inventory", "drawing", "execution_log", "visit", "task",
    "followup", "payment", "invoice", "customer_receipt", "vendor", "vendor_rate", "contractor",
    "contractor_bid", "contractor_bill", "contractor_payment", "contractor_settlement", "commission", "blocked", "thread_message", "communication", "general",
];
export function isEntityContextType(value: unknown): value is FileAttachmentEntityType {
    return typeof value === "string" && (entityTypes as readonly string[]).includes(value);
}

/** Resolve a stable human-readable label for a file attachment target.
 * Keep this shared between client-side file linking and server-side direct uploads
 * so both paths produce the same contextual attachment metadata.
 */
export function resolveAttachmentEntityLabel(db: RDashDatabase, type: FileAttachmentEntityType, id: ID): string {
    if (type === "quotation_item") {
        const item = db.quotations.flatMap((row) => [...(row.scope_lines || []), ...(row.items || [])]).find((row) => row.id === id);
        return item?.title || `Quotation item · ${id}`;
    }
    if (type === "boq_item") {
        const item = db.boqs.flatMap((row) => row.items || []).find((row) => row.id === id);
        return item?.title || `BOQ item · ${id}`;
    }
    if (type === "measurement_revision") {
        const row = db.measurementRevisions.find((item) => item.id === id);
        return row ? `Measurement revision ${row.revision_no}` : `measurement revision · ${id}`;
    }
    if (type === "vendor_bid") {
        const row = db.vendorBids.find((item) => item.id === id);
        const rfq = row && db.vendorRfqs.find((item) => item.id === row.rfq_id);
        return row ? `${row.vendor_name} · ${rfq?.rfq_no || "Vendor bid"}` : `vendor bid · ${id}`;
    }
    if (type === "variation_request") {
        const row = db.variationRequests.find((item) => item.id === id);
        return row?.variation_no || `variation request · ${id}`;
    }
    if (type === "vendor_payment") {
        const row = db.vendorPayments.find((item) => item.id === id);
        return row?.payment_no || `vendor payment · ${id}`;
    }
    if (type === "contractor_bill") {
        const row = db.contractorBills.find((item) => item.id === id);
        return row?.bill_no || `contractor bill · ${id}`;
    }
    if (type === "contractor_payment") {
        const row = db.contractorPayments.find((item) => item.id === id);
        return row?.payment_no || `contractor payment · ${id}`;
    }
    if (type === "customer_receipt") {
        const row = db.customerReceipts.find((item) => item.id === id);
        return row?.receipt_no || `customer receipt · ${id}`;
    }
    if (type === "thread_message") {
        const message = db.threads.flatMap((thread) => thread.messages || []).find((item) => item.id === id);
        return message ? `${message.author_name} · Thread message` : `thread message · ${id}`;
    }
    if (type === "vendor_rate") {
        const rate = db.master.vendorRates.find((item) => item.id === id);
        const vendor = rate && db.master.vendors.find((item) => item.id === rate.vendor_id);
        const article = rate && db.master.articles.find((item) => item.id === rate.article_id);
        return rate ? `${vendor?.name || "Vendor"} · ${article?.name || rate.article_id}` : `vendor rate · ${id}`;
    }
    type LabelRow = { id: ID; [key: string]: unknown };
    const rows = <T extends { id: ID }>(value: T[]): LabelRow[] => value as unknown as LabelRow[];
    const lookup: Record<string, LabelRow[]> = {
        customer: rows(db.customers),
        site: rows(db.sites),
        room: rows(db.areas),
        workRequired: rows(db.workRequired),
        measurement_revision: rows(db.measurementRevisions),
        quotation: rows(db.quotations),
        accepted_scope: rows(db.acceptedScopes),
        workOrder: rows(db.workOrders),
        boq: rows(db.boqs),
        variation_request: rows(db.variationRequests),
        vendor_rfq: rows(db.vendorRfqs),
        vendor_bid: rows(db.vendorBids),
        purchase_order: rows(db.purchaseOrders),
        grn: rows(db.grns),
        stock_movement: rows(db.stockMovements),
        vendor_bill: rows(db.vendorBills),
        vendor_payment: rows(db.vendorPayments),
        dispatch: rows(db.dispatches),
        inventory: rows(db.inventory),
        drawing: rows(db.drawings),
        execution_log: rows(db.executionLogs),
        visit: rows(db.visits),
        task: rows(db.tasks),
        followup: rows(db.followups),
        payment: rows(db.payments),
        invoice: rows(db.invoices),
        customer_receipt: rows(db.customerReceipts),
        vendor: rows(db.master.vendors),
        contractor: rows(db.master.contractors),
        contractor_bid: rows(db.contractorBids),
        contractor_bill: rows(db.contractorBills),
        contractor_payment: rows(db.contractorPayments),
        contractor_settlement: rows(db.contractorSettlements),
        communication: rows(db.commSends),
        commission: rows(db.commissions),
        blocked: rows(db.blocked),
    };
    const row = lookup[type]?.find((item) => item.id === id);
    if (!row) return `${type.replace(/_/g, " ")} · ${id}`;

    // Use the owner's own business identifier before any related-record fields
    // carried on the row (for example a PO also carries work_order_no).
    const ownLabelField: Partial<Record<FileAttachmentEntityType, string>> = {
        customer: "name",
        site: "name",
        room: "name",
        workRequired: "title",
        quotation: "quotation_no",
        workOrder: "work_order_no",
        boq: "boq_no",
        vendor_rfq: "rfq_no",
        purchase_order: "po_no",
        grn: "grn_no",
        vendor_bill: "bill_no",
        dispatch: "dispatch_no",
        inventory: "name",
        drawing: "drawing_no",
        execution_log: "log_no",
        visit: "location_name",
        task: "title",
        followup: "subject",
        payment: "milestone_label",
        invoice: "invoice_no",
        vendor: "name",
        contractor: "name",
        contractor_bid: "bid_no",
        contractor_settlement: "settlement_no",
        communication: "subject",
        commission: "commission_no",
        blocked: "title",
    };
    const ownLabelKey = ownLabelField[type];
    const ownLabel = ownLabelKey ? row[ownLabelKey] : undefined;
    if (ownLabel) return String(ownLabel);

    return String(
        row.name ||
        row.title ||
        row.label ||
        row.subject ||
        row.invoice_no ||
        row.receipt_no ||
        row.payment_no ||
        row.rfq_no ||
        row.variation_no ||
        row.settlement_no ||
        row.commission_no ||
        row.bid_no ||
        row.quotation_no ||
        row.work_order_no ||
        row.po_no ||
        row.grn_no ||
        row.bill_no ||
        row.dispatch_no ||
        row.drawing_no ||
        row.log_no ||
        row.location_name ||
        row.customer_name ||
        row.vendor_name ||
        row.contractor_name ||
        id
    );
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
    // Prefer the most specific context for the same customer so a record linked
    // to a Work Order/PO/GRN keeps that operational path instead of collapsing
    // to a broader Customer-only context just because it was listed first.
    const specificity = (context: EntityContext) =>
        (context.workOrderId ? 32 : 0) +
        (context.purchaseOrderId ? 16 : 0) +
        (context.grnId ? 8 : 0) +
        (context.quotationId ? 4 : 0) +
        (context.workRequiredId ? 2 : 0) +
        (context.siteId ? 1 : 0);
    const customerContexts = available.filter((item) => item.context.customerId);
    const primary = (customerContexts.length ? customerContexts : available)
        .reduce<typeof available[number] | undefined>((best, item) =>
            !best || specificity(item.context) > specificity(best.context) ? item : best, undefined);
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
export function resolveThreadRecordEntityType(db: RDashDatabase, recordType: string, recordId: ID): FileAttachmentEntityType | undefined {
    const has = <T extends { id: ID }>(rows: T[]) => rows.some((row) => row.id === recordId);
    if (recordType === "quotation" && has(db.quotations)) return "quotation";
    if (recordType === "workOrder" && has(db.workOrders)) return "workOrder";
    if (recordType === "workRequired" && has(db.workRequired)) return "workRequired";
    if (recordType === "task" && has(db.tasks)) return "task";
    if (recordType === "followup" && has(db.followups)) return "followup";
    if (recordType === "visit" && has(db.visits)) return "visit";
    if (recordType === "payment" && has(db.payments)) return "payment";
    if (recordType === "invoice" && has(db.invoices)) return "invoice";
    if (recordType === "vendor_bill") return has(db.vendorBills) ? "vendor_bill" : has(db.vendorPayments) ? "vendor_payment" : undefined;
    if (recordType === "inventory" && has(db.inventory)) return "inventory";
    if (recordType === "po") return has(db.purchaseOrders) ? "purchase_order" : has(db.vendorRfqs) ? "vendor_rfq" : has(db.vendorBids) ? "vendor_bid" : undefined;
    if (recordType === "grn" && has(db.grns)) return "grn";
    if (recordType === "dispatch" && has(db.dispatches)) return "dispatch";
    if (recordType === "blocked" && has(db.blocked)) return "blocked";
    if (recordType === "commission" && has(db.commissions)) return "commission";
    if (recordType === "site" && has(db.sites)) return "site";
    if (recordType === "drawing" && has(db.drawings)) return "drawing";
    if (recordType === "execution_log" && has(db.executionLogs)) return "execution_log";
    if (recordType === "settlement" && has(db.contractorSettlements)) return "contractor_settlement";
    if (recordType === "bid") return has(db.contractorBids) ? "contractor_bid" : has(db.contractorBills) ? "contractor_bill" : has(db.contractorPayments) ? "contractor_payment" : undefined;
    if (recordType === "generic") {
        const candidates: Array<[FileAttachmentEntityType, Array<{ id: ID }>]> = [
            ["customer", db.customers], ["room", db.areas], ["measurement_revision", db.measurementRevisions], ["accepted_scope", db.acceptedScopes], ["boq", db.boqs],
            ["variation_request", db.variationRequests], ["vendor_rfq", db.vendorRfqs], ["vendor_bid", db.vendorBids], ["stock_movement", db.stockMovements],
            ["customer_receipt", db.customerReceipts], ["vendor", db.master.vendors], ["vendor_rate", db.master.vendorRates], ["contractor", db.master.contractors],
        ];
        return candidates.find(([, rows]) => rows.some((row) => row.id === recordId))?.[0];
    }
    return undefined;
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
        case "measurement_revision": {
            const measurement = requireRow(db.measurementRevisions, entityId, "Measurement Revision", source);
            const area = requireRow(db.areas, measurement.area_id, "Area", source);
            if (area.site_id !== measurement.site_id) throw new Error(`${source}: Measurement Revision Area does not belong to its Site.`);
            const context = siteContext(db, entityType, entityId, measurement.site_id, "Measurements", { areaId: measurement.area_id, workRequiredId: measurement.work_required_id }, source);
            if (measurement.work_required_id) {
                const work = requireRow(db.workRequired, measurement.work_required_id, "Work Required", source);
                if (work.site_id !== measurement.site_id || work.customer_id !== context.customerId) throw new Error(`${source}: Measurement Revision Work Required does not match its Site/Customer.`);
            }
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
        case "accepted_scope": {
            const scope = requireRow(db.acceptedScopes, entityId, "Accepted Scope", source);
            const quotation = requireRow(db.quotations, scope.quotation_id, "Quotation", source);
            const work = requireRow(db.workRequired, scope.work_required_id, "Work Required", source);
            const context = siteContext(db, entityType, entityId, scope.site_id, "Quotations", { quotationId: scope.quotation_id, workRequiredId: scope.work_required_id }, source);
            ensureSameCustomer(source, scope.customer_id, context.customerId!, "Accepted Scope");
            if (quotation.site_id !== scope.site_id || quotation.customer_id !== scope.customer_id) throw new Error(`${source}: Accepted Scope Quotation does not match its Site/Customer.`);
            if (work.site_id !== scope.site_id || work.customer_id !== scope.customer_id) throw new Error(`${source}: Accepted Scope Work Required does not match its Site/Customer.`);
            if (scope.work_order_id) {
                const workOrder = workOrderContext(db, entityType, entityId, scope.work_order_id, "Work Orders", {}, source);
                if (workOrder.siteId !== scope.site_id || workOrder.customerId !== scope.customer_id) throw new Error(`${source}: Accepted Scope Work Order does not match its Site/Customer.`);
            }
            return { ...context, workOrderId: scope.work_order_id };
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
        case "variation_request": {
            const variation = requireRow(db.variationRequests, entityId, "Variation Request", source);
            const context = workOrderContext(db, entityType, entityId, variation.work_order_id, "Variations", {}, source);
            ensureSameCustomer(source, variation.customer_id, context.customerId!, "Variation Request");
            if (context.siteId !== variation.site_id) throw new Error(`${source}: Variation Request Site does not match its Work Order.`);
            return context;
        }
        case "vendor_rfq": {
            const rfq = requireRow(db.vendorRfqs, entityId, "Vendor RFQ", source);
            const context = workOrderContext(db, entityType, entityId, rfq.work_order_id, "Procurement", {}, source);
            if (context.siteId !== rfq.site_id) throw new Error(`${source}: Vendor RFQ Site does not match its Work Order.`);
            const boq = requireRow(db.boqs, rfq.boq_id, "BOQ", source);
            if (boq.work_order_id !== rfq.work_order_id) throw new Error(`${source}: Vendor RFQ BOQ does not match its Work Order.`);
            return context;
        }
        case "vendor_bid": {
            const bid = requireRow(db.vendorBids, entityId, "Vendor Bid", source);
            const rfq = requireRow(db.vendorRfqs, bid.rfq_id, "Vendor RFQ", source);
            requireRow(db.master.vendors, bid.vendor_id, "Vendor", source);
            if (!rfq.vendor_ids.includes(bid.vendor_id)) throw new Error(`${source}: Vendor Bid Vendor is not part of its RFQ.`);
            const context = resolveEntityContext(db, "vendor_rfq", rfq.id, source);
            return { ...context, entityType, entityId, vendorId: bid.vendor_id };
        }
        case "purchase_order": {
            const po = requireRow(db.purchaseOrders, entityId, "Purchase Order", source);
            requireRow(db.master.vendors, po.vendor_id, "Vendor", source);
            if (po.work_order_id) {
                const context = workOrderContext(db, entityType, entityId, po.work_order_id, "Procurement", { purchaseOrderId: po.id, vendorId: po.vendor_id }, source);
                if (po.site_id && context.siteId !== po.site_id)
                    throw new Error(`${source}: Purchase Order Site does not match its Work Order.`);
                return context;
            }
            // General/stock procurement is intentionally allowed without a
            // project Work Order. Preserve Site context when one was supplied;
            // otherwise the Vendor is the nearest real business owner.
            if (po.site_id)
                return siteContext(db, entityType, entityId, po.site_id, "Procurement", { purchaseOrderId: po.id, vendorId: po.vendor_id }, source);
            return vendorContext(entityType, entityId, po.vendor_id, "Procurement", { purchaseOrderId: po.id });
        }
        case "grn": {
            const grn = requireRow(db.grns, entityId, "GRN", source);
            const po = requireRow(db.purchaseOrders, grn.po_id, "Purchase Order", source);
            if (po.vendor_id !== grn.vendor_id) throw new Error(`${source}: GRN Vendor does not match its Purchase Order.`);
            if (grn.work_order_id !== po.work_order_id) throw new Error(`${source}: GRN Work Order does not match its Purchase Order.`);
            if (grn.site_id !== po.site_id) throw new Error(`${source}: GRN Site does not match its Purchase Order.`);
            const context = resolveEntityContext(db, "purchase_order", po.id, source);
            return { ...context, entityType, entityId, grnId: grn.id, purchaseOrderId: po.id, vendorId: grn.vendor_id, driveBucket: "Delivery" };
        }
        case "stock_movement": {
            const movement = requireRow(db.stockMovements, entityId, "Stock Movement", source);
            const inventory = requireRow(db.inventory, movement.inventory_id, "Inventory", source);
            const effectiveWorkOrderId = movement.work_order_id || inventory.work_order_id;
            if (movement.work_order_id && inventory.work_order_id && movement.work_order_id !== inventory.work_order_id) throw new Error(`${source}: Stock Movement Work Order does not match its Inventory item.`);
            const assertLinkedWorkOrder = (linkedWorkOrderId: ID | undefined, label: string) => {
                if (effectiveWorkOrderId && linkedWorkOrderId && effectiveWorkOrderId !== linkedWorkOrderId) {
                    throw new Error(`${source}: Stock Movement ${label} belongs to a different Work Order.`);
                }
            };
            if (movement.po_id) {
                const po = requireRow(db.purchaseOrders, movement.po_id, "Purchase Order", source);
                assertLinkedWorkOrder(po.work_order_id, "Purchase Order");
            }
            if (movement.grn_id) {
                const grn = requireRow(db.grns, movement.grn_id, "GRN", source);
                assertLinkedWorkOrder(grn.work_order_id, "GRN");
            }
            if (movement.dispatch_id) {
                const dispatch = requireRow(db.dispatches, movement.dispatch_id, "Dispatch", source);
                assertLinkedWorkOrder(dispatch.work_order_id, "Dispatch");
            }
            if (movement.work_order_id) return workOrderContext(db, entityType, entityId, movement.work_order_id, "Inventory", {}, source);
            if (movement.grn_id) return { ...resolveEntityContext(db, "grn", movement.grn_id, source), entityType, entityId, driveBucket: "Inventory" };
            if (movement.dispatch_id) return { ...resolveEntityContext(db, "dispatch", movement.dispatch_id, source), entityType, entityId, driveBucket: "Inventory" };
            if (movement.po_id) return { ...resolveEntityContext(db, "purchase_order", movement.po_id, source), entityType, entityId, driveBucket: "Inventory" };
            return { ...resolveEntityContext(db, "inventory", movement.inventory_id, source), entityType, entityId, driveBucket: "Inventory" };
        }
        case "vendor_bill": {
            const bill = requireRow(db.vendorBills, entityId, "Vendor Bill", source);
            const po = requireRow(db.purchaseOrders, bill.po_id, "Purchase Order", source);
            const grn = requireRow(db.grns, bill.grn_id, "GRN", source);
            requireRow(db.master.vendors, bill.vendor_id, "Vendor", source);
            if (grn.po_id !== po.id) throw new Error(`${source}: Vendor Bill GRN does not belong to its Purchase Order.`);
            if (po.vendor_id !== bill.vendor_id || grn.vendor_id !== bill.vendor_id) throw new Error(`${source}: Vendor Bill Vendor does not match its PO/GRN.`);
            if (bill.work_order_id !== po.work_order_id || bill.work_order_id !== grn.work_order_id) throw new Error(`${source}: Vendor Bill Work Order does not match its PO/GRN.`);
            if (bill.site_id !== po.site_id) throw new Error(`${source}: Vendor Bill Site does not match its Purchase Order.`);
            if (bill.site_id !== grn.site_id) throw new Error(`${source}: Vendor Bill Site does not match its GRN.`);
            const context = resolveEntityContext(db, "grn", grn.id, source);
            return { ...context, entityType, entityId, purchaseOrderId: po.id, grnId: grn.id, vendorId: bill.vendor_id, driveBucket: "Finance" };
        }
        case "vendor_payment": {
            const payment = requireRow(db.vendorPayments, entityId, "Vendor Payment", source);
            const bill = requireRow(db.vendorBills, payment.vendor_bill_id, "Vendor Bill", source);
            requireRow(db.master.vendors, payment.vendor_id, "Vendor", source);
            if (bill.vendor_id !== payment.vendor_id || bill.work_order_id !== payment.work_order_id || bill.site_id !== payment.site_id) throw new Error(`${source}: Vendor Payment does not match its Vendor Bill.`);
            const billContext = resolveEntityContext(db, "vendor_bill", bill.id, source);
            if (billContext.siteId !== payment.site_id) throw new Error(`${source}: Vendor Payment Site does not match its Vendor Bill/Work Order.`);
            return { ...billContext, entityType, entityId, vendorId: payment.vendor_id, driveBucket: "Finance" };
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
            if (inventory.work_order_id)
                return workOrderContext(db, entityType, entityId, inventory.work_order_id, "Inventory", {}, source);
            if (inventory.grn_id) {
                const context = resolveEntityContext(db, "grn", inventory.grn_id, source);
                return { ...context, entityType, entityId, driveBucket: "Inventory" };
            }
            // Shop/warehouse stock is a valid inventory record even when it is
            // not allocated to a customer project. Route it through the shared
            // Inventory hierarchy rather than inventing a Work Order.
            return { entityType, entityId, ownerKind: "system", ownerId: "inventory", driveBucket: "Inventory" };
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
                { label: "task payment", context: maybeContext(db, "payment", task.payment_id, source) },
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
        case "customer_receipt": {
            const receipt = requireRow(db.customerReceipts, entityId, "Customer Receipt", source);
            const context = resolveEntityContext(db, "invoice", receipt.invoice_id, source);
            ensureSameCustomer(source, receipt.customer_id, context.customerId!, "Customer Receipt");
            if (receipt.site_id && context.siteId && receipt.site_id !== context.siteId)
                throw new Error(`${source}: Customer Receipt Site does not match its Invoice.`);
            if (receipt.payment_id) {
                const payment = requireRow(db.payments, receipt.payment_id, "Payment", source);
                const paymentContext = resolveEntityContext(db, "payment", payment.id, source);
                ensureSameCustomer(source, receipt.customer_id, paymentContext.customerId!, "Customer Receipt Payment");
                if (payment.invoice_id && payment.invoice_id !== receipt.invoice_id)
                    throw new Error(`${source}: Customer Receipt Payment belongs to a different Invoice.`);
                if (context.siteId && paymentContext.siteId && context.siteId !== paymentContext.siteId)
                    throw new Error(`${source}: Customer Receipt Payment and Invoice belong to different Sites.`);
            }
            return { ...context, entityType, entityId, driveBucket: "Finance" };
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
        case "contractor_bill": {
            const bill = requireRow(db.contractorBills, entityId, "Contractor Bill", source);
            requireRow(db.master.contractors, bill.contractor_id, "Contractor", source);
            const context = workOrderContext(db, entityType, entityId, bill.work_order_id, "Contractor Bills", { contractorId: bill.contractor_id, workRequiredId: bill.work_required_id }, source);
            ensureSameCustomer(source, bill.customer_id, context.customerId!, "Contractor Bill");
            if (context.siteId !== bill.site_id) throw new Error(`${source}: Contractor Bill Site does not match its Work Order.`);
            return { ...context, contractorId: bill.contractor_id };
        }
        case "contractor_payment": {
            const payment = requireRow(db.contractorPayments, entityId, "Contractor Payment", source);
            const bill = requireRow(db.contractorBills, payment.contractor_bill_id, "Contractor Bill", source);
            requireRow(db.master.contractors, payment.contractor_id, "Contractor", source);
            if (bill.contractor_id !== payment.contractor_id || bill.work_order_id !== payment.work_order_id || bill.site_id !== payment.site_id) throw new Error(`${source}: Contractor Payment does not match its Contractor Bill.`);
            const billContext = resolveEntityContext(db, "contractor_bill", bill.id, source);
            return { ...billContext, entityType, entityId, contractorId: payment.contractor_id, driveBucket: "Contractor Payments" };
        }
        case "contractor_settlement": {
            const settlement = requireRow(db.contractorSettlements, entityId, "Contractor Settlement", source);
            return { ...workOrderContext(db, entityType, entityId, settlement.work_order_id, "Settlements", { contractorId: settlement.contractor_id }, source), contractorId: settlement.contractor_id };
        }
        case "commission": {
            const commission = requireRow(db.commissions, entityId, "Commission", source);
            const context = resolveCandidates(source, [
                { label: "commission customer", context: commission.customer_id ? (requireRow(db.customers, commission.customer_id, "Customer", source), customerContext(entityType, entityId, commission.customer_id, "Commissions")) : undefined },
                { label: "commission Site", context: maybeContext(db, "site", commission.site_id, source) },
                { label: "commission Work Order", context: maybeContext(db, "workOrder", commission.work_order_id, source) },
                { label: "commission quotation", context: maybeContext(db, "quotation", commission.quotation_id, source) },
            ]);
            return { ...context, entityType, entityId, driveBucket: "Commissions", quotationId: commission.quotation_id || context.quotationId, workOrderId: commission.work_order_id || context.workOrderId, siteId: commission.site_id || context.siteId };
        }
        case "communication": {
            const communication = requireRow(db.commSends, entityId, "Communication", source);
            requireRow(db.customers, communication.customer_id, "Customer", source);
            const related = resolveCandidates(source, [
                { label: "communication customer", context: customerContext(entityType, entityId, communication.customer_id, "Communications") },
                { label: "communication quotation", context: maybeContext(db, "quotation", communication.quotation_id, source) },
                { label: "communication Work Order", context: maybeContext(db, "workOrder", communication.work_order_id, source) },
                { label: "communication task", context: maybeContext(db, "task", communication.task_id, source) },
                { label: "communication follow-up", context: maybeContext(db, "followup", communication.followup_id, source) },
            ]);
            return { ...related, entityType, entityId, driveBucket: "Communications", quotationId: communication.quotation_id || related.quotationId, workOrderId: communication.work_order_id || related.workOrderId };
        }
        case "thread_message": {
            const thread = db.threads.find((row) => row.messages.some((message) => message.id === entityId));
            if (!thread) missing(source, "Thread Message", entityId);
            const mapped = resolveThreadRecordEntityType(db, thread.record_type, thread.record_id);
            if (!mapped) throw new Error(`${source}: Thread Message belongs to an unsupported thread target.`);
            return { ...resolveEntityContext(db, mapped, thread.record_id, source), entityType, entityId, driveBucket: "Threads" };
        }
        case "blocked": {
            const blocked = requireRow(db.blocked, entityId, "Obstacle", source);
            const context = resolveCandidates(source, [
                { label: "obstacle customer", context: blocked.customer_id ? (requireRow(db.customers, blocked.customer_id, "Customer", source), customerContext(entityType, entityId, blocked.customer_id, "Obstacles")) : undefined },
                { label: "obstacle task", context: maybeContext(db, "task", blocked.linked_task_id, source) },
                { label: "obstacle Work Order", context: maybeContext(db, "workOrder", blocked.linked_work_order_id, source) },
                { label: "obstacle PO", context: maybeContext(db, "purchase_order", blocked.linked_po_id, source) },
                { label: "obstacle GRN", context: maybeContext(db, "grn", blocked.linked_grn_id, source) },
                { label: "obstacle quotation", context: maybeContext(db, "quotation", blocked.linked_quotation_id, source) },
            ]);
            return { ...context, entityType, entityId, driveBucket: "Obstacles" };
        }
        default:
            throw new Error(`${source}: unsupported entity type "${String(entityType)}".`);
    }
}
