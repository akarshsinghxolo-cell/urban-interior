/**
 * @mention utilities for the Universal Conversation Graph.
 *
 * Mention syntax inside a thread message body:
 *   `@[Entity Label](entity_type:entity_id)`
 *
 * Examples:
 *   `@[Mr Das](customer:cus_001)`
 *   `@[WO-2026-001](workOrder:wo_001)`
 *   `@[Kitchen Site](site:site_001)`
 *
 * Mentions are parsed from the body and stored on the message. When a message
 * with mentions is posted, the threads slice cross-posts an alert message to
 * each mentioned entity's own thread — creating the conversation graph
 * backlinks described in the vision.
 *
 * ThreadKind resolution uses the shared `entity-thread-map.ts` — the single
 * source of truth for entity-type → ThreadKind mapping (no manual sync).
 */
import type { ThreadKind } from "./types";
import { mapEntityTypeToThreadKind } from "./entity-thread-map";

interface ParsedMention {
    entity_type: string;
    entity_id: string;
    label: string;
    start: number;
    end: number;
}

/**
 * Mapping of supported mention `entity_type` values to their human label and
 * the ThreadKind their thread uses (so we can cross-post alerts). Kept in
 * sync with `mapEntityTypeToThreadKind` in store/slices/core.ts.
 */
export const MENTION_ENTITY_TYPES: Record<string, { label: string; threadKind: ThreadKind }> = {
    customer: { label: "Customer", threadKind: "generic" },
    site: { label: "Site", threadKind: "site" },
    workOrder: { label: "Work Order", threadKind: "workOrder" },
    quotation: { label: "Quotation", threadKind: "quotation" },
    po: { label: "Purchase Order", threadKind: "po" },
    grn: { label: "GRN", threadKind: "grn" },
    vendor: { label: "Vendor", threadKind: "generic" },
    contractor: { label: "Contractor", threadKind: "generic" },
    staff: { label: "Staff", threadKind: "generic" },
    task: { label: "Task", threadKind: "task" },
    visit: { label: "Visit", threadKind: "visit" },
    vendorBill: { label: "Vendor Bill", threadKind: "vendor_bill" },
    payment: { label: "Payment", threadKind: "payment" },
    invoice: { label: "Invoice", threadKind: "invoice" },
};

/**
 * Matches `@[label](entity_type:entity_id)`. The label may contain any
 * characters except a literal `]`. The entity_type is restricted to
 * alphanumerics + underscore (matches the MENTION_ENTITY_TYPES keys). The
 * entity_id is any non-`)` characters.
 *
 * The regex is global so a single body can contain multiple mentions.
 */
const MENTION_REGEX = /@\[([^\]]+)\]\(([a-zA-Z][a-zA-Z0-9_]*):([^)\s]+)\)/g;

/**
 * Parse all mentions in a message body. Returns them with character offsets
 * (`start`, `end`) so the renderer can split the body into text + mention
 * segments.
 *
 * Malformed mentions (e.g. `entity_type` not in MENTION_ENTITY_TYPES) are
 * still returned — the renderer will render them as plain text, but the
 * data is available for inspection. Callers can filter on `entity_type`
 * membership in MENTION_ENTITY_TYPES if they only want known types.
 */
export function parseMentions(body: string): ParsedMention[] {
    if (!body || !body.includes("@[")) return [];
    const out: ParsedMention[] = [];
    // Reset regex state in case the same global regex is reused.
    MENTION_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(body)) !== null) {
        const label = match[1];
        const entityType = match[2];
        const entityId = match[3];
        out.push({
            label,
            entity_type: entityType,
            entity_id: entityId,
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return out;
}

type RenderSegment =
    | { type: "text"; text: string }
    | { type: "mention"; text: string; mention: ParsedMention };

/**
 * Split a body into ordered segments of plain text and mention pills, for
 * React rendering. Mention segments carry the parsed `mention` object so the
 * renderer can attach click handlers / tooltips.
 */
export function renderMentions(body: string): RenderSegment[] {
    const mentions = parseMentions(body);
    if (!mentions.length) return [{ type: "text", text: body }];
    const segments: RenderSegment[] = [];
    let cursor = 0;
    for (const mention of mentions) {
        if (mention.start > cursor) {
            segments.push({ type: "text", text: body.slice(cursor, mention.start) });
        }
        segments.push({
            type: "mention",
            text: body.slice(mention.start, mention.end),
            mention,
        });
        cursor = mention.end;
    }
    if (cursor < body.length) {
        segments.push({ type: "text", text: body.slice(cursor) });
    }
    return segments;
}

/**
 * Resolve the ThreadKind for a mention's `entity_type`, so the threads
 * slice can cross-post an alert to the mentioned entity's own thread.
 *
 * Uses the shared `mapEntityTypeToThreadKind` from `entity-thread-map.ts`
 * — the single source of truth for entity-type → ThreadKind mapping.
 * The 14 primary mention types are also checked against
 * `MENTION_ENTITY_TYPES` first (for the autocomplete UI metadata), but
 * the ThreadKind resolution is unified.
 *
 * Returns `null` for unknown entity types (the slice will silently skip
 * cross-posting in that case — the mention is still rendered in the
 * original message, just without a backlink).
 */
export function mentionThreadKindForEntityType(entityType: string): ThreadKind | null {
    // Check the curated mention types first (they carry autocomplete metadata).
    const primary = MENTION_ENTITY_TYPES[entityType];
    if (primary) return primary.threadKind;
    // Fall back to the shared canonical map — no more manual sync needed.
    return mapEntityTypeToThreadKind(entityType);
}

/**
 * A mentionable entity — a record the user can @mention in a thread message.
 * Built from the workspace db so the autocomplete popover shows real records.
 */
export interface MentionableEntity {
    entity_type: string;
    entity_id: string;
    label: string;
    sublabel?: string;
    group: string;
}

/**
 * Build a flat, searchable list of mentionable entities from the workspace db.
 * Powers the @mention autocomplete popover. Groups entities by type so the
 * popover can render section headers.
 *
 * Only entity types in MENTION_ENTITY_TYPES are included (the 14 primary
 * mentionable types). Each entity gets a human-readable label and an optional
 * sublabel (e.g. site name for a work order, phone for a customer).
 */
export function buildMentionableEntities(db: any): MentionableEntity[] {
    const out: MentionableEntity[] = [];
    const push = (entity_type: string, entity_id: string, label: string, sublabel: string | undefined, group: string) => {
        if (!entity_id || !label) return;
        out.push({ entity_type, entity_id, label, sublabel, group });
    };
    (db.customers || []).forEach((c: any) => push("customer", c.id, c.name, c.phone, "Customers"));
    (db.sites || []).forEach((s: any) => push("site", s.id, s.name, s.address, "Sites"));
    (db.workOrders || []).forEach((w: any) => push("workOrder", w.id, w.work_order_no || w.id, w.title, "Work Orders"));
    (db.quotations || []).forEach((q: any) => push("quotation", q.id, q.quotation_no || q.id, q.title, "Quotations"));
    (db.purchaseOrders || []).forEach((p: any) => push("po", p.id, p.po_no || p.id, p.vendor_name, "Purchase Orders"));
    (db.grns || []).forEach((g: any) => push("grn", g.id, g.grn_no || g.id, g.po_no, "GRNs"));
    (db.master?.vendors || []).forEach((v: any) => push("vendor", v.id, v.name, v.phone, "Vendors"));
    (db.master?.contractors || []).forEach((c: any) => push("contractor", c.id, c.name, c.phone, "Contractors"));
    (db.master?.staff || []).forEach((s: any) => push("staff", s.id, s.name, s.designation, "Staff"));
    (db.tasks || []).forEach((t: any) => push("task", t.id, t.title, t.assignee_name, "Tasks"));
    (db.visits || []).forEach((v: any) => push("visit", v.id, v.title || v.location_name, v.staff_name, "Visits"));
    (db.vendorBills || []).forEach((b: any) => push("vendorBill", b.id, b.bill_no || b.id, b.vendor_name, "Vendor Bills"));  // STAGE-3-FIX: bill_no (not bill_number)
    (db.payments || []).forEach((p: any) => push("payment", p.id, p.milestone_label || p.payment_no || p.id, p.customer_name, "Payments"));  // STAGE-3-FIX: milestone_label (Payment has no payment_no)
    (db.invoices || []).forEach((i: any) => push("invoice", i.id, i.invoice_no || i.id, i.customer_name, "Invoices"));  // STAGE-3-FIX: invoice_no (not invoice_number)
    return out;
}

/**
 * Fuzzy-filter mentionable entities by a query string. Matches label or
 * sublabel (case-insensitive, punctuation-insensitive). Returns up to `limit`
 * results, preserving the grouped order. Prioritizes label-starts-with matches
 * over label-contains. Token-based: all space-separated query tokens must
 * match somewhere in the label/sublabel (so "Mr Das" matches "Mr. Das").
 */
export function filterMentionableEntities(entities: MentionableEntity[], query: string, limit = 8): MentionableEntity[] {
    const q = query.trim().toLowerCase();
    if (!q) return entities.slice(0, limit);
    // Normalize: remove punctuation, collapse spaces.
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    const nq = normalize(q);
    const tokens = nq.split(" ").filter(Boolean);
    const startsWith: MentionableEntity[] = [];
    const contains: MentionableEntity[] = [];
    for (const e of entities) {
        const label = normalize(e.label);
        const sub = normalize(e.sublabel || "");
        const hay = label + " " + sub;
        // All tokens must be present somewhere in the label or sublabel.
        const allTokensMatch = tokens.every((tok) => hay.includes(tok));
        if (!allTokensMatch) continue;
        if (label.startsWith(nq) || sub.startsWith(nq)) startsWith.push(e);
        else contains.push(e);
    }
    return [...startsWith, ...contains].slice(0, limit);
}
