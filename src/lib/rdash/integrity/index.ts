// ============================================================================
// Integrity Layer — barrel export for the workspace integrity primitives.
// ============================================================================
// Public API:
//   - FOREIGN_KEYS, ForeignKeyRule, OnDeletePolicy, fksForCollection,
//     fksTargetingCollection, parentCollections, childCollections (fk-registry.ts)
//   - checkWorkspaceIntegrity                    (checker.ts)
//   - cascadeDelete, cascadeDeleteDryRun          (cascade.ts)
//   - repairIntegrityIssues                       (repair.ts)
//
// Type re-exports: the integrity types from ../types are the canonical home.
// ============================================================================

export {
    FOREIGN_KEYS,
    fksForCollection,
    fksTargetingCollection,
    parentCollections,
    childCollections,
} from "./fk-registry";
export type { ForeignKeyRule, OnDeletePolicy } from "./fk-registry";

export { checkWorkspaceIntegrity } from "./checker";

export { cascadeDelete, cascadeDeleteDryRun } from "./cascade";
export type { CascadeOptions } from "./cascade";

export { repairIntegrityIssues } from "./repair";

// Re-export the integrity-domain types for one-stop-shopping callers.
export type {
    ForeignKeyRule as FKRule,
    IntegrityReport,
    IntegrityIssue,
    CascadeResult,
    RepairResult,
    DuplicateIdConflict,
} from "../types";

