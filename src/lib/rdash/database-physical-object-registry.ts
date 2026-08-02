import type { CollectionArchitectureDecision } from "./database-architecture-registry";

export interface PhysicalDatabaseObjectDecision extends CollectionArchitectureDecision {
  objectType: "table" | "view";
  runtimeOwner: string;
}

const physical = (
  objectType: PhysicalDatabaseObjectDecision["objectType"],
  domain: PhysicalDatabaseObjectDecision["domain"],
  decision: PhysicalDatabaseObjectDecision["decision"],
  canonicalTruth: string,
  risk: PhysicalDatabaseObjectDecision["risk"],
  runtimeOwner: string,
  targetConcept?: string,
): PhysicalDatabaseObjectDecision => Object.freeze({
  objectType,
  domain,
  decision,
  canonicalTruth,
  risk,
  runtimeOwner,
  ...(targetConcept ? { targetConcept } : {}),
});

/**
 * Public database objects that are not ordinary workspace collections.
 * These require explicit ownership because they are easy to overlook when
 * auditing COLLECTION_TO_TABLE.
 */
export const SPECIAL_DATABASE_OBJECT_ARCHITECTURE = Object.freeze({
  GenericRecord: physical(
    "table",
    "system",
    "projection-view-candidate",
    "Integration compatibility state",
    "high",
    "Google Drive OAuth/vault compatibility",
    "Explicit integration state storage",
  ),
  StaffProfile: physical(
    "table",
    "hr",
    "profile-consolidation-candidate",
    "Operational Staff mirror",
    "critical",
    "Staff identity synchronization and GPS FK",
    "Canonical Staff profile",
  ),
  StaffRouteBundle: physical(
    "table",
    "hr",
    "keep-normalize-later",
    "Staff GPS route bundle",
    "high",
    "GPS tracking",
  ),
  uc_drive_folders: physical(
    "table",
    "media",
    "infrastructure-keep",
    "Drive folder routing state",
    "high",
    "Drive folder engine",
  ),
  uc_upload_batches: physical(
    "table",
    "media",
    "infrastructure-keep",
    "Upload batch state",
    "high",
    "Direct upload engine",
  ),
  uc_upload_items: physical(
    "table",
    "media",
    "infrastructure-keep",
    "Upload item state",
    "high",
    "Direct upload engine",
  ),
  uc_upload_events: physical(
    "table",
    "media",
    "infrastructure-keep",
    "Upload state transition event",
    "medium",
    "Direct upload engine",
  ),
  uc_user_roles: physical(
    "table",
    "system",
    "infrastructure-keep",
    "Supabase Auth workspace role assignment",
    "critical",
    "Authentication approval and server authorization",
  ),
  uc_workspace_operations: physical(
    "table",
    "system",
    "infrastructure-keep",
    "Workspace operation/idempotency receipt",
    "critical",
    "Atomic commit API",
  ),
  entity_workspace_revision: physical(
    "table",
    "system",
    "infrastructure-keep",
    "Canonical workspace revision",
    "critical",
    "Workspace CAS/delta synchronization",
  ),
  entity_workspace_change_batches: physical(
    "table",
    "system",
    "infrastructure-keep",
    "Canonical workspace delta journal",
    "critical",
    "Workspace delta synchronization",
  ),
  entity_issues: physical(
    "table",
    "workflow",
    "keep-normalize-later",
    "Canonical Issue pilot storage",
    "medium",
    "Risks/Blockers consolidation shadow and parity storage",
    "issues logical collection after cutover",
  ),
  staff_identity_drift_report: physical(
    "view",
    "hr",
    "infrastructure-keep",
    "Staff mirror integrity report",
    "high",
    "Staff identity diagnostics",
  ),
} satisfies Record<string, PhysicalDatabaseObjectDecision>);
