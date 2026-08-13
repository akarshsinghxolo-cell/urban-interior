import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { attachCustomerLabels } from "../customer";
import { prepareWorkspaceData } from "../work-category-master";
import { repairOperationalWorkspace } from "../operational-repair";
import {
  applyWorkspaceOperations,
  diffWorkspaceOperations,
  operationSummary,
  type WorkspaceOperation,
} from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import { prepareTargetedCommit } from "./targeted-commit";
import { applyVendorRateAverages } from "../vendor-rate-average";
import { canonicalizeVendorRateMaster } from "../vendor-rate";
import { contractorRateProjection } from "../contractor-profile";
import type { ContractorProfileRecord } from "../contractor-profile";
import { commitWorkspaceOperations, getWorkspace } from "./workspace";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

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

function sanitizeWorkspaceOperations(operations: WorkspaceOperation[]): WorkspaceOperation[] {
  return operations.map((operation) => {
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
  if (!contractorOperation) {
    if (hasRateOperation) {
      throw new Error("INVALID:Contractor Rates are read-only projections. Update Contractor work capabilities instead.");
    }
    return operations;
  }

  // Caller-supplied rate rows are never authoritative. Apply only the
  // Contractor/profile operations, then rebuild rate rows from canonical
  // work_capabilities for every touched Contractor.
  const profileOperations = operations.filter((operation) => operation.collection !== "master.contractorRates");
  const candidate = applyWorkspaceOperations(current, profileOperations);
  let contractorRates = current.master.contractorRates || [];
  const touchedIds = new Set<string>();
  for (const row of contractorOperation.upsert || []) {
    const id = String(row.id || "").trim();
    if (id) touchedIds.add(id);
  }
  for (const id of contractorOperation.deleteIds || []) {
    if (id) touchedIds.add(id);
  }

  for (const contractorId of touchedIds) {
    const contractor = candidate.master.contractors.find((row) => row.id === contractorId);
    if (!contractor) {
      contractorRates = contractorRates.filter((rate) => rate.contractor_id !== contractorId);
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

export type CommitMode = "phase2b-targeted" | "phase2-single-read";

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
 * Phase 2B uses targeted row reads for common Task, Follow-up, Visit, and
 * related Thread/Audit mutations. Any unsupported or high-risk operation falls
 * back to the Phase 2A single-full-read path without changing its behavior.
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
  let mode: CommitMode = "phase2-single-read";
  let queryCount: number | undefined;
  let loadMs = 0;
  let authorizeAndValidateMs = 0;

  const targeted = await prepareTargetedCommit(user, revision, commitOperations);
  if (targeted) {
    commitOperations = targeted.operations;
    mode = "phase2b-targeted";
    queryCount = targeted.queryCount;
    loadMs = targeted.loadMs;
    authorizeAndValidateMs = targeted.authorizeAndValidateMs;
  } else {
    const loadStartedAt = Date.now();
    const current = await getWorkspace();
    const loadedAt = Date.now();
    if (current.revision !== revision) throw new Error("CONFLICT");

    assertWorkspaceMutationAllowed(user, commitOperations, current.data);
    commitOperations = canonicalizeVendorRateOperations(current.data, commitOperations);
    commitOperations = canonicalizeContractorRateOperations(current.data, commitOperations);
    const candidate = normalizeWorkspace(applyWorkspaceOperations(current.data, commitOperations));
    const issues = validateBusinessData(candidate);
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
