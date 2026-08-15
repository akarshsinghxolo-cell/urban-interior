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
import { introducedIntegrityIssues } from "./integrity-delta";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import { prepareTargetedCommit } from "./targeted-commit";
import { applyVendorRateAverages } from "../vendor-rate-average";
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
  const canonical = applyVendorRateAverages(current, candidate);
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
  let commitOperations = operations;
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
