/**
 * REST-based commit pipeline using Supabase REST API (@supabase/supabase-js).
 *
 * This is the sole data layer (no Prisma, no blob). Each collection maps to an
 * `entity_*` table with a uniform structure: {id, workspace_id, revision, data}.
 *
 * Per-row CAS: PATCH /entity_<table>?id=eq.X&revision=eq.N
 *   → 0 rows updated = concurrent edit = CONFLICT (409)
 *
 * Works locally AND on Vercel (REST over HTTPS — no pooler needed).
 */
import { getSupabaseAdminClient } from "../../supabase/server";
import type { WorkspaceOperation } from "../workspace-operations";
import type { RDashDatabase, Master } from "../types";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

// ----------------------------------------------------------------------------
// Collection → entity_* table name mapping (81 collections)
// ----------------------------------------------------------------------------
const COLLECTION_TO_TABLE: Record<string, string> = {
  // Top-level collections (56)
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
  // Master collections (25) — prefixed with "master."
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

/**
 * Reads the full workspace from entity_* tables via REST.
 * Each table is read in parallel. Returns the assembled RDashDatabase.
 *
 * For large workspaces, this reads all 81 tables — but each read is a targeted
 * SELECT (not a full blob). Future optimization: lazy-load collections on demand.
 */
export async function getRestWorkspace(): Promise<{
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions: Record<string, number>;
}> {
  const admin = getSupabaseAdminClient();

  // Read whole-workspace revision (single row).
  const { data: wsRevRow } = await admin
    .from("entity_workspace_revision")
    .select("revision,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();
  const wsRevision: number = typeof wsRevRow?.revision === "number" ? wsRevRow.revision : 0;
  const updatedAt: string = (wsRevRow?.updated_at as string) || new Date().toISOString();

  // Read all entity_* tables in parallel.
  const readCollection = async (collection: string): Promise<{ collection: string; rows: any[] }> => {
    const table = tableFor(collection);
    if (!table) return { collection, rows: [] };
    const { data, error } = await admin.from(table).select("id,revision,data").eq("workspace_id", workspaceId);
    if (error || !data) return { collection, rows: [] };
    return { collection, rows: data as any[] };
  };

  const collections = Object.keys(COLLECTION_TO_TABLE);
  const results = await Promise.all(collections.map(readCollection));

  // Assemble the RDashDatabase.
  const data: any = { master: {} };
  const rowVersions: Record<string, number> = {};
  for (const { collection, rows } of results) {
    const decoded = rows.map((r) => {
      if (r.revision) rowVersions[r.id] = r.revision;
      try {
        return typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      } catch {
        return null;
      }
    }).filter(Boolean);
    if (collection.startsWith("master.")) {
      const key = collection.slice("master.".length) as keyof Master;
      data.master[key] = decoded;
    } else {
      data[collection] = decoded;
    }
  }
  data._workspace_mode = "rest";
  data._data_source = "supabase-rest";

  // QA-INTEGRITY-001: Normalize the workspace before returning so missing
  // master.storageFolderTemplates (and other auto-seedable master fields) are
  // backfilled in-memory. Without this, every workspace load returns 0
  // templates even though normalizeStorageMaster knows how to seed them —
  // which trips the integrity checker (313 issues: 11 critical "template_id
  // references missing template") and breaks downstream features that look
  // up templates by purpose (storage path resolver, upload route, etc.).
  // prepareWorkspaceData is idempotent: it only fills in missing fields,
  // never overwrites real user data.
  let normalizedData: RDashDatabase;
  try {
    const { prepareWorkspaceData } = await import("../work-category-master");
    const { attachCustomerLabels } = await import("../customer");
    normalizedData = attachCustomerLabels(prepareWorkspaceData(data as Partial<RDashDatabase>));
  } catch (normalizeErr) {
    // Normalization is best-effort — if it throws, return the raw data so the
    // client can still operate. Log for debugging.
    console.error("[getRestWorkspace] prepareWorkspaceData failed, returning raw data:", normalizeErr);
    normalizedData = data as RDashDatabase;
  }

  return { revision: wsRevision, data: normalizedData, updatedAt, rowVersions };
}

/**
 * Seeds the Supabase entity_* tables from buildSeedDatabase().
 * Called automatically on first run when the workspace is empty.
 */
async function seedRestWorkspace(): Promise<void> {
  const { buildSeedDatabase } = await import("../seed");
  const { diffWorkspaceOperations } = await import("../workspace-operations");
  const seedData = buildSeedDatabase() as RDashDatabase;

  // Build empty db to diff against.
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
    await commitRestOperations(operations);
  }
}

/**
 * Commits a batch of operations as per-row REST writes.
 *
 * Each operation {collection, upsert[], deleteIds[]} translates to:
 *   - upsert: PATCH /entity_<table> (per row, with CAS via revision)
 *   - delete: DELETE /entity_<table>?id=in.(id1,id2,...)
 *
 * Per-row CAS: if expectedRowVersions[id] is provided, the update only succeeds
 * if the current revision matches. Mismatch = 0 rows = conflict (409).
 *
 * Returns bumped versions for the lightweight response.
 */
export async function commitRestOperations(
  operations: WorkspaceOperation[],
  expectedRowVersions?: Record<string, number>,
): Promise<{
  upserted: number;
  deleted: number;
  conflicts: number;
  bumpedRowVersions: Record<string, number>;
  newRevision?: number;
}> {
  const admin = getSupabaseAdminClient();
  let upserted = 0;
  let deleted = 0;
  let conflicts = 0;
  const bumpedRowVersions: Record<string, number> = {};
  const conflictRows: Array<{ collection: string; id: string }> = [];

  // FIX-FK-001: When FK constraints are active, deletes must happen in
  // REVERSE order (children first, parents last). The operations array is
  // ordered parent-first (customers, sites, areas, ...), so we reverse it
  // for deletes. Upserts stay in forward order (parents first).
  const deleteOps = [...operations].reverse();
  const upsertOps = operations;

  // Phase 1: Deletes (children first, reversed)
  for (const op of deleteOps) {
    const table = tableFor(op.collection);
    if (!table) continue;
    if (op.deleteIds?.length) {
      const { error } = await admin.from(table).delete().in("id", op.deleteIds);
      if (!error) deleted += op.deleteIds.length;
    }
  }

  // Phase 2: Upserts (parents first, forward order — same as before)
  for (const op of upsertOps) {
    const table = tableFor(op.collection);
    if (!table) {
      console.warn(`[commit-rest] no table for collection: ${op.collection}`);
      continue;
    }

    if (op.upsert?.length) {
      for (const row of op.upsert) {
        const id = String(row.id);
        if (!id) continue;
        const dataJson = typeof row === "object" ? row : {};
        const expectedVer = expectedRowVersions?.[id];

        // Try to read the current revision (for CAS + to know if it's create vs update).
        const { data: existing } = await admin.from(table).select("revision").eq("id", id).maybeSingle();
        const existingRevision: number = typeof existing?.revision === "number" ? existing.revision : 0;

        if (existing) {
          // UPDATE path — check CAS if expected version provided.
          if (expectedVer !== undefined && existingRevision !== expectedVer) {
            conflicts++;
            conflictRows.push({ collection: op.collection, id });
            continue;
          }
          const newRevision = existingRevision + 1;
          const { error } = await admin.from(table).update({
            data: dataJson,
            revision: newRevision,
            updated_at: new Date().toISOString(),
          }).eq("id", id);
          if (!error) {
            upserted++;
            bumpedRowVersions[id] = newRevision;
          }
        } else {
          // CREATE path.
          const { error } = await admin.from(table).insert({
            id,
            workspace_id: workspaceId,
            revision: 0,
            data: dataJson,
            updated_at: new Date().toISOString(),
          });
          if (!error) {
            upserted++;
            bumpedRowVersions[id] = 0;
          } else if (String(error.code || "").includes("23505")) {
            // Unique constraint — row was created concurrently = conflict.
            conflicts++;
            conflictRows.push({ collection: op.collection, id });
          }
        }
      }
    }
  }

  if (conflicts > 0) {
    console.warn(`[commit-rest] ${conflicts} row conflicts detected:`, conflictRows.slice(0, 5));
  }

  // Bump whole-workspace revision (read current, increment, update).
  let newRevision: number | undefined;
  const { data: currentRev } = await admin
    .from("entity_workspace_revision")
    .select("revision")
    .eq("id", workspaceId)
    .maybeSingle();
  const currentRevision: number = typeof currentRev?.revision === "number" ? currentRev.revision : 0;
  const nextRevision = currentRevision + 1;
  const { error: bumpError } = await admin
    .from("entity_workspace_revision")
    .upsert({
      id: workspaceId,
      workspace_id: workspaceId,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (!bumpError) {
    newRevision = nextRevision;
  }

  return { upserted, deleted, conflicts, bumpedRowVersions, newRevision };
}

/**
 * Resets the workspace: deletes all entity_* rows + re-seeds.
 */
export async function resetRestWorkspace(): Promise<{ revision: number; data: RDashDatabase; updatedAt: string }> {
  const admin = getSupabaseAdminClient();

  // Delete all rows from all entity_* tables (parallel).
  const tables = Object.values(COLLECTION_TO_TABLE);
  await Promise.all(tables.map(async (table) => {
    try { await admin.from(table).delete().eq("workspace_id", workspaceId); } catch { /* ignore */ }
  }));

  // Reset workspace revision to 0.
  await admin.from("entity_workspace_revision").upsert({
    id: workspaceId,
    workspace_id: workspaceId,
    revision: 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  // Re-seed from buildSeedDatabase.
  const { buildSeedDatabase } = await import("../seed");
  const { diffWorkspaceOperations } = await import("../workspace-operations");
  const seedData = buildSeedDatabase() as RDashDatabase;

  // Build empty db to diff against. MUST deep-clone so emptying arrays in
  // emptyDb doesn't mutate seedData (shallow copy shares the .master ref).
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
    await commitRestOperations(operations);
  }

  return getRestWorkspace();
}

/**
 * Reads the current whole-workspace revision (for CAS checks).
 */
export async function getRestWorkspaceRevision(): Promise<number> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("entity_workspace_revision")
    .select("revision")
    .eq("id", workspaceId)
    .maybeSingle();
  return typeof data?.revision === "number" ? data.revision : 0;
}
