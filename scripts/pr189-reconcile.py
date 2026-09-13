from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


helpers = Path("src/lib/rdash/store/quotations-helpers.ts")
text = helpers.read_text()
marker = 'import { today, addDays } from "./helpers";\n'
addition = '''import { today, addDays } from "./helpers";

/**
 * Permanent deletion is intentionally limited to disposable first-version
 * drafts. Once a quotation has been sent, accepted, rejected, expired,
 * cancelled, revised, or linked downstream, it is commercial history and
 * must be retained.
 */
export function canPermanentlyDeleteQuotation(quotation: Pick<Quotation,
    "status" | "revision_no" | "parent_quotation_id" | "superseded_by_quotation_id" | "accepted_at" | "work_order_ids"
>): boolean {
    return quotation.status === "draft" &&
        quotation.revision_no === 0 &&
        !quotation.parent_quotation_id &&
        !quotation.superseded_by_quotation_id &&
        !quotation.accepted_at &&
        quotation.work_order_ids.length === 0;
}
'''
if "export function canPermanentlyDeleteQuotation" not in text:
    if marker not in text:
        raise SystemExit("quotation helper import marker not found")
    helpers.write_text(text.replace(marker, addition, 1))

core = Path("src/lib/rdash/store/slices/quotations-core.ts")
text = core.read_text()
text = text.replace(
    'import { coverageAcceptedValue, quotationAcceptanceWarnings, resolveQuotationDefaults } from "../quotations-helpers";',
    'import { canPermanentlyDeleteQuotation, coverageAcceptedValue, quotationAcceptanceWarnings, resolveQuotationDefaults } from "../quotations-helpers";',
    1,
)
if 'import { cascadeDelete } from "../../integrity/cascade";' not in text:
    text = text.replace(
        'import { assertQuotationRelations, assertWorkOrderRelations } from "../../business-rules";\n',
        'import { assertQuotationRelations, assertWorkOrderRelations } from "../../business-rules";\nimport { cascadeDelete } from "../../integrity/cascade";\n',
        1,
    )
pattern = re.compile(r'        deleteQuotation: \(id, reason\) => \{\n.*?\n        \},\n        addQuotation:', re.S)
replacement = '''        deleteQuotation: (id, reason) => {
            assertRole(get().currentUser().role, ["Owner", "Operations Manager"], "delete quotations");
            const state = get();
            const actor = state.currentUser();
            const before = state.db.quotations.find((quotation: any) => quotation.id === id);
            if (!before)
                throw new Error("Quotation not found.");
            if (!canPermanentlyDeleteQuotation(before))
                throw new Error("Only an original Draft quotation can be permanently deleted. Commercial history and revisions must be retained.");
            if (state.db.quotations.some((quotation: any) => quotation.parent_quotation_id === id))
                throw new Error("A quotation with a revision history cannot be permanently deleted.");
            if (state.db.acceptedScopes.some((scope: any) => scope.quotation_id === id))
                throw new Error("A quotation with accepted scope history cannot be permanently deleted.");

            const deleted = cascadeDelete(state.db, "quotations", id);
            if (!deleted.result.success)
                throw new Error(deleted.result.blocked[0]?.reason || "Quotation could not be deleted safely.");

            const changedAt = nowIso();
            const nextDb = {
                ...deleted.db,
                workRequired: deleted.db.workRequired.map((work: any) => before.coverage.some((coverage: any) => coverage.work_required_id === work.id)
                    ? { ...work, status: workRequiredStatusAfterQuotationChange(deleted.db, work, id, "cancelled"), updated_at: changedAt }
                    : work),
            };
            commitState(() => ({ db: nextDb }));
            get().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Deleted draft quotation ${before.quotation_no}`,
                entity_type: "quotation",
                entity_id: id,
                entity_label: before.quotation_no,
                kind: "delete",
                reason,
            });
        },
        addQuotation:'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"deleteQuotation block replacement count={count}")
core.write_text(text)

actions = Path("src/components/rdash/recordActions.tsx")
text = actions.read_text()
if 'canPermanentlyDeleteQuotation' not in text:
    text = text.replace(
        'import { formatINR } from "@/lib/rdash/format";\n',
        'import { formatINR } from "@/lib/rdash/format";\nimport { canPermanentlyDeleteQuotation } from "@/lib/rdash/store/quotations-helpers";\n',
        1,
    )
text, count = re.subn(
    r'\nfunction isQuotationDeletable\(quote: \{ status: string; work_order_ids: string\[\] \}\) \{\n    return quote\.status !== "accepted" && quote\.work_order_ids\.length === 0;\n\}\n',
    '\n', text, count=1,
)
if count != 1:
    raise SystemExit(f"isQuotationDeletable removal count={count}")
text = text.replace('if (quote && isQuotationDeletable(quote))', 'if (quote && canPermanentlyDeleteQuotation(quote))', 1)
text = text.replace(
    'description: "This permanently removes the quotation, its accepted scopes and its conversation thread. This cannot be undone.",',
    'description: "This permanently removes this original draft and its dependent thread/file links. Commercial history cannot be deleted. This cannot be undone.",',
    1,
)
actions.write_text(text)

detail = Path("src/components/rdash/DetailPanel.tsx")
text = detail.read_text()
if 'canPermanentlyDeleteQuotation' not in text:
    text = text.replace(
        'import { buildQuotationShareText, shareQuotationText } from "@/lib/rdash/quotation-share";\n',
        'import { buildQuotationShareText, shareQuotationText } from "@/lib/rdash/quotation-share";\nimport { canPermanentlyDeleteQuotation } from "@/lib/rdash/store/quotations-helpers";\n',
        1,
    )
text = text.replace(
    'description: "This permanently removes the quotation, its accepted scopes and its conversation thread. This cannot be undone.",',
    'description: "This permanently removes this original draft and its dependent thread/file links. Commercial history cannot be deleted. This cannot be undone.",',
    1,
)
text = text.replace(
    '{q.status !== "accepted" && q.work_order_ids.length === 0 && (<Button size="sm" variant="destructive"',
    '{canPermanentlyDeleteQuotation(q) && (<Button size="sm" variant="destructive"',
    1,
)
detail.write_text(text)

replace_once(
    "src/lib/rdash/store/types.ts",
    '''  /** Permanently delete a quotation that has no Work Order downstream and is
   *  not accepted. Removes the quotation, its accepted scopes and its
   *  conversation thread, and recomputes covered work-required lifecycle
   *  statuses. Owner / Operations Manager only. */
''',
    '''  /** Permanently delete only an original disposable Draft quotation.
   *  Commercial history/revisions are retained. Dependency cleanup delegates
   *  to the centralized cascade engine, then covered Work Required lifecycle
   *  statuses are recomputed. Owner / Operations Manager only. */
''',
)

Path("tests/quotation-delete.test.ts").write_text(r'''import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createQuotationsSlice } from "../src/lib/rdash/store/slices/quotations";
import type { RDashDatabase } from "../src/lib/rdash/types";
import type { StoreContext } from "../src/lib/rdash/store/context";

const TS = "2026-08-26T03:30:00.000Z";

function baseDatabase(): RDashDatabase {
    const db = structuredClone(buildSeedDatabase());
    db.quotations = [];
    db.acceptedScopes = [];
    db.workOrders = [];
    db.workRequired = [];
    db.threads = [];
    return db;
}

function quotationHarness(role: string = "Owner") {
    const state: any = {
        db: baseDatabase(),
        requiresApproval: vi.fn(() => null),
        openThreadFor: vi.fn(() => "thread-q1"),
        addThreadReply: vi.fn(),
        logAudit: vi.fn(),
        fireAutomation: vi.fn(),
        currentUser: vi.fn(() => ({ name: "Test User", role })),
    };
    const context: StoreContext = {
        get: () => state,
        setBase: () => undefined,
        isNestedTransaction: () => false,
        commitState: (partial: any) => {
            const patch = typeof partial === "function" ? partial(state) : partial;
            Object.assign(state, patch);
        },
    };
    const slice = createQuotationsSlice(context);
    Object.assign(state, slice);
    return state;
}

function seedQuotation(state: any, overrides: Record<string, unknown> = {}) {
    state.db.quotations.push({
        id: "q1",
        quotation_no: "Q-2026-001",
        revision_no: 0,
        customer_id: "customer-only",
        site_id: "",
        status: "draft",
        title: "Test quotation",
        total_amount: 1000,
        subtotal: 847,
        tax_amount: 153,
        valid_until: "2026-12-01",
        work_order_ids: [],
        coverage: [{ id: "cov1", work_required_id: "w1", area_ids: [], status: "proposed" }],
        scope_lines: [],
        items: [],
        payment_terms: [],
        thread_id: "thread-q1",
        created_at: TS,
        updated_at: TS,
        ...overrides,
    } as any);
    state.db.threads.push({
        id: "thread-q1",
        kind: "quotation",
        title: "Q-2026-001",
        record_id: "q1",
        record_type: "quotation",
        messages: [],
        participants: [],
        open: true,
        created_at: TS,
        updated_at: TS,
    } as any);
    state.db.workRequired.push({
        id: "w1",
        customer_id: "customer-only",
        site_id: "",
        title: "Covered work",
        status: "quotation_sent",
        created_at: TS,
        updated_at: TS,
    } as any);
}

describe("deleteQuotation", () => {
    test("deletes only an original draft through the central cascade and recomputes work status", () => {
        const state = quotationHarness();
        seedQuotation(state);

        state.deleteQuotation("q1", "Duplicate draft");

        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(false);
        expect(state.db.threads.some((t: any) => t.id === "thread-q1")).toBe(false);
        expect(state.db.workRequired.find((w: any) => w.id === "w1")?.status).toBe("on_hold");
        expect(state.logAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: "Deleted draft quotation Q-2026-001",
            kind: "delete",
            entity_type: "quotation",
            entity_id: "q1",
            reason: "Duplicate draft",
        }));
    });

    test("keeps workflow-owned work status untouched on draft delete", () => {
        const state = quotationHarness();
        seedQuotation(state);
        state.db.workRequired[0].status = "awarded";

        state.deleteQuotation("q1");

        expect(state.db.workRequired[0].status).toBe("awarded");
    });

    test.each(["sent", "accepted", "rejected", "expired", "cancelled"])(
        "retains %s quotations as commercial history",
        (status) => {
            const state = quotationHarness();
            seedQuotation(state, { status });

            expect(() => state.deleteQuotation("q1")).toThrow(/original Draft quotation/i);
            expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
        },
    );

    test("blocks deleting a revision draft", () => {
        const state = quotationHarness();
        seedQuotation(state, { revision_no: 1, parent_quotation_id: "q0" });

        expect(() => state.deleteQuotation("q1")).toThrow(/original Draft quotation/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });

    test("blocks a draft that already has accepted-scope history", () => {
        const state = quotationHarness();
        seedQuotation(state);
        state.db.acceptedScopes.push({ id: "scope1", quotation_id: "q1" } as any);

        expect(() => state.deleteQuotation("q1")).toThrow(/accepted scope history/i);
        expect(state.db.acceptedScopes).toHaveLength(1);
    });

    test("blocks a draft linked to a work order", () => {
        const state = quotationHarness();
        seedQuotation(state, { work_order_ids: ["wo1"] });

        expect(() => state.deleteQuotation("q1")).toThrow(/original Draft quotation/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });

    test("blocks roles outside Owner / Operations Manager", () => {
        const state = quotationHarness("Field Staff");
        seedQuotation(state);

        expect(() => state.deleteQuotation("q1")).toThrow(/delete quotations/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });
});
''')
