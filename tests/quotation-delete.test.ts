import { describe, expect, test, vi } from "vitest";
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
