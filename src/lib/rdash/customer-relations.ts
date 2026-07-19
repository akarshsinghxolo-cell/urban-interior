import type { FileAttachmentEntityType, ID, RDashDatabase } from "./types";
import { isEntityContextType, resolveEntityContext } from "./entity-context";
export type CustomerLinkInput = {
    customer_id?: ID;
    site_id?: ID;
    area_id?: ID;
    work_required_id?: ID;
    work_order_id?: ID;
    quotation_id?: ID;
    po_id?: ID;
    visit_id?: ID;
    payment_id?: ID;
    invoice_id?: ID;
    linked_task_id?: ID;
    linked_work_order_id?: ID;
    linked_po_id?: ID;
    linked_grn_id?: ID;
    linked_record_id?: ID;
    linked_record_type?: string;
    entity_id?: ID;
    entity_type?: string;
};
function id(value: unknown): ID | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function missing(context: string, label: string, recordId: ID): never {
    throw new Error(`${context}: ${label} "${recordId}" does not exist.`);
}
function entityCustomerId(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, context: string): ID | undefined {
    return resolveEntityContext(db, entityType, entityId, context).customerId;
}
function linkedRecordEntityType(recordType?: string): FileAttachmentEntityType | undefined {
    if (recordType === "quotation")
        return "quotation";
    if (recordType === "po")
        return "purchase_order";
    if (recordType === "payment")
        return "payment";
    if (recordType === "contractor_payment")
        return undefined;
    return undefined;
}
function linkedRecordCustomerId(db: RDashDatabase, recordId: ID, recordType: string | undefined, context: string): ID | undefined {
    if (recordType === "contractor_payment") {
        const payment = db.contractorPayments.find((row) => row.id === recordId);
        if (!payment)
            missing(context, "Contractor Payment", recordId);
        const bill = db.contractorBills.find((row) => row.id === payment.contractor_bill_id);
        if (!bill)
            missing(context, "Contractor Bill", payment.contractor_bill_id);
        return bill.customer_id;
    }
    const entityType = linkedRecordEntityType(recordType);
    return entityType ? entityCustomerId(db, entityType, recordId, context) : undefined;
}
export function resolveCustomerIdFromLinks(db: RDashDatabase, input: CustomerLinkInput, context: string): ID | undefined {
    const candidates: Array<{
        source: string;
        customerId: ID;
    }> = [];
    const add = (source: string, customerId: ID | undefined) => {
        if (customerId)
            candidates.push({ source, customerId });
    };
    const explicitCustomerId = id(input.customer_id);
    if (explicitCustomerId) {
        if (!db.customers.some((row) => row.id === explicitCustomerId))
            missing(context, "Customer", explicitCustomerId);
        add("customer_id", explicitCustomerId);
    }
    const links: Array<[
        keyof CustomerLinkInput,
        FileAttachmentEntityType,
        string
    ]> = [
        ["site_id", "site", "site_id"],
        ["area_id", "room", "area_id"],
        ["work_required_id", "workRequired", "work_required_id"],
        ["quotation_id", "quotation", "quotation_id"],
        ["work_order_id", "workOrder", "work_order_id"],
        ["linked_work_order_id", "workOrder", "linked_work_order_id"],
        ["po_id", "purchase_order", "po_id"],
        ["linked_po_id", "purchase_order", "linked_po_id"],
        ["linked_grn_id", "grn", "linked_grn_id"],
        ["visit_id", "visit", "visit_id"],
        ["payment_id", "payment", "payment_id"],
        ["invoice_id", "invoice", "invoice_id"],
    ];
    for (const [key, entityType, label] of links) {
        const recordId = id(input[key]);
        if (recordId)
            add(label, entityCustomerId(db, entityType, recordId, context));
    }
    const linkedTaskId = id(input.linked_task_id);
    if (linkedTaskId)
        add("linked_task_id", entityCustomerId(db, "task", linkedTaskId, `${context} linked Task`));
    const linkedRecordId = id(input.linked_record_id);
    if (linkedRecordId)
        add("linked_record_id", linkedRecordCustomerId(db, linkedRecordId, input.linked_record_type, context));
    const entityId = id(input.entity_id);
    if (entityId && input.entity_type && !isEntityContextType(input.entity_type)) {
        throw new Error(`${context}: unsupported entity type "${input.entity_type}".`);
    }
    const entityType = isEntityContextType(input.entity_type) ? input.entity_type : undefined;
    if (entityId && entityType && entityType !== "general")
        add("entity_id", entityCustomerId(db, entityType, entityId, context));
    const distinct = Array.from(new Set(candidates.map((candidate) => candidate.customerId)));
    if (distinct.length > 1) {
        const detail = candidates.map((candidate) => `${candidate.source} → ${candidate.customerId}`).join(", ");
        throw new Error(`${context}: customer relationships conflict (${detail}).`);
    }
    return distinct[0];
}
export function isCustomerLinked(db: RDashDatabase, input: CustomerLinkInput, customerId: ID): boolean {
    try {
        return resolveCustomerIdFromLinks(db, input, "Customer link") === customerId;
    }
    catch {
        return false;
    }
}
