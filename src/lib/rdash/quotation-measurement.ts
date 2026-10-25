import type { Area, ContractorRate, LineItem, WorkRequired, WorkSubcategory } from "./types";
import {
  averageWorkTypeTotalRate,
  capturedPairsTitle,
  defaultMeasureBasisFor,
  measuredQuantity,
  workTypesForSubcategory,
} from "./work-types";

type Dimensions = { length: number; breadth: number; height: number };

/**
 * Turns an in-quotation room measurement into the same canonical structured
 * item used by Work Required and quotation scope. The measured room must live
 * on the Work Required record selected by the quotation; a measurement-only
 * link cannot produce a priced line later.
 */
export function quotationMeasuredLine(input: {
  work: WorkRequired;
  area: Pick<Area, "id" | "name">;
  siteName?: string;
  dimensions: Dimensions;
  workSubcategories: WorkSubcategory[];
  contractorRates: ContractorRate[];
  id: string;
}): LineItem {
  const { work, area, dimensions, workSubcategories, contractorRates } = input;
  const template = (work.structured_items || [])[0];
  const pairs = (work.work_subcategory_ids || []).flatMap((subcategoryId) => {
    const subcategory = workSubcategories.find((row) => row.id === subcategoryId);
    if (!subcategory) return [];
    return workTypesForSubcategory(subcategory)
      .filter((workType) => (work.work_type_ids || []).includes(workType.id))
      .map((workType) => ({ subcategory_id: subcategory.id, work_type_id: workType.id }));
  });
  const primaryPair = pairs[0] || {
    subcategory_id: template?.subcategory_id || work.work_subcategory_ids?.[0],
    work_type_id: template?.work_type_id || work.work_type_ids?.[0],
  };
  const subcategory = workSubcategories.find((row) => row.id === primaryPair.subcategory_id);
  const basis = defaultMeasureBasisFor(subcategory?.name || work.title);
  const measured = measuredQuantity(basis, dimensions);
  const quantity = Math.round(measured.quantity * 100) / 100;
  const rate = template?.rate ?? averageWorkTypeTotalRate(contractorRates, primaryPair.subcategory_id, primaryPair.work_type_id) ?? 0;
  const scopeTitle = capturedPairsTitle(workSubcategories, pairs) || work.title;

  return {
    ...template,
    id: input.id,
    title: `${area.name} · ${scopeTitle}`,
    category_id: subcategory?.category_id || template?.category_id,
    subcategory_id: primaryPair.subcategory_id,
    work_type_id: primaryPair.work_type_id,
    option_pairs: pairs.length > 1 ? pairs : undefined,
    work_required_id: work.id,
    area_id: area.id,
    area_name: area.name,
    site_id: work.site_id,
    site_name: input.siteName,
    length_ft: dimensions.length,
    breadth_ft: dimensions.breadth,
    height_ft: dimensions.height || undefined,
    floor_ceiling_area: Math.round(dimensions.length * dimensions.breadth * 100) / 100,
    quantity,
    unit_id: measured.unit,
    unit_name: measured.unit === "sqft" ? "Square feet" : "Running feet",
    rate,
    amount: Math.round(quantity * rate * 100) / 100,
    tax_rate: rate > 0 ? (template?.tax_rate ?? 18) : template?.tax_rate,
    status: "active",
  };
}
