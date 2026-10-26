// ============================================================================
// Integrity Repair Engine — uses the checker to find auto-fixable issues
// and applies the fixes. Also de-duplicates IDs and runs the operational
// self-heal pass at the end.
// ============================================================================
// PURE function — does not mutate the store. The caller commits the result.
// ============================================================================

import type { RDashDatabase, RepairResult, IntegrityIssue } from "../types";
import { checkWorkspaceIntegrity } from "./checker";
import { repairOperationalWorkspace } from "../operational-repair";

import { resolveReferenceCollection as resolveCollection, replaceReferenceCollection as replaceCollection, referenceField, replaceReferenceField } from "./reference-access";

/**
 * Repair auto-fixable integrity issues.
 *
 * For each issue from the checker:
 *   - If rule.onDelete === "nullify" and the field is nullable → set field
 *     to undefined (or remove the id from the array). Fixes the orphan.
 *   - If rule.onDelete === "cascade" and the parent is gone → remove the
 *     orphaned child (it has no purpose without its parent).
 *   - If rule.onDelete === "restrict" → cannot auto-fix; skip and log.
 *   - Empty-required-field issues (rule.nullable=false, value missing) →
 *     cannot auto-fix; skip and log.
 *
 * Also de-duplicates IDs within each collection: keeps the first occurrence
 * and renames subsequent duplicates with a `-dup-N` suffix.
 *
 * Finally, runs `repairOperationalWorkspace` for the self-heal pass
 * (article variants, vendor rates, inventory, work costs, quotation totals).
 *
 * Returns the modified db and a result describing what was changed.
 */
export function repairIntegrityIssues(inputDb: RDashDatabase): { db: RDashDatabase; result: RepairResult } {
    let db = structuredClone(inputDb) as RDashDatabase;
    const details: RepairResult["details"] = [];
    const skippedDetails: RepairResult["skippedDetails"] = [];
    let repaired = 0;
    let skipped = 0;

    // ── 1. Run the checker to find all auto-fixable issues ───────────
    const report = checkWorkspaceIntegrity(db);
    const autoFixable = report.issues.filter((issue) => issue.autoFixable);

    // Group issues by (collection, recordId, field) so we apply at most one
    // fix per (record, field) pair. Within a group, prefer the first issue.
    const fixGroups = new Map<string, IntegrityIssue[]>();
    for (const issue of autoFixable) {
        const key = `${issue.collection}::${issue.recordId}::${issue.field}`;
        const group = fixGroups.get(key);
        if (group) group.push(issue);
        else fixGroups.set(key, [issue]);
    }

    // ── 2. Apply fixes ─────────────────────────────────────────────────
    // Process cascade-style fixes first (they may remove rows that other
    // fixes would otherwise target), then nullify-style fixes.
    const orderedGroups = Array.from(fixGroups.values()).sort((a, b) => {
        const aCascade = a[0].rule.onDelete === "cascade" ? 0 : 1;
        const bCascade = b[0].rule.onDelete === "cascade" ? 0 : 1;
        return aCascade - bCascade;
    });

    for (const group of orderedGroups) {
        const issue = group[0];
        // The record may have been removed by an earlier cascade fix.
        const rows = resolveCollection(db, issue.collection);
        const target = rows.find((row) => row.id === issue.recordId);
        if (!target) {
            // Already removed (likely by a cascade fix on a parent) — skip.
            continue;
        }

        if (issue.rule.onDelete === "cascade") {
            // Parent is gone and child has no purpose → remove the child.
            const idx = rows.findIndex((row) => row.id === issue.recordId);
            const nextRows = [...rows.slice(0, idx), ...rows.slice(idx + 1)];
            db = replaceCollection(db, issue.collection, nextRows);
            details.push({
                collection: issue.collection,
                id: issue.recordId,
                action: `cascade-removed orphan (parent ${issue.targetCollection} "${issue.targetId}" is missing)`,
            });
            repaired++;
            continue;
        }

        if (issue.rule.onDelete === "nullify") {
            if (issue.rule.isArray) {
                // Remove the dangling id from the array.
                const arr = Array.isArray(referenceField(target, issue.field)) ? referenceField(target, issue.field) as unknown[] : [];
                const missingIds = new Set(group.map((entry) => entry.targetId));
                const filtered = arr.filter((v) => typeof v !== "string" || !missingIds.has(v));
                const idx = rows.findIndex((row) => row.id === issue.recordId);
                const nextRows = [...rows.slice(0, idx), replaceReferenceField(target, issue.field, filtered), ...rows.slice(idx + 1)];
                db = replaceCollection(db, issue.collection, nextRows);
                details.push({
                    collection: issue.collection,
                    id: issue.recordId,
                    action: `nullified array entry in ${issue.field} (removed missing ${issue.targetCollection} "${issue.targetId}")`,
                });
                repaired++;
            } else if (issue.rule.nullable) {
                const idx = rows.findIndex((row) => row.id === issue.recordId);
                const nextRows = [...rows.slice(0, idx), replaceReferenceField(target, issue.field, undefined), ...rows.slice(idx + 1)];
                db = replaceCollection(db, issue.collection, nextRows);
                details.push({
                    collection: issue.collection,
                    id: issue.recordId,
                    action: `nullified ${issue.field} (parent ${issue.targetCollection} "${issue.targetId}" is missing)`,
                });
                repaired++;
            } else {
                // Nullify rule on a non-nullable field — shouldn't happen
                // per registry convention, but be defensive.
                skipped++;
                skippedDetails.push({
                    collection: issue.collection,
                    id: issue.recordId,
                    reason: `Cannot nullify non-nullable field ${issue.field}.`,
                });
            }
            continue;
        }
    }

    // ── 3. Skip non-auto-fixable issues (restrict + missing-required) ─
    for (const issue of report.issues) {
        if (issue.autoFixable) continue;
        if (issue.rule.onDelete === "restrict") {
            skipped++;
            skippedDetails.push({
                collection: issue.collection,
                id: issue.recordId,
                reason: `restrict policy on ${issue.field} → ${issue.targetCollection} — manual resolution required.`,
            });
        } else if (!issue.rule.nullable && !issue.targetId) {
            skipped++;
            skippedDetails.push({
                collection: issue.collection,
                id: issue.recordId,
                reason: `Required field ${issue.field} is missing — cannot auto-fill.`,
            });
        }
    }

    // ── 4. De-duplicate IDs within each collection ───────────────────
    // Keep the first occurrence; rename subsequent duplicates with a -dup-N
    // suffix so they no longer collide. Log every rename.
    const collectionNames: string[] = [];
    for (const key of Object.keys(db)) {
        if (key === "master" || key.startsWith("_")) continue;
        const value = (db as unknown as Record<string, unknown>)[key];  // STAGE-6-FIX: double cast
        if (Array.isArray(value)) collectionNames.push(key);
    }
    if (db.master) {
        for (const key of Object.keys(db.master)) {
            const value = (db.master as unknown as Record<string, unknown>)[key];  // STAGE-6-FIX: double cast
            if (Array.isArray(value)) collectionNames.push(`master.${key}`);
        }
    }
    for (const name of collectionNames) {
        const rows = resolveCollection(db, name);
        const seen = new Set<string>();
        let modified = false;
        const nextRows = rows.map((row) => {
            const id = String(row.id);
            if (!seen.has(id)) {
                seen.add(id);
                return row;
            }
            // Find a unique rename.
            let counter = 1;
            let newId = `${id}-dup-${counter}`;
            while (seen.has(newId)) {
                counter++;
                newId = `${id}-dup-${counter}`;
            }
            seen.add(newId);
            modified = true;
            details.push({
                collection: name,
                id: newId,
                action: `renamed duplicate id "${id}" → "${newId}"`,
            });
            repaired++;
            return { ...row, id: newId };
        });
        if (modified) {
            db = replaceCollection(db, name, nextRows);
        }
    }

    // ── 5. Run the operational self-heal pass ────────────────────────
    // This repairs article variants, vendor rates, inventory, work costs,
    // quotation totals — the "operational" repairs that don't fit the FK
    // registry model. It also normalizes the master catalogue.
    // Operational normalization can discard incomplete rates and their history.
    // Unknown required parents need manual resolution, so do not run that pass
    // while those records are still present. Explicit safe FK repairs above
    // remain available and are reported independently.
    const manualReferenceIssues = report.issues.some((issue) => !issue.autoFixable);
    if (!manualReferenceIssues) db = repairOperationalWorkspace(db);

    return {
        db,
        result: {
            repaired,
            details,
            skipped,
            skippedDetails,
        },
    };
}
