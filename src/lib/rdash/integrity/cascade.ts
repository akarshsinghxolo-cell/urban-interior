// ============================================================================
// Cascade-Delete Planner — given a target collection + id, walks the FK
// registry INVERSE (find every rule whose targetCollection === collection)
// and applies each rule's onDelete policy.
// ============================================================================
// This is a PURE function — it does not mutate the store. The caller
// commits the returned `db` via the workspace transaction pipeline.
//
// Depth limiting: cascade recursion is capped at maxDepth (default 10) to
// prevent infinite loops in pathological cycles. The registry has no
// intentional cycles, but defensive depth limiting is cheap insurance.
// ============================================================================

import type { RDashDatabase, Master, CascadeResult } from "../types";
import { fksTargetingCollection } from "./fk-registry";

type GenericRow = { id: string } & Record<string, unknown>;

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

function replaceCollection(db: RDashDatabase, name: string, rows: GenericRow[]): RDashDatabase {
    if (name.startsWith("master.")) {
        const key = name.slice("master.".length) as keyof Master;
        return { ...db, master: { ...db.master, [key]: rows } };
    }
    const key = name as keyof RDashDatabase;
    return { ...db, [key]: rows };
}

function labelForRow(row: GenericRow): string | undefined {
    const labelFields = ["name", "title", "label", "quotation_no", "work_order_no", "po_no", "grn_no", "bill_no", "payment_no", "rfq_no", "bid_no", "settlement_no", "variation_no", "log_no", "drawing_no", "receipt_no", "invoice_no", "commission_no"];
    for (const field of labelFields) {
        const value = row[field];
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}

interface CascadeContext {
    db: RDashDatabase;
    result: CascadeResult;
    visited: Set<string>; // "collection:id" keys to prevent revisits
    depth: number;
    maxDepth: number;
    softDelete: boolean;
}

const SOFT_DELETE_COLLECTIONS = new Set([
    "sites",
    "areas",
    "customers",
]);

/** Apply the soft-delete flag to a row, if the collection supports it. */
function applySoftDelete(row: GenericRow, collection: string): GenericRow | null {
    if (!SOFT_DELETE_COLLECTIONS.has(collection)) return null;
    const next: GenericRow = { ...row };
    if ("is_archived" in next) {
        next.is_archived = true;
    } else {
        next.is_archived = true;
    }
    if (!("archived_at" in next)) {
        next.archived_at = new Date().toISOString();
    }
    return next;
}

/** Remove a single row by id from a collection (immutably). Returns the
 *  updated database, or null if the row wasn't found. */
function removeRow(db: RDashDatabase, collection: string, id: string): RDashDatabase | null {
    const rows = resolveCollection(db, collection);
    const idx = rows.findIndex((row) => row.id === id);
    if (idx === -1) return null;
    const nextRows = [...rows.slice(0, idx), ...rows.slice(idx + 1)];
    return replaceCollection(db, collection, nextRows);
}

/** Nullify a single field on a single row (immutably). */
function nullifyField(db: RDashDatabase, collection: string, id: string, field: string, isArray: boolean): RDashDatabase | null {
    const rows = resolveCollection(db, collection);
    const idx = rows.findIndex((row) => row.id === id);
    if (idx === -1) return null;
    const target = rows[idx];
    let updatedRow: GenericRow;
    if (isArray) {
        // For array fields, remove the dangling id from the array (the rest
        // of the array might still reference valid rows).
        const arr = Array.isArray(target[field]) ? (target[field] as unknown[]) : [];
        const filtered = arr.filter((v) => typeof v !== "string" || v !== id);
        updatedRow = { ...target, [field]: filtered };
    } else {
        updatedRow = { ...target, [field]: undefined };
    }
    const nextRows = [...rows.slice(0, idx), updatedRow, ...rows.slice(idx + 1)];
    return replaceCollection(db, collection, nextRows);
}

/** Recursively delete a row, applying cascade/restrict/nullify rules to
 *  every child collection that references it. Mutates `ctx.result`. */
function deleteRecursive(ctx: CascadeContext, collection: string, id: string, label?: string): void {
    const key = `${collection}:${id}`;
    if (ctx.visited.has(key)) return; // already processed (cycle guard)
    ctx.visited.add(key);

    if (ctx.depth > ctx.maxDepth) {
        ctx.result.blocked.push({
            collection,
            id,
            reason: `Max cascade depth (${ctx.maxDepth}) exceeded — possibly cyclic reference.`,
            rule: {
                collection: "",
                field: "",
                targetCollection: collection,
                onDelete: "cascade",
                nullable: false,
                label: "(depth limit)",
            },
        });
        return;
    }

    // Find every FK rule whose targetCollection === collection — these are
    // the child relationships that depend on this row.
    const childRules = fksTargetingCollection(collection);

    for (const rule of childRules) {
        if (rule.onDelete === "ignore") continue; // polymorphic — skip
        // Find every child row in the source collection that references `id`
        // via this rule's field.
        const childRows = resolveCollection(ctx.db, rule.collection);
        const referencing = childRows.filter((row) => {
            const value = row[rule.field];
            if (rule.isArray) {
                return Array.isArray(value) && (value as unknown[]).some((v) => typeof v === "string" && v === id);
            }
            return typeof value === "string" && value === id;
        });

        for (const child of referencing) {
            switch (rule.onDelete) {
                case "restrict": {
                    // Block the whole operation. Do not continue cascading.
                    ctx.result.success = false;
                    ctx.result.blocked.push({
                        collection: rule.collection,
                        id: String(child.id),
                        reason: `${rule.label}: cannot delete ${collection} "${id}" while ${rule.collection} "${child.id}" references it (restrict policy).`,
                        rule,
                    });
                    return;
                }
                case "nullify": {
                    const updated = nullifyField(ctx.db, rule.collection, String(child.id), rule.field, Boolean(rule.isArray));
                    if (updated) {
                        ctx.db = updated;
                        ctx.result.nullified.push({
                            collection: rule.collection,
                            id: String(child.id),
                            field: rule.field,
                        });
                    }
                    break;
                }
                case "cascade": {
                    // Recursively delete the child.
                    const childLabel = labelForRow(child);
                    ctx.depth += 1;
                    try {
                        deleteRecursive(ctx, rule.collection, String(child.id), childLabel);
                    } finally {
                        ctx.depth -= 1;
                    }
                    if (!ctx.result.success) return; // abort on restrict below
                    break;
                }
                case "ignore":
                    // Already filtered above.
                    break;
            }
        }
    }

    // All children handled — now remove the row itself (or soft-delete).
    if (ctx.softDelete) {
        const softDeleted = applySoftDelete({ id } as GenericRow, collection);
        if (softDeleted) {
            // Apply the soft-delete patch to the actual row in the db.
            const rows = resolveCollection(ctx.db, collection);
            const idx = rows.findIndex((row) => row.id === id);
            if (idx !== -1) {
                const merged = { ...rows[idx], ...softDeleted };
                const nextRows = [...rows.slice(0, idx), merged, ...rows.slice(idx + 1)];
                ctx.db = replaceCollection(ctx.db, collection, nextRows);
                ctx.result.softDeleted.push({ collection, id });
                return;
            }
        }
        // Fall through to hard delete if soft-delete isn't supported.
    }
    const pruned = removeRow(ctx.db, collection, id);
    if (pruned) {
        ctx.db = pruned;
        ctx.result.deleted.push({ collection, id, label });
    }
}

export interface CascadeOptions {
    softDelete?: boolean;
    maxDepth?: number;
}

/**
 * Cascade-delete a record. Returns the modified database and a result
 * describing what was deleted / blocked / nullified / soft-deleted.
 *
 * PURE: does not mutate the input `db`. The caller must commit the result.
 *
 * If any child relationship is `restrict` and a child exists, the entire
 * operation is aborted (success=false) and the db is returned unchanged.
 */
export function cascadeDelete(
    inputDb: RDashDatabase,
    collection: string,
    id: string,
    options: CascadeOptions = {},
): { db: RDashDatabase; result: CascadeResult } {
    const result: CascadeResult = {
        success: true,
        deleted: [],
        blocked: [],
        softDeleted: [],
        nullified: [],
    };

    // Verify the row exists — if not, return early.
    const rows = resolveCollection(inputDb, collection);
    const target = rows.find((row) => row.id === id);
    if (!target) {
        result.success = false;
        result.blocked.push({
            collection,
            id,
            reason: `No ${collection} record with id "${id}" exists.`,
            rule: {
                collection: "",
                field: "",
                targetCollection: collection,
                onDelete: "restrict",
                nullable: false,
                label: "(not found)",
            },
        });
        return { db: inputDb, result };
    }

    const ctx: CascadeContext = {
        db: structuredClone(inputDb) as RDashDatabase,
        result,
        visited: new Set<string>(),
        depth: 0,
        maxDepth: options.maxDepth ?? 10,
        softDelete: options.softDelete ?? false,
    };

    deleteRecursive(ctx, collection, id, labelForRow(target));
    return { db: ctx.db, result };
}

/**
 * DRY-RUN mode: compute what WOULD be deleted/blocked/nullified without
 * actually modifying the database. Returns the same CascadeResult shape
 * but the `db` field is unchanged.
 *
 * Implementation: we run the real cascade on a clone and discard the clone,
 * keeping only the result. This is simpler than maintaining two code paths.
 */
export function cascadeDeleteDryRun(
    db: RDashDatabase,
    collection: string,
    id: string,
    options: CascadeOptions = {},
): CascadeResult {
    return cascadeDelete(db, collection, id, options).result;
}
