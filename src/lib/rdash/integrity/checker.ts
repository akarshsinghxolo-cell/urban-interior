// ============================================================================
// Integrity Checker — scans the workspace database against the FK registry
// and produces an IntegrityReport.
// ============================================================================
// Performance: O(N) — pre-builds a Set<string> of IDs per parent collection
// and walks each child collection exactly once per FK rule. Target <100ms
// for the seed workspace (~600 records, 723KB).
// ============================================================================

import type { RDashDatabase, Master, IntegrityIssue, IntegrityReport, DuplicateIdConflict } from "../types";
import { FOREIGN_KEYS, type ForeignKeyRule } from "./fk-registry";

type GenericRow = { id: string } & Record<string, unknown>;

/** Resolve a collection name (e.g. "customers" or "master.vendors") to the
 *  actual array of records in the database. Returns [] for unknown names. */
function resolveCollection(db: RDashDatabase, name: string): GenericRow[] {
    if (name.startsWith("master.")) {
        const key = name.slice("master.".length) as keyof Master;
        const arr = db.master?.[key];
        return Array.isArray(arr) ? (arr as unknown as GenericRow[]) : [];
    }
    const key = name as keyof RDashDatabase;
    const arr = db[key];
    return Array.isArray(arr) ? (arr as unknown as GenericRow[]) : [];
}

/** Build a Set<string> of every id in the given collection. O(N). */
function buildIdSet(rows: GenericRow[]): Set<string> {
    const set = new Set<string>();
    for (const row of rows) {
        if (row && typeof row.id === "string") set.add(row.id);
    }
    return set;
}

/** Get the list of all collection names present in the workspace
 *  (top-level + master.*). Used for duplicate-ID detection and for the
 *  totalRecords counter. */
function allCollectionNames(db: RDashDatabase): string[] {
    const names: string[] = [];
    for (const key of Object.keys(db)) {
        if (key === "master" || key.startsWith("_")) continue;
        const value = (db as Record<string, unknown>)[key];
        if (Array.isArray(value)) names.push(key);
    }
    if (db.master) {
        for (const key of Object.keys(db.master)) {
            const value = (db.master as Record<string, unknown>)[key];
            if (Array.isArray(value)) names.push(`master.${key}`);
        }
    }
    return names;
}

function genIssueId(): string {
    return `iss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Determine severity for a missing reference. */
function severityFor(rule: ForeignKeyRule): "critical" | "warning" {
    // Non-nullable + missing parent → critical (data is broken).
    // Nullable + missing parent → warning (data is degraded but usable).
    return rule.nullable ? "warning" : "critical";
}

/** Is this issue auto-fixable by the repair engine? */
function isAutoFixable(rule: ForeignKeyRule): boolean {
    if (rule.onDelete === "ignore") return false;
    if (rule.onDelete === "restrict") return false;
    // cascade + nullify are both auto-fixable:
    //  - nullify: set field to undefined
    //  - cascade: remove the orphaned child entirely (no purpose without parent)
    return true;
}

function buildIssue(
    rule: ForeignKeyRule,
    record: GenericRow,
    targetId: string,
    message: string,
): IntegrityIssue {
    const severity = severityFor(rule);
    return {
        id: genIssueId(),
        severity,
        collection: rule.collection,
        recordId: String(record.id),
        field: rule.field,
        targetCollection: rule.targetCollection,
        targetId,
        message,
        rule,
        autoFixable: isAutoFixable(rule),
    };
}

/**
 * Compute an integrity report for the workspace.
 *
 * The report covers:
 *   - referential integrity (every FK in the registry)
 *   - duplicate-ID detection (within each collection)
 *   - health score (0-100)
 *
 * Pure function — does not mutate `db`.
 */
export function checkWorkspaceIntegrity(db: RDashDatabase): IntegrityReport {
    const startedAt = Date.now();
    const issues: IntegrityIssue[] = [];
    const byCollection: Record<string, number> = {};
    let totalRecords = 0;
    let totalReferences = 0;

    // ── 1. Pre-build ID sets for every parent collection ──────────────
    // We only need sets for collections that appear as a target in at least
    // one FK rule. Polymorphic targets are skipped.
    const parentTargets = new Set<string>();
    for (const rule of FOREIGN_KEYS) {
        if (rule.targetCollection !== "polymorphic") {
            parentTargets.add(rule.targetCollection);
        }
    }
    const idSets = new Map<string, Set<string>>();
    for (const target of parentTargets) {
        const rows = resolveCollection(db, target);
        idSets.set(target, buildIdSet(rows));
    }

    // ── 2. Walk every FK rule and scan the source collection ──────────
    for (const rule of FOREIGN_KEYS) {
        // Polymorphic FKs cannot be checked generically — validateBusinessData
        // handles them via dedicated assert* functions.
        if (rule.onDelete === "ignore" || rule.targetCollection === "polymorphic") {
            continue;
        }
        const childRows = resolveCollection(db, rule.collection);
        if (!childRows.length) continue;
        const parentIds = idSets.get(rule.targetCollection);
        if (!parentIds) continue; // target collection missing from db — treat as empty

        for (const row of childRows) {
            const value = row[rule.field];
            if (rule.isArray) {
                const ids = Array.isArray(value) ? (value as unknown[]) : [];
                for (const idRaw of ids) {
                    if (typeof idRaw !== "string" || !idRaw) continue;
                    totalReferences++;
                    if (!parentIds.has(idRaw)) {
                        const msg = `${rule.collection}.${rule.field}[] references missing ${rule.targetCollection} "${idRaw}".`;
                        issues.push(buildIssue(rule, row, idRaw, msg));
                        byCollection[rule.collection] = (byCollection[rule.collection] || 0) + 1;
                    }
                }
            } else {
                const id = typeof value === "string" ? value : (value == null ? "" : String(value));
                if (!id) {
                    // Empty field — only an issue if rule is non-nullable.
                    if (!rule.nullable) {
                        totalReferences++; // count the expected-but-missing reference
                        const msg = `${rule.collection}.${rule.field} is required but missing (target: ${rule.targetCollection}).`;
                        issues.push(buildIssue(rule, row, "", msg));
                        byCollection[rule.collection] = (byCollection[rule.collection] || 0) + 1;
                    }
                    continue;
                }
                totalReferences++;
                if (!parentIds.has(id)) {
                    const msg = `${rule.collection}.${rule.field} references missing ${rule.targetCollection} "${id}".`;
                    issues.push(buildIssue(rule, row, id, msg));
                    byCollection[rule.collection] = (byCollection[rule.collection] || 0) + 1;
                }
            }
        }
    }

    // ── 3. Duplicate-ID detection within each collection ─────────────
    const duplicateIds: DuplicateIdConflict[] = [];
    const collectionNames = allCollectionNames(db);
    for (const name of collectionNames) {
        const rows = resolveCollection(db, name);
        totalRecords += rows.length;
        const seen = new Map<string, number>();
        for (const row of rows) {
            if (typeof row.id !== "string") continue;
            seen.set(row.id, (seen.get(row.id) || 0) + 1);
        }
        const dupIds: string[] = [];
        for (const [id, count] of seen) {
            if (count > 1) dupIds.push(id);
        }
        if (dupIds.length) {
            duplicateIds.push({ collection: name, ids: dupIds });
        }
    }

    // ── 4. Tally severity counts + health score ──────────────────────
    let critical = 0;
    let warning = 0;
    let info = 0;
    for (const issue of issues) {
        if (issue.severity === "critical") critical++;
        else if (issue.severity === "warning") warning++;
        else info++;
    }
    // Health score: fraction of references that are NOT critically broken,
    // scaled 0-100. Warnings don't reduce the score below 100 by themselves
    // but cap the maximum at 95 when present (so users see there's something
    // to address). When there are zero references (empty workspace), score
    // is 100 (vacuously clean).
    let healthScore: number;
    if (totalReferences === 0) {
        healthScore = 100;
    } else {
        const ratio = 1 - critical / totalReferences;
        healthScore = Math.round(ratio * 100);
        if (warning > 0) healthScore = Math.min(healthScore, 95);
        if (critical === 0 && warning === 0) healthScore = 100;
    }
    if (duplicateIds.length) {
        // Duplicate IDs are critical data corruption — cap the score.
        healthScore = Math.min(healthScore, 50);
    }

    const elapsedMs = Date.now() - startedAt;
    // Attach the elapsed time to the report via a custom field for diagnostics
    // (kept off the public type but useful in development).
    const report: IntegrityReport & { _elapsedMs?: number } = {
        generatedAt: new Date().toISOString(),
        totalRecords,
        totalReferences,
        issues,
        bySeverity: { critical, warning, info },
        byCollection,
        healthScore,
        duplicateIds,
    };
    if (elapsedMs > 50) {
        report._elapsedMs = elapsedMs;
    }
    return report;
}
