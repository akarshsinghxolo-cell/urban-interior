import { hydrateStaffReferenceLabels } from "../staff-reference-labels";
import type { RDashDatabase } from "../types";
import { diffWorkspaceOperations, type WorkspaceOperation } from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import { assertNotImplicitSeedReset } from "./mutation-policy";

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

interface WorkspaceSnapshot {
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions?: Record<string, number>;
  bumpedRowVersions?: Record<string, number>;
}

interface WorkspaceWithRevisions extends WorkspaceSnapshot {
  rowVersions?: Record<string, number>;
}

interface WorkspaceOperationCommitResult {
  revision: number;
  updatedAt: string;
  bumpedRowVersions?: Record<string, number>;
}

interface WorkspacePaginationEntry {
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

function assertWorkspaceResetRequest(user: AuthenticatedUser, confirmation: string) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner may reset the workspace.");
  if (confirmation.trim() !== "RESET WORKSPACE") throw new Error('INVALID:Type "RESET WORKSPACE" exactly to confirm the reset.');
}

export async function resetWorkspace(user: AuthenticatedUser, confirmation: string): Promise<WorkspaceSnapshot> {
  assertWorkspaceResetRequest(user, confirmation);
  await assertSupabaseSchemaReady();
  const { resetRestWorkspace } = await getRestModule();
  return resetRestWorkspace();
}
