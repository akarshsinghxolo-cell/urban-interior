import { describe, expect, test } from "vitest";
import { draftForWorkRequired } from "../src/components/rdash/customer-sites-form-model";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { createQuotationsSlice } from "../src/lib/rdash/store/slices/quotations";
import type { StoreContext } from "../src/lib/rdash/store/context";
import { itemOptionPairs, seedDetailedAreaLines } from "../src/lib/rdash/work-types";

function quotationHarness() {
    const state: any = {
        db: structuredClone(buildSeedDatabase()),
        currentUser: () => ({ name: "QA Owner", role: "Owner" }),
        logAudit: () => undefined,
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

    test("adding and editing a quotation area updates Work Required and its captured measurement line", () => {
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
        const line = quotation.scope_lines.at(-1);

        slice.updateQuotationItem(quotation.id, line.id, {
            area_chips: [{ area_id: "area-das-cabin", area_name: "Director Cabin", quantity: 120 }],
            quantity: 120,
        });

        let work = state.db.workRequired.find((row: any) => row.id === "work-das-office-ceiling");
        expect(work.area_ids).toContain("area-das-cabin");
        expect(work.structured_items).toEqual(expect.arrayContaining([
            expect.objectContaining({
                area_id: "area-das-cabin",
                subcategory_id: "fc_gyp",
                work_type_id: "wt-fc_gyp-standard",
                quantity: 120,
            }),
        ]));
        expect(state.db.quotations.find((row: any) => row.id === quotation.id).coverage[0].area_ids).toContain("area-das-cabin");
        expect(draftForWorkRequired(work, state.db.master).areaIds).toContain("area-das-cabin");

        slice.updateQuotationItem(quotation.id, line.id, {
            area_chips: [{ area_id: "area-das-cabin", area_name: "Director Cabin", quantity: 145.5 }],
            quantity: 145.5,
        });
        work = state.db.workRequired.find((row: any) => row.id === "work-das-office-ceiling");
        expect(work.structured_items.find((item: any) => item.area_id === "area-das-cabin" && item.work_type_id === "wt-fc_gyp-standard").quantity).toBe(145.5);
        expect(state.db.quotations.find((row: any) => row.id === quotation.id).scope_lines.find((item: any) => item.id === line.id).quantity).toBe(145.5);
    });

    test("adding work to a room-wise quotation updates the shared customer scope and measurement line", () => {
        const { state, slice } = quotationHarness();
        const quotation = state.db.quotations.find((row: any) => row.id === "quote-das-office");
        const subcategory = state.db.master.workSubcategories.find((row: any) => row.id === "pw_int");
        quotation.grouping = "area";

        slice.addQuotationItem(quotation.id, {
            title: "Interior Emulsion Paint · Standard",
            category_id: subcategory.category_id,
            subcategory_id: subcategory.id,
            work_type_id: "wt-pw_int-standard",
            area_id: "area-das-reception",
            area_name: "Reception",
            area_chips: [{ area_id: "area-das-reception", area_name: "Reception", quantity: 252 }],
            quantity: 252,
            rate: 31.5,
            unit_id: "sqft",
            unit_name: "sqft",
        });

        const savedQuotation = state.db.quotations.find((row: any) => row.id === quotation.id);
        const added = savedQuotation.scope_lines.find((line: any) => line.work_type_id === "wt-pw_int-standard");
        expect(added).toMatchObject({
            area_id: "area-das-reception",
            quantity: 252,
            area_chips: [{ area_id: "area-das-reception", area_name: "Reception", quantity: 252 }],
        });

        const work = state.db.workRequired.find((row: any) => row.id === "work-das-office-ceiling");
        expect(work.work_subcategory_ids).toContain("pw_int");
        expect(work.work_type_ids).toContain("wt-pw_int-standard");
        expect(work.area_ids).toContain("area-das-reception");
        expect(work.structured_items).toEqual(expect.arrayContaining([
            expect.objectContaining({
                area_id: "area-das-reception",
                subcategory_id: "pw_int",
                work_type_id: "wt-pw_int-standard",
                quantity: 252,
            }),
        ]));

        const customerEditDraft = draftForWorkRequired(work, state.db.master);
        expect(customerEditDraft.subcategoryIds).toContain("pw_int");
        expect(customerEditDraft.workTypeIds).toContain("wt-pw_int-standard");
        expect(customerEditDraft.areaIds).toContain("area-das-reception");
        const measurementSeeds = seedDetailedAreaLines({ siteWorks: [work], workSubcategories: state.db.master.workSubcategories });
        expect(measurementSeeds.some((seed) => seed.area_id === "area-das-reception" && seed.work_type_id === "wt-pw_int-standard")).toBe(false);
    });
});
