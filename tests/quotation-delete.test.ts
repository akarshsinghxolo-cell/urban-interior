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
    test("deletes a draft quotation, its accepted scopes and thread, and recomputes covered work status", () => {
        const state = quotationHarness();
        seedQuotation(state);
        state.db.acceptedScopes.push({
            id: "scope1",
            quotation_id: "q1",
            customer_id: "customer-only",
            site_id: "",
            work_required_id: "w1",
            area_ids: [],
            measurement_revision_ids: [],
            label: "Scope",
            accepted_value: 1000,
            status: "accepted",
        } as any);

        state.deleteQuotation("q1");

        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(false);
        expect(state.db.acceptedScopes.some((s: any) => s.quotation_id === "q1")).toBe(false);
        expect(state.db.threads.some((t: any) => t.id === "thread-q1")).toBe(false);
        const work = state.db.workRequired.find((w: any) => w.id === "w1");
        expect(work.status).toBe("on_hold");
        expect(state.logAudit).toHaveBeenCalledWith(expect.objectContaining({
            kind: "delete",
            entity_type: "quotation",
            entity_id: "q1",
        }));
    });

    test("keeps workflow-owned work status untouched on delete", () => {
        const state = quotationHarness();
        seedQuotation(state);
        state.db.workRequired[0].status = "awarded";

        state.deleteQuotation("q1");

        expect(state.db.workRequired[0].status).toBe("awarded");
    });

    test("blocks deleting an accepted quotation", () => {
        const state = quotationHarness();
        seedQuotation(state, { status: "accepted" });

        expect(() => state.deleteQuotation("q1")).toThrow(/accepted quotation cannot be deleted/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });

    test("blocks deleting a quotation linked to a work order", () => {
        const state = quotationHarness();
        seedQuotation(state, { work_order_ids: ["wo1"] });

        expect(() => state.deleteQuotation("q1")).toThrow(/work order/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });

    test("blocks roles outside Owner / Operations Manager", () => {
        const state = quotationHarness("Field Staff");
        seedQuotation(state);

        expect(() => state.deleteQuotation("q1")).toThrow(/delete quotations/i);
        expect(state.db.quotations.some((q: any) => q.id === "q1")).toBe(true);
    });
});
