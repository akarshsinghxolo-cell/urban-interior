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
    const commercialScope = Boolean(customerId || filter.workOrderId);
    const selectedOrders = db.workOrders.filter(work => (!customerId || work.customer_id === customerId) &&
        (!filter.workOrderId || work.id === filter.workOrderId));
    const workOrderIds = new Set(selectedOrders.map(work => work.id));
    const siteIds = new Set(filter.workOrderId ? selectedOrders.map(work => work.site_id) :
        db.sites.filter(site => site.customer_id === customerId).map(site => site.id));
    const selectedWork = selectedOrders.find(work => work.id === filter.workOrderId);
    const inCommercialScope = (row: { work_order_id?: string; site_id?: string }) => !commercialScope ||
        (row.work_order_id ? workOrderIds.has(row.work_order_id) : !filter.workOrderId && !!row.site_id && siteIds.has(row.site_id));
    const supplierScope = commercialScope || Boolean(filter.vendorId);
    const purchaseOrders = db.purchaseOrders.filter(row => inCommercialScope(row) && (!filter.vendorId || row.vendor_id === filter.vendorId));
    const poIds = new Set(purchaseOrders.map(row => row.id));
    const vendorBills = db.vendorBills.filter(row => (!filter.vendorId || row.vendor_id === filter.vendorId) &&
        (!commercialScope || (row.work_order_id || row.site_id ? inCommercialScope(row) : poIds.has(row.po_id))));
    const vendorBillIds = new Set(vendorBills.map(row => row.id));
    const contractorBills = db.contractorBills.filter(inCommercialScope);
    const contractorBillIds = new Set(contractorBills.map(row => row.id));
    return {
        ...db,
        workRequired: customerId || filter.workOrderId
            ? db.workRequired.filter(w => (!customerId || w.customer_id === customerId) &&
                (!filter.workOrderId || (selectedWork?.work_required_ids || []).includes(w.id)))
            : db.workRequired,
        customers: filter.customerId ? db.customers.filter((c) => c.id === filter.customerId) : db.customers,
        sites: commercialScope ? db.sites.filter(site => siteIds.has(site.id)) : db.sites,
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
        acceptedScopes: commercialScope ? db.acceptedScopes.filter(row =>
            (!customerId || row.customer_id === customerId) &&
            (!filter.workOrderId || selectedWork?.accepted_scope_ids?.includes(row.id))) : db.acceptedScopes,
        workOrderCostLines: commercialScope ? db.workOrderCostLines.filter(row => workOrderIds.has(row.work_order_id)) : db.workOrderCostLines,
        purchaseOrders: supplierScope ? purchaseOrders : db.purchaseOrders,
        grns: supplierScope ? db.grns.filter(row => (!filter.vendorId || row.vendor_id === filter.vendorId) &&
            (!commercialScope || (row.work_order_id ? workOrderIds.has(row.work_order_id) : poIds.has(row.po_id)))) : db.grns,
        vendorBills: supplierScope ? vendorBills : db.vendorBills,
        vendorPayments: supplierScope ? db.vendorPayments.filter(row => (!filter.vendorId || row.vendor_id === filter.vendorId) &&
            (!commercialScope || (row.work_order_id || row.site_id ? inCommercialScope(row) : vendorBillIds.has(row.vendor_bill_id)))) : db.vendorPayments,
        contractorBills: commercialScope ? contractorBills : db.contractorBills,
        contractorPayments: commercialScope ? db.contractorPayments.filter(row =>
            inCommercialScope(row) || contractorBillIds.has(row.contractor_bill_id || "")) : db.contractorPayments,
        vendorRfqs: commercialScope ? db.vendorRfqs.filter(row => workOrderIds.has(row.work_order_id)) : db.vendorRfqs,
        master: filter.vendorId
            ? { ...db.master, vendors: db.master.vendors.filter((v) => v.id === filter.vendorId) }
            : filter.staffId
                ? { ...db.master, staff: db.master.staff.filter((s) => s.id === filter.staffId) }
                : db.master,
    };
}
