/**
 * Supabase REST workspace data layer.
 *
 * Reads remain collection-based. Writes are delegated to the
 * commit_workspace_operations PostgreSQL function so one logical workspace
 * save is atomic and workspace/row CAS checks occur in the same transaction.
 */
import { getSupabaseAdminClient } from "../../supabase/server";
import type { WorkspaceOperation } from "../workspace-operations";
import type { RDashDatabase, Master } from "../types";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

const COLLECTION_TO_TABLE: Record<string, string> = {
  customers: "entity_customers",
  sites: "entity_sites",
  areas: "entity_areas",
  workRequired: "entity_workRequired",
  measurementRevisions: "entity_measurementRevisions",
  quotations: "entity_quotations",
  acceptedScopes: "entity_acceptedScopes",
  workOrders: "entity_workOrders",
  boqs: "entity_boqs",
  vendorRfqs: "entity_vendorRfqs",
  vendorBids: "entity_vendorBids",
  purchaseOrders: "entity_purchaseOrders",
  grns: "entity_grns",
  inventory: "entity_inventory",
  stockMovements: "entity_stockMovements",
  dispatches: "entity_dispatches",
  vendorBills: "entity_vendorBills",
  vendorPayments: "entity_vendorPayments",
  contractorBills: "entity_contractorBills",
  contractorPayments: "entity_contractorPayments",
  commissions: "entity_commissions",
  workOrderCostLines: "entity_workOrderCostLines",
  contractorBids: "entity_contractorBids",
  contractorSettlements: "entity_contractorSettlements",
  drawings: "entity_drawings",
  executionLogs: "entity_executionLogs",
  variationRequests: "entity_variationRequests",
  visits: "entity_visits",
  tasks: "entity_tasks",
  followups: "entity_followups",
  actions: "entity_actions",
  payments: "entity_payments",
  invoices: "entity_invoices",
  customerReceipts: "entity_customerReceipts",
  blocked: "entity_blocked",
  risks: "entity_risks",
  threads: "entity_threads",
  attendance: "entity_attendance",
  staffLocationPings: "entity_staffLocationPings",
  staffRolePermissions: "entity_staffRolePermissions",
  staffAuthUsers: "entity_staffAuthUsers",
  leaveRequests: "entity_leaveRequests",
  payrollPeriods: "entity_payrollPeriods",
  payrollLines: "entity_payrollLines",
  salaryAdjustments: "entity_salaryAdjustments",
  staffDocuments: "entity_staffDocuments",
  approvalPolicies: "entity_approvalPolicies",
  automationRules: "entity_automationRules",
  recurringTasks: "entity_recurringTasks",
  commSends: "entity_commSends",
  entityFileAttachments: "entity_entityFileAttachments",
  entityReferenceAssignments: "entity_entityReferenceAssignments",
  commercialTerms: "entity_commercialTerms",
  paymentTermTemplates: "entity_paymentTermTemplates",
  taxConfigs: "entity_taxConfigs",
  validityConfigs: "entity_validityConfigs",
  auditLog: "entity_auditLog",
  "master.units": "entity_master_units",
  "master.workCategories": "entity_master_workCategories",
  "master.workSubcategories": "entity_master_workSubcategories",
  "master.articles": "entity_master_articles",
  "master.articleVariants": "entity_master_articleVariants",
  "master.subcategoryArticleMap": "entity_master_subcategoryArticleMap",
  "master.workOptionGroups": "entity_master_workOptionGroups",
  "master.workOptionValues": "entity_master_workOptionValues",
  "master.vendors": "entity_master_vendors",
  "master.contractors": "entity_master_contractors",
  "master.staff": "entity_master_staff",
  "master.sourcePartners": "entity_master_sourcePartners",
  "master.commissionRules": "entity_master_commissionRules",
  "master.vendorRates": "entity_master_vendorRates",
  "master.contractorRates": "entity_master_contractorRates",
  "master.customerRateSuggestions": "entity_master_customerRateSuggestions",
  "master.vendorRateHistories": "entity_master_vendorRateHistories",
  "master.storageAccounts": "entity_master_storageAccounts",
  "master.storageFolderTemplates": "entity_master_storageFolderTemplates",
  "master.storageFolderInstances": "entity_master_storageFolderInstances",
  "master.fileAssets": "entity_master_fileAssets",
  "master.catalogues": "entity_master_catalogues",
  "master.catalogueArticleVendorLinks": "entity_master_catalogueArticleVendorLinks",
  "master.pinterestBoards": "entity_master_pinterestBoards",
  "master.referenceMedia": "entity_master_referenceMedia",
};

function tableFor(collection: string): string | null {
  return COLLECTION_TO_TABLE[collection] || null;
}

export async function getRestWorkspace(): Promise<{
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions: Record<string, number>;
}> {
  const admin = getSupabaseAdminClient();
  const { data: wsRevRow } = await admin
    .from("entity_workspace_revision")
    .select("revision,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();

  const revision = typeof wsRevRow?.revision === "number" ? wsRevRow.revision : 0;
  const updatedAt = (wsRevRow?.updated_at as string) || new Date().toISOString();

  const readCollection = async (collection: string): Promise<{ collection: string; rows: any[] }> => {
    const table = tableFor(collection);
    if (!table) return { collection, rows: [] };
    const { data, error } = await admin
      .from(table)
      .select("id,revision,data")
      .eq("workspace_id", workspaceId);
    if (error || !data) return { collection, rows: [] };
    return { collection, rows: data as any[] };
  };

  const results = await Promise.all(Object.keys(COLLECTION_TO_TABLE).map(readCollection));
  const data: any = { master: {} };
  const rowVersions: Record<string, number> = {};

  for (const { collection, rows } of results) {
    const decoded = rows
      .map((row) => {
        if (typeof row.revision === "number") {
          // Keep the legacy id key for the current client and also expose the
          // collision-safe collection-qualified key for newer clients.
          rowVersions[row.id] = row.revision;
          rowVersions[`${collection}:${row.id}`] = row.revision;
        }
        try {
          return typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (collection.startsWith("master.")) {
      const key = collection.slice("master.".length) as keyof Master;
      data.master[key] = decoded;
    } else {
      data[collection] = decoded;
    }
  }

  data._workspace_mode = "rest";
  data._data_source = "supabase-rest";

  let normalizedData: RDashDatabase;
  try {
    const { prepareWorkspaceData } = await import("../work-category-master");
    const { attachCustomerLabels } = await import("../customer");
    normalizedData = attachCustomerLabels(prepareWorkspaceData(data as Partial<RDashDatabase>));
  } catch (error) {
    console.error("[getRestWorkspace] prepareWorkspaceData failed, returning raw data:", error);
    normalizedData = data as RDashDatabase;
  }

  return { revision, data: normalizedData, updatedAt, rowVersions };
}

export interface AtomicCommitResult {
  upserted: number;
  deleted: number;
  conflicts: number;
  bumpedRowVersions: Record<string, number>;
  newRevision: number;
}

export async function commitRestOperations(
  operations: WorkspaceOperation[],
  expectedWorkspaceRevision: number,
  expectedRowVersions: Record<string, number> = {},
): Promise<AtomicCommitResult> {
  const mappedOperations = operations.map((operation) => {
    const table = tableFor(operation.collection);
    if (!table) throw new Error(`INVALID:Unknown workspace collection ${operation.collection}.`);
    return {
      collection: operation.collection,
      table,
      upsert: operation.upsert || [],
      deleteIds: operation.deleteIds || [],
    };
  });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("commit_workspace_operations", {
    p_workspace_id: workspaceId,
    p_expected_workspace_revision: expectedWorkspaceRevision,
    p_operations: mappedOperations,
    p_expected_row_versions: expectedRowVersions,
  });

  if (error) {
    const message = `${error.message || ""} ${error.details || ""}`;
    if (message.includes("WORKSPACE_CONFLICT") || message.includes("ROW_CONFLICT")) {
      throw new Error("CONFLICT");
    }
    if (message.includes("INVALID_")) {
      throw new Error(`INVALID:${error.message}`);
    }
    throw new Error(`Workspace transaction failed: ${error.message}`);
  }

  const result = (data || {}) as Partial<AtomicCommitResult>;
  if (typeof result.newRevision !== "number") {
    throw new Error("Workspace transaction returned no revision.");
  }

  return {
    upserted: result.upserted || 0,
    deleted: result.deleted || 0,
    conflicts: result.conflicts || 0,
    bumpedRowVersions: result.bumpedRowVersions || {},
    newRevision: result.newRevision,
  };
}

export async function resetRestWorkspace(): Promise<{
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
}> {
  const admin = getSupabaseAdminClient();
  const tables = Object.values(COLLECTION_TO_TABLE);
  await Promise.all(
    tables.map(async (table) => {
      try {
        await admin.from(table).delete().eq("workspace_id", workspaceId);
      } catch {
        // Existing reset behavior is intentionally preserved for now.
      }
    }),
  );

  await admin.from("entity_workspace_revision").upsert(
    {
      id: workspaceId,
      workspace_id: workspaceId,
      revision: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  const { buildSeedDatabase } = await import("../seed");
  const { diffWorkspaceOperations } = await import("../workspace-operations");
  const seedData = buildSeedDatabase() as RDashDatabase;
  const emptyDb = structuredClone(seedData) as any;
  for (const key of Object.keys(emptyDb)) {
    if (Array.isArray(emptyDb[key])) emptyDb[key] = [];
  }
  if (emptyDb.master) {
    for (const key of Object.keys(emptyDb.master)) {
      if (Array.isArray(emptyDb.master[key])) emptyDb.master[key] = [];
    }
  }

  const operations = diffWorkspaceOperations(emptyDb, seedData);
  if (operations.length > 0) {
    await commitRestOperations(operations, 0, {});
  }
  return getRestWorkspace();
}

export async function getRestWorkspaceRevision(): Promise<number> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("entity_workspace_revision")
    .select("revision")
    .eq("id", workspaceId)
    .maybeSingle();
  return typeof data?.revision === "number" ? data.revision : 0;
}
