import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createQuotationsSlice } from "../src/lib/rdash/store/slices/quotations";
import { assertQuotationRelations } from "../src/lib/rdash/business-rules";
import type { RDashDatabase } from "../src/lib/rdash/types";
import type { StoreContext } from "../src/lib/rdash/store/context";

function customerOnlyDatabase(): RDashDatabase {
    const db = structuredClone(buildSeedDatabase());
    const timestamp = "2026-08-26T03:30:00.000Z";
    db.customers = [{
        id: "customer-only",
        name: "Customer Without Site",
        phone: "9000000000",
        status: "active",
        created_at: timestamp,
        updated_at: timestamp,
    }];
    db.sites = [];
    db.areas = [];
    db.workRequired = [];
    db.measurementRevisions = [];
    db.quotations = [];
    db.acceptedScopes = [];
    db.workOrders = [];
    return db;
}

function quotationHarness() {
    const state: any = {
        db: customerOnlyDatabase(),
        requiresApproval: vi.fn(() => null),
        openThreadFor: vi.fn(() => "thread-customer-quote"),
        addThreadReply: vi.fn(),
        logAudit: vi.fn(),
        fireAutomation: vi.fn(),
        currentUser: vi.fn(() => ({ name: "Owner", role: "Owner" })),
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
    return { state, slice };
}

describe("customer quotation without Site", () => {
    test("relationship validation allows a customer-level draft with no Site or coverage", () => {
        const db = customerOnlyDatabase();
        expect(() => assertQuotationRelations(db, {
            customer_id: "customer-only",
            site_id: "",
            coverage: [],
            scope_lines: [],
            items: [],
        }, "Quotation")).not.toThrow();
    });

    test("creates and edits a customer-level quotation before a Site exists", () => {
        const { state, slice } = quotationHarness();
        const id = slice.addQuotation({
            customer_id: "customer-only",
            title: "Initial budget quotation",
            status: "draft",
        });

        const created = state.db.quotations.find((quotation: any) => quotation.id === id);
        expect(created).toMatchObject({
            customer_id: "customer-only",
            site_id: "",
            title: "Initial budget quotation",
            status: "draft",
            coverage: [],
        });

        slice.addQuotationItem(id, {
            title: "Design consultation",
            quantity: 1,
            rate: 2500,
        });
        expect(state.db.quotations.find((quotation: any) => quotation.id === id)?.scope_lines).toEqual([
            expect.objectContaining({ title: "Design consultation", site_id: "", amount: 2500 }),
        ]);
    });

    test("still blocks Site-specific scope until a real Site is linked", () => {
        const { slice } = quotationHarness();
        const id = slice.addQuotation({ customer_id: "customer-only", status: "draft" });

        expect(() => slice.addQuotationItem(id, {
            title: "Site-specific line",
            site_id: "missing-site",
            quantity: 1,
            rate: 100,
        })).toThrow(/needs a quotation Site/);

        expect(() => slice.acceptQuotationForBidding(id)).toThrow(/Choose at least one quotation scope to accept/);
    });
});
