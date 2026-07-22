import type { AuditLogEntry, RDashDatabase } from "../types";
import { validateBusinessData } from "../business-rules";
import { diffWorkspaceOperations, operationSummary } from "../workspace-operations";
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
  return inMemoryWorkspace;
}

export interface WorkspaceSnapshot {
  revision: number;
  data: RDashDatabase;
  updatedAt: string;
  rowVersions?: Record<string, number>;
}

export interface WorkspaceWithRevisions extends WorkspaceSnapshot {
  rowVersions?: Record<string, number>;
}

export async function getWorkspace(includeRevisions = false): Promise<WorkspaceWithRevisions> {
  // Check if Supabase entity_* tables exist
  if (await checkSupabaseSchema()) {
    const { getRestWorkspace } = await getRestModule();
    return getRestWorkspace();
  }
  // Fallback: return in-memory seed data
  const ws = await getInMemoryWorkspace();
  return { ...ws, rowVersions: {} };
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

export async function saveWorkspace(revision: number, data: RDashDatabase): Promise<WorkspaceSnapshot> {
  const current = await getWorkspace();
  if (current.revision !== revision) throw new Error("CONFLICT");
  assertNotImplicitSeedReset(current.data, data);
  const operations = diffWorkspaceOperations(current.data, data);
  if (!operations.length) return current;

  // If Supabase is ready, commit via REST. Otherwise, update in-memory.
  if (await checkSupabaseSchema()) {
    const { commitRestOperations } = await getRestModule();
    const result = await commitRestOperations(operations);
    if (result.conflicts > 0) throw new Error("CONFLICT");
    return getWorkspace();
  }

  // In-memory fallback: apply operations directly
  const { applyWorkspaceOperations } = await import("../workspace-operations");
  inMemoryWorkspace = {
    revision: current.revision + 1,
    data: applyWorkspaceOperations(current.data, operations),
    updatedAt: new Date().toISOString(),
  };
  return inMemoryWorkspace;
}

export function assertWorkspaceResetRequest(user: AuthenticatedUser, confirmation: string) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner may reset the workspace.");
  if (confirmation.trim() !== "RESET WORKSPACE") throw new Error('INVALID:Type "RESET WORKSPACE" exactly to confirm the reset.');
}

export async function resetWorkspace(user: AuthenticatedUser, confirmation: string): Promise<WorkspaceSnapshot> {
  assertWorkspaceResetRequest(user, confirmation);

  if (await checkSupabaseSchema()) {
    const { resetRestWorkspace } = await getRestModule();
    return resetRestWorkspace();
  }

  // In-memory fallback: re-seed
  const { buildSeedDatabase } = await import("../seed");
  inMemoryWorkspace = {
    revision: 1,
    data: buildSeedDatabase(),
    updatedAt: new Date().toISOString(),
  };
  return inMemoryWorkspace;
}
