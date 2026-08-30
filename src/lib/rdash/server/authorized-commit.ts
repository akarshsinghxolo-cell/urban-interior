import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { attachCustomerLabels } from "../customer";
import { canonicalizeCustomerRow } from "../customer-record";
import { prepareWorkspaceData } from "../work-category-master";
import { repairOperationalWorkspace } from "../operational-repair";
import {
  applyWorkspaceOperations,
  diffWorkspaceOperations,
  operationSummary,
  type WorkspaceOperation,
} from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { introducedIntegrityIssues } from "./integrity-delta";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import { prepareTargetedCommit } from "./targeted-commit";
import { prepareSimpleTargetedCommit } from "./simple-targeted-commit";
import { applyVendorRateAverages } from "../vendor-rate-average";
import { canonicalizeVendorRateMaster } from "../vendor-rate";
import { contractorRateProjection } from "../contractor-profile";
import { moduleForCollection } from "../staff-operations";
import type { ModuleWorkspaceReadScope } from "../workspace-read-scope";
import { COLLECTIONS_BY_SCOPE } from "./module-scoped-collections";
import {
  commitWorkspaceOperations,
  getWorkspaceSubset,
  type WorkspaceReadPlan,
} from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

const VALIDATION_SCOPE_BY_MODULE: Readonly<Record<string, ModuleWorkspaceReadScope>> = Object.freeze({
  workspace: "system",
  customers: "customer",
  sites: "site",
  work: "site",
  quotations: "quotation",
  workOrders: "site",
  boqs: "site",
  tasks: "workdesk",
  visits: "field",
  attendance: "hr",
  gps: "field",
  vendors: "procurement",
  contractors: "finance",
  procurement: "procurement",
  purchaseOrders: "procurement",
  grns: "procurement",
  inventory: "procurement",
  finance: "finance",
  payroll: "hr",
  staff: "hr",
  masters: "master",
  media: "media",
  approvals: "system",
  reports: "reports",
  system: "system",
});

const CONTRACTOR_CANONICAL_COLLECTIONS = Object.freeze([
  "master.contractors",
  "master.contractorRates",
  "master.workCategories",
  "master.workSubcategories",
  "master.articles",
  "master.articleVariants",
  "master.subcategoryArticleMap",
  "master.units",
  "master.sourcePartners",
] as const);

const MASTER_REVERSE_VALIDATION_SCOPES: readonly ModuleWorkspaceReadScope[] = Object.freeze([
  "master",
  "quotation",
  "procurement",
  "site",
]);

function normalizeWorkspace(data: RDashDatabase) {
  return attachCustomerLabels(prepareWorkspaceData(repairOperationalWorkspace(data)));
}

function canonicalizeVendorRateOperations(
  current: RDashDatabase,
  operations: WorkspaceOperation[],
): WorkspaceOperation[] {
  if (!operations.some((operation) => ["master.vendorRates", "master.vendorRateHistories"].includes(operation.collection))) {
    return operations;
  }
  const candidate = applyWorkspaceOperations(current, operations);
  const canonicalRates = { ...candidate, master: canonicalizeVendorRateMaster(candidate.master) };
  const canonical = applyVendorRateAverages(current, canonicalRates);
  return diffWorkspaceOperations(current, canonical);
}

function assertCanonicalThreadOperations(operations: WorkspaceOperation[]): void {
  for (const operation of operations) {
    if (operation.collection !== "threads") continue;
    for (const row of operation.upsert || []) {
      const kind = String(row.kind || row.record_type || "");
      const recordId = String(row.record_id || "").trim();
      if (kind === "generic" && recordId.startsWith("cust-")) {
        throw new Error("INVALID:Customer conversation threads must use customer-conversation:<customer_id>.");
      }
    }
  }
}

function sanitizeWorkspaceOperations(operations: WorkspaceOperation[]): WorkspaceOperation[] {
  assertCanonicalThreadOperations(operations);
  return operations.map((operation) => {
    if (operation.collection === "customers") {
      return {
        ...operation,
        upsert: (operation.upsert || []).map((row) => canonicalizeCustomerRow(row)),
      };
    }
    if (operation.collection !== "master.staff") return operation;
    return {
      ...operation,
      upsert: (operation.upsert || []).map((row) => {
        const safe = { ...row };
        delete safe.temporary_password;
        delete safe.force_password_change;
        return safe;
      }),
    };
  });
}

function canonicalizeContractorRateOperations(
  current: RDashDatabase,
  operations: WorkspaceOperation[],
): WorkspaceOperation[] {
  const contractorOperation = operations.find((operation) => operation.collection === "master.contractors");
  const hasRateOperation = operations.some((operation) => operation.collection === "master.contractorRates");
  if (!hasRateOperation) return operations;

  // Contractor rates are a projection of work capabilities: client rate rows
  // are never trusted — the projection is re-derived from the stored profile.
  // A rates-ONLY commit (client save chains can land the capability row one
  // queue tick before its projection sync) re-projects from the already-stored
  // capabilities instead of rejecting the user's edit — same semantics as the
  // vendorRates canonicalization above.
  const touchedIds = new Set<string>();
  for (const row of contractorOperation?.upsert || []) {
    const id = String(row.id || "").trim();
    if (id) touchedIds.add(id);
  }
  for (const id of contractorOperation?.deleteIds || []) {
    if (id) touchedIds.add(id);
  }
  if (!contractorOperation) {
    for (const operation of operations) {
      if (operation.collection !== "master.contractorRates") continue;
      for (const row of operation.upsert || []) {
        const id = String(row.contractor_id || "").trim();
        if (id) touchedIds.add(id);
      }
      for (const id of operation.deleteIds || []) {
        const deleted = (current.master.contractorRates || []).find((rate) => rate.id === id);
        if (deleted?.contractor_id) touchedIds.add(deleted.contractor_id);
      }
    }
  }

  const profileOperations = operations.filter((operation) => operation.collection !== "master.contractorRates");
  const candidate = applyWorkspaceOperations(current, profileOperations);
  let contractorRates = current.master.contractorRates || [];
  for (const contractorId of touchedIds) {
    const contractor = candidate.master.contractors.find((row) => row.id === contractorId);
    if (!contractor) {
      // Contractor delete cascades the projection; an unknown contractor in a
      // rates-only commit leaves orphan rows alone (nothing to re-project).
      if (contractorOperation) contractorRates = contractorRates.filter((rate) => rate.contractor_id !== contractorId);
      continue;
    }
    contractorRates = contractorRateProjection(
      { master: { ...candidate.master, contractorRates } },
      contractor,
    );
  }

  const canonical: RDashDatabase = {
    ...candidate,
    master: { ...candidate.master, contractorRates },
  };
  return diffWorkspaceOperations(current, canonical);
}

function validationReadPlan(user: AuthenticatedUser, operations: WorkspaceOperation[]): WorkspaceReadPlan {
  const fullCollections = new Set<string>();

  for (const operation of operations) {
    fullCollections.add(operation.collection);
    const moduleKey = moduleForCollection(operation.collection);
    const scope = VALIDATION_SCOPE_BY_MODULE[moduleKey] || "system";
    for (const collection of COLLECTIONS_BY_SCOPE[scope]) fullCollections.add(collection);

    // Taxonomy/master deletes can invalidate quotation, procurement and site
    // records in other modules. Load those explicit reverse-reference domains
    // rather than reverting to a whole-workspace validator.
    if (
      operation.collection.startsWith("master.")
      && !operation.collection.startsWith("master.vendor")
      && operation.collection !== "master.contractors"
      && operation.collection !== "master.contractorRates"
      && operation.collection !== "master.staff"
      && !operation.collection.startsWith("master.storage")
      && operation.collection !== "master.fileAssets"
    ) {
      for (const reverseScope of MASTER_REVERSE_VALIDATION_SCOPES) {
        for (const collection of COLLECTIONS_BY_SCOPE[reverseScope]) fullCollections.add(collection);
      }
    }
  }

  const hasContractorMutation = operations.some((operation) =>
    operation.collection === "master.contractors" || operation.collection === "master.contractorRates",
  );
  if (hasContractorMutation) {
    for (const collection of CONTRACTOR_CANONICAL_COLLECTIONS) fullCollections.add(collection);
  }

  // Permission checks need the authoritative role matrix. Staff-sensitive
  // writes also use the signed-in Staff record; the Staff table is small and
  // loading it keeps all role/active-status checks on the same new read path.
  if (user.role !== "Owner") fullCollections.add("staffRolePermissions");
  fullCollections.add("master.staff");

  const collections = [...fullCollections];
  return {
    fullCollections: collections,
    // A validation domain must be complete. Explicit zero disables the generic
    // history/list caps in getWorkspaceSubset without switching read systems.
    limitsByCollection: Object.fromEntries(collections.map((collection) => [collection, 0])),
  };
}

function audit(user: AuthenticatedUser, operations: WorkspaceOperation[]): AuditLogEntry {
  return {
    id: `audit-rest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor: user.name,
    actor_role: user.role,
    action: `REST operation commit: ${operationSummary(operations)}`,
    entity_type: "workspace",
    entity_id: workspaceId,
    entity_label: "Urban Castle REST workspace",
    kind: "update",
  };
}

export type CommitMode = "row-targeted" | "domain-targeted";

export interface CommitResult {
  revision: number;
  updatedAt: string;
  bumpedRowVersions?: Record<string, number>;
  newRevision?: number;
  patches: WorkspaceOperation[];
  mode: CommitMode;
  queryCount?: number;
  timing: {
    loadMs: number;
    authorizeAndValidateMs: number;
    commitMs: number;
    totalMs: number;
  };
}

/**
 * Every normal commit uses the new subset architecture. Common mutations use
 * row/dependency reads; complex or cross-domain mutations use an explicit
 * validation-domain subset. There is no whole-workspace fallback and no old
 * commit mode to switch back to.
 */
export async function commitAuthorizedPostgresOperations(
  user: AuthenticatedUser,
  revision: number,
  operations: WorkspaceOperation[],
  _expectedRevisions?: Record<string, number>,
  expectedRowVersions?: Record<string, number>,
): Promise<CommitResult> {
  const startedAt = Date.now();
  let commitOperations = sanitizeWorkspaceOperations(operations);
  let mode: CommitMode = "domain-targeted";
  let queryCount: number | undefined;
  let loadMs = 0;
  let authorizeAndValidateMs = 0;

  const targeted = await prepareTargetedCommit(user, revision, commitOperations);
  const simpleTargeted = targeted
    ? null
    : await prepareSimpleTargetedCommit(user, revision, commitOperations);
  if (targeted || simpleTargeted) {
    const prepared = targeted || simpleTargeted!;
    commitOperations = prepared.operations;
    mode = "row-targeted";
    queryCount = prepared.queryCount;
    loadMs = prepared.loadMs;
    authorizeAndValidateMs = prepared.authorizeAndValidateMs;
  } else {
    const loadStartedAt = Date.now();
    const current = await getWorkspaceSubset(validationReadPlan(user, commitOperations));
    const loadedAt = Date.now();
    queryCount = current.queryCount;
    if (current.revision !== revision) throw new Error("CONFLICT");

    assertWorkspaceMutationAllowed(user, commitOperations, current.data);
    commitOperations = canonicalizeVendorRateOperations(current.data, commitOperations);
    commitOperations = canonicalizeContractorRateOperations(current.data, commitOperations);
    const baseline = normalizeWorkspace(current.data);
    const candidate = normalizeWorkspace(applyWorkspaceOperations(current.data, commitOperations));
    const issues = introducedIntegrityIssues(
      validateBusinessData(baseline),
      validateBusinessData(candidate),
    );
    if (issues.length) throw new Error(`INVALID:${issues[0]}`);
    const validatedAt = Date.now();

    loadMs = loadedAt - loadStartedAt;
    authorizeAndValidateMs = validatedAt - loadedAt;
  }

  const auditEntry = audit(user, commitOperations);
  const operationsWithAudit: WorkspaceOperation[] = [
    ...commitOperations,
    { collection: "auditLog", upsert: [auditEntry as unknown as Record<string, unknown>] },
  ];

  const commitStartedAt = Date.now();
  const result = await commitWorkspaceOperations(revision, operationsWithAudit, expectedRowVersions);
  const committedAt = Date.now();
  const timing = {
    loadMs,
    authorizeAndValidateMs,
    commitMs: committedAt - commitStartedAt,
    totalMs: committedAt - startedAt,
  };

  console.info("[workspace-commit]", JSON.stringify({
    mode,
    revision,
    newRevision: result.revision,
    operationCount: operationsWithAudit.length,
    collections: operationsWithAudit.map((operation) => operation.collection),
    queryCount,
    timing,
  }));

  return {
    revision: result.revision,
    updatedAt: result.updatedAt,
    bumpedRowVersions: result.bumpedRowVersions,
    newRevision: result.revision,
    patches: operationsWithAudit,
    mode,
    queryCount,
    timing,
  };
}
