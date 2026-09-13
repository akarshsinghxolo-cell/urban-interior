import * as core from "./business-rules-core";
import { assertCustomerRecord, assertWorkRequiredDefinition } from "./customer-domain-rules";
import type { Quotation, RDashDatabase, Site } from "./types";

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
 * Canonical quotation rule: a quotation may begin as a Customer-level draft
 * before a physical Site exists. Once Site/Area/Work Required context appears,
 * every relationship must resolve inside that one Customer Site.
 */
export function assertQuotationRelations(
  db: RDashDatabase,
  quotation: Pick<Quotation, "customer_id" | "site_id" | "coverage" | "scope_lines" | "items">,
  context: string,
  options: ValidationOptions = {},
) {
  core.assertCustomerExists(db, quotation.customer_id, context);
  const hasSite = Boolean(quotation.site_id);
  if (hasSite) core.assertSiteBelongsToCustomer(db, quotation.site_id, quotation.customer_id, context, options);

  const coverageRows = quotation.coverage || [];
  if (!hasSite && coverageRows.length) quotationError(context, "A Site is required before quotation coverage can be linked to Work Required.");
  if (hasSite) {
    for (const coverage of coverageRows) {
      const work = core.assertWorkRequiredMatchesContext(db, coverage.work_required_id, quotation.customer_id, quotation.site_id, context, options);
      core.assertAreasBelongToSite(db, coverage.area_ids, quotation.site_id, context, options);
      for (const areaId of unique(coverage.area_ids || [])) {
        if (!work.area_ids.includes(areaId)) quotationError(context, `Quotation coverage Area is not covered by Work Required "${work.title}".`);
      }
      for (const measurementId of unique(coverage.measurement_revision_ids || [])) {
        const measurement = db.measurementRevisions.find((row) => row.id === measurementId);
        if (!measurement || measurement.site_id !== quotation.site_id) quotationError(context, "Quotation coverage includes a Measurement Revision from a different Site.");
        if (!coverage.area_ids.includes(measurement.area_id)) quotationError(context, "Quotation coverage Measurement Revision is outside the covered Areas.");
      }
    }
  }

  for (const item of quotation.scope_lines || quotation.items || []) {
    core.assertLineItemCatalogRelations(db, item, context);
    if (!hasSite) {
      if (item.site_id || item.area_id || item.work_required_id) quotationError(context, `Line "${item.title}" needs a quotation Site before it can be linked to Site, Area, or Work Required.`);
      continue;
    }
    if (item.site_id && item.site_id !== quotation.site_id) quotationError(context, `Line "${item.title}" belongs to a different Site.`);
    if (item.area_id) core.assertAreaBelongsToSite(db, item.area_id, quotation.site_id, context, options);
    if (item.work_required_id) core.assertWorkRequiredMatchesContext(db, item.work_required_id, quotation.customer_id, quotation.site_id, context, options);
  }
}

function addFailure(failures: string[], entry: string) {
  if (!failures.includes(entry)) failures.push(entry);
}

/**
 * The baseline validator predates Customer-level draft quotations. Instead of
 * parsing and suppressing one historical error string, validate those drafts
 * against a synthetic Site in an isolated snapshot, then apply the canonical
 * rule above to the original rows.
 */
function baselineValidationSnapshot(db: RDashDatabase): RDashDatabase {
  const siteLess = db.quotations.filter((quotation) => !quotation.site_id);
  if (!siteLess.length) return db;

  const syntheticSites = new Map<string, Site>();
  for (const quotation of siteLess) {
    if (!db.customers.some((customer) => customer.id === quotation.customer_id)) continue;
    const id = `__customer_quote__:${quotation.customer_id}`;
    if (!syntheticSites.has(id)) {
      syntheticSites.set(id, {
        id,
        customer_id: quotation.customer_id,
        name: "Customer-level quotation validation context",
        site_type: "other",
        stage: "enquiry",
        created_at: quotation.created_at,
        updated_at: quotation.updated_at,
      });
    }
  }

  return {
    ...db,
    sites: [...db.sites, ...syntheticSites.values()],
    quotations: db.quotations.map((quotation) => !quotation.site_id && syntheticSites.has(`__customer_quote__:${quotation.customer_id}`)
      ? { ...quotation, site_id: `__customer_quote__:${quotation.customer_id}` }
      : quotation),
  };
}

export function validateBusinessData(db: RDashDatabase) {
  const failures = core.validateBusinessData(baselineValidationSnapshot(db));

  for (const customer of db.customers) {
    try {
      assertCustomerRecord(db, customer, "Customer");
    } catch (error) {
      addFailure(failures, `Customer ${customer.id}: ${error instanceof Error ? error.message : "Customer validation failed."}`);
    }
  }

  for (const work of db.workRequired) {
    try {
      assertWorkRequiredDefinition(db, work, "Work Required");
    } catch (error) {
      addFailure(failures, `Work Required ${work.id}: ${error instanceof Error ? error.message : "Work Required validation failed."}`);
    }
  }

  for (const quotation of db.quotations.filter((row) => !row.site_id)) {
    if (!db.customers.some((customer) => customer.id === quotation.customer_id)) continue;
    try {
      assertQuotationRelations(db, quotation, "Quotation", { allowArchived: true });
    } catch (error) {
      addFailure(failures, `Quotation ${quotation.id}: ${error instanceof Error ? error.message : "Relationship validation failed."}`);
    }
  }
  return failures;
}
