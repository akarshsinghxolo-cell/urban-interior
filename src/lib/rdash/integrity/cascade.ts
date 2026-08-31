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
import { validateBusinessData } from "../business-rules";

type GenericRow = { id: string } & Record<string, unknown>;

const THREAD_KINDS_BY_COLLECTION: Record<string, string[]> = {
    customers: ["generic"], sites: ["site"], areas: ["generic"], workRequired: ["workRequired"], measurementRevisions: ["generic"],
    quotations: ["quotation"], acceptedScopes: ["generic"], workOrders: ["workOrder"], boqs: ["generic"], variationRequests: ["generic"],
    vendorRfqs: ["po"], vendorBids: ["po"], purchaseOrders: ["po"], grns: ["grn"], stockMovements: ["generic"], vendorBills: ["vendor_bill"],
    vendorPayments: ["vendor_bill"], dispatches: ["dispatch"], inventory: ["inventory"], drawings: ["drawing"], executionLogs: ["execution_log"],
    visits: ["visit"], tasks: ["task"], followups: ["followup"], actions: ["approval"], payments: ["payment"], invoices: ["invoice"],
    customerReceipts: ["generic"], contractorBids: ["bid"], contractorBills: ["bid"], contractorPayments: ["bid"], contractorSettlements: ["settlement"],
    commissions: ["commission"], blocked: ["blocked"], "master.vendors": ["generic"], "master.vendorRates": ["generic"], "master.contractors": ["generic"],
    "master.staff": ["generic"],
};

const APPROVAL_LINK_TYPE_BY_COLLECTION: Record<string, string> = {
    quotations: "quotation",
    purchaseOrders: "po",
    payments: "payment",
    contractorPayments: "contractor_payment",
};

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

function blockNestedHistoryReference(ctx: CascadeContext, collection: string, id: string): boolean {
    const blocked = (childCollection: string, childId: string, reason: string) => {
        ctx.result.success = false;
        ctx.result.blocked.push({
            collection: childCollection,
            id: childId,
            reason,
            rule: { collection: childCollection, field: "nested", targetCollection: collection, onDelete: "restrict", nullable: false, label: "Nested historical reference" },
        });
        return true;
    };
    if (collection === "workRequired") {
        const quotation = ctx.db.quotations.find((row) => (row.coverage || []).some((coverage) => coverage.work_required_id === id));
        if (quotation) return blocked("quotations", quotation.id, `Quotation ${quotation.quotation_no} still includes Work Required "${id}" in its coverage.`);
    }
    if (collection === "measurementRevisions") {
        const quotation = ctx.db.quotations.find((row) => (row.coverage || []).some((coverage) => (coverage.measurement_revision_ids || []).includes(id)));
        if (quotation) return blocked("quotations", quotation.id, `Quotation ${quotation.quotation_no} still includes Measurement Revision "${id}".`);
        const scope = ctx.db.acceptedScopes.find((row) => (row.measurement_revision_ids || []).includes(id));
        if (scope) return blocked("acceptedScopes", scope.id, `Accepted Scope "${scope.label}" still includes Measurement Revision "${id}".`);
    }
    return false;
}

function nullifyNestedDrawingLinks(ctx: CascadeContext, drawingId: string): void {
    let changed = false;
    const boqs = ctx.db.boqs.map((boq) => {
        let itemChanged = false;
        const items = boq.items.map((item) => {
            if (item.drawing_id !== drawingId) return item;
            itemChanged = true;
            changed = true;
            ctx.result.nullified.push({ collection: "boqs", id: boq.id, field: `items.${item.id}.drawing_id` });
            return { ...item, drawing_id: undefined, drawing_no: undefined };
        });
        return itemChanged ? { ...boq, items } : boq;
    });
    if (changed) ctx.db = { ...ctx.db, boqs };
}

function deletePolymorphicDependents(ctx: CascadeContext, collection: string, id: string): void {
    if (collection !== "threads") {
        const kinds = THREAD_KINDS_BY_COLLECTION[collection] || [];
        const threads = ctx.db.threads.filter((thread) => thread.record_id === id && kinds.includes(thread.kind));
        for (const thread of threads) {
            ctx.depth += 1;
            try { deleteRecursive(ctx, "threads", thread.id, thread.title); } finally { ctx.depth -= 1; }
            if (!ctx.result.success) return;
        }
    }
    const approvalType = APPROVAL_LINK_TYPE_BY_COLLECTION[collection];
    if (approvalType) {
        const actions = ctx.db.actions.filter((action) => action.linked_record_type === approvalType && action.linked_record_id === id);
        for (const action of actions) {
            ctx.depth += 1;
            try { deleteRecursive(ctx, "actions", action.id, action.title); } finally { ctx.depth -= 1; }
            if (!ctx.result.success) return;
        }
    }
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

    if (blockNestedHistoryReference(ctx, collection, id)) return;
    if (collection === "drawings") nullifyNestedDrawingLinks(ctx, id);

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
                // STAGE-5-FIX (5.8): "ignore" case removed — it's filtered at
                // line 137 (if rule.onDelete === "ignore") and is not in the
                // OnDeletePolicy union, causing TS2678. This dead case is gone.
            }
        }
    }

    deletePolymorphicDependents(ctx, collection, id);
    if (!ctx.result.success) return;

    // ── FIX-ANALYSIS-001 #8: Polymorphic-entity sweep ──────────────────────
    // entityFileAttachments and entityReferenceAssignments reference their
    // parent via (entity_type, entity_id) — a polymorphic link that the FK
    // registry marks as "ignore" because the parent collection varies.
    // Without this sweep, deleting a customer/site/workOrder leaves orphaned
    // file attachments that reference a non-existent entity_id. These orphans
    // block subsequent workspace commits (validateBusinessData rejects them).
    //
    // Solution: after processing all typed FK rules, scan these two
    // polymorphic collections for rows where entity_id === id AND entity_type
    // matches the collection being deleted. Cascade-delete the matching file
    // attachment/reference rows. The underlying FileAsset is intentionally not
    // deleted here because one Drive file may be shared by multiple entities;
    // unreferenced managed-file cleanup is handled separately.
    const ATTACHMENT_ENTITY_TYPES_BY_COLLECTION: Record<string, string[]> = {
        customers: ["customer"], sites: ["site"], areas: ["room"], workRequired: ["workRequired"], measurementRevisions: ["measurement_revision"],
        quotations: ["quotation"], acceptedScopes: ["accepted_scope"], workOrders: ["workOrder"], boqs: ["boq"], variationRequests: ["variation_request"],
        vendorRfqs: ["vendor_rfq"], vendorBids: ["vendor_bid"], purchaseOrders: ["purchase_order"], grns: ["grn"], stockMovements: ["stock_movement"],
        vendorBills: ["vendor_bill"], vendorPayments: ["vendor_payment"], dispatches: ["dispatch"], inventory: ["inventory"], drawings: ["drawing"],
        executionLogs: ["execution_log"], visits: ["visit"], tasks: ["task"], followups: ["followup"], payments: ["payment"], invoices: ["invoice"],
        customerReceipts: ["customer_receipt"], contractorBids: ["contractor_bid"], contractorBills: ["contractor_bill"], contractorPayments: ["contractor_payment"],
        contractorSettlements: ["contractor_settlement"], commissions: ["commission"], blocked: ["blocked"], commSends: ["communication"],
        "master.vendors": ["vendor"], "master.vendorRates": ["vendor_rate"], "master.contractors": ["contractor"],
    };
    const attachmentEntityTypes = ATTACHMENT_ENTITY_TYPES_BY_COLLECTION[collection] || [collection];
    const parentRow = resolveCollection(ctx.db, collection).find((row) => row.id === id);
    const nestedEntityIds = new Map<string, Set<string>>();
    if (collection === "quotations" && parentRow) {
        const items = [...(Array.isArray(parentRow.scope_lines) ? parentRow.scope_lines : []), ...(Array.isArray(parentRow.items) ? parentRow.items : [])] as Array<Record<string, unknown>>;
        nestedEntityIds.set("quotation_item", new Set(items.map((item) => String(item.id || "")).filter(Boolean)));
    }
    if (collection === "boqs" && parentRow) {
        const items = (Array.isArray(parentRow.items) ? parentRow.items : []) as Array<Record<string, unknown>>;
        nestedEntityIds.set("boq_item", new Set(items.map((item) => String(item.id || "")).filter(Boolean)));
    }
    if (collection === "threads" && parentRow) {
        const messages = (Array.isArray(parentRow.messages) ? parentRow.messages : []) as Array<Record<string, unknown>>;
        nestedEntityIds.set("thread_message", new Set(messages.map((message) => String(message.id || "")).filter(Boolean)));
    }
    const POLYMORPHIC_ENTITY_COLLECTIONS: Array<{
        collection: string;
        entityField: string;
        typeField: string;
    }> = [
        { collection: "entityFileAttachments", entityField: "entity_id", typeField: "entity_type" },
        { collection: "entityReferenceAssignments", entityField: "entity_id", typeField: "entity_type" },
    ];
    for (const poly of POLYMORPHIC_ENTITY_COLLECTIONS) {
        const polyRows = resolveCollection(ctx.db, poly.collection);
        const matching = polyRows.filter((row) => {
            const entityId = row[poly.entityField];
            const entityType = row[poly.typeField];
            if (typeof entityId !== "string" || typeof entityType !== "string") return false;
            if (entityId === id && attachmentEntityTypes.includes(entityType)) return true;
            return nestedEntityIds.get(entityType)?.has(entityId) === true;
        });
        for (const child of matching) {
            const childLabel = labelForRow(child);
            ctx.depth += 1;
            try {
                deleteRecursive(ctx, poly.collection, String(child.id), childLabel);
            } finally {
                ctx.depth -= 1;
            }
            if (!ctx.result.success) return;
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
        // STAGE-5-FIX (5.2): Throw instead of silently falling through to
        // hard delete. A caller requesting softDelete:true on a non-whitelisted
        // collection should get an explicit error, not silent permanent deletion.
        if (ctx.softDelete) {
            ctx.result.success = false;
            ctx.result.blocked.push({
                collection,
                id,
                reason: `Soft-delete is not supported for collection "${collection}". Supported: ${[...SOFT_DELETE_COLLECTIONS].join(", ")}.`,
                rule: {
                    collection: "",
                    field: "",
                    targetCollection: collection,
                    onDelete: "restrict",
                    nullable: false,
                    label: "(soft-delete not supported)",
                },
            });
            return;
        }
    }
    const pruned = removeRow(ctx.db, collection, id);
    if (pruned) {
        ctx.db = pruned;
        ctx.result.deleted.push({ collection, id, label });
    }
}

interface CascadeOptions {
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
    if (result.success) {
        const beforeFailures = new Set(validateBusinessData(inputDb));
        const introduced = validateBusinessData(ctx.db).filter((failure) => !beforeFailures.has(failure));
        if (introduced.length) {
            result.success = false;
            for (const failure of introduced.slice(0, 10)) {
                result.blocked.push({
                    collection,
                    id,
                    reason: `Delete would introduce an invalid workspace state: ${failure}`,
                    rule: { collection, field: "business_integrity", targetCollection: collection, onDelete: "restrict", nullable: false, label: "Business integrity guard" },
                });
            }
        }
    }
    // If the operation was blocked by a restrict rule or by the final business
    // integrity guard, return the ORIGINAL db rather than a partially-mutated clone.
    return { db: result.success ? ctx.db : inputDb, result };
}

