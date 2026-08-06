import { resolveCustomerIdFromLinks, type CustomerLinkInput } from "./customer-relations";
import { findCustomerIdentityMatches } from "./customer-identity";
import type { Area, FinanceContextLink, ID, LineItem, Customer, Quotation, RDashDatabase, WorkOrder, WorkRequired, Visit, ThreadKind, } from "./types";
export class BusinessRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BusinessRuleError";
    }
}
type ValidationOptions = {
    allowArchived?: boolean;
};
type FinanceRecord = FinanceContextLink & {
    customer_id?: ID;
};
function fail(context: string, message: string): never {
    throw new BusinessRuleError(`${context}: ${message}`);
}
function isArchived(row: {
    is_archived?: boolean;
} | undefined) {
    return Boolean(row?.is_archived);
}
export function threadParentExists(db: RDashDatabase, kind: ThreadKind, recordId: ID): boolean {
    if (!recordId)
        return false;
    switch (kind) {
        case "quotation": return db.quotations.some((row) => row.id === recordId);
        case "workOrder": return db.workOrders.some((row) => row.id === recordId);
        case "task": return db.tasks.some((row) => row.id === recordId);
        case "followup": return db.followups.some((row) => row.id === recordId);
        case "visit": return db.visits.some((row) => row.id === recordId);
        case "payment": return db.payments.some((row) => row.id === recordId);
        case "invoice": return db.invoices.some((row) => row.id === recordId);
        case "vendor_bill": return db.vendorBills.some((row) => row.id === recordId) ||
            db.vendorPayments.some((row) => row.id === recordId);
        case "inventory": return db.inventory.some((row) => row.id === recordId);
        case "po": return db.purchaseOrders.some((row) => row.id === recordId);
        case "grn": return db.grns.some((row) => row.id === recordId);
        case "dispatch": return db.dispatches.some((row) => row.id === recordId);
        case "blocked": return db.blocked.some((row) => row.id === recordId);
        case "approval": return db.actions.some((row) => row.id === recordId);
        case "commission": return db.commissions.some((row) => row.id === recordId);
        case "bid": return db.contractorBids.some((row) => row.id === recordId) ||
            db.contractorBills.some((row) => row.id === recordId) ||
            db.contractorPayments.some((row) => row.id === recordId);
        case "settlement": return db.contractorSettlements.some((row) => row.id === recordId);
        case "site": return db.sites.some((row) => row.id === recordId);
        case "drawing": return db.drawings.some((row) => row.id === recordId);
        case "execution_log": return db.executionLogs.some((row) => row.id === recordId);
        case "workRequired": return db.workRequired.some((row) => row.id === recordId);
        case "generic": {
            if (recordId.startsWith("customer-conversation:")) {
                const customerId = recordId.slice("customer-conversation:".length);
                return db.customers.some((row) => row.id === customerId);
            }
            // "generic" threads are the catch-all for entities without a
            // dedicated ThreadKind: customers, areas, boqs, variationRequests,
            // vendors, contractors, staff, vendorRates, attendance, purchase
            // orders, GRNs, dispatches, vendor bills, invoices, payments, etc.
            return (db.customers.some((row) => row.id === recordId) ||
                db.areas.some((row) => row.id === recordId) ||
                db.boqs.some((row) => row.id === recordId) ||
                db.variationRequests.some((row) => row.id === recordId) ||
                db.attendance.some((row) => row.id === recordId) ||
                db.purchaseOrders.some((row) => row.id === recordId) ||
                db.grns.some((row) => row.id === recordId) ||
                db.dispatches.some((row) => row.id === recordId) ||
                db.vendorBills.some((row) => row.id === recordId) ||
                db.invoices.some((row) => row.id === recordId) ||
                db.payments.some((row) => row.id === recordId) ||
                db.contractorBills.some((row) => row.id === recordId) ||
                db.contractorBids.some((row) => row.id === recordId) ||
                db.contractorSettlements.some((row) => row.id === recordId) ||
                db.contractorPayments.some((row) => row.id === recordId) ||
                db.vendorPayments.some((row) => row.id === recordId) ||
                (db.master?.vendors || []).some((row) => row.id === recordId) ||
                (db.master?.contractors || []).some((row) => row.id === recordId) ||
                (db.master?.staff || []).some((row) => row.id === recordId) ||
                (db.master?.vendorRates || []).some((row) => row.id === recordId));
        }
        default: return false;
    }
}
export function assertThreadParentExists(db: RDashDatabase, kind: ThreadKind, recordId: ID, context = "Thread") {
    if (!threadParentExists(db, kind, recordId)) {
        fail(context, `parent ${kind} record "${recordId}" does not exist.`);
    }
}
function unique(ids: ID[]) {
    return Array.from(new Set(ids.filter(Boolean)));
}
export function assertCustomerExists(db: RDashDatabase, customerId: ID, context: string) {
    if (!customerId || !db.customers.some((row) => row.id === customerId)) {
        fail(context, "Customer does not exist.");
    }
}
export function assertCustomerRelation(db: RDashDatabase, input: CustomerLinkInput, context: string) {
    try {
        return resolveCustomerIdFromLinks(db, input, context);
    }
    catch (error) {
        fail(context, error instanceof Error ? error.message.replace(`${context}: `, "") : "Customer relationship is invalid.");
    }
}
export function assertWorkCategoryId(db: RDashDatabase, categoryId: ID | undefined, context: string) {
    if (!categoryId)
        return undefined;
    const category = db.master.workCategories.find((row) => row.id === categoryId);
    if (!category) {
        fail(context, `Work Category "${categoryId}" does not exist in the Work Category Master.`);
    }
    return category;
}
export function assertWorkSubcategoryId(db: RDashDatabase, subcategoryId: ID | undefined, context: string) {
    if (!subcategoryId)
        return undefined;
    const subcategory = db.master.workSubcategories.find((row) => row.id === subcategoryId);
    if (!subcategory) {
        fail(context, `Work Subcategory "${subcategoryId}" does not exist in the Work Category Master.`);
    }
    return subcategory;
}
export function assertLineItemCatalogRelations(db: RDashDatabase, item: LineItem, context: string) {
    const category = assertWorkCategoryId(db, item.category_id, context);
    // Work Required Article (scoped material) link is only mandatory when the line is tied to a Work Required scope or a variant.
    // Free-form catalog lines (article picked from the master, no scope) are allowed for flexibility — they are linked loosely via article_id only.
    if (item.work_required_article_id) {
        const mapping = db.master.subcategoryArticleMap.find((row) => row.id === item.work_required_article_id);
        if (!mapping) {
            fail(context, `Line "${item.title}" references a missing material catalog context.`);
        }
        if (item.article_id && item.article_id !== mapping.article_id) {
            fail(context, `Line "${item.title}" article conflicts with its scoped material.`);
        }
        const article = db.master.articles.find((row) => row.id === mapping.article_id);
        if (!article) {
            fail(context, `Line "${item.title}" scoped material has no canonical article.`);
        }
        const subcategory = db.master.workSubcategories.find((row) => row.id === mapping.work_required_id);
        if (!subcategory) {
            fail(context, `Line "${item.title}" material context has no Work Subcategory.`);
        }
        if (category && subcategory && category.id !== subcategory.category_id) {
            fail(context, `Line "${item.title}" Work Category conflicts with its material catalog context.`);
        }
        if (item.work_required_id) {
            const work = db.workRequired.find((row) => row.id === item.work_required_id);
            if (!work) fail(context, `Line "${item.title}" Work Required does not exist.`);
            if (work.work_subcategory_id && work.work_subcategory_id !== subcategory.id) {
                fail(context, `Line "${item.title}" material belongs to ${subcategory.name}, not the selected Work Required.`);
            }
        }
        const variant = item.variant_id ? db.master.articleVariants.find((row) => row.id === item.variant_id) : undefined;
        if (item.variant_id && !variant) {
            fail(context, `Line "${item.title}" variant does not exist.`);
        }
        if (variant && variant.article_id !== mapping.article_id) {
            fail(context, `Line "${item.title}" variant belongs to another article.`);
        }
        const expectedUnit = variant?.unit_id || mapping.unit_id;
        if (item.unit_id && item.unit_id !== expectedUnit) {
            fail(context, `Line "${item.title}" unit must be ${expectedUnit} from its scoped material context, not ${item.unit_id}.`);
        }
        return;
    }
    // Free-form catalog line: only validate that the article exists when referenced.
    if (item.article_id) {
        const article = db.master.articles.find((row) => row.id === item.article_id);
        if (!article) {
            fail(context, `Line "${item.title}" references a missing article.`);
        }
        if (category && article && article.category_id && article.category_id !== category.id) {
            fail(context, `Line "${item.title}" Work Category conflicts with its article category.`);
        }
    }
    if (item.variant_id) {
        const variant = db.master.articleVariants.find((row) => row.id === item.variant_id);
        if (!variant) {
            fail(context, `Line "${item.title}" variant does not exist.`);
        }
    }
}
export function assertCustomerCatalogRelations(db: RDashDatabase, customer: Pick<Customer, "interest_category_ids" | "interest_work_subcategory_ids">, context: string) {
    for (const categoryId of unique(customer.interest_category_ids || [])) {
        assertWorkCategoryId(db, categoryId, context);
    }
    for (const subcategoryId of unique(customer.interest_work_subcategory_ids || [])) {
        assertWorkSubcategoryId(db, subcategoryId, context);
    }
}
export function assertWorkRequiredCatalogRelations(db: RDashDatabase, work: Pick<WorkRequired, "work_category_id" | "work_subcategory_id" | "structured_items">, context: string) {
    const items = work.structured_items || [];
    const hasCategory = Boolean(work.work_category_id);
    const hasSubcategory = Boolean(work.work_subcategory_id);
    if (hasCategory !== hasSubcategory) {
        fail(context, "Work Category and exact Work Subcategory / Work Item must be selected together.");
    }
    if (hasCategory && hasSubcategory) {
        const category = assertWorkCategoryId(db, work.work_category_id, context);
        const subcategory = assertWorkSubcategoryId(db, work.work_subcategory_id, context);
        if (category && subcategory && category.id !== subcategory.category_id) {
            fail(context, `Work Category "${category.id}" conflicts with Work Subcategory "${subcategory.name}".`);
        }
    }
    for (const item of items) {
        assertLineItemCatalogRelations(db, item, context);
    }
}
export function assertSiteExists(db: RDashDatabase, siteId: ID, context: string, options: ValidationOptions = {}) {
    const site = db.sites.find((row) => row.id === siteId);
    if (!site)
        fail(context, "Site does not exist.");
    if (!options.allowArchived && isArchived(site)) {
        fail(context, `Site "${site.name}" is archived and cannot be used for new work.`);
    }
    return site;
}
export function assertSiteBelongsToCustomer(db: RDashDatabase, siteId: ID, customerId: ID, context: string, options: ValidationOptions = {}) {
    assertCustomerExists(db, customerId, context);
    const site = assertSiteExists(db, siteId, context, options);
    if (site.customer_id !== customerId) {
        fail(context, `Site "${site.name}" belongs to a different Customer.`);
    }
    return site;
}
export function assertAreaBelongsToSite(db: RDashDatabase, areaId: ID, siteId: ID, context: string, options: ValidationOptions = {}) {
    const area = db.areas.find((row) => row.id === areaId);
    if (!area)
        fail(context, "Area does not exist.");
    if (!options.allowArchived && isArchived(area)) {
        fail(context, `Area "${area.name}" is archived and cannot be used for new work.`);
    }
    if (area.site_id !== siteId) {
        fail(context, `Area "${area.name}" belongs to a different Site.`);
    }
    return area;
}
export function assertAreasBelongToSite(db: RDashDatabase, areaIds: ID[] | undefined, siteId: ID, context: string, options: ValidationOptions = {}) {
    for (const areaId of unique(areaIds || [])) {
        assertAreaBelongsToSite(db, areaId, siteId, context, options);
    }
}
export function assertWorkRequiredMatchesContext(db: RDashDatabase, workRequiredId: ID, customerId: ID, siteId: ID, context: string, options: ValidationOptions = {}) {
    const work = db.workRequired.find((row) => row.id === workRequiredId);
    if (!work)
        fail(context, "Work Required does not exist.");
    if (work.customer_id !== customerId || work.site_id !== siteId) {
        fail(context, `Work Required "${work.title}" belongs to a different Customer or Site.`);
    }
    assertSiteBelongsToCustomer(db, siteId, customerId, context, options);
    assertAreasBelongToSite(db, work.area_ids, siteId, context, options);
    return work;
}
function assertLineItemRelations(db: RDashDatabase, item: LineItem, customerId: ID, siteId: ID, context: string, options: ValidationOptions) {
    if (item.site_id && item.site_id !== siteId) {
        fail(context, `Line "${item.title}" belongs to a different Site.`);
    }
    if (item.area_id)
        assertAreaBelongsToSite(db, item.area_id, siteId, context, options);
    if (item.work_required_id) {
        assertWorkRequiredMatchesContext(db, item.work_required_id, customerId, siteId, context, options);
    }
}
export function assertVisitRelations(db: RDashDatabase, visit: Pick<Visit, "customer_id" | "site_id" | "work_required_id" | "work_order_id" | "location_target_type" | "vendor_id" | "staff_id" | "assignee_type" | "contractor_id">, context: string, options: ValidationOptions = {}) {
    if (!visit.customer_id || !visit.site_id)
        fail(context, "Visit requires a Customer and project Site context.");
    assertSiteBelongsToCustomer(db, visit.site_id, visit.customer_id, context, options);
    if (visit.work_required_id)
        assertWorkRequiredMatchesContext(db, visit.work_required_id, visit.customer_id, visit.site_id, context, options);
    if (visit.work_order_id) {
        const workOrder = db.workOrders.find((row) => row.id === visit.work_order_id);
        if (!workOrder || workOrder.customer_id !== visit.customer_id || workOrder.site_id !== visit.site_id)
            fail(context, "Visit Work Order belongs to a different Customer or Site.");
    }
    if (visit.location_target_type === "vendor") {
        const vendor = db.master.vendors.find((row) => row.id === visit.vendor_id);
        if (!vendor)
            fail(context, "Visit Vendor does not exist.");
        if (!Number.isFinite(vendor.latitude) || !Number.isFinite(vendor.longitude))
            fail(context, "Visit Vendor has no registered GPS coordinates.");
    }
    const assigneeType = visit.assignee_type || (visit.contractor_id ? "contractor" : "staff");
    if (assigneeType === "staff") {
        // Flexibility: allow unassigned visits (empty staff_id) so a business with no staff set up
        // yet can still schedule visits. The owner can assign an active staff member later.
        if (visit.staff_id) {
            const staff = db.master.staff.find((row) => row.id === visit.staff_id && row.status === "active");
            if (!staff)
                fail(context, "Visit assignee must be an active Staff member.");
        }
    }
    else {
        const contractor = db.master.contractors.find((row) => row.id === visit.contractor_id);
        if (!contractor)
            fail(context, "Visit assignee Contractor does not exist.");
    }
}
export function assertMeasurementRevisionRelations(db: RDashDatabase, input: {
    site_id: ID;
    area_id: ID;
    work_required_id?: ID;
}, context: string, options: ValidationOptions = {}) {
    assertSiteExists(db, input.site_id, context, options);
    assertAreaBelongsToSite(db, input.area_id, input.site_id, context, options);
    if (input.work_required_id) {
        const work = db.workRequired.find((row) => row.id === input.work_required_id);
        if (!work || work.site_id !== input.site_id) {
            fail(context, "Measurement Work Required belongs to a different Site.");
        }
        if (!work.area_ids.includes(input.area_id)) {
            fail(context, `Measurement Area is not covered by Work Required "${work.title}".`);
        }
    }
}
export function assertQuotationRelations(db: RDashDatabase, quotation: Pick<Quotation, "customer_id" | "site_id" | "coverage" | "scope_lines" | "items">, context: string, options: ValidationOptions = {}) {
    assertSiteBelongsToCustomer(db, quotation.site_id, quotation.customer_id, context, options);
    for (const coverage of quotation.coverage || []) {
        const work = assertWorkRequiredMatchesContext(db, coverage.work_required_id, quotation.customer_id, quotation.site_id, context, options);
        assertAreasBelongToSite(db, coverage.area_ids, quotation.site_id, context, options);
        for (const areaId of unique(coverage.area_ids || [])) {
            if (!work.area_ids.includes(areaId)) {
                fail(context, `Quotation coverage Area is not covered by Work Required "${work.title}".`);
            }
        }
        for (const measurementId of unique(coverage.measurement_revision_ids || [])) {
            const measurement = db.measurementRevisions.find((row) => row.id === measurementId);
            if (!measurement || measurement.site_id !== quotation.site_id) {
                fail(context, "Quotation coverage includes a Measurement Revision from a different Site.");
            }
            if (!coverage.area_ids.includes(measurement.area_id)) {
                fail(context, "Quotation coverage Measurement Revision is outside the covered Areas.");
            }
        }
    }
    for (const item of quotation.scope_lines || quotation.items || []) {
        assertLineItemCatalogRelations(db, item, context);
        assertLineItemRelations(db, item, quotation.customer_id, quotation.site_id, context, options);
    }
}
export function assertWorkOrderRelations(db: RDashDatabase, workOrder: Pick<WorkOrder, "customer_id" | "site_id" | "area_ids" | "accepted_scope_ids" | "work_required_ids" | "quotation_ids">, context: string, options: ValidationOptions = {}) {
    assertSiteBelongsToCustomer(db, workOrder.site_id, workOrder.customer_id, context, options);
    assertAreasBelongToSite(db, workOrder.area_ids, workOrder.site_id, context, options);
    for (const workRequiredId of unique(workOrder.work_required_ids || [])) {
        assertWorkRequiredMatchesContext(db, workRequiredId, workOrder.customer_id, workOrder.site_id, context, options);
    }
    for (const quotationId of unique(workOrder.quotation_ids || [])) {
        const quotation = db.quotations.find((row) => row.id === quotationId);
        if (!quotation || quotation.customer_id !== workOrder.customer_id || quotation.site_id !== workOrder.site_id) {
            fail(context, "Work Order quotation belongs to a different Customer or Site.");
        }
    }
    for (const scopeId of unique(workOrder.accepted_scope_ids || [])) {
        const scope = db.acceptedScopes.find((row) => row.id === scopeId);
        if (!scope || scope.customer_id !== workOrder.customer_id || scope.site_id !== workOrder.site_id) {
            fail(context, "Work Order accepted scope belongs to a different Customer or Site.");
        }
        assertAreasBelongToSite(db, scope.area_ids, workOrder.site_id, context, options);
    }
}
export function assertFinanceContext(db: RDashDatabase, record: FinanceRecord, context: string, options: ValidationOptions = {}) {
    const customerId = record.customer_id;
    if (customerId)
        assertCustomerExists(db, customerId, context);
    if (record.finance_context === "service" && !record.site_id) {
        fail(context, "Service finance requires a Site.");
    }
    if (record.site_id) {
        if (!customerId)
            fail(context, "A Site-linked finance record requires a Customer.");
        assertSiteBelongsToCustomer(db, record.site_id, customerId, context, options);
        assertAreasBelongToSite(db, record.area_ids, record.site_id, context, options);
    }
    if (record.work_required_id) {
        if (!customerId || !record.site_id)
            fail(context, "Work Required finance links require Customer and Site.");
        assertWorkRequiredMatchesContext(db, record.work_required_id, customerId, record.site_id, context, options);
    }
    if (record.quotation_id) {
        const quotation = db.quotations.find((row) => row.id === record.quotation_id);
        if (!quotation || quotation.customer_id !== customerId || quotation.site_id !== record.site_id) {
            fail(context, "Quotation finance link belongs to a different Customer or Site.");
        }
    }
    if (record.work_order_id) {
        const workOrder = db.workOrders.find((row) => row.id === record.work_order_id);
        if (!workOrder || workOrder.customer_id !== customerId || workOrder.site_id !== record.site_id) {
            fail(context, "Work Order finance link belongs to a different Customer or Site.");
        }
    }
}
export type AreaDependencySummary = Record<"workRequired" | "measurements" | "quotationCoverage" | "quotationLines" | "acceptedScopes" | "workOrders" | "boqs" | "purchaseOrders" | "grns" | "dispatches" | "payments" | "invoices" | "receipts" | "contractorBills" | "drawings" | "referenceAssignments" | "driveAttachments" | "total", number>;
export function areaDependencySummary(db: RDashDatabase, areaId: ID): AreaDependencySummary {
    const quotationCoverage = db.quotations.reduce((count, quote) => count + quote.coverage.filter((coverage) => coverage.area_ids.includes(areaId)).length, 0);
    const quotationLines = db.quotations.reduce((count, quote) => count + [...(quote.scope_lines || []), ...(quote.items || [])].filter((item) => item.area_id === areaId).length, 0);
    const summary = {
        workRequired: db.workRequired.filter((row) => row.area_ids.includes(areaId) || (row.structured_items || []).some((item) => item.area_id === areaId)).length,
        measurements: db.measurementRevisions.filter((row) => row.area_id === areaId).length,
        quotationCoverage,
        quotationLines,
        acceptedScopes: db.acceptedScopes.filter((row) => row.area_ids.includes(areaId)).length,
        workOrders: db.workOrders.filter((row) => row.area_ids.includes(areaId)).length,
        boqs: db.boqs.reduce((count, row) => count + row.items.filter((item) => item.area_id === areaId).length, 0),
        purchaseOrders: db.purchaseOrders.reduce((count, row) => count + row.items.filter((item) => item.area_id === areaId).length, 0),
        grns: db.grns.reduce((count, row) => count + row.items.filter((item) => item.area_id === areaId).length, 0),
        dispatches: db.dispatches.reduce((count, row) => count + row.items.filter((item) => item.area_id === areaId).length, 0),
        payments: db.payments.filter((row) => row.area_ids?.includes(areaId)).length,
        invoices: db.invoices.filter((row) => row.area_ids?.includes(areaId)).length,
        receipts: db.customerReceipts.filter((row) => row.area_ids?.includes(areaId)).length,
        contractorBills: db.contractorBills.filter((row) => row.area_ids?.includes(areaId)).length,
        drawings: db.drawings.filter((row) => row.area_id === areaId).length,
        referenceAssignments: db.entityReferenceAssignments.filter((row) => row.area_id === areaId).length,
        driveAttachments: db.entityFileAttachments.filter((row) => row.entity_type === "room" && row.entity_id === areaId).length,
        total: 0,
    };
    summary.total = Object.entries(summary)
        .filter(([key]) => key !== "total")
        .reduce((total, [, value]) => total + value, 0);
    return summary;
}
export function validateBusinessData(db: RDashDatabase) {
    const failures: string[] = [];
    const capture = (label: string, check: () => void) => {
        try {
            check();
        }
        catch (error) {
            failures.push(`${label}: ${error instanceof Error ? error.message : "Relationship validation failed."}`);
        }
    };
    db.customers.forEach((customer) => capture(`Customer ${customer.id}`, () => assertCustomerCatalogRelations(db, customer, "Customer")));
    db.customers.forEach((customer) => {
        const duplicate = findCustomerIdentityMatches(db.customers, customer, { excludeCustomerId: customer.id })[0];
        if (duplicate) {
            failures.push(`Customer ${customer.id}: Duplicate contact identity with Customer ${duplicate.customer.id} (${duplicate.fields.join(", ")}).`);
        }
    });
    db.sites.forEach((site) => capture(`Site ${site.id}`, () => assertCustomerExists(db, site.customer_id, "Site")));
    db.areas.forEach((area) => capture(`Area ${area.id}`, () => assertSiteExists(db, area.site_id, "Area", { allowArchived: true })));
    db.workRequired.forEach((work) => capture(`Work Required ${work.id}`, () => {
        assertWorkRequiredCatalogRelations(db, work, "Work Required");
        assertSiteBelongsToCustomer(db, work.site_id, work.customer_id, "Work Required", { allowArchived: true });
        assertAreasBelongToSite(db, work.area_ids, work.site_id, "Work Required", { allowArchived: true });
    }));
    db.measurementRevisions.forEach((revision) => capture(`Measurement ${revision.id}`, () => assertMeasurementRevisionRelations(db, revision, "Measurement", { allowArchived: true })));
    db.visits.forEach((visit) => capture(`Visit ${visit.id}`, () => assertVisitRelations(db, visit, "Visit", { allowArchived: true })));
    db.quotations.forEach((quotation) => capture(`Quotation ${quotation.id}`, () => assertQuotationRelations(db, quotation, "Quotation", { allowArchived: true })));
    db.acceptedScopes.forEach((scope) => capture(`Accepted Scope ${scope.id}`, () => {
        assertWorkRequiredMatchesContext(db, scope.work_required_id, scope.customer_id, scope.site_id, "Accepted Scope", { allowArchived: true });
        assertAreasBelongToSite(db, scope.area_ids, scope.site_id, "Accepted Scope", { allowArchived: true });
    }));
    db.workOrders.forEach((workOrder) => capture(`Work Order ${workOrder.id}`, () => assertWorkOrderRelations(db, workOrder, "Work Order", { allowArchived: true })));
    db.tasks.forEach((task) => capture(`Task ${task.id}`, () => assertCustomerRelation(db, task, "Task")));
    db.followups.forEach((followup) => capture(`Follow-up ${followup.id}`, () => assertCustomerRelation(db, followup, "Follow-up")));
    db.actions.forEach((action) => capture(`Approval ${action.id}`, () => assertCustomerRelation(db, action, "Approval")));
    db.risks.forEach((risk) => capture(`Risk ${risk.id}`, () => assertCustomerRelation(db, risk, "Risk")));
    db.blocked.forEach((blocked) => capture(`Obstacle ${blocked.id}`, () => assertCustomerRelation(db, blocked, "Obstacle")));
    db.commSends.forEach((send) => capture(`Communication ${send.id}`, () => assertCustomerRelation(db, send, "Communication")));
    db.payments.forEach((payment) => capture(`Payment ${payment.id}`, () => assertFinanceContext(db, payment, "Payment", { allowArchived: true })));
    db.invoices.forEach((invoice) => capture(`Invoice ${invoice.id}`, () => assertFinanceContext(db, invoice, "Invoice", { allowArchived: true })));
    db.customerReceipts.forEach((receipt) => capture(`Receipt ${receipt.id}`, () => assertFinanceContext(db, receipt, "Receipt", { allowArchived: true })));
    db.contractorBills.forEach((bill) => capture(`Contractor Bill ${bill.id}`, () => {
        const workOrder = db.workOrders.find((row) => row.id === bill.work_order_id);
        if (!workOrder || workOrder.customer_id !== bill.customer_id || workOrder.site_id !== bill.site_id) {
            fail("Contractor Bill", "Customer, Site, and Work Order do not match.");
        }
        if (bill.work_required_id) {
            assertWorkRequiredMatchesContext(db, bill.work_required_id, bill.customer_id, bill.site_id, "Contractor Bill", { allowArchived: true });
        }
        assertAreasBelongToSite(db, bill.area_ids, bill.site_id, "Contractor Bill", { allowArchived: true });
    }));
    db.boqs.forEach((boq) => capture(`BOQ ${boq.id}`, () => {
        boq.items.forEach((item) => assertLineItemCatalogRelations(db, item, "BOQ"));
    }));
    db.purchaseOrders.forEach((po) => capture(`Purchase Order ${po.id}`, () => {
        if (po.work_order_id) {
            const workOrder = db.workOrders.find((row) => row.id === po.work_order_id);
            if (!workOrder || (po.site_id && workOrder.site_id !== po.site_id))
                fail("Purchase Order", "Work Order does not belong to the PO Site.");
        }
        po.items.forEach((item) => {
            assertLineItemCatalogRelations(db, item, "Purchase Order");
            if (item.area_id && po.site_id)
                assertAreaBelongsToSite(db, item.area_id, po.site_id, "Purchase Order", { allowArchived: true });
        });
    }));
    db.grns.forEach((grn) => capture(`GRN ${grn.id}`, () => {
        const po = db.purchaseOrders.find((row) => row.id === grn.po_id);
        if (!po)
            fail("GRN", "PO not found.");
        else {
            if ((po.site_id || grn.site_id) && po.site_id !== grn.site_id)
                fail("GRN", "PO Site and GRN Site do not match.");
            if ((po.work_order_id || grn.work_order_id) && po.work_order_id !== grn.work_order_id)
                fail("GRN", "PO Work Order and GRN Work Order do not match.");
        }
        grn.items.forEach((item) => assertLineItemCatalogRelations(db, item, "GRN"));
    }));
    db.dispatches.forEach((dispatch) => capture(`Dispatch ${dispatch.id}`, () => {
        dispatch.items.forEach((item) => assertLineItemCatalogRelations(db, item, "Dispatch"));
    }));
    db.inventory.forEach((item) => capture(`Inventory ${item.id}`, () => {
        if (!item.article_id || !item.work_required_article_id || !item.unit_id) {
            fail("Inventory", "must carry article_id, work_required_article_id, and unit_id.");
        }
        const mapping = db.master.subcategoryArticleMap.find((row) => row.id === item.work_required_article_id);
        if (!mapping || mapping.article_id !== item.article_id || mapping.unit_id !== item.unit_id) {
            fail("Inventory", "material context, article, and unit do not match.");
        }
    }));
    db.stockMovements.forEach((movement) => capture(`Stock Movement ${movement.id}`, () => {
        const inventory = db.inventory.find((row) => row.id === movement.inventory_id);
        if (!inventory) fail("Stock Movement", "Inventory item does not exist.");
        if (!movement.article_id || !movement.work_required_article_id) {
            fail("Stock Movement", "must carry exact article and scoped material context.");
        }
        if (movement.article_id !== inventory.article_id || movement.work_required_article_id !== inventory.work_required_article_id) {
            fail("Stock Movement", "does not match its inventory material context.");
        }
    }));
    db.vendorBills.forEach((bill) => capture(`Vendor Bill ${bill.id}`, () => {
        const po = db.purchaseOrders.find((row) => row.id === bill.po_id);
        const grn = db.grns.find((row) => row.id === bill.grn_id);
        if (!po || !grn || po.id !== grn.po_id)
            fail("Vendor Bill", "PO and GRN do not match.");
        else {
            // H: Tolerance path for site/work_order mismatch. In real procurement,
            // partial deliveries or cross-site transfers happen. Instead of hard-
            // failing, we allow the bill to carry a different site_id/work_order_id
            // IF the bill explicitly records a variance reason. Without a reason,
            // the original strict match is enforced. This keeps the data clean
            // while not blocking legitimate partial/cross-site deliveries.
            const billAny = bill as unknown as Record<string, unknown>;
            const hasVarianceReason = Boolean(billAny.variance_reason || billAny.mismatch_notes);
            if ((po.site_id || bill.site_id) && po.site_id !== bill.site_id) {
                if (!hasVarianceReason)
                    fail("Vendor Bill", "PO Site and Bill Site do not match. Record a variance_reason on the bill if this is an intentional partial/cross-site delivery.");
            }
            if ((po.work_order_id || bill.work_order_id) && po.work_order_id !== bill.work_order_id) {
                if (!hasVarianceReason)
                    fail("Vendor Bill", "PO Work Order and Bill Work Order do not match. Record a variance_reason on the bill if this is an intentional cross-job allocation.");
            }
        }
    }));
    db.drawings.forEach((drawing) => capture(`Drawing ${drawing.id}`, () => {
        if (drawing.site_id)
            assertSiteExists(db, drawing.site_id, "Drawing", { allowArchived: true });
        if (drawing.area_id) {
            if (!drawing.site_id)
                fail("Drawing", "Area-linked drawing requires a Site.");
            assertAreaBelongsToSite(db, drawing.area_id, drawing.site_id, "Drawing", { allowArchived: true });
        }
    }));
    db.threads.forEach((thread) => capture(`Thread ${thread.id}`, () => {
        if (thread.record_type !== thread.kind) {
            fail("Thread", "record type must match its thread kind.");
        }
        assertThreadParentExists(db, thread.kind, thread.record_id, "Thread");
        const messageIds = new Set<string>();
        thread.messages.forEach((message) => {
            if (message.thread_id !== thread.id)
                fail("Thread", "contains a message assigned to another thread.");
            if (messageIds.has(message.id))
                fail("Thread", "contains duplicate message IDs.");
            messageIds.add(message.id);
        });
        thread.messages.forEach((message) => {
            if (message.parent_message_id && !messageIds.has(message.parent_message_id)) {
                fail("Thread", "contains a nested reply whose parent message is missing.");
            }
        });
    }));
    const storageAccounts = new Map(db.master.storageAccounts.map((account) => [account.id, account]));
    const storageTemplates = new Set(db.master.storageFolderTemplates.map((template) => template.id));
    const storageFolders = new Map(db.master.storageFolderInstances.map((folder) => [folder.id, folder]));
    if (storageAccounts.size !== db.master.storageAccounts.length)
        failures.push("Storage account: duplicate account id.");
    db.master.storageAccounts.forEach((account) => capture(`Storage account ${account.id}`, () => {
        if (!account.label.trim())
            fail("Storage account", "must have a display name.");
        if (!Number.isFinite(account.priority_order))
            fail("Storage account", "must have a numeric write priority.");
        if (!Number.isFinite(account.switch_threshold_percent) || account.switch_threshold_percent <= 0 || account.switch_threshold_percent > 100)
            fail("Storage account", "must have a switch threshold from 1 to 100.");
    }));
    db.master.storageFolderInstances.forEach((folder) => capture(`Storage folder ${folder.id}`, () => {
        if (!storageAccounts.has(folder.storage_account_id))
            fail("Storage folder", "belongs to a missing connected Drive account.");
        if (!storageTemplates.has(folder.template_id))
            fail("Storage folder", "uses a missing logical folder template.");
        if (!folder.folder_path.trim())
            fail("Storage folder", "must record its logical path.");
    }));
    db.master.fileAssets.forEach((file) => capture(`Drive file ${file.id}`, () => {
        if (!/^https:\/\/drive\.google\.com\//.test(file.web_view_link || ""))
            fail("Drive file", "must use a Google Drive web link.");
        if (/^(data:|blob:)/i.test(file.web_view_link || ""))
            fail("Drive file", "cannot retain embedded or temporary binary data.");
        if (file.storage_provider !== "google_drive" || file.sync_status !== "uploaded")
            fail("Drive file", "must be a completed Google Drive upload.");
        if (file.storage_account_id && !storageAccounts.has(file.storage_account_id))
            fail("Drive file", "belongs to a missing connected Drive account.");
        if (file.storage_folder_instance_id) {
            const folder = storageFolders.get(file.storage_folder_instance_id);
            if (!folder)
                fail("Drive file", "references a missing physical folder instance.");
            if (file.storage_account_id && folder.storage_account_id !== file.storage_account_id)
                fail("Drive file", "folder and account ownership do not match.");
        }
        if (file.storage_mode === "managed") {
            if (!file.google_file_id)
                fail("Drive file", "managed uploads require a Google Drive file ID.");
            if (!file.storage_account_id)
                fail("Drive file", "managed uploads require their original connected Drive account.");
            if (!file.storage_folder_instance_id)
                fail("Drive file", "managed uploads require their original physical folder.");
        }
    }));
    db.entityFileAttachments.forEach((attachment) => capture(`Drive attachment ${attachment.id}`, () => {
        assertCustomerRelation(db, attachment, "Drive attachment");
        const file = db.master.fileAssets.find((row) => row.id === attachment.file_asset_id);
        if (!file)
            fail("Drive attachment", "references a missing Drive file.");
        if (file.sync_status !== "uploaded")
            fail("Drive attachment", "references a file that is not uploaded to Google Drive.");
    }));
    db.entityReferenceAssignments.forEach((assignment) => capture(`Reference assignment ${assignment.id}`, () => {
        assertCustomerRelation(db, assignment, "Reference assignment");
        if (assignment.site_id)
            assertSiteExists(db, assignment.site_id, "Reference assignment", { allowArchived: true });
        if (assignment.area_id) {
            if (!assignment.site_id)
                fail("Reference assignment", "Area-linked assignment requires a Site.");
            assertAreaBelongsToSite(db, assignment.area_id, assignment.site_id, "Reference assignment", { allowArchived: true });
        }
    }));
    db.commSends.forEach((communication) => capture(`Communication ${communication.id}`, () => {
        assertCustomerExists(db, communication.customer_id, "Communication");
        (communication.attachment_ids || []).forEach((attachmentId) => {
            const attachment = db.entityFileAttachments.find((row) => row.id === attachmentId);
            if (!attachment || attachment.entity_type !== "communication" || attachment.entity_id !== communication.id) {
                fail("Communication attachment", "must resolve to this communication attachment record.");
                return;
            }
            const file = db.master.fileAssets.find((row) => row.id === attachment.file_asset_id);
            if (!file || file.storage_provider !== "google_drive" || file.sync_status !== "uploaded") {
                fail("Communication attachment", "does not resolve to an uploaded Google Drive file.");
            }
        });
    }));
    // FIX-ANALYSIS-003 Group C: Add validation for entities that previously had
    // NO standalone validation in validateBusinessData. These 9 entity types
    // were persisted without any integrity checks — now they validate that
    // their referenced parent entities exist and that customer_id consistency
    // holds where applicable. Defensive (|| []) guards ensure these don't
    // crash when a collection is absent from the workspace payload.
    (db.vendorPayments || []).forEach((payment) => capture(`Vendor Payment ${payment.id}`, () => {
        const bill = db.vendorBills.find((row) => row.id === payment.vendor_bill_id);
        if (!bill) fail("Vendor Payment", "Vendor Bill not found.");
        else if (bill.vendor_id !== payment.vendor_id)
            fail("Vendor Payment", "Vendor does not match the bill.");
    }));
    (db.contractorPayments || []).forEach((payment) => capture(`Contractor Payment ${payment.id}`, () => {
        const bill = db.contractorBills.find((row) => row.id === payment.contractor_bill_id);
        if (!bill) fail("Contractor Payment", "Contractor Bill not found.");
        else {
            if (bill.contractor_id !== payment.contractor_id)
                fail("Contractor Payment", "Contractor does not match the bill.");
            if (bill.work_order_id !== payment.work_order_id)
                fail("Contractor Payment", "Work Order does not match the bill.");
        }
    }));
    (db.contractorBids || []).forEach((bid) => capture(`Contractor Bid ${bid.id}`, () => {
        if (bid.work_order_id) {
            const wo = db.workOrders.find((row) => row.id === bid.work_order_id);
            if (!wo) fail("Contractor Bid", "Work Order not found.");
        }
        if (bid.accepted_scope_id) {
            const scope = db.acceptedScopes.find((row) => row.id === bid.accepted_scope_id);
            if (!scope) fail("Contractor Bid", "Accepted Scope not found.");
        }
    }));
    (db.commissions || []).forEach((commission) => capture(`Commission ${commission.id}`, () => {
        if (commission.work_order_id) {
            const wo = db.workOrders.find((row) => row.id === commission.work_order_id);
            if (!wo) fail("Commission", "Work Order not found.");
            else if (commission.customer_id && wo.customer_id !== commission.customer_id)
                fail("Commission", "Customer does not match the Work Order.");
        }
    }));
    (db.variationRequests || []).forEach((variation) => capture(`Variation ${variation.id}`, () => {
        const wo = db.workOrders.find((row) => row.id === variation.work_order_id);
        if (!wo) fail("Variation", "Work Order not found.");
        else {
            if (wo.customer_id !== variation.customer_id)
                fail("Variation", "Customer does not match the Work Order.");
            if (variation.site_id && wo.site_id !== variation.site_id)
                fail("Variation", "Site does not match the Work Order.");
        }
    }));
    (db.executionLogs || []).forEach((log) => capture(`Execution Log ${log.id}`, () => {
        const wo = db.workOrders.find((row) => row.id === log.work_order_id);
        if (!wo) fail("Execution Log", "Work Order not found.");
        if (log.filed_by_staff_id) {
            const staff = db.master.staff.find((row) => row.id === log.filed_by_staff_id);
            if (!staff) fail("Execution Log", "Filed-by Staff not found.");
        }
    }));
    (db.attendance || []).forEach((record) => capture(`Attendance ${record.id}`, () => {
        const staff = db.master.staff.find((row) => row.id === record.staff_id);
        if (!staff) fail("Attendance", "Staff not found.");
        if (record.visit_id) {
            const visit = db.visits.find((row) => row.id === record.visit_id);
            if (!visit) fail("Attendance", "Visit not found.");
        }
        if (record.work_order_id) {
            const wo = db.workOrders.find((row) => row.id === record.work_order_id);
            if (!wo) fail("Attendance", "Work Order not found.");
        }
    }));
    (db.salaryAdjustments || []).forEach((adj) => capture(`Salary Adjustment ${adj.id}`, () => {
        const staff = db.master.staff.find((row) => row.id === adj.staff_id);
        if (!staff) fail("Salary Adjustment", "Staff not found.");
        if (adj.work_order_id) {
            const wo = db.workOrders.find((row) => row.id === adj.work_order_id);
            if (!wo) fail("Salary Adjustment", "Work Order not found.");
        }
    }));
    (db.leaveRequests || []).forEach((leave) => capture(`Leave Request ${leave.id}`, () => {
        const staff = db.master.staff.find((row) => row.id === leave.staff_id);
        if (!staff) fail("Leave Request", "Staff not found.");
        if (leave.approved_by_staff_id) {
            const approver = db.master.staff.find((row) => row.id === leave.approved_by_staff_id);
            if (!approver) fail("Leave Request", "Approver Staff not found.");
        }
    }));
    return failures;
}
export function replaceAreaId(ids: ID[] | undefined, fromAreaId: ID, toAreaId: ID) {
    return unique((ids || []).map((id) => id === fromAreaId ? toAreaId : id));
}
export function activeAreasForSite(db: RDashDatabase, siteId: ID): Area[] {
    return db.areas.filter((area) => area.site_id === siteId && !area.is_archived);
}
