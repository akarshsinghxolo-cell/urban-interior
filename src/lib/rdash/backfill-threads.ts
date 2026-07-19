/**
 * Seed thread backfill — implements the "Universal Conversation Graph" vision
 * for seed data.
 *
 * At runtime, `logAudit` (in `store/slices/core.ts`) auto-opens a thread for
 * any entity that receives an audit event, and posts the audit action as a
 * system message in that thread. But the SEED bypasses `logAudit` — it writes
 * audit entries directly to `db.auditLog` and ships with `threads: []`. This
 * means a freshly-seeded workspace has ZERO threads until the user performs
 * their first action, so the conversation graph is invisible on first load.
 *
 * `backfillSeedThreads` closes that gap. It walks every key entity collection
 * in the seed DB and opens a thread for each entity (with a "Thread opened"
 * system message + a few lifecycle messages derived from the entity's own
 * fields). It then walks the existing `auditLog` entries and links each one
 * to its entity's thread (creating the thread if needed), mirroring exactly
 * what `logAudit` would have done at runtime.
 *
 * This module is pure (no store / no React) so it can be unit-tested and
 * reused outside the seed pipeline if needed.
 */
import type { RDashDatabase, Thread, ThreadKind, ThreadMessage, ThreadMessageMention, Drawing, DailyExecutionLog, DrawingKind, DrawingStatus } from "./types";
import { genId, nowIso } from "./store/helpers";
import { mapEntityTypeToThreadKind } from "./entity-thread-map";
import { parseMentions, mentionThreadKindForEntityType } from "./mentions";

/**
 * Returns an ISO timestamp `offsetMs` milliseconds after `base`. Used to
 * stagger thread messages so they have monotonically-increasing timestamps
 * (the "Thread opened" message comes first, then lifecycle events).
 */
function stagger(base: string, offsetMs: number): string {
    const d = new Date(base);
    if (Number.isNaN(d.getTime())) return nowIso();
    d.setTime(d.getTime() + offsetMs);
    return d.toISOString();
}

interface BackfillContext {
    /** Working list of threads (mutated in place as we create/open threads). */
    threads: Thread[];
    /** Lookup index keyed by `${kind}::${record_id}` for O(1) dedup. */
    index: Map<string, Thread>;
}

/**
 * Find an existing thread for the given (kind, recordId) pair, or create a
 * new one with a "Thread opened" system message. Mirrors the behaviour of
 * `ThreadsSlice.openThreadFor` but operates on a plain `RDashDatabase`-shaped
 * context instead of the Zustand store, so it can run during seed build.
 */
function findOrCreateThread(
    ctx: BackfillContext,
    kind: ThreadKind,
    recordId: string,
    title: string,
    createdAt: string,
    participants: string[] = ["Owner"],
): Thread {
    const key = `${kind}::${recordId}`;
    const existing = ctx.index.get(key);
    if (existing) return existing;

    const id = genId("thr");
    const ts = createdAt || nowIso();
    const thread: Thread = {
        id,
        kind,
        title,
        record_id: recordId,
        record_type: kind,
        messages: [
            {
                id: genId("msg"),
                thread_id: id,
                author_name: "System",
                body: `Thread opened for ${title}`,
                kind: "system",
                created_at: ts,
            },
        ],
        participants,
        open: true,
        created_at: ts,
        updated_at: ts,
    };
    ctx.threads.push(thread);
    ctx.index.set(key, thread);
    return thread;
}

/**
 * Append a `system` message to `thread`. Updates `thread.updated_at` if the
 * new message is the newest so far. Pass `relatedAuditId` to link the message
 * back to the `AuditLogEntry` that generated it (matches runtime `logAudit`).
 */
function appendSystemMessage(
    thread: Thread,
    body: string,
    createdAt: string,
    relatedAuditId?: string,
    actor: string = "System",
    actorRole?: string,
): void {
    const ts = createdAt || nowIso();
    const msg: ThreadMessage = {
        id: genId("msg"),
        thread_id: thread.id,
        author_name: actor,
        author_role: actorRole,
        body,
        kind: "system",
        related_audit_id: relatedAuditId,
        created_at: ts,
    };
    thread.messages.push(msg);
    const prev = new Date(thread.updated_at).getTime();
    const next = new Date(ts).getTime();
    if (Number.isNaN(prev) || next > prev) {
        thread.updated_at = ts;
    }
}

/**
 * Backfill threads for every key entity in the seed database, and link every
 * existing audit-log entry to its entity's thread. Returns a NEW database
 * object (the input is not structurally mutated at the top level, though
 * existing Thread objects inside `db.threads` may be mutated — for the seed
 * use case `db.threads` is `[]` so this is safe).
 *
 * Idempotent: if a thread already exists for an entity (same `kind` +
 * `record_id`), it is reused and no duplicate is created.
 */
export function backfillSeedThreads(input: RDashDatabase): RDashDatabase {
    const db: RDashDatabase = { ...input };
    const ctx: BackfillContext = {
        threads: [...(db.threads || [])],
        index: new Map(),
    };
    // Index existing threads so we never duplicate.
    for (const t of ctx.threads) {
        ctx.index.set(`${t.kind}::${t.record_id}`, t);
    }

    // Local label resolvers — kept tiny to avoid pulling in customer-relations.
    const customerName = (id?: string | null): string | undefined =>
        id ? db.customers.find((c) => c.id === id)?.name : undefined;
    const siteName = (id?: string | null): string | undefined =>
        id ? db.sites.find((s) => s.id === id)?.name : undefined;

    // 1. customers → kind "generic", title = customer name.
    for (const c of db.customers) {
        const ts = c.created_at || nowIso();
        const thread = findOrCreateThread(ctx, "generic", c.id, c.name, ts);
        appendSystemMessage(thread, "Customer onboarded", stagger(ts, 60_000));
    }

    // 2. sites → kind "site", title = site name.
    for (const s of db.sites) {
        const ts = s.created_at || nowIso();
        const thread = findOrCreateThread(ctx, "site", s.id, s.name, ts);
        appendSystemMessage(thread, "Site added to portfolio", stagger(ts, 60_000));
    }

    // 3. workOrders → kind "workOrder", title = WO number.
    for (const w of db.workOrders) {
        const ts = w.created_at || nowIso();
        const title = w.work_order_no || w.title;
        const thread = findOrCreateThread(ctx, "workOrder", w.id, title, ts);
        appendSystemMessage(thread, "Work order created", stagger(ts, 60_000));
        const cust = customerName(w.customer_id);
        const site = siteName(w.site_id);
        if (cust || site) {
            appendSystemMessage(
                thread,
                `Linked to ${cust || "—"} / ${site || "—"}`,
                stagger(ts, 120_000),
            );
        }
    }

    // 4. quotations → kind "quotation", title = quotation number.
    for (const q of db.quotations) {
        const ts = q.created_at || nowIso();
        const title = q.quotation_no || q.title;
        const thread = findOrCreateThread(ctx, "quotation", q.id, title, ts);
        appendSystemMessage(thread, "Quotation created", stagger(ts, 60_000));
        if (q.status === "accepted") {
            appendSystemMessage(thread, "Quotation accepted", stagger(ts, 120_000));
        }
    }

    // 5. purchaseOrders → kind "po", title = PO number.
    for (const p of db.purchaseOrders) {
        const ts = p.created_at || nowIso();
        const title = p.po_no;
        const thread = findOrCreateThread(ctx, "po", p.id, title, ts);
        appendSystemMessage(
            thread,
            `PO created to ${p.vendor_name || "vendor"}`,
            stagger(ts, 60_000),
        );
    }

    // 6. grns → kind "grn", title = GRN number.
    for (const g of db.grns) {
        const ts = g.created_at || nowIso();
        const title = g.grn_no;
        const thread = findOrCreateThread(ctx, "grn", g.id, title, ts);
        appendSystemMessage(
            thread,
            `GRN filed against ${g.po_no || g.po_id || "PO"}`,
            stagger(ts, 60_000),
        );
    }

    // 7. payments → kind "payment", title = milestone label / id.
    for (const p of db.payments) {
        const ts = p.created_at || nowIso();
        const title = p.milestone_label || p.id;
        const thread = findOrCreateThread(ctx, "payment", p.id, title, ts);
        appendSystemMessage(thread, "Payment recorded", stagger(ts, 60_000));
    }

    // 8. invoices → kind "invoice", title = invoice number.
    for (const i of db.invoices) {
        const ts = i.created_at || nowIso();
        const title = i.invoice_no;
        const thread = findOrCreateThread(ctx, "invoice", i.id, title, ts);
        appendSystemMessage(thread, "Invoice issued", stagger(ts, 60_000));
    }

    // 9. vendorBills → kind "vendor_bill", title = bill number.
    for (const v of db.vendorBills) {
        const ts = v.created_at || nowIso();
        const title = v.bill_no;
        const thread = findOrCreateThread(ctx, "vendor_bill", v.id, title, ts);
        appendSystemMessage(thread, "Vendor bill received", stagger(ts, 60_000));
    }

    // 10. contractorBills → kind "bid", title = bill number.
    for (const c of db.contractorBills) {
        const ts = c.created_at || nowIso();
        const title = c.bill_no;
        const thread = findOrCreateThread(ctx, "bid", c.id, title, ts);
        appendSystemMessage(thread, "Contractor bill received", stagger(ts, 60_000));
    }

    // 11. contractorBids → kind "bid", title = bid label.
    for (const b of db.contractorBids) {
        const ts = b.created_at || nowIso();
        const title = b.bid_no || b.scope || b.id;
        const thread = findOrCreateThread(ctx, "bid", b.id, title, ts);
        appendSystemMessage(thread, "Contractor bid submitted", stagger(ts, 60_000));
    }

    // 12. tasks → kind "task", title = task title.
    for (const t of db.tasks) {
        const ts = (t as { created_at?: string }).created_at || nowIso();
        const title = t.title;
        const thread = findOrCreateThread(ctx, "task", t.id, title, ts);
        appendSystemMessage(thread, "Task created", stagger(ts, 60_000));
        if (t.assignee_name) {
            appendSystemMessage(
                thread,
                `Assigned to ${t.assignee_name}`,
                stagger(ts, 120_000),
            );
        }
    }

    // 13. visits → kind "visit", title = visit label.
    for (const v of db.visits) {
        const ts =
            (v as { created_at?: string }).created_at || v.scheduled_at || nowIso();
        const title = v.location_name || v.id;
        const thread = findOrCreateThread(ctx, "visit", v.id, title, ts);
        appendSystemMessage(thread, "Visit scheduled", stagger(ts, 60_000));
    }

    // 13a. staff → kind "generic", title = staff name.
    // (Needed so @mentions of staff in comments have a target thread for
    //  alert backlinks — completes the bidirectional conversation graph.)
    for (const s of (db.master.staff || [])) {
        const ts = (s as { created_at?: string }).created_at || nowIso();
        const thread = findOrCreateThread(ctx, "generic", s.id, s.name, ts);
        appendSystemMessage(thread, "Staff profile created", stagger(ts, 60_000));
    }

    // 13b. vendors → kind "generic", title = vendor name.
    for (const v of (db.master.vendors || [])) {
        const ts = (v as { created_at?: string }).created_at || nowIso();
        const thread = findOrCreateThread(ctx, "generic", v.id, v.name, ts);
        appendSystemMessage(thread, "Vendor onboarded", stagger(ts, 60_000));
    }

    // 13c. contractors → kind "generic", title = contractor name.
    for (const c of (db.master.contractors || [])) {
        const ts = (c as { created_at?: string }).created_at || nowIso();
        const thread = findOrCreateThread(ctx, "generic", c.id, c.name, ts);
        appendSystemMessage(thread, "Contractor onboarded", stagger(ts, 60_000));
    }

    // 14. Backfill existing audit-log entries: link each one to its entity's
    // thread (creating the thread if needed), append a system message with
    // `related_audit_id` set, and set the audit entry's `thread_id`. This
    // mirrors exactly what `logAudit` does at runtime.
    const auditLog = db.auditLog.map((entry) => {
        if (!entry.entity_id) return entry;
        const mapped = mapEntityTypeToThreadKind(entry.entity_type);
        // If the entity_type isn't in the map (e.g. snake_case "vendor_rate"
        // which the runtime map only knows as camelCase "vendorRate"), fall
        // back to "generic" so the audit entry still gets linked to a thread.
        const kind: ThreadKind = (mapped as ThreadKind | null) || "generic";
        const title = entry.entity_label || entry.entity_id;
        // If we end up creating a new thread here, back-date its "opened"
        // timestamp by 60s so the lifecycle ordering is preserved.
        const thread = findOrCreateThread(
            ctx,
            kind,
            entry.entity_id,
            title,
            stagger(entry.timestamp, -60_000),
        );
        const body =
            entry.action + (entry.reason ? ` — Reason: "${entry.reason}"` : "");
        appendSystemMessage(
            thread,
            body,
            entry.timestamp,
            entry.id,
            entry.actor,
            entry.actor_role,
        );
        return { ...entry, thread_id: thread.id };
    });

    // 15. Seed realistic conversation messages (comments, decisions, alerts)
    // so the Universal Conversation Graph is immediately useful on first load.
    // Without these, the Thread Inbox only shows system events — the Chat,
    // Decisions, and Mentions filters would all be empty until users act.
    seedConversationMessages(ctx, db);

    // 15b. Seed a comprehensive project lifecycle tree for Mr. Das's apartment
    // site — drawings, execution logs, and rich @mention conversations across
    // BOQ, quotation, work order, PO/GRN, payment, customer, and site threads.
    // This runs AFTER `seedConversationMessages` (which itself calls
    // `backfillMentionsAndAlerts` internally) and re-invokes
    // `backfillMentionsAndAlerts` at the end so the new @mention comments get
    // parsed and cross-posted to mentioned entities' threads. The idempotency
    // guard in `backfillMentionsAndAlerts` makes the second pass safe — only
    // newly-added messages are processed.
    seedProjectLifecycle(ctx, db);

    return {
        ...db,
        threads: ctx.threads,
        auditLog,
    };
}

/**
 * Append a message of any kind to a thread (internal helper).
 */
function appendMessage(
    thread: Thread,
    body: string,
    kind: ThreadMessage["kind"],
    createdAt: string,
    actor: string,
    actorRole?: string,
    extra?: Partial<ThreadMessage>,
): void {
    const ts = createdAt || nowIso();
    const msg: ThreadMessage = {
        id: genId("msg"),
        thread_id: thread.id,
        author_name: actor,
        author_role: actorRole,
        body,
        kind,
        created_at: ts,
        ...extra,
    };
    thread.messages.push(msg);
    const prev = new Date(thread.updated_at).getTime();
    const next = new Date(ts).getTime();
    if (Number.isNaN(prev) || next > prev) {
        thread.updated_at = ts;
    }
}

/**
 * Seed realistic conversation messages across key threads so the Thread Inbox
 * has a mix of system events, team comments, decisions, and mention backlinks
 * on first load. These mirror what users would naturally post during real
 * project execution.
 */
function seedConversationMessages(ctx: BackfillContext, db: RDashDatabase): void {
    const find = (kind: ThreadKind, recordId: string): Thread | undefined =>
        ctx.index.get(`${kind}::${recordId}`);

    // Helper to find a staff member's name by id.
    const staffName = (id: string): string =>
        db.master.staff.find((s) => s.id === id)?.name || "Staff";

    const owner = staffName("staff-owner");
    const ops = staffName("staff-ops");
    const field = staffName("staff-field");
    const finance = staffName("staff-finance");
    const sales = staffName("staff-sales");

    // --- Mr. Das customer thread: onboarding conversation ---
    const dasCust = find("generic", "cust-das");
    if (dasCust) {
        const base = dasCust.created_at;
        appendMessage(dasCust, `Hi Mr. Das, welcome to Urban Castle! I'm ${sales}, your project coordinator. Looking forward to transforming your spaces.`, "comment", stagger(base, 3_600_000), sales, "Sales / Telecaller");
        appendMessage(dasCust, "Thanks! Excited to get started. When can you visit for measurements?", "comment", stagger(base, 7_200_000), "Mr. Das", "Customer");
        appendMessage(dasCust, `I've scheduled a measurement visit for tomorrow 10 AM. @[Ravi Kumar](staff:staff-field) will lead the site survey.`, "comment", stagger(base, 10_800_000), sales, "Sales / Telecaller");
        appendMessage(dasCust, "Measurement visit confirmed — Ravi is onsite now.", "decision", stagger(base, 86_400_000), ops, "Operations Manager");
    }

    // --- WO-2026-301 (Master Bedroom Gypsum Ceiling) work order thread ---
    const woThread = find("workOrder", "wo-das-ceiling");
    if (woThread) {
        const base = woThread.created_at;
        appendMessage(woThread, `Work order kicked off. @[Ravi Kumar](staff:staff-field) is the site lead. Materials needed: gypsum board 12.5mm, metal framing, joint compound.`, "comment", stagger(base, 3_600_000), ops, "Operations Manager");
        appendMessage(woThread, "Started ceiling framing today. Grid layout marked, 6 main runners installed.", "comment", stagger(base, 28_800_000), field, "Field Staff");
        appendMessage(woThread, "Need 2 extra boxes of gypsum board — current stock is short by 8 sheets.", "comment", stagger(base, 43_200_000), field, "Field Staff");
        appendMessage(woThread, "PO raised to Build Mart for 20 sheets of gypsum board 12.5mm. Expected delivery in 2 days.", "decision", stagger(base, 46_800_000), ops, "Operations Manager");
        appendMessage(woThread, "Ceiling progress photos uploaded. Framing 60% complete, boarding starts tomorrow.", "comment", stagger(base, 86_400_000), field, "Field Staff");
    }

    // --- Q-2026-202 (Bedroom Painting Package) quotation thread ---
    const quoteThread = find("quotation", "quote-das-paint");
    if (quoteThread) {
        const base = quoteThread.created_at;
        appendMessage(quoteThread, "Quotation draft prepared — includes 2 coats of premium emulsion, putty, and primer for the master bedroom.", "comment", stagger(base, 3_600_000), sales, "Sales / Telecaller");
        appendMessage(quoteThread, "Customer reviewed the quote. Wants to upgrade to matte finish — add ₹2,500.", "comment", stagger(base, 28_800_000), sales, "Sales / Telecaller");
        appendMessage(quoteThread, "Updated to matte finish. Total now ₹17,705. Sending revised quote for approval.", "decision", stagger(base, 36_000_000), sales, "Sales / Telecaller");
        appendMessage(quoteThread, "Quotation accepted by Mr. Das via WhatsApp. Proceeding to work order creation.", "decision", stagger(base, 86_400_000), owner, "Owner");
    }

    // --- Q-2026-201 (Master Bedroom Gypsum Ceiling) quotation thread ---
    const quoteCeiling = find("quotation", "quote-das-ceiling");
    if (quoteCeiling) {
        const base = quoteCeiling.created_at;
        appendMessage(quoteCeiling, "Quote covers grid false ceiling with recessed LED lights — 12 downlights included.", "comment", stagger(base, 3_600_000), sales, "Sales / Telecaller");
        appendMessage(quoteCeiling, "Accepted. Linking to work order WO-2026-301 for execution.", "decision", stagger(base, 172_800_000), owner, "Owner");
    }

    // --- Site threads: site visit notes ---
    for (const s of db.sites.slice(0, 2)) {
        const siteThread = find("site", s.id);
        if (siteThread) {
            const base = siteThread.created_at;
            appendMessage(siteThread, `Site survey complete. Dimensions captured, photos uploaded. Condition: good, minor wall prep needed.`, "comment", stagger(base, 86_400_000), field, "Field Staff");
            appendMessage(siteThread, `Material delivery slot booked — 9 AM tomorrow. @[Anita Rao](staff:staff-ops) please confirm site access.`, "comment", stagger(base, 172_800_000), field, "Field Staff");
        }
    }

    // --- Task threads: assignment + completion notes ---
    for (const t of db.tasks.slice(0, 3)) {
        const taskThread = find("task", t.id);
        if (taskThread) {
            const base = taskThread.created_at || nowIso();
            const assignee = t.assignee_name || field;
            appendMessage(taskThread, `Task assigned to ${assignee}. Due: ${t.due_date ? new Date(t.due_date).toLocaleDateString("en-IN") : "TBD"}.`, "comment", stagger(base, 1_800_000), ops, "Operations Manager");
            if (t.status === "todo" || t.status === "in_progress") {
                appendMessage(taskThread, "Started working on this. Will update with progress.", "comment", stagger(base, 28_800_000), assignee, "Field Staff");
            }
        }
    }

    // --- Payment thread: receipt confirmation ---
    for (const p of db.payments.slice(0, 1)) {
        const payThread = find("payment", p.id);
        if (payThread) {
            const base = payThread.created_at || nowIso();
            appendMessage(payThread, `Advance payment of ₹${p.amount.toLocaleString("en-IN")} received via UPI. Receipt sent to customer.`, "comment", stagger(base, 3_600_000), finance, "Finance");
            appendMessage(payThread, "Payment recorded against work order WO-2026-301. Milestone: advance 30%.", "decision", stagger(base, 7_200_000), finance, "Finance");
        }
    }

    // --- PO thread: procurement conversation ---
    for (const po of db.purchaseOrders.slice(0, 1)) {
        const poThread = find("po", po.id);
        if (poThread) {
            const base = poThread.created_at || nowIso();
            appendMessage(poThread, `PO created to Build Mart — 20 sheets gypsum board 12.5mm @ ₹1,800/sheet. Total ₹45,000.`, "comment", stagger(base, 3_600_000), ops, "Operations Manager");
            appendMessage(poThread, "Delivery confirmed for tomorrow 9 AM. Site team notified.", "decision", stagger(base, 28_800_000), ops, "Operations Manager");
        }
    }

    // --- Contractor bid thread: award conversation ---
    for (const b of db.contractorBids.slice(0, 1)) {
        const bidThread = find("bid", b.id);
        if (bidThread) {
            const base = bidThread.created_at || nowIso();
            appendMessage(bidThread, `Bid received from Balaji Contractors — ₹85,000 for gypsum ceiling execution. Timeline: 7 days.`, "comment", stagger(base, 3_600_000), ops, "Operations Manager");
            appendMessage(bidThread, "Bid selected. Balaji Contractors awarded WO-2026-301. Mobilization advance to be processed.", "decision", stagger(base, 86_400_000), owner, "Owner");
        }
    }

    // --- Proof messages: site visit photos, material delivery, progress photos ---
    // (Populates the "Proofs" filter in the Thread Inbox — without these,
    //  the Proofs filter is always empty.)
    for (const v of db.visits.slice(0, 2)) {
        const visitThread = find("visit", v.id);
        if (visitThread) {
            const base = visitThread.created_at || nowIso();
            appendMessage(visitThread, "Site measurement photos uploaded — 4 images of master bedroom dimensions.", "proof", stagger(base, 5_400_000), field, "Field Staff", {
                proof_attachment_id: db.entityFileAttachments[0]?.id,
            });
            appendMessage(visitThread, "Ceiling progress photos — framing layout and runner installation.", "proof", stagger(base, 90_000_000), field, "Field Staff", {
                proof_attachment_id: db.entityFileAttachments[1]?.id || db.entityFileAttachments[0]?.id,
            });
        }
    }
    for (const po of db.purchaseOrders.slice(0, 1)) {
        const poThread = find("po", po.id);
        if (poThread) {
            const base = poThread.created_at || nowIso();
            appendMessage(poThread, "GRN photos — 20 sheets of gypsum board received, condition verified.", "proof", stagger(base, 86_400_000), field, "Field Staff", {
                proof_attachment_id: db.entityFileAttachments[2]?.id || db.entityFileAttachments[0]?.id,
            });
        }
    }

    // --- Backfill @mention parsing + alert cross-posts ---
    // The seeded comments above use @[Label](entity_type:entity_id) syntax,
    // but since they bypass `addThreadReply` (which does runtime mention
    // parsing), the `mentions` field is empty and no alert backlinks exist.
    // This step parses mentions from every comment/decision body, populates
    // the `mentions` field, and creates alert backlink messages in mentioned
    // entities' threads — completing the bidirectional conversation graph.
    backfillMentionsAndAlerts(ctx);

    // Re-sort all thread messages chronologically (oldest first) so the feed
    // displays correctly.
    for (const t of ctx.threads) {
        t.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
}

/**
 * Seed a comprehensive project lifecycle tree for Mr. Das (cust-das) and his
 * apartment site (site-das-apartment). Pushes 7 drawings and 6 execution logs
 * into `db.drawings` / `db.executionLogs` (which are empty arrays in the seed),
 * opens "drawing" and "execution_log" threads for each, and enriches the
 * existing BOQ, quotation, work order, PO, payment, customer, and site threads
 * with realistic @mention conversations — telling the full lifecycle story
 * from concept design through project closure.
 *
 * Called after `seedConversationMessages` (which itself runs
 * `backfillMentionsAndAlerts` internally). This function re-invokes
 * `backfillMentionsAndAlerts` at the end so the new @mention comments get
 * parsed and cross-posted to mentioned entities' threads. The idempotency
 * guard in `backfillMentionsAndAlerts` (it skips messages with `mentions`
 * already populated) makes the second pass safe — only newly-added messages
 * are processed.
 */
function seedProjectLifecycle(ctx: BackfillContext, db: RDashDatabase): void {
    const find = (kind: ThreadKind, recordId: string): Thread | undefined =>
        ctx.index.get(`${kind}::${recordId}`);

    const staffName = (id: string): string =>
        db.master.staff.find((s) => s.id === id)?.name || "Staff";

    // Real staff / vendor / contractor names (the task description's
    // "Priya/Anjali/Amit/Sameer/Balaji/Ramesh" aliases map to these real
    // records so @mention backlinks resolve correctly).
    const owner = staffName("staff-owner");          // "Owner"
    const ops = staffName("staff-ops");              // "Anita Rao" — designer / supervisor
    const field = staffName("staff-field");          // "Ravi Kumar" — site engineer
    const finance = staffName("staff-finance");      // "Meera Nair" — finance / accounts
    const sales = staffName("staff-sales");          // "Pooja Singh" — sales
    const procurement = staffName("staff-procurement"); // "Vikas Tiwari" — procurement / electrical
    const contractorName = "Sharma Ceiling Works";   // con-gypsum (Balaji)
    const vendorName = "Build Mart";                 // ven-build

    const customerId = "cust-das";
    const siteId = "site-das-apartment";
    const woId = "wo-das-ceiling";
    const woNo = "WO-2026-301";
    const siteName = "Das Residence — 3BHK Apartment";

    const DAY = 86_400_000;
    const HOUR = 3_600_000;

    // Anchor timestamps on the work order's created_at so all lifecycle
    // events happen after the WO was kicked off, in chronological order.
    const wo = db.workOrders.find((w) => w.id === woId);
    const baseTs = wo?.created_at || nowIso();

    // =================================================================
    // 1. DRAWINGS (7) — push to db.drawings, then open "drawing" threads
    // =================================================================
    const drawingSpecs: Array<{
        id: string;
        no: string;
        title: string;
        kind: DrawingKind;
        uploadedBy: string;
        uploadedRole: string;
        status: DrawingStatus;
        offsetDays: number;
        notes: string;
        version: number;
        parentId?: string;
    }> = [
        { id: "drawing-das-concept", no: "DRG-2026-501", title: "Concept Design", kind: "sketch", uploadedBy: ops, uploadedRole: "Operations Manager", status: "approved", offsetDays: 1, notes: "Initial concept sketch — master bedroom ceiling layout and design intent.", version: 1 },
        { id: "drawing-das-floorplan", no: "DRG-2026-502", title: "Floor Plan", kind: "2D", uploadedBy: field, uploadedRole: "Field Staff", status: "approved", offsetDays: 2, notes: "Floor plan with verified dimensions captured during site survey.", version: 1 },
        { id: "drawing-das-electrical", no: "DRG-2026-503", title: "Electrical Layout", kind: "blueprint", uploadedBy: procurement, uploadedRole: "Procurement Staff", status: "approved", offsetDays: 3, notes: "Electrical layout — 12 downlight positions, 4 fan points, 6 socket points.", version: 1 },
        { id: "drawing-das-plumbing", no: "DRG-2026-504", title: "Plumbing Layout", kind: "blueprint", uploadedBy: finance, uploadedRole: "Finance", status: "approved", offsetDays: 4, notes: "Plumbing layout — no change to existing lines, only concealing work.", version: 1 },
        { id: "drawing-das-ceiling-layout", no: "DRG-2026-505", title: "Ceiling Layout", kind: "2D", uploadedBy: ops, uploadedRole: "Operations Manager", status: "approved", offsetDays: 5, notes: "False ceiling grid layout — bulkhead detail and cove lighting positions.", version: 1 },
        { id: "drawing-das-3d-render", no: "DRG-2026-506", title: "3D Render V1", kind: "render", uploadedBy: ops, uploadedRole: "Operations Manager", status: "approved", offsetDays: 6, notes: "3D render of master bedroom ceiling with cove lighting.", version: 1 },
        { id: "drawing-das-revision-2", no: "DRG-2026-507", title: "Revision 2", kind: "render", uploadedBy: ops, uploadedRole: "Operations Manager", status: "approved", offsetDays: 8, notes: "Revision 2 — TV wall finish changed to walnut per customer request.", version: 2, parentId: "drawing-das-3d-render" },
    ];

    for (const spec of drawingSpecs) {
        const created = stagger(baseTs, spec.offsetDays * DAY);
        const drawing: Drawing = {
            id: spec.id,
            drawing_no: spec.no,
            title: spec.title,
            kind: spec.kind,
            site_id: siteId,
            site_name: siteName,
            work_order_id: woId,
            work_order_no: woNo,
            version: spec.version,
            parent_drawing_id: spec.parentId,
            status: spec.status,
            uploaded_by: spec.uploadedBy,
            uploaded_at: created,
            approved_by: owner,
            approved_at: stagger(created, DAY),
            notes: spec.notes,
            thread_id: undefined,
            created_at: created,
            updated_at: stagger(created, DAY),
        };
        db.drawings.push(drawing);

        const thread = findOrCreateThread(ctx, "drawing", drawing.id, `${spec.no} — ${spec.title}`, created);
        appendSystemMessage(thread, `Drawing ${spec.no} "${spec.title}" uploaded by ${spec.uploadedBy}`, stagger(created, 60_000));
        appendSystemMessage(thread, `Drawing approved by ${owner}`, stagger(created, DAY));
    }

    // Revision 2 — @mention replies (customer requests walnut finish, designer
    // responds, owner approves).
    const revisionThread = find("drawing", "drawing-das-revision-2");
    if (revisionThread) {
        const base = revisionThread.created_at;
        appendMessage(revisionThread, `Please change the TV wall finish to walnut — the laminate sample doesn't match the mood board.`, "comment", stagger(base, 2 * HOUR), "Mr. Das", "Customer");
        appendMessage(revisionThread, `Updated rendering with walnut finish will be shared tomorrow morning. @[Mr. Das](customer:${customerId}) please confirm the walnut tone (light/medium/dark).`, "comment", stagger(base, 6 * HOUR), ops, "Operations Manager");
        appendMessage(revisionThread, `Approved — medium walnut. Please proceed to execution. @[Anita Rao](staff:staff-ops) please share the revised 3D with the site team.`, "decision", stagger(base, 26 * HOUR), owner, "Owner");
    }

    // =================================================================
    // 2. EXECUTION LOGS (6) — push to db.executionLogs, then open
    //    "execution_log" threads
    // =================================================================
    const execSpecs: Array<{
        id: string;
        no: string;
        title: string;
        progress: number;
        offsetDays: number;
        notes: string;
        verified?: boolean;
        isCompletion?: boolean;
    }> = [
        { id: "exec-das-day1", no: "EL-2026-001", title: "Day 1 Progress", progress: 12, offsetDays: 9, notes: "Framing started — main runners marked, 6 of 12 channels installed. Photos uploaded." },
        { id: "exec-das-day2", no: "EL-2026-002", title: "Day 2 Progress", progress: 38, offsetDays: 10, notes: "Boarding 60% complete. Jointing compound applied to first section." },
        { id: "exec-das-photos", no: "EL-2026-003", title: "Daily Photos", progress: 50, offsetDays: 11, notes: "Ceiling progress photos — framing layout, runner installation, first boarding section." },
        { id: "exec-das-qc", no: "EL-2026-004", title: "Quality Inspection", progress: 78, offsetDays: 13, notes: "Inspection passed with 3 minor punch items: cove jointing touch-up, paint bleed at corner, socket alignment." },
        { id: "exec-das-punch", no: "EL-2026-005", title: "Punch List", progress: 90, offsetDays: 14, notes: "3 punch items pending: cove jointing touch-up, paint bleed rectification, socket alignment." },
        { id: "exec-das-complete", no: "EL-2026-006", title: "Completion Certificate", progress: 100, offsetDays: 16, notes: "Work complete. Ready for handover. All punch items closed.", verified: true, isCompletion: true },
    ];

    for (const spec of execSpecs) {
        const created = stagger(baseTs, spec.offsetDays * DAY);
        const log: DailyExecutionLog = {
            id: spec.id,
            log_no: spec.no,
            work_order_id: woId,
            work_order_no: woNo,
            site_id: siteId,
            site_name: siteName,
            date: created.slice(0, 10),
            progress_pct: spec.progress,
            progress_delta: spec.progress,
            materials_used: [
                { description: "Gypsum board 12.5 mm", qty: 4, unit: "sheet", amount: 3120 },
                { description: "GI main channel", qty: 30, unit: "ft", amount: 1020 },
            ],
            progress_verification_status: spec.verified ? "verified" : "pending_review",
            progress_verified_by: spec.verified ? ops : undefined,
            progress_verified_at: spec.verified ? stagger(created, DAY) : undefined,
            completion_notes: spec.isCompletion ? spec.notes : undefined,
            site_condition: "Good — minor dust, ventilation adequate.",
            photo_attachment_ids: [],
            filed_by: field,
            filed_by_staff_id: "staff-field",
            contractor_material_confirmed: true,
            thread_id: undefined,
            created_at: created,
            updated_at: stagger(created, 60_000),
        };
        db.executionLogs.push(log);

        const thread = findOrCreateThread(ctx, "execution_log", log.id, `${spec.no} — ${spec.title}`, created);
        appendSystemMessage(thread, `Execution log ${spec.no} filed by ${field} — ${spec.progress}% progress`, stagger(created, 60_000), undefined, field, "Field Staff");
        appendMessage(thread, spec.notes, "comment", stagger(created, 2 * HOUR), field, "Field Staff");
    }

    // Completion Certificate — @mention replies
    const completionThread = find("execution_log", "exec-das-complete");
    if (completionThread) {
        const base = completionThread.created_at;
        appendMessage(completionThread, `Excellent finishing. Very happy with the result — the walnut TV wall looks stunning.`, "comment", stagger(base, 2 * HOUR), "Mr. Das", "Customer");
        appendMessage(completionThread, `Minor touch-up pending at the cove jointing. @[Anita Rao](staff:staff-ops) will supervise the rectification tomorrow.`, "comment", stagger(base, 5 * HOUR), field, "Field Staff");
        appendMessage(completionThread, `Will complete tomorrow — team mobilized for final touch-up. @[Mr. Das](customer:${customerId}) we'll hand over by evening.`, "comment", stagger(base, 8 * HOUR), contractorName, "Contractor");
    }

    // =================================================================
    // 3. ENRICH BOQ THREAD — category system messages + @mention replies
    // =================================================================
    const boq = db.boqs.find((b) => b.id === "boq-das-ceiling");
    if (boq) {
        const boqTs = boq.created_at || baseTs;
        const boqThread = findOrCreateThread(ctx, "generic", boq.id, `BOQ — ${boq.title}`, boqTs);
        appendSystemMessage(boqThread, "BOQ created", stagger(boqTs, 60_000));
        const categories = ["Civil", "Carpentry", "Electrical", "Plumbing", "Painting", "False Ceiling", "Hardware"];
        for (let i = 0; i < categories.length; i++) {
            appendSystemMessage(boqThread, `BOQ category added: ${categories[i]}`, stagger(boqTs, (i + 2) * 30 * 60_000));
        }
        appendMessage(boqThread, `Budget within estimate. Total BOQ value ₹${boq.total_amount.toLocaleString("en-IN")} cleared against the work order budget. @[Owner](staff:staff-owner) — no variations required.`, "comment", stagger(boqTs, 4 * HOUR), finance, "Finance");
        appendMessage(boqThread, `Please reduce laminate cost options — looking for value engineering. @[Pooja Singh](staff:staff-sales) please share 2-3 alternates.`, "comment", stagger(boqTs, 5 * HOUR), "Mr. Das", "Customer");
    }

    // =================================================================
    // 4. ENRICH QUOTATION THREAD (quote-das-paint, Q-2026-202)
    // =================================================================
    const quoteThread = find("quotation", "quote-das-paint");
    if (quoteThread) {
        const base = quoteThread.created_at;
        appendMessage(quoteThread, `Version 1 sent to customer — premium emulsion, putty, and primer for master bedroom.`, "comment", stagger(base, 3 * HOUR), sales, "Sales / Telecaller");
        appendMessage(quoteThread, `Revision 2 — customer requested matte finish upgrade (+₹2,500). Total now ₹17,705.`, "comment", stagger(base, 28 * HOUR), sales, "Sales / Telecaller");
        appendMessage(quoteThread, `Revision 3 approved — final quote accepted with matte finish.`, "decision", stagger(base, 52 * HOUR), owner, "Owner");
        appendMessage(quoteThread, `Accepted by Mr. Das via WhatsApp.`, "decision", stagger(base, 76 * HOUR), owner, "Owner");
        appendMessage(quoteThread, `Please start work next Monday. @[Pooja Singh](staff:staff-sales) — looking forward to the timeline.`, "comment", stagger(base, 80 * HOUR), "Mr. Das", "Customer");
        appendMessage(quoteThread, `Work order will be generated. @[Ravi Kumar](staff:staff-field) please prepare the site for Monday mobilization.`, "comment", stagger(base, 84 * HOUR), sales, "Sales / Telecaller");
    }

    // =================================================================
    // 5. ENRICH WORK ORDER THREAD (wo-das-ceiling, WO-2026-301)
    // =================================================================
    const woThread = find("workOrder", woId);
    if (woThread) {
        const base = woThread.created_at;
        appendMessage(woThread, `Generated by ${sales} — work order created from accepted quotation Q-2026-201.`, "comment", stagger(base, 90 * 60_000), sales, "Sales / Telecaller");
        appendMessage(woThread, `Budget approved — ₹${(wo?.value || 0).toLocaleString("en-IN")} cleared against estimate.`, "decision", stagger(base, 3 * HOUR), owner, "Owner");
        appendMessage(woThread, `Schedule finalized — start ${wo?.start_date || "TBD"}, expected end ${wo?.expected_end || "TBD"}.`, "decision", stagger(base, 5 * HOUR), ops, "Operations Manager");
        appendMessage(woThread, `${contractorName} assigned as the executing contractor for gypsum ceiling work.`, "decision", stagger(base, 7 * HOUR), ops, "Operations Manager");
        appendMessage(woThread, `Supervisor: ${ops} — will oversee daily progress and quality. Site Engineer: ${field}.`, "comment", stagger(base, 9 * HOUR), ops, "Operations Manager");
        appendMessage(woThread, `Team will mobilize Monday 9 AM. @[Anita Rao](staff:staff-ops) please confirm site access and power.`, "comment", stagger(base, 11 * HOUR), contractorName, "Contractor");
        appendMessage(woThread, `Material checklist prepared — gypsum board, channels, jointing compound, fasteners. @[Vikas Tiwari](staff:staff-procurement) PO raised to Build Mart.`, "comment", stagger(base, 13 * HOUR), ops, "Operations Manager");
        appendMessage(woThread, `I'll visit the site at 11 AM on Monday to review mobilization. @[Pooja Singh](staff:staff-sales) please coordinate with the customer.`, "comment", stagger(base, 15 * HOUR), "Mr. Das", "Customer");
    }

    // =================================================================
    // 6. ENRICH PO THREAD — procurement conversation
    // =================================================================
    const poThread = find("po", "po-das-ceiling");
    if (poThread) {
        const base = poThread.created_at;
        appendMessage(poThread, `Dispatch received — 20 sheets of gypsum board 12.5mm delivered by Build Mart.`, "comment", stagger(base, 6 * HOUR), field, "Field Staff");
        appendMessage(poThread, `GRN created by ${ops} — 5 sheets short of ordered 20. Pending replacement.`, "decision", stagger(base, 8 * HOUR), ops, "Operations Manager");
        appendMessage(poThread, `5 boards short — actual received 15 of 20 ordered. Vendor notified.`, "comment", stagger(base, 10 * HOUR), field, "Field Staff");
        appendMessage(poThread, `Replacement requested — Build Mart dispatching 5 additional boards by tomorrow EOD.`, "decision", stagger(base, 12 * HOUR), procurement, "Procurement Staff");
        appendMessage(poThread, `Replacement vehicle dispatched — will reach site by 11 AM tomorrow. @[Ravi Kumar](staff:staff-field) please arrange receiver.`, "comment", stagger(base, 14 * HOUR), vendorName, "Vendor");
        appendMessage(poThread, `Waiting for delivery. Site team notified.`, "comment", stagger(base, 16 * HOUR), field, "Field Staff");
        appendMessage(poThread, `Hold payment until replacement received and verified. @[Meera Nair](staff:staff-finance) please track.`, "decision", stagger(base, 18 * HOUR), owner, "Owner");
    }

    // =================================================================
    // 7. ENRICH PAYMENT THREAD — finance lifecycle conversation
    // =================================================================
    const payThread = find("payment", "pay-das-ceiling-advance");
    if (payThread) {
        const base = payThread.created_at;
        const vendorBillTotal = db.vendorBills[0]?.total_amount;
        appendMessage(payThread, `Customer Invoice INV-2026-101 sent — advance 30% milestone.`, "comment", stagger(base, 3 * HOUR), finance, "Finance");
        appendMessage(payThread, `₹2,50,000 received via UPI — reference UPI-DAS-ADV-101.`, "decision", stagger(base, 6 * HOUR), finance, "Finance");
        appendMessage(payThread, `Vendor Bills verified — VB-2026-801 from ${vendorName} for ₹${(vendorBillTotal || 0).toLocaleString("en-IN")}.`, "comment", stagger(base, 28 * HOUR), finance, "Finance");
        appendMessage(payThread, `Contractor RA Bill processed — CTB-2026-901 from ${contractorName} for ₹14,500 (48% progress).`, "comment", stagger(base, 52 * HOUR), finance, "Finance");
        appendMessage(payThread, `Contractor Payment Released — ₹14,500 settled to ${contractorName}.`, "decision", stagger(base, 76 * HOUR), finance, "Finance");
        appendMessage(payThread, `Commission Paid — partner commission accrued and settled.`, "decision", stagger(base, 100 * HOUR), finance, "Finance");
        appendMessage(payThread, `Payment confirmed — all milestones reconciled. @[Owner](staff:staff-owner) margin is on track.`, "comment", stagger(base, 104 * HOUR), finance, "Finance");
        appendMessage(payThread, `Received payment receipt. Thank you. @[Pooja Singh](staff:staff-sales) please share the warranty documents next.`, "comment", stagger(base, 108 * HOUR), "Mr. Das", "Customer");
    }

    // =================================================================
    // 8. COMMUNICATION MESSAGES on customer thread (cust-das)
    // =================================================================
    const dasCust = find("generic", customerId);
    if (dasCust) {
        const base = dasCust.created_at;
        appendMessage(dasCust, `[WhatsApp] Drawing shared with customer — concept design DRG-2026-501.`, "comment", stagger(base, 7 * DAY), sales, "Sales / Telecaller");
        appendMessage(dasCust, `[WhatsApp] Quote shared via WhatsApp — Q-2026-202 Bedroom Painting Package.`, "comment", stagger(base, 9 * DAY), sales, "Sales / Telecaller");
        appendMessage(dasCust, `[WhatsApp] Customer reply: "Looks good. Please proceed with the matte finish."`, "comment", stagger(base, 10 * DAY), "Mr. Das", "Customer");
        appendMessage(dasCust, `[Email] Invoice sent via email — INV-2026-101 advance milestone.`, "comment", stagger(base, 12 * DAY), finance, "Finance");
        appendMessage(dasCust, `[Email] Warranty documents shared — 12 month labour warranty, 6 month paint warranty.`, "comment", stagger(base, 18 * DAY), ops, "Operations Manager");
        appendMessage(dasCust, `[Phone] Meeting notes from site visit discussion — Mr. Das confirmed walnut TV wall finish and Monday mobilization.`, "decision", stagger(base, 14 * DAY), sales, "Sales / Telecaller");
    }

    // =================================================================
    // 9. PROJECT CLOSURE MESSAGES on site thread (site-das-apartment)
    // =================================================================
    const siteThread = find("site", siteId);
    if (siteThread) {
        const base = siteThread.created_at;
        const closureStart = 17 * DAY;
        appendMessage(siteThread, `Final Inspection completed — all work inspected against BOQ and drawings.`, "decision", stagger(base, closureStart), ops, "Operations Manager");
        appendMessage(siteThread, `Snag List closed — 3 punch items rectified by ${contractorName}.`, "decision", stagger(base, closureStart + 1 * DAY), ops, "Operations Manager");
        appendMessage(siteThread, `Final Payment received — ₹${(wo?.value || 0).toLocaleString("en-IN")} milestone collected.`, "decision", stagger(base, closureStart + 2 * DAY), finance, "Finance");
        appendMessage(siteThread, `Handover completed — keys handed over to Mr. Das. Site photos archived.`, "decision", stagger(base, closureStart + 3 * DAY), owner, "Owner");
        appendMessage(siteThread, `Warranty documents activated — 12 month labour warranty, 6 month paint warranty. Customer notified via email.`, "decision", stagger(base, closureStart + 4 * DAY), ops, "Operations Manager");
        appendMessage(siteThread, `Customer Feedback collected — Mr. Das rated 5/5 for quality and 4/5 for timeline.`, "decision", stagger(base, closureStart + 5 * DAY), sales, "Sales / Telecaller");
        appendMessage(siteThread, `Very satisfied with the project. The walnut TV wall and cove lighting exceeded expectations. Will refer friends.`, "comment", stagger(base, closureStart + 6 * DAY), "Mr. Das", "Customer");
        appendMessage(siteThread, `Thank you for choosing Urban Castle. We're honored to have delivered your dream space. @[Pooja Singh](staff:staff-sales) please send the referral request.`, "comment", stagger(base, closureStart + 7 * DAY), owner, "Owner");
        appendMessage(siteThread, `Warranty support activated. @[Mr. Das](customer:${customerId}) any snag or concern in the next 12 months — we're one message away.`, "comment", stagger(base, closureStart + 8 * DAY), sales, "Sales / Telecaller");
    }

    // =================================================================
    // FINAL — parse @mentions on the new messages + cross-post alerts
    // (Mirrors the end of `seedConversationMessages`. The idempotency
    // guard in `backfillMentionsAndAlerts` ensures messages already
    // processed by the first pass are skipped here.)
    // =================================================================
    backfillMentionsAndAlerts(ctx);

    // Re-sort all thread messages chronologically (oldest first) so the feed
    // displays correctly.
    for (const t of ctx.threads) {
        t.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
}

/**
 * Parse @mentions from all comment/decision messages, populate the `mentions`
 * field on each message, and create alert backlink messages in mentioned
 * entities' threads. This mirrors what `addThreadReply` does at runtime —
 * the seed bypasses that function so we replicate the behavior here.
 */
function backfillMentionsAndAlerts(ctx: BackfillContext): void {
    for (const thread of ctx.threads) {
        for (const message of thread.messages) {
            // Only parse mentions from comment/decision messages (not system/alert).
            if (message.kind !== "comment" && message.kind !== "decision") continue;
            // Skip if mentions already populated (e.g. by a previous run).
            if (message.mentions && message.mentions.length) continue;
            const parsed = parseMentions(message.body);
            if (!parsed.length) continue;
            // Populate the mentions field on the message.
            const mentions: ThreadMessageMention[] = parsed.map((p) => ({
                entity_type: p.entity_type,
                entity_id: p.entity_id,
                label: p.label,
                start: p.start,
                end: p.end,
            }));
            message.mentions = mentions;
            // Create an alert backlink in each mentioned entity's thread.
            // (Same pattern as threads.ts addThreadReply — but without the
            // infinite-loop guard since we only process comment/decision.)
            const truncatedBody = message.body.length > 60
                ? message.body.slice(0, 57) + "…"
                : message.body;
            for (const mention of mentions) {
                const alertKind = mentionThreadKindForEntityType(mention.entity_type);
                if (!alertKind) continue;
                // Don't cross-post to the same thread (self-mention).
                if (alertKind === thread.kind && mention.entity_id === thread.record_id) continue;
                const alertThread = ctx.index.get(`${alertKind}::${mention.entity_id}`);
                if (!alertThread) continue;
                const alertMsg: ThreadMessage = {
                    id: genId("msg"),
                    thread_id: alertThread.id,
                    author_name: message.author_name,
                    author_role: message.author_role,
                    body: `mentioned in ${thread.title}: "${truncatedBody}"`,
                    kind: "alert",
                    related_thread_id: thread.id,
                    created_at: stagger(message.created_at, 1_000),
                };
                alertThread.messages.push(alertMsg);
                // Update the alert thread's updated_at if newer.
                const prev = new Date(alertThread.updated_at).getTime();
                const next = new Date(alertMsg.created_at).getTime();
                if (Number.isNaN(prev) || next > prev) {
                    alertThread.updated_at = alertMsg.created_at;
                }
            }
        }
    }
}
