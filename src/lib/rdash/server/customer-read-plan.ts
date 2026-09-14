/**
 * Canonical Customer workspace read model.
 *
 * The Customer CRM graph is the always-safe base. Rich Customer Desk features
 * are restored through permission-aware extensions below: Finance,
 * Procurement, Media, Vendor and Contractor data are never granted merely
 * because a role can open Customers.
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

/** Customer-linked media restored when the role can view Files & Media. */
export const CUSTOMER_MEDIA_COLLECTIONS = Object.freeze([
  "entityReferenceAssignments",
  "master.catalogues",
  "master.pinterestBoards",
  "master.referenceMedia",
] as const);

/** Customer commercial / collection data restored when the role can view Finance. */
export const CUSTOMER_FINANCE_COLLECTIONS = Object.freeze([
  "payments",
  "invoices",
  "customerReceipts",
  "workOrderCostLines",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorSettlements",
  "actions",
] as const);

/** Customer-linked buying / receipt records restored only with Procurement access. */
export const CUSTOMER_PROCUREMENT_COLLECTIONS = Object.freeze([
  "purchaseOrders",
  "grns",
  "dispatches",
  "vendorRfqs",
  "vendorBids",
] as const);

/** Vendor directory used by the Customer referrer picker when Vendors is allowed. */
export const CUSTOMER_VENDOR_COLLECTIONS = Object.freeze([
  "master.vendors",
] as const);

/**
 * Contractor directory + work-type rates support both the restored referrer
 * picker and the detailed-area live estimate. They are never part of the
 * Customers-only graph.
 */
export const CUSTOMER_CONTRACTOR_COLLECTIONS = Object.freeze([
  "master.contractors",
  "master.contractorRates",
] as const);

/**
 * Customer-family modules can render the richer cockpit, but every collection
 * below remains conditional on its owning permission domain at runtime.
 */
export const CUSTOMER_PERMISSION_EXTENSION_MODULES = Object.freeze([
  "customerDesk",
  "customerTimeline",
  "customerRequests",
  "salesPipeline",
  "lostClosedReview",
] as const);

/**
 * Static superset used by source/plan guardrails. This is NOT a grant list:
 * runtime reads must start from CUSTOMER_CRM_COLLECTIONS and add only the
 * domain sets authorized for the current role.
 */
export const CUSTOMER_PERMISSION_AWARE_COLLECTIONS = Object.freeze([
  ...CUSTOMER_MEDIA_COLLECTIONS,
  ...CUSTOMER_FINANCE_COLLECTIONS,
  ...CUSTOMER_PROCUREMENT_COLLECTIONS,
  ...CUSTOMER_VENDOR_COLLECTIONS,
  ...CUSTOMER_CONTRACTOR_COLLECTIONS,
] as const);

/**
 * Scope fallback adds only conversations. Taxonomy masters are loaded through
 * the workspace foundation, so they do not need to be duplicated here.
 */
export const CUSTOMER_SCOPE_COLLECTIONS = Object.freeze([
  ...CUSTOMER_CRM_COLLECTIONS,
  "threads",
] as const);

/**
 * Collections forbidden from the *base* Customers-only graph. Some are valid
 * permission-aware Customer Desk extensions above; this list remains useful
 * for proving that CUSTOMER_CRM_COLLECTIONS itself never drifts into them.
 */
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
