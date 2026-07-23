import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { attachCustomerLabels } from "../customer";
import { prepareWorkspaceData } from "../work-category-master";
import { repairOperationalWorkspace } from "../operational-repair";
import {
  applyWorkspaceOperations,
  operationSummary,
  type WorkspaceOperation,
} from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import type { WorkspaceSnapshot } from "./workspace";
import { assertWorkspaceMutationAllowed } from "./mutation-policy";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

function normalizeWorkspace(data: RDashDatabase) {
  return attachCustomerLabels(prepareWorkspaceData(repairOperationalWorkspace(data)));
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

export interface CommitResult extends WorkspaceSnapshot {
  bumpedRowVersions?: Record<string, number>;
  newRevision?: number;
}

/**
 * Validates the candidate workspace, appends a server-owned audit entry, and
 * commits all resulting row operations in one PostgreSQL transaction.
 */
export async function commitAuthorizedPostgresOperations(
  user: AuthenticatedUser,
  revision: number,
  operations: WorkspaceOperation[],
  _expectedRevisions?: Record<string, number>,
  expectedRowVersions?: Record<string, number>,
): Promise<CommitResult> {
  const { getWorkspace, saveWorkspace } = await import("./workspace");
  const current = await getWorkspace();
  if (current.revision !== revision) throw new Error("CONFLICT");

  assertWorkspaceMutationAllowed(user, operations, current.data);

  const candidate = normalizeWorkspace(applyWorkspaceOperations(current.data, operations));
  const issues = validateBusinessData(candidate);
  if (issues.length) throw new Error(`INVALID:${issues[0]}`);

  const auditEntry = audit(user, operations);
  const operationsWithAudit: WorkspaceOperation[] = [
    ...operations,
    { collection: "auditLog", upsert: [auditEntry as unknown as Record<string, unknown>] },
  ];
  const persistedCandidate = applyWorkspaceOperations(current.data, operationsWithAudit);

  const result = await saveWorkspace(revision, persistedCandidate, expectedRowVersions);
  return {
    revision: result.revision,
    data: result.data,
    updatedAt: result.updatedAt,
    bumpedRowVersions: result.bumpedRowVersions,
    newRevision: result.revision,
  };
}
