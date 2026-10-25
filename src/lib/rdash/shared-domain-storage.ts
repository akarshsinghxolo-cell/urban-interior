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
    "contractorSettlements"
  ],
  "financial_documents": [
    "invoices",
    "vendorBills",
    "contractorBills"
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
    "blocked"
  ],
  "reference_libraries": [
    "master.catalogues",
    "master.pinterestBoards",
    "master.referenceMedia"
  ],
  "rate_cards": [
    "master.vendorRates",
    "master.contractorRates",
    "master.customerRateSuggestions"
  ],
  "policy_rules": [
    "approvalPolicies",
    "automationRules",
    "master.commissionRules"
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
