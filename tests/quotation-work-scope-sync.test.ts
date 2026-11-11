import { describe, expect, test } from "vitest";
import { draftForWorkRequired } from "../src/components/rdash/customer-sites-form-model";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createQuotationsSlice } from "../src/lib/rdash/store/slices/quotations";
import type { StoreContext } from "../src/lib/rdash/store/context";
import { itemOptionPairs, seedDetailedAreaLines } from "../src/lib/rdash/work-types";

function quotationHarness() {
    const state: any = { db: structuredClone(buildSeedDatabase()) };
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

describe("quotation work scope synchronization", () => {
    test("adding a work type updates the linked customer scope and measurement plan in the same save", () => {
        const { state, slice } = quotationHarness();
        const subcategory = state.db.master.workSubcategories.find((row: any) => row.id === "fc_gyp");

        slice.addQuotationItem("quote-das-office", {
            title: "Gypsum False Ceiling · Standard",
            category_id: subcategory.category_id,
            subcategory_id: "fc_gyp",
            work_type_id: "wt-fc_gyp-standard",
            quantity: 1,
            rate: 255,
            unit_id: "sqft",
            unit_name: "sqft",
        });

        const quotation = state.db.quotations.find((row: any) => row.id === "quote-das-office");
        expect(quotation.scope_lines.at(-1)).toMatchObject({
            subcategory_id: "fc_gyp",
            work_type_id: "wt-fc_gyp-standard",
            work_required_id: "work-das-office-ceiling",
            site_id: "site-das-office",
        });

        const work = state.db.workRequired.find((row: any) => row.id === "work-das-office-ceiling");
        expect(work.work_subcategory_ids).toEqual(expect.arrayContaining(["fc_grid", "fc_gyp"]));
        expect(work.work_type_ids).toEqual(expect.arrayContaining(["wt-fc_grid-standard", "wt-fc_gyp-standard"]));

        const customerEditDraft = draftForWorkRequired(work, state.db.master);
        expect(customerEditDraft.subcategoryIds).toContain("fc_gyp");
        expect(customerEditDraft.workTypeIds).toContain("wt-fc_gyp-standard");

        const measurementSeeds = seedDetailedAreaLines({
            siteWorks: [work],
            workSubcategories: state.db.master.workSubcategories,
        });
        expect(measurementSeeds.some((seed) => itemOptionPairs(seed).some((pair) => pair.work_type_id === "wt-fc_gyp-standard"))).toBe(true);
    });
});
