import { masterCollections, topLevelCollections } from "./workspace-operations";

/** Physical storage is shared by business domain; collection is a required discriminator.
 * Logical collections and their permissions/revision keys remain independent.
 * Customer, Article, Unit and Work taxonomy continue to be single shared masters.
 */
export const SHARED_DOMAIN_COLLECTIONS = {
  "commercial_documents": [
    "quotations",
    "boqs",
    "vendorRfqs",
    "vendorBids",
    "contractorBids",
    "purchaseOrders",
    "contractorSettlements",
    "grns",
    "dispatches"
  ],
  "financial_documents": [
    "invoices",
    "vendorBills",
    "contractorBills",
    "payrollPeriods"
  ],
  "money_movements": [
    "customerReceipts",
    "vendorPayments",
    "contractorPayments"
  ],
  "commercial_settings": [
    "commercialTerms",
    "paymentTermTemplates",
    "taxConfigs",
    "validityConfigs"
  ],
  "workflow_controls": [
    "actions",
    "risks",
    "blocked",
    "tasks",
    "followups",
    "visits"
  ],
  "reference_libraries": [
    "master.catalogues",
    "master.pinterestBoards",
    "master.referenceMedia"
  ],
  "rate_cards": [
    "master.vendorRates",
    "master.contractorRates",
    "master.customerRateSuggestions",
    "master.vendorRateHistories"
  ],
  "policy_rules": [
    "approvalPolicies",
    "automationRules",
    "master.commissionRules",
    "recurringTasks"
  ],
  "work_definitions": [
    "master.workCategories",
    "master.workSubcategories",
    "master.workOptionGroups",
    "master.workOptionValues"
  ],
  "site_records": [
    "measurementRevisions",
    "drawings",
    "executionLogs",
    "variationRequests"
  ],
  "catalogue_items": [
    "master.articles",
    "master.articleVariants"
  ],
  "resource_links": [
    "entityFileAttachments",
    "entityReferenceAssignments"
  ],
  "staff_records": [
    "attendance",
    "payrollLines",
    "leaveRequests",
    "salaryAdjustments",
    "staffDocuments"
  ],
  "storage_structure": [
    "master.storageFolderTemplates",
    "master.storageFolderInstances"
  ]
} as const;

const sharedTables = Object.fromEntries(Object.entries(SHARED_DOMAIN_COLLECTIONS)
  .flatMap(([domain, collections]) => collections.map((collection) => [collection, `entity_${domain}`])));

export const COLLECTION_TO_TABLE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...topLevelCollections.map(String),
    ...masterCollections.map((key) => `master.${key}`),
  ].map((collection) => [collection, sharedTables[collection] || `entity_${collection.replace(".", "_")}`])),
);

export function isSharedCollection(collection: string): boolean {
  return Object.hasOwn(sharedTables, collection);
}
