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
import { assertWorkspaceMutationAllowed } from "./mutation-policy";
import { commitWorkspaceOperations, getWorkspace } from "./workspace";

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

export interface CommitResult {
  revision: number;
  updatedAt: string;
  bumpedRowVersions?: Record<string, number>;
  newRevision?: number;
  patches: WorkspaceOperation[];
  timing: {
    loadMs: number;
    authorizeAndValidateMs: number;
    commitMs: number;
    totalMs: number;
  };
}

/**
 * Loads the workspace once for authorization and business validation, then
 * commits the already-authorized operations directly through the atomic RPC.
 * Phase 2A intentionally keeps full validation while removing the second
 * pre-commit read and the post-commit full workspace reconstruction.
 */
export async function commitAuthorizedPostgresOperations(
  user: AuthenticatedUser,
  revision: number,
  operations: WorkspaceOperation[],
  _expectedRevisions?: Record<string, number>,
  expectedRowVersions?: Record<string, number>,
): Promise<CommitResult> {
  const startedAt = Date.now();
  const current = await getWorkspace();
  const loadedAt = Date.now();
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
  const validatedAt = Date.now();

  const result = await commitWorkspaceOperations(revision, operationsWithAudit, expectedRowVersions);
  const committedAt = Date.now();
  const timing = {
    loadMs: loadedAt - startedAt,
    authorizeAndValidateMs: validatedAt - loadedAt,
    commitMs: committedAt - validatedAt,
    totalMs: committedAt - startedAt,
  };

  console.info("[workspace-commit]", JSON.stringify({
    mode: "phase2-single-read",
    revision,
    newRevision: result.revision,
    operationCount: operationsWithAudit.length,
    collections: operationsWithAudit.map((operation) => operation.collection),
    timing,
  }));

  return {
    revision: result.revision,
    updatedAt: result.updatedAt,
    bumpedRowVersions: result.bumpedRowVersions,
    newRevision: result.revision,
    patches: operationsWithAudit,
    timing,
  };
}
