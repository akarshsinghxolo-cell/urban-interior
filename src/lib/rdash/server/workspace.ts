import { hydrateStaffReferenceLabels } from "../staff-reference-labels";
import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { applyWorkspaceOperations, diffWorkspaceOperations, operationSummary, type WorkspaceOperation } from "../workspace-operations";
import type { AuthenticatedUser } from "./auth";
import {
  assertNotImplicitSeedReset,
  assertWorkspaceMutationAllowed,
} from "./mutation-policy";

// REST-based data layer — Supabase only, no Prisma, no local database.
// All data is read from and written to Supabase entity_* tables via REST.
//
// FALLBACK: When the Supabase entity_* tables are not yet applied (first deploy
// before schema-entity-tables.sql is run), the app falls back to in-memory seed
// data so it's always usable. Once the schema is applied, all reads/writes go
// to Supabase automatically.

let restModule: typeof import("./commit-rest") | null = null;
async function getRestModule() {
  if (!restModule) {
    restModule = await import("./commit-rest");
  }
  return restModule;
}

// In-memory fallback cache (only used when Supabase tables don't exist)
let inMemoryWorkspace: { revision: number; data: RDashDatabase; updatedAt: string } | null = null;
let supabaseSchemaReady: boolean | null = null;

async function checkSupabaseSchema(): Promise<boolean> {
  if (supabaseSchemaReady !== null) return supabaseSchemaReady;
  try {
    const admin = (await import("../../supabase/server")).getSupabaseAdminClient();
    const { error } = await admin.from("entity_workspace_revision").select("id").limit(1);
    supabaseSchemaReady = !error;
    if (supabaseSchemaReady) {
      console.log("[workspace] Supabase entity_* schema is ready.");
    } else {
      console.log("[workspace] Supabase entity_* schema NOT ready — using in-memory fallback.");
    }
  } catch {
    supabaseSchemaReady = false;
  }
  return supabaseSchemaReady;
}

async function getInMemoryWorkspace(): Promise<{ revision: number; data: RDashDatabase; updatedAt: string }> {
  if (!inMemoryWorkspace) {
    const { buildSeedDatabase } = await import("../seed");
    inMemoryWorkspace = {
      revision: 1,
      data: buildSeedDatabase(),
      updatedAt: new Date().toISOString(),
    };
    console.log("[workspace] In-memory workspace seeded from buildSeedDatabase().");
  }
  hydrateStaffReferenceLabels(inMemoryWorkspace.data);
  return inMemoryWorkspace;
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

export type WorkspaceReadPlan = {
  fullCollections?: string[];
  rowsByCollection?: Record<string, string[]>;
  limitsByCollection?: Record<string, number>;
};

export interface WorkspaceSubset extends WorkspaceWithRevisions {
  queryCount: number;
}

export async function getWorkspace(includeRevisions = false): Promise<WorkspaceWithRevisions> {
  if (await checkSupabaseSchema()) {
    const { getRestWorkspace } = await getRestModule();
    const workspace = await getRestWorkspace();
    hydrateStaffReferenceLabels(workspace.data);
    if (includeRevisions) return workspace;
    return { revision: workspace.revision, data: workspace.data, updatedAt: workspace.updatedAt };
  }
  const ws = await getInMemoryWorkspace();
  return includeRevisions ? { ...ws, rowVersions: {} } : ws;
}

/**
 * Reads only the collections and row IDs requested by a targeted commit.
 * The in-memory development fallback returns its complete local snapshot because
 * it has no network/database query cost and is not used in production.
 */
export async function getWorkspaceSubset(plan: WorkspaceReadPlan): Promise<WorkspaceSubset> {
  if (await checkSupabaseSchema()) {
    const { getRestWorkspaceSubset } = await getRestModule();
    return getRestWorkspaceSubset(plan);
  }
  const ws = await getInMemoryWorkspace();
  return { ...ws, rowVersions: {}, queryCount: 0 };
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

  const issues = validateBusinessData(trustedCandidate);
  if (issues.length) throw new Error(`INVALID:${issues[0]}`);

  if (!operations.length) return trustedCandidate;

  trustedCandidate.auditLog = [
    secureMutationAudit(user, operations),
    ...current.auditLog,
  ].slice(0, 5000);

  return trustedCandidate;
}

/**
 * Commits already-authorized row operations without reconstructing the whole
 * workspace again. PostgreSQL performs workspace and row CAS atomically.
 */
export async function commitWorkspaceOperations(
  revision: number,
  operations: WorkspaceOperation[],
  expectedRowVersions?: Record<string, number>,
): Promise<WorkspaceOperationCommitResult> {
  if (!operations.length) {
    return { revision, updatedAt: new Date().toISOString(), bumpedRowVersions: {} };
  }

  if (await checkSupabaseSchema()) {
    const { commitRestOperations } = await getRestModule();
    const result = await commitRestOperations(operations, revision, expectedRowVersions);
    return {
      revision: result.newRevision,
      updatedAt: new Date().toISOString(),
      bumpedRowVersions: result.bumpedRowVersions,
    };
  }

  const current = await getInMemoryWorkspace();
  if (current.revision !== revision) throw new Error("CONFLICT");
  inMemoryWorkspace = {
    revision: current.revision + 1,
    data: applyWorkspaceOperations(current.data, operations),
    updatedAt: new Date().toISOString(),
  };
  hydrateStaffReferenceLabels(inMemoryWorkspace.data);
  return {
    revision: inMemoryWorkspace.revision,
    updatedAt: inMemoryWorkspace.updatedAt,
    bumpedRowVersions: {},
  };
}

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

  if (await checkSupabaseSchema()) {
    const result = await commitWorkspaceOperations(revision, operations, expectedRowVersions);
    const saved = await getWorkspace();
    return {
      ...saved,
      revision: result.revision,
      bumpedRowVersions: result.bumpedRowVersions,
    };
  }

  const result = await commitWorkspaceOperations(revision, operations, expectedRowVersions);
  const saved = await getInMemoryWorkspace();
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

export async function resetWorkspace(user: AuthenticatedUser, confirmation: string): Promise<WorkspaceSnapshot> {
  assertWorkspaceResetRequest(user, confirmation);

  if (await checkSupabaseSchema()) {
    const { resetWorkspaceChangeJournal } = await import("./workspace-change-reset");
    const { resetRestWorkspace } = await getRestModule();
    await resetWorkspaceChangeJournal();
    return resetRestWorkspace();
  }

  const { buildSeedDatabase } = await import("../seed");
  inMemoryWorkspace = {
    revision: 1,
    data: buildSeedDatabase(),
    updatedAt: new Date().toISOString(),
  };
  hydrateStaffReferenceLabels(inMemoryWorkspace.data);
  return inMemoryWorkspace;
}
