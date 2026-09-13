/**
 * Canonical Customer workspace read model.
 *
 * Customer Desk and Customer Timeline intentionally share this one collection
 * contract. Finance/procurement collections do not belong to the Customer CRM
 * surface; those modules own payments, invoices, receipts, vendor/contractor
 * liabilities, purchase orders, GRNs, rates and approvals.
 */
export const CUSTOMER_CRM_COLLECTIONS = Object.freeze([
  "customers",
  "sites",
  "areas",
  "workRequired",
  "measurementRevisions",
  "quotations",
  "acceptedScopes",
  "workOrders",
  "tasks",
  "followups",
  "visits",
  "risks",
  "blocked",
  "commSends",
  "boqs",
  "drawings",
  "executionLogs",
  "variationRequests",
  "entityFileAttachments",
  "auditLog",
  "master.fileAssets",
  "master.sourcePartners",
] as const);

/** Explicit deny-list used by tests so finance cannot silently drift back in. */
export const CUSTOMER_CRM_FORBIDDEN_COLLECTIONS = Object.freeze([
  "payments",
  "invoices",
  "customerReceipts",
  "purchaseOrders",
  "grns",
  "vendorBills",
  "vendorPayments",
  "contractorBills",
  "contractorPayments",
  "contractorSettlements",
  "workOrderCostLines",
  "commissions",
  "actions",
  "master.vendors",
  "master.vendorRates",
  "master.vendorRateHistories",
  "master.contractors",
  "master.contractorRates",
] as const);
