import type { ID, RDashDatabase } from "./types";
type CustomerLabelRecord = object;
export function getCustomer(db: RDashDatabase, customerId?: ID | null) {
    return customerId ? db.customers.find((customer) => customer.id === customerId) : undefined;
}
export function customerName(db: RDashDatabase, customerId?: ID | null, fallback = "Customer") {
    return getCustomer(db, customerId)?.name || fallback;
}
export function customerIdForJob(db: RDashDatabase, workOrderId?: ID | null) {
    return workOrderId ? db.workOrders.find((workOrder) => workOrder.id === workOrderId)?.customer_id : undefined;
}
export function customerNameForJob(db: RDashDatabase, workOrderId?: ID | null, fallback = "Customer") {
    return customerName(db, customerIdForJob(db, workOrderId), fallback);
}
export function customerIdForQuotation(db: RDashDatabase, quotationId?: ID | null) {
    return quotationId ? db.quotations.find((quotation) => quotation.id === quotationId)?.customer_id : undefined;
}
export function customerNameForQuotation(db: RDashDatabase, quotationId?: ID | null, fallback = "Customer") {
    return customerName(db, customerIdForQuotation(db, quotationId), fallback);
}
function defineCustomerLabel(record: CustomerLabelRecord, resolve: () => string) {
    delete (record as {
        customer_name?: string;
    }).customer_name;
    Object.defineProperty(record, "customer_name", {
        configurable: true,
        enumerable: false,
        get: resolve,
    });
}
export function attachCustomerLabels(db: RDashDatabase): RDashDatabase {
    db.quotations.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.workOrders.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.visits.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.tasks.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.followups.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.payments.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.invoices.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.actions.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.risks.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.blocked.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.commissions.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id || customerIdForJob(db, record.work_order_id))));
    db.commSends.forEach((record) => defineCustomerLabel(record, () => customerName(db, record.customer_id)));
    db.boqs.forEach((record) => defineCustomerLabel(record, () => customerNameForJob(db, record.work_order_id)));
    db.purchaseOrders.forEach((record) => defineCustomerLabel(record, () => customerNameForJob(db, record.work_order_id)));
    db.dispatches.forEach((record) => defineCustomerLabel(record, () => customerNameForJob(db, record.work_order_id)));
    db.contractorBids.forEach((record) => defineCustomerLabel(record, () => customerNameForJob(db, record.work_order_id)));
    db.contractorSettlements.forEach((record) => defineCustomerLabel(record, () => customerNameForJob(db, record.work_order_id)));
    return db;
}
