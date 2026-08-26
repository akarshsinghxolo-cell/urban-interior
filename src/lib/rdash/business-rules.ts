import * as core from "./business-rules-core";
import type { Quotation, RDashDatabase } from "./types";

export * from "./business-rules-core";

type ValidationOptions = {
    allowArchived?: boolean;
};

function unique(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean)));
}

function quotationError(context: string, message: string): never {
    throw new core.BusinessRuleError(`${context}: ${message}`);
}

/**
 * Quotations may start as customer-level commercial drafts before a physical
 * Site exists. Once any Site/Area/Work Required context is attached, the
 * original strict relationship checks still apply.
 */
export function assertQuotationRelations(
    db: RDashDatabase,
    quotation: Pick<Quotation, "customer_id" | "site_id" | "coverage" | "scope_lines" | "items">,
    context: string,
    options: ValidationOptions = {},
) {
    core.assertCustomerExists(db, quotation.customer_id, context);

    const hasSite = Boolean(quotation.site_id);
    if (hasSite) {
        core.assertSiteBelongsToCustomer(db, quotation.site_id, quotation.customer_id, context, options);
    }

    const coverageRows = quotation.coverage || [];
    if (!hasSite && coverageRows.length) {
        quotationError(context, "A Site is required before quotation coverage can be linked to Work Required.");
    }

    if (hasSite) {
        for (const coverage of coverageRows) {
            const work = core.assertWorkRequiredMatchesContext(
                db,
                coverage.work_required_id,
                quotation.customer_id,
                quotation.site_id,
                context,
                options,
            );
            core.assertAreasBelongToSite(db, coverage.area_ids, quotation.site_id, context, options);
            for (const areaId of unique(coverage.area_ids || [])) {
                if (!work.area_ids.includes(areaId)) {
                    quotationError(context, `Quotation coverage Area is not covered by Work Required "${work.title}".`);
                }
            }
            for (const measurementId of unique(coverage.measurement_revision_ids || [])) {
                const measurement = db.measurementRevisions.find((row) => row.id === measurementId);
                if (!measurement || measurement.site_id !== quotation.site_id) {
                    quotationError(context, "Quotation coverage includes a Measurement Revision from a different Site.");
                }
                if (!coverage.area_ids.includes(measurement.area_id)) {
                    quotationError(context, "Quotation coverage Measurement Revision is outside the covered Areas.");
                }
            }
        }
    }

    for (const item of quotation.scope_lines || quotation.items || []) {
        core.assertLineItemCatalogRelations(db, item, context);
        if (!hasSite) {
            if (item.site_id || item.area_id || item.work_required_id) {
                quotationError(context, `Line "${item.title}" needs a quotation Site before it can be linked to Site, Area, or Work Required.`);
            }
            continue;
        }
        if (item.site_id && item.site_id !== quotation.site_id) {
            quotationError(context, `Line "${item.title}" belongs to a different Site.`);
        }
        if (item.area_id) {
            core.assertAreaBelongsToSite(db, item.area_id, quotation.site_id, context, options);
        }
        if (item.work_required_id) {
            core.assertWorkRequiredMatchesContext(
                db,
                item.work_required_id,
                quotation.customer_id,
                quotation.site_id,
                context,
                options,
            );
        }
    }
}

/**
 * Keep the existing whole-workspace validator, but replace only its legacy
 * "Site does not exist" result for customer-level quotations with the new
 * quotation rule above. All other business rules remain owned by the core.
 */
export function validateBusinessData(db: RDashDatabase) {
    const siteLessIds = new Set(db.quotations.filter((quotation) => !quotation.site_id).map((quotation) => quotation.id));
    const failures = core.validateBusinessData(db).filter((failure) => {
        const match = failure.match(/^Quotation ([^:]+): Quotation: Site does not exist\.$/);
        return !(match && siteLessIds.has(match[1]));
    });

    for (const quotation of db.quotations.filter((row) => !row.site_id)) {
        // If the Customer itself is missing, the core validator already reports
        // that error; avoid adding a duplicate copy here.
        if (!db.customers.some((customer) => customer.id === quotation.customer_id)) {
            continue;
        }
        try {
            assertQuotationRelations(db, quotation, "Quotation", { allowArchived: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Relationship validation failed.";
            const entry = `Quotation ${quotation.id}: ${message}`;
            if (!failures.includes(entry)) failures.push(entry);
        }
    }

    return failures;
}
