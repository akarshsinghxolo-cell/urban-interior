import type { RDashDatabase } from "./types";

export type ReportFilter = { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null | undefined;
export function applyReportFilter(db: RDashDatabase, filter: ReportFilter): RDashDatabase {
    if (!filter) return db;
    const hasFilter = !!(filter.customerId || filter.workOrderId || filter.vendorId || filter.staffId);
    if (!hasFilter) return db;
    // Resolve customerId from workOrderId if only workOrderId is set, so we
    // can filter customer-scoped collections consistently.
    let customerId = filter.customerId;
    if (!customerId && filter.workOrderId) {
        const wo = db.workOrders.find((w) => w.id === filter.workOrderId);
        if (wo) customerId = wo.customer_id;
    }
    // Resolve workOrderIds from customerId if only customerId is set, so
    // work-order-scoped collections (POs/GRNs/bills) are also filtered.
    const workOrderIds = new Set<string>();
    if (customerId) {
        db.workOrders.filter((w) => w.customer_id === customerId).forEach((w) => workOrderIds.add(w.id));
    }
    if (filter.workOrderId) workOrderIds.add(filter.workOrderId);
    const selectedWork = filter.workOrderId ? db.workOrders.find(w => w.id === filter.workOrderId) : undefined;
    return {
        ...db,
        workRequired: customerId || filter.workOrderId
            ? db.workRequired.filter(w => (!customerId || w.customer_id === customerId) &&
                (!filter.workOrderId || (selectedWork?.work_required_ids || []).includes(w.id)))
            : db.workRequired,
        customers: filter.customerId ? db.customers.filter((c) => c.id === filter.customerId) : db.customers,
        sites: customerId ? db.sites.filter((s) => s.customer_id === customerId) : db.sites,
        workOrders: customerId || filter.workOrderId
            ? db.workOrders.filter((w) => (!customerId || w.customer_id === customerId) && (!filter.workOrderId || w.id === filter.workOrderId))
            : db.workOrders,
        quotations: customerId || filter.workOrderId
            ? db.quotations.filter((q) => (!customerId || q.customer_id === customerId) && (!filter.workOrderId || (q.work_order_ids || []).includes(filter.workOrderId)))
            : db.quotations,
        payments: customerId || filter.workOrderId
            ? db.payments.filter((p) => (!customerId || p.customer_id === customerId) && (!filter.workOrderId || p.work_order_id === filter.workOrderId))
            : db.payments,
        invoices: customerId || filter.workOrderId
            ? db.invoices.filter((i) => (!customerId || i.customer_id === customerId) && (!filter.workOrderId || i.work_order_id === filter.workOrderId))
            : db.invoices,
        customerReceipts: customerId || filter.workOrderId
            ? db.customerReceipts.filter((r) => (!customerId || r.customer_id === customerId) && (!filter.workOrderId || r.work_order_id === filter.workOrderId))
            : db.customerReceipts,
        visits: customerId || filter.workOrderId || filter.staffId
            ? db.visits.filter((v) => (!customerId || v.customer_id === customerId) && (!filter.workOrderId || v.work_order_id === filter.workOrderId) && (!filter.staffId || v.assigned_staff_id === filter.staffId))
            : db.visits,
        tasks: customerId || filter.workOrderId || filter.staffId
            ? db.tasks.filter((t) => (!customerId || t.customer_id === customerId) && (!filter.workOrderId || t.work_order_id === filter.workOrderId) && (!filter.staffId || t.assigned_staff_id === filter.staffId))
            : db.tasks,
        followups: customerId || filter.staffId
            ? db.followups.filter((f) => (!customerId || f.customer_id === customerId) && (!filter.staffId || f.assigned_staff_id === filter.staffId))
            : db.followups,
        purchaseOrders: filter.workOrderId || filter.vendorId
            ? db.purchaseOrders.filter((p) => (!filter.workOrderId || p.work_order_id === filter.workOrderId) && (!filter.vendorId || p.vendor_id === filter.vendorId))
            : db.purchaseOrders,
        grns: filter.workOrderId || filter.vendorId
            ? db.grns.filter((g) => (!filter.workOrderId || g.work_order_id === filter.workOrderId) && (!filter.vendorId || g.vendor_id === filter.vendorId))
            : db.grns,
        vendorBills: filter.workOrderId || filter.vendorId
            ? db.vendorBills.filter((b) => (!filter.workOrderId || b.work_order_id === filter.workOrderId) && (!filter.vendorId || b.vendor_id === filter.vendorId))
            : db.vendorBills,
        vendorPayments: filter.workOrderId || filter.vendorId
            ? db.vendorPayments.filter((p) => (!filter.workOrderId || p.work_order_id === filter.workOrderId) && (!filter.vendorId || p.vendor_id === filter.vendorId))
            : db.vendorPayments,
        vendorRfqs: filter.workOrderId
            ? db.vendorRfqs.filter((r) => r.work_order_id === filter.workOrderId)
            : db.vendorRfqs,
        master: filter.vendorId
            ? { ...db.master, vendors: db.master.vendors.filter((v) => v.id === filter.vendorId) }
            : filter.staffId
                ? { ...db.master, staff: db.master.staff.filter((s) => s.id === filter.staffId) }
                : db.master,
    };
}
