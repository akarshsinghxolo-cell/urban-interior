export type DatabaseArchitectureDecision =
  | "keep"
  | "keep-normalize-later"
  | "merge-candidate"
  | "profile-consolidation-candidate"
  | "projection-view-candidate"
  | "infrastructure-keep";

export type DatabaseArchitectureDomain =
  | "customer-site"
  | "execution"
  | "workflow"
  | "procurement"
  | "finance"
  | "hr"
  | "partners"
  | "catalog"
  | "commercial-config"
  | "media"
  | "system";

export interface CollectionArchitectureDecision {
  domain: DatabaseArchitectureDomain;
  decision: DatabaseArchitectureDecision;
  canonicalTruth: string;
  targetConcept?: string;
  risk: "low" | "medium" | "high" | "critical";
}

const decision = (
  domain: DatabaseArchitectureDomain,
  architectureDecision: DatabaseArchitectureDecision,
  canonicalTruth: string,
  risk: CollectionArchitectureDecision["risk"],
  targetConcept?: string,
): CollectionArchitectureDecision => Object.freeze({
  domain,
  decision: architectureDecision,
  canonicalTruth,
  risk,
  ...(targetConcept ? { targetConcept } : {}),
});

/**
 * Architecture decision for every logical collection persisted through
 * COLLECTION_TO_TABLE.
 *
 * This registry is intentionally descriptive only: importing it must never
 * change persistence behavior. Any future collection added to the REST commit
 * mapper must also receive an explicit architecture decision here so table
 * growth cannot happen silently.
 */
export const COLLECTION_ARCHITECTURE = Object.freeze({
  customers: decision("customer-site", "profile-consolidation-candidate", "Customer profile", "critical", "Party + CustomerProfile"),
  sites: decision("customer-site", "keep-normalize-later", "Site", "critical"),
  areas: decision("customer-site", "keep-normalize-later", "Site area/room", "high"),
  workRequired: decision("customer-site", "keep-normalize-later", "Work requirement", "high"),
  measurementRevisions: decision("customer-site", "keep", "Measurement revision", "medium"),
  quotations: decision("customer-site", "keep-normalize-later", "Quotation", "high"),
  acceptedScopes: decision("customer-site", "keep-normalize-later", "Accepted scope", "high"),
  workOrders: decision("execution", "keep-normalize-later", "Work order", "critical"),
  boqs: decision("execution", "keep-normalize-later", "BOQ", "high"),

  vendorRfqs: decision("procurement", "keep-normalize-later", "Vendor RFQ", "high"),
  vendorBids: decision("procurement", "keep-normalize-later", "Vendor bid", "high"),
  purchaseOrders: decision("procurement", "keep-normalize-later", "Purchase order", "critical"),
  grns: decision("procurement", "keep-normalize-later", "Goods received note", "critical"),
  inventory: decision("procurement", "keep-normalize-later", "Inventory position", "high"),
  stockMovements: decision("procurement", "keep-normalize-later", "Stock movement", "high"),
  dispatches: decision("procurement", "keep-normalize-later", "Dispatch/stock issue", "high"),

  vendorBills: decision("finance", "merge-candidate", "Vendor bill", "critical", "FinancialDocument"),
  vendorPayments: decision("finance", "merge-candidate", "Vendor payment", "critical", "FinancialTransaction"),
  contractorBills: decision("finance", "merge-candidate", "Contractor bill", "critical", "FinancialDocument"),
  contractorPayments: decision("finance", "merge-candidate", "Contractor payment", "critical", "FinancialTransaction"),
  commissions: decision("finance", "keep-normalize-later", "Commission", "high"),
  workOrderCostLines: decision("finance", "keep-normalize-later", "Work-order cost line", "high"),
  contractorBids: decision("execution", "keep-normalize-later", "Contractor bid", "high"),
  contractorSettlements: decision("finance", "keep-normalize-later", "Contractor settlement", "high"),

  drawings: decision("execution", "keep", "Drawing", "medium"),
  executionLogs: decision("execution", "keep", "Execution log", "medium"),
  variationRequests: decision("execution", "keep-normalize-later", "Variation request", "high"),
  visits: decision("execution", "keep-normalize-later", "Field visit", "high"),

  tasks: decision("workflow", "merge-candidate", "Task", "high", "WorkItem"),
  followups: decision("workflow", "merge-candidate", "Follow-up", "high", "WorkItem"),
  actions: decision("workflow", "merge-candidate", "Business action", "high", "WorkItem"),
  payments: decision("finance", "merge-candidate", "Customer payment/collection", "critical", "FinancialTransaction"),
  invoices: decision("finance", "merge-candidate", "Customer invoice", "critical", "FinancialDocument"),
  customerReceipts: decision("finance", "merge-candidate", "Customer receipt", "critical", "FinancialTransaction"),
  blocked: decision("workflow", "merge-candidate", "Blocker", "medium", "Issue"),
  risks: decision("workflow", "merge-candidate", "Risk", "medium", "Issue"),
  threads: decision("workflow", "keep-normalize-later", "Conversation thread", "high"),

  attendance: decision("hr", "keep-normalize-later", "Attendance", "high"),
  staffRolePermissions: decision("hr", "infrastructure-keep", "Role permission assignment", "critical"),
  leaveRequests: decision("hr", "keep-normalize-later", "Leave request", "medium"),
  payrollPeriods: decision("hr", "keep-normalize-later", "Payroll period", "high"),
  payrollLines: decision("hr", "keep-normalize-later", "Payroll line", "high"),
  salaryAdjustments: decision("hr", "keep-normalize-later", "Salary adjustment", "high"),
  staffDocuments: decision("hr", "merge-candidate", "Staff document metadata", "medium", "Document/EntityAttachment"),

  approvalPolicies: decision("workflow", "keep", "Approval policy", "medium"),
  automationRules: decision("workflow", "keep", "Automation rule", "medium"),
  recurringTasks: decision("workflow", "merge-candidate", "Recurring task template", "medium", "WorkItem recurrence"),
  commSends: decision("media", "keep", "Communication send event", "medium"),
  entityFileAttachments: decision("media", "keep-normalize-later", "Entity-file attachment", "high"),
  entityReferenceAssignments: decision("media", "merge-candidate", "Entity-reference assignment", "medium", "Generic resource assignment"),

  commercialTerms: decision("commercial-config", "merge-candidate", "Commercial terms configuration", "medium", "CommercialConfig"),
  paymentTermTemplates: decision("commercial-config", "merge-candidate", "Payment-term configuration", "medium", "CommercialConfig"),
  taxConfigs: decision("commercial-config", "merge-candidate", "Tax configuration", "high", "CommercialConfig"),
  validityConfigs: decision("commercial-config", "merge-candidate", "Validity configuration", "medium", "CommercialConfig"),
  auditLog: decision("system", "infrastructure-keep", "Audit event", "critical"),

  "master.units": decision("catalog", "keep-normalize-later", "Unit", "high"),
  "master.workCategories": decision("catalog", "keep-normalize-later", "Work category", "high"),
  "master.workSubcategories": decision("catalog", "keep-normalize-later", "Work subcategory", "high"),
  "master.articles": decision("catalog", "keep-normalize-later", "Article", "high"),
  "master.articleVariants": decision("catalog", "keep-normalize-later", "Article variant", "medium"),
  "master.subcategoryArticleMap": decision("catalog", "keep-normalize-later", "Subcategory/article relationship", "high"),
  "master.workOptionGroups": decision("catalog", "keep", "Work option group", "medium"),
  "master.workOptionValues": decision("catalog", "keep", "Work option value", "medium"),

  "master.vendors": decision("partners", "profile-consolidation-candidate", "Vendor profile", "critical", "Party + VendorProfile"),
  "master.contractors": decision("partners", "profile-consolidation-candidate", "Contractor profile", "critical", "Party + ContractorProfile"),
  "master.staff": decision("hr", "profile-consolidation-candidate", "Workspace Staff profile", "critical", "Canonical Staff"),
  "master.sourcePartners": decision("partners", "profile-consolidation-candidate", "Source/referral partner", "high", "Party + SourcePartnerProfile"),
  "master.commissionRules": decision("finance", "keep", "Commission rule", "medium"),
  "master.vendorRates": decision("partners", "keep-normalize-later", "Current vendor rate", "high"),
  "master.contractorRates": decision("partners", "projection-view-candidate", "Contractor.work_capabilities", "medium", "Contractor Rate view/projection"),
  "master.customerRateSuggestions": decision("commercial-config", "keep", "Customer rate suggestion", "medium"),
  "master.vendorRateHistories": decision("partners", "keep", "Vendor rate history/event", "medium"),

  "master.storageAccounts": decision("media", "keep", "Storage account", "high"),
  "master.storageFolderTemplates": decision("media", "keep", "Storage-folder template", "medium"),
  "master.storageFolderInstances": decision("media", "keep", "Storage-folder instance", "medium"),
  "master.fileAssets": decision("media", "keep-normalize-later", "File asset metadata", "high"),
  "master.catalogues": decision("media", "keep", "Catalogue", "medium"),
  "master.catalogueArticleVendorLinks": decision("media", "keep", "Catalogue/article/vendor relationship", "medium"),
  "master.pinterestBoards": decision("media", "keep", "Pinterest board reference", "low"),
  "master.referenceMedia": decision("media", "merge-candidate", "Reference media", "medium", "Generic resource/reference model"),
} satisfies Record<string, CollectionArchitectureDecision>);

export type RegisteredWorkspaceCollection = keyof typeof COLLECTION_ARCHITECTURE;
