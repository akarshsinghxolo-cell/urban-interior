import type { RDashDatabase } from "./types";
import type { ContextHistoryEntry, DetailPanelKind, DetailPanelState, WorkspaceOverlaySnapshot } from "./store/ui-types";

export function detailRecordExists(db: RDashDatabase, kind: Exclude<DetailPanelKind, null>, id: string) {
    const records: Record<Exclude<DetailPanelKind, null>, Array<{
        id: string;
    }>> = {
        quotation: db.quotations,
        workOrder: db.workOrders,
        task: db.tasks,
        followup: db.followups,
        visit: db.visits,
        payment: db.payments,
        invoice: db.invoices,
        po: db.purchaseOrders,
        grn: db.grns,
        dispatch: db.dispatches,
        boq: db.boqs,
        vendorBill: db.vendorBills,
        commission: db.commissions,
        blocked: db.blocked,
        customer: db.customers,
        site: db.sites,
        area: db.areas,
        workRequired: db.workRequired,
        inventory: db.inventory,
        vendor: db.master.vendors,
        vendorRate: db.master.vendorRates,
        contractor: db.master.contractors,
        contractorBill: db.contractorBills,
        contractorPayment: db.contractorPayments,
        staff: db.master.staff,
        audit: db.auditLog,
        media: db.master.fileAssets,
    };
    return records[kind].some((record) => record.id === id);
}

export function detailRecordCustomerId(db: RDashDatabase, kind: Exclude<DetailPanelKind, null>, recordId: string): string | undefined {
    if (kind === "customer")
        return db.customers.some((row) => row.id === recordId) ? recordId : undefined;
    if (kind === "site")
        return db.sites.find((row) => row.id === recordId)?.customer_id;
    if (kind === "area") {
        const area = db.areas.find((row) => row.id === recordId);
        return area ? db.sites.find((site) => site.id === area.site_id)?.customer_id : undefined;
    }
    if (kind === "workRequired")
        return db.workRequired.find((row) => row.id === recordId)?.customer_id;
    if (kind === "quotation")
        return db.quotations.find((row) => row.id === recordId)?.customer_id;
    if (kind === "workOrder")
        return db.workOrders.find((row) => row.id === recordId)?.customer_id;
    if (kind === "task")
        return db.tasks.find((row) => row.id === recordId)?.customer_id;
    if (kind === "followup")
        return db.followups.find((row) => row.id === recordId)?.customer_id;
    if (kind === "visit")
        return db.visits.find((row) => row.id === recordId)?.customer_id;
    if (kind === "payment")
        return db.payments.find((row) => row.id === recordId)?.customer_id;
    if (kind === "invoice")
        return db.invoices.find((row) => row.id === recordId)?.customer_id;
    if (kind === "po") {
        const po = db.purchaseOrders.find((row) => row.id === recordId);
        return po ? db.workOrders.find((row) => row.id === po.work_order_id)?.customer_id : undefined;
    }
    if (kind === "grn") {
        const grn = db.grns.find((row) => row.id === recordId);
        return grn ? db.workOrders.find((row) => row.id === grn.work_order_id)?.customer_id : undefined;
    }
    if (kind === "dispatch") {
        const dispatch = db.dispatches.find((row) => row.id === recordId);
        return dispatch ? db.workOrders.find((row) => row.id === dispatch.work_order_id)?.customer_id : undefined;
    }
    if (kind === "boq") {
        const boq = db.boqs.find((row) => row.id === recordId);
        return boq ? db.workOrders.find((row) => row.id === boq.work_order_id)?.customer_id : undefined;
    }
    if (kind === "vendorBill") {
        const bill = db.vendorBills.find((row) => row.id === recordId);
        return bill ? db.workOrders.find((row) => row.id === bill.work_order_id)?.customer_id : undefined;
    }
    if (kind === "blocked")
        return db.blocked.find((row) => row.id === recordId)?.customer_id;
    if (kind === "commission")
        return db.commissions.find((row) => row.id === recordId)?.customer_id;
    // FIX-CONTRACTOR-BATCH2 / F.15: contractor bills / payments resolve
    // through their work_order_id → workOrder.customer_id chain so the
    // customer-context navigation header shows the correct root customer.
    if (kind === "contractorBill") {
        const bill = db.contractorBills.find((row) => row.id === recordId);
        return bill ? db.workOrders.find((row) => row.id === bill.work_order_id)?.customer_id : undefined;
    }
    if (kind === "contractorPayment") {
        const payment = db.contractorPayments.find((row) => row.id === recordId);
        return payment ? db.workOrders.find((row) => row.id === payment.work_order_id)?.customer_id : undefined;
    }
    if (kind === "inventory") {
        const inventory = db.inventory.find((row) => row.id === recordId);
        return inventory?.work_order_id ? db.workOrders.find((row) => row.id === inventory.work_order_id)?.customer_id : undefined;
    }
    // Entity-master records are intentionally not customer-rooted. They open the
    // same right-side panel as an entity inspector and can still link onward to
    // customer-rooted operational records from their overview tabs.
    if (kind === "vendor" || kind === "vendorRate" || kind === "contractor" || kind === "staff" || kind === "audit" || kind === "media")
        return undefined;
    return undefined;
}

export function contextDetailPanel(entry: ContextHistoryEntry): DetailPanelState {
    return { kind: entry.kind, recordId: entry.recordId, fromModule: "context", panelTab: entry.detailTab || "overview" };
}
export function isEntityInspectorKind(kind: Exclude<DetailPanelKind, null>) {
    return kind === "vendor" || kind === "vendorRate" || kind === "contractor" || kind === "staff" || kind === "audit" || kind === "media";
}


export function workspaceOverlayIsValid(db: RDashDatabase, overlay: WorkspaceOverlaySnapshot): boolean {
    switch (overlay.type) {
        case "commandPalette":
        case "mobileNav":
        case "moreMenu":
        case "quickAdd":
        case "keyboardShortcuts":
            return true;
        case "actionDialog":
            return !overlay.value.customerId || db.customers.some((customer) => customer.id === overlay.value.customerId);
        case "createDialog": {
            const customer = overlay.value.customerId
                ? db.customers.find((row) => row.id === overlay.value.customerId)
                : undefined;
            if (overlay.value.customerId && !customer) return false;
            const site = overlay.value.siteId
                ? db.sites.find((row) => row.id === overlay.value.siteId)
                : undefined;
            if (overlay.value.siteId && !site) return false;
            if (customer && site && site.customer_id !== customer.id) return false;
            const work = overlay.value.workRequiredId
                ? db.workRequired.find((row) => row.id === overlay.value.workRequiredId)
                : undefined;
            if (overlay.value.workRequiredId && !work) return false;
            if (work && customer && work.customer_id !== customer.id) return false;
            if (work && site && work.site_id !== site.id) return false;
            return true;
        }
        case "quotationAcceptance": {
            const quotation = db.quotations.find((row) => row.id === overlay.quotationId);
            return Boolean(quotation && quotation.status !== "cancelled" && quotation.work_order_ids.length === 0);
        }
        case "editDialog":
            return detailRecordExists(db, overlay.value.type, overlay.value.entityId);
    }
}
