/**
 * Canonical Customer workspace read model.
 *
 * Customer list, detail, timeline, Customer-family modules, and the generic
 * customer-scope fallback all derive from these constants. Customer Desk and
 * Site Execution may both edit Site / Area / Work Required through the same
 * canonical records and mutations. Finance/procurement collections and
 * contractor/vendor rate masters do not belong to the Customer CRM surface;
 * their owning modules keep those commercial details permission-scoped.
 */
export const CUSTOMER_CRM_DIRECT_RELATIONS = Object.freeze([
  "sites",
  "workRequired",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "visits",
  "tasks",
  "followups",
  "blocked",
  "risks",
  "commSends",
] as const);

/** Rows reached through a Customer's Site / Work Order graph. */
export const CUSTOMER_CRM_DOWNSTREAM_RELATIONS = Object.freeze([
  "areas",
  "measurementRevisions",
  "boqs",
  "drawings",
  "executionLogs",
  "variationRequests",
] as const);

/** Supporting CRM history / files that are safe under Customers permission. */
export const CUSTOMER_CRM_SUPPORT_COLLECTIONS = Object.freeze([
  "entityFileAttachments",
  "auditLog",
  "master.fileAssets",
  "master.sourcePartners",
] as const);

export const CUSTOMER_CRM_COLLECTIONS = Object.freeze([
  "customers",
  ...CUSTOMER_CRM_DIRECT_RELATIONS,
  ...CUSTOMER_CRM_DOWNSTREAM_RELATIONS,
  ...CUSTOMER_CRM_SUPPORT_COLLECTIONS,
] as const);

/**
 * Scope fallback adds only conversations. Taxonomy masters are loaded through
 * the workspace foundation, so they do not need to be duplicated here.
 */
export const CUSTOMER_SCOPE_COLLECTIONS = Object.freeze([
  ...CUSTOMER_CRM_COLLECTIONS,
  "threads",
] as const);

/** Explicit deny-list used by tests so restricted data cannot silently drift back in. */
export const CUSTOMER_CRM_FORBIDDEN_COLLECTIONS = Object.freeze([
  "payments",
  "invoices",
  "customerReceipts",
  "purchaseOrders",
  "grns",
  "dispatches",
  "vendorRfqs",
  "vendorBids",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorBids",
  "contractorSettlements",
  "workOrderCostLines",
  "commissions",
  "stockMovements",
  "attendance",
  "actions",
  "commercialTerms",
  "paymentTermTemplates",
  "taxConfigs",
  "validityConfigs",
  "master.vendors",
  "master.vendorRates",
  "master.vendorRateHistories",
  "master.contractors",
  "master.contractorRates",
] as const);
