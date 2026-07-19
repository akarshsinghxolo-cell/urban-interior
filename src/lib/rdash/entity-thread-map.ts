/**
 * Entity-Type → ThreadKind mapping — the canonical "nervous system registry"
 * for the Universal Conversation Graph.
 *
 * This is the SINGLE source of truth for which ThreadKind an entity type maps
 * to. Both `store/slices/core.ts` (for `logAudit` cross-posting) and
 * `mentions.ts` (for @mention backlink cross-posting) import from this file.
 *
 * Adding a new entity type: add ONE entry here. Both audit events and
 * @mention backlinks will automatically use the correct ThreadKind.
 *
 * Design note: previously `core.ts` had the full map and `mentions.ts` had a
 * partial "fallback" map that had to be manually kept in sync (with a warning
 * comment). This file eliminates that sync burden — there is now one map.
 */
import type { ThreadKind } from "./types";

/**
 * The canonical entity_type → ThreadKind mapping.
 *
 * Convention:
 * - Entities with a dedicated ThreadKind use it (e.g. "quotation" → "quotation").
 * - Entities without a dedicated ThreadKind use "generic" (e.g. "customer", "vendor", "staff").
 * - Some entity types are aliases (e.g. "purchaseOrder" → "po", "execution_log" → "execution_log").
 */
const ENTITY_TYPE_TO_THREAD_KIND: Record<string, ThreadKind> = {
    // Customer-domain entities
    customer: "generic",
    site: "site",
    area: "generic",

    // Sales / quotation domain
    workRequired: "workRequired",
    quotation: "quotation",
    acceptedScope: "quotation",

    // Execution domain
    workOrder: "workOrder",
    boq: "generic",
    drawing: "drawing",
    executionLog: "execution_log",
    execution_log: "execution_log",
    variationRequest: "generic",

    // Procurement domain
    vendorRfq: "po",
    vendorBid: "po",
    po: "po",
    purchaseOrder: "po",
    grn: "grn",
    dispatch: "dispatch",
    inventory: "inventory",

    // Finance domain
    vendorBill: "vendor_bill",
    vendorPayment: "vendor_bill",
    contractorBill: "bid",
    contractorPayment: "bid",
    commission: "commission",
    settlement: "settlement",
    payment: "payment",
    invoice: "invoice",

    // Contractor domain
    contractorBid: "bid",
    bid: "bid",

    // Operations domain
    visit: "visit",
    task: "task",
    followup: "followup",
    action: "approval",
    approval: "approval",
    blocked: "blocked",
    risk: "blocked",

    // Master-data entities (no dedicated ThreadKind → "generic")
    vendor: "generic",
    contractor: "generic",
    staff: "generic",
    staffRate: "generic",
    vendorRate: "generic",
    attendance: "generic",

    // System / misc
    thread: "generic",
    workspace: "generic",
};

/**
 * Maps an audit entity_type string to the corresponding ThreadKind.
 * Returns `null` for unknown entity types (they won't get a thread).
 *
 * This is used by `logAudit` to determine which thread(s) to post an audit
 * event to, and by the @mention system to determine where to cross-post
 * mention backlinks.
 */
export function mapEntityTypeToThreadKind(entityType: string): ThreadKind | null {
    return ENTITY_TYPE_TO_THREAD_KIND[entityType] || null;
}

/**
 * Check if an entity type is known (has a ThreadKind mapping).
 * Useful for validation before attempting to open a thread.
 */
export function isKnownEntityType(entityType: string): boolean {
    return entityType in ENTITY_TYPE_TO_THREAD_KIND;
}
