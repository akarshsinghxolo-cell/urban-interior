import { hydrateStaffReferenceLabels } from "../staff-reference-labels";
import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { applyWorkspaceOperations, diffWorkspaceOperations, operationSummary, type WorkspaceOperation } from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { introducedIntegrityIssues } from "./integrity-delta";
import {
  assertNotImplicitSeedReset,
  assertWorkspaceMutationAllowed,
} from "./mutation-policy";

// Supabase/PostgreSQL is the single server workspace persistence system.
// The server fails closed if the canonical entity schema is unavailable.
let restModule: typeof import("./commit-rest") | null = null;
async function getRestModule() {
  if (!restModule) restModule = await import("./commit-rest");
  return restModule;
}

let supabaseSchemaReady: boolean | null = null;

async function assertSupabaseSchemaReady(): Promise<void> {
  if (supabaseSchemaReady === true) return;
  if (supabaseSchemaReady === false) {
    throw new Error("SUPABASE_SCHEMA_UNAVAILABLE:Supabase is unavailable or the canonical entity schema is missing.");
  }
  try {
    const admin = (await import("../../supabase/server")).getSupabaseAdminClient();
    const { error } = await admin.from("entity_workspace_revision").select("id").limit(1);
    supabaseSchemaReady = !error;
    if (error) console.error("[workspace] Supabase entity_* schema is not ready.", error.message || error);
  } catch (error) {
    supabaseSchemaReady = false;
    console.error("[workspace] Supabase schema check failed.", error);
  }
  if (!supabaseSchemaReady) {
    throw new Error("SUPABASE_SCHEMA_UNAVAILABLE:Supabase is unavailable or the canonical entity schema is missing.");
  }
}

export interface WorkspaceSnapshot {
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions?: Record<string, number>;
  bumpedRowVersions?: Record<string, number>;
}

export interface WorkspaceWithRevisions extends WorkspaceSnapshot {
  rowVersions?: Record<string, number>;
}

export interface WorkspaceOperationCommitResult {
  revision: number;
  updatedAt: string;
  bumpedRowVersions?: Record<string, number>;
}

export interface WorkspacePaginationEntry {
  offset: number;
  limit: number;
  returned: number;
  hasMore: boolean;
  nextOffset?: number;
}

export type WorkspacePagination = Record<string, WorkspacePaginationEntry>;

export type WorkspaceReadPlan = {
  fullCollections?: string[];
  rowsByCollection?: Record<string, string[]>;
  limitsByCollection?: Record<string, number>;
  offsetsByCollection?: Record<string, number>;
};

export interface WorkspaceSubset extends WorkspaceWithRevisions {
  queryCount: number;
  pagination?: WorkspacePagination;
}

/** Full reads are reserved for explicit reset/integrity/diagnostic operations. */
export async function getWorkspace(includeRevisions = false): Promise<WorkspaceWithRevisions> {
  await assertSupabaseSchemaReady();
  const { getRestWorkspace } = await getRestModule();
  const workspace = await getRestWorkspace();
  hydrateStaffReferenceLabels(workspace.data);
  if (includeRevisions) return workspace;
  return { revision: workspace.revision, data: workspace.data, updatedAt: workspace.updatedAt };
}

/**
 * Reads only the collections and row IDs requested by the authoritative subset
 * architecture. Limited full-collection reads can carry a per-collection
 * offset and return pagination metadata without issuing an expensive count.
 */
export async function getWorkspaceSubset(plan: WorkspaceReadPlan): Promise<WorkspaceSubset> {
  await assertSupabaseSchemaReady();
  const { getRestWorkspaceSubset } = await getRestModule();
  return getRestWorkspaceSubset(plan);
}

function secureMutationAudit(user: AuthenticatedUser, operations: ReturnType<typeof diffWorkspaceOperations>): AuditLogEntry {
  return {
    id: `audit-secure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor: user.name,
    actor_role: user.role,
    action: `Secure server commit: ${operationSummary(operations)}`,
    entity_type: "workspace",
    entity_id: process.env.UC_WORKSPACE_ID || "default",
    entity_label: "Urban Castle workspace",
    kind: "update",
  };
}

export function enforceMutation(user: AuthenticatedUser, current: RDashDatabase, candidate: RDashDatabase) {
  const trustedCandidate = structuredClone(candidate);

  assertNotImplicitSeedReset(current, trustedCandidate);

  // Audit history is server-owned. Browser-supplied additions, removals, and edits are discarded.
  trustedCandidate.auditLog = structuredClone(current.auditLog);

  const operations = diffWorkspaceOperations(current, trustedCandidate);
  assertWorkspaceMutationAllowed(user, operations, current);

  const issues = introducedIntegrityIssues(
    validateBusinessData(current),
    validateBusinessData(trustedCandidate),
  );
  if (issues.length) throw new Error(`INVALID:${issues[0]}`);

  if (!operations.length) return trustedCandidate;

  trustedCandidate.auditLog = [
    secureMutationAudit(user, operations),
    ...current.auditLog,
  ].slice(0, 5000);

  return trustedCandidate;
}

/** Commits already-authorized row operations with PostgreSQL workspace/row CAS. */
export async function commitWorkspaceOperations(
  revision: number,
  operations: WorkspaceOperation[],
  expectedRowVersions?: Record<string, number>,
): Promise<WorkspaceOperationCommitResult> {
  if (!operations.length) {
    return { revision, updatedAt: new Date().toISOString(), bumpedRowVersions: {} };
  }

  await assertSupabaseSchemaReady();
  const { commitRestOperations } = await getRestModule();
  const result = await commitRestOperations(operations, revision, expectedRowVersions);
  return {
    revision: result.newRevision,
    updatedAt: new Date().toISOString(),
    bumpedRowVersions: result.bumpedRowVersions,
  };
}

/**
 * Full snapshot save is retained only for explicit administrative callers.
 * Normal application mutations use /api/operations/commit and subset reads.
 */
export async function saveWorkspace(
  revision: number,
  data: RDashDatabase,
  expectedRowVersions?: Record<string, number>,
): Promise<WorkspaceSnapshot> {
  const current = await getWorkspace();
  if (current.revision !== revision) throw new Error("CONFLICT");
  assertNotImplicitSeedReset(current.data, data);
  const operations = diffWorkspaceOperations(current.data, data);
  if (!operations.length) return current;

  const result = await commitWorkspaceOperations(revision, operations, expectedRowVersions);
  const saved = await getWorkspace();
  return {
    ...saved,
    revision: result.revision,
    bumpedRowVersions: result.bumpedRowVersions,
  };
}

export function assertWorkspaceResetRequest(user: AuthenticatedUser, confirmation: string) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner may reset the workspace.");
  if (confirmation.trim() !== "RESET WORKSPACE") throw new Error('INVALID:Type "RESET WORKSPACE" exactly to confirm the reset.');
}

async function canonicalizeResetCustomerThreads(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const customerIds = new Set(snapshot.data.customers.map((customer) => customer.id));
  const changed = snapshot.data.threads.flatMap((thread) => {
    if (thread.kind !== "generic" || !customerIds.has(thread.record_id)) return [];
    return [{ ...thread, record_id: `customer-conversation:${thread.record_id}` }];
  });
  if (!changed.length) return snapshot;

  const committed = await commitWorkspaceOperations(snapshot.revision, [
    {
      collection: "threads",
      upsert: changed as unknown as Array<Record<string, unknown>>,
    },
  ]);
  const saved = await getWorkspace();
  return {
    ...saved,
    revision: committed.revision,
    bumpedRowVersions: committed.bumpedRowVersions,
  };
}

export async function resetWorkspace(user: AuthenticatedUser, confirmation: string): Promise<WorkspaceSnapshot> {
  assertWorkspaceResetRequest(user, confirmation);
  await assertSupabaseSchemaReady();
  const { resetWorkspaceChangeJournal } = await import("./workspace-change-reset");
  const { resetRestWorkspace } = await getRestModule();
  await resetWorkspaceChangeJournal();
  const reset = await resetRestWorkspace();
  return canonicalizeResetCustomerThreads(reset);
}
