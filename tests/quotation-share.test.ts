import { describe, expect, it } from "vitest";
import {
    buildQuotationShareText,
    whatsappShareUrl,
} from "../src/lib/rdash/quotation-share";
import type { Quotation } from "../src/lib/rdash/types";

function makeQuotation(overrides: Partial<Quotation> = {}): Quotation {
    return {
        id: "q1",
        quotation_no: "Q-2026-001",
        customer_id: "c1",
        site_id: "s1",
        title: "Interior work",
        status: "sent",
        revision_no: 0,
        valid_until: "2026-09-26",
        subtotal: 24000,
        tax_amount: 4320,
        total_amount: 28320,
        payment_terms: [
            { id: "pt1", label: "Advance", percentage: 30, due_event: "on_acceptance" },
            { id: "pt2", label: "On handover", percentage: 70, due_event: "on_handover" },
        ],
        coverage: [],
        scope_lines: [
            {
                id: "i1",
                title: "Wooden panel",
                quantity: 2,
                rate: 12000,
                amount: 24000,
            },
        ],
        work_order_ids: [],
        ...overrides,
    } as Quotation;
}

describe("buildQuotationShareText", () => {
    it("builds a WhatsApp-formatted summary with items, totals and payment plan", () => {
        const text = buildQuotationShareText(makeQuotation());
        expect(text).toContain("*Urban Castle — Quotation Q-2026-001*");
        expect(text).toContain("1. Wooden panel — 2 ×");
        expect(text).toContain("Subtotal: ₹24,000");
        expect(text).toContain("GST: ₹4,320");
        expect(text).toContain("*Total: ₹28,320*");
        expect(text).toContain("Payment plan:");
        expect(text).toContain("• Advance — 30%");
        expect(text).toContain("Valid until");
        expect(text).not.toContain("Draft");
    });

    it("prefers items over scope_lines when both exist", () => {
        const q = makeQuotation({
            items: [{ id: "i2", title: "Gypsum ceiling", quantity: 1, rate: 8000, amount: 8000 }],
            scope_lines: [{ id: "i1", title: "Wooden panel", quantity: 2, rate: 12000, amount: 24000 }],
        } as Partial<Quotation>);
        const text = buildQuotationShareText(q);
        expect(text).toContain("Gypsum ceiling");
        expect(text).not.toContain("Wooden panel");
    });

    it("falls back to scope_lines when items is missing or empty", () => {
        const q = makeQuotation({ items: [] } as Partial<Quotation>);
        const text = buildQuotationShareText(q);
        expect(text).toContain("Wooden panel");
    });

    it("handles an empty quotation without line items", () => {
        const q = makeQuotation({ scope_lines: [], payment_terms: [], subtotal: 0, tax_amount: 0, total_amount: 0 } as Partial<Quotation>);
        const text = buildQuotationShareText(q);
        expect(text).toContain("No line items added yet.");
        expect(text).not.toContain("Payment plan:");
        expect(text).toContain("*Total: ₹0*");
    });

    it("omits GST line when tax is zero and marks drafts as indicative", () => {
        const q = makeQuotation({ tax_amount: 0, total_amount: 24000, status: "draft" });
        const text = buildQuotationShareText(q);
        expect(text).not.toContain("GST:");
        expect(text).toContain("(Draft — figures indicative until sent)");
    });

    it("includes revision number for revised quotes", () => {
        const q = makeQuotation({ revision_no: 2 });
        const text = buildQuotationShareText(q);
        expect(text).toContain("Rev 2");
    });

    it("honours a custom company name", () => {
        const text = buildQuotationShareText(makeQuotation(), { companyName: "Akarsh Interiors" });
        expect(text).toContain("*Akarsh Interiors — Quotation Q-2026-001*");
    });
});

describe("whatsappShareUrl", () => {
    it("encodes the text into a click-to-chat link", () => {
        const url = whatsappShareUrl("Hello\n*Total: ₹100*");
        expect(url.startsWith("https://wa.me/?text=")).toBe(true);
        expect(decodeURIComponent(url)).toContain("Hello\n*Total: ₹100*");
    });
});
