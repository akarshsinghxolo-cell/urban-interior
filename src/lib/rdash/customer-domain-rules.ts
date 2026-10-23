import { isValidIndianMobile } from "./phone-validation";
import {
  customerReferrer,
  isCustomerReferrerType,
  referrerExists,
  type CustomerReferrerLookup,
} from "./customer-referrer";
import { resolveWorkTypes } from "./work-types";
import type { Area, Customer, Master, Site, WorkRequired } from "./types";

export type WorkRequiredValidationContext = {
  sites: Site[];
  areas: Area[];
  master: Pick<Master, "workCategories" | "workSubcategories">;
};

function present(value: unknown): boolean {
  return typeof value === "string" ? Boolean(value.trim()) : value != null;
}

export function validCustomerEmailValue(value: unknown): boolean {
  const raw = String(value || "").trim();
  return !raw || raw.includes("@");
}

export function assertCustomerReferrer(
  db: CustomerReferrerLookup,
  customer: Customer,
  context = "Customer",
): void {
  const referrerType = customer.referrer_type;
  if (!isCustomerReferrerType(referrerType)) {
    if (present(referrerType) || present(customer.referrer_id) || present(customer.referrer_name)) {
      throw new Error(`${context}: a valid referrer type is required when referrer details are supplied.`);
    }
    return;
  }

  const referrer = customerReferrer(customer);
  if (!referrer.referrer_name?.trim()) {
    throw new Error(`${context}: referrer name is required when a referrer is selected.`);
  }
  if (!referrerExists(db, referrer)) {
    throw new Error(`${context}: selected ${referrerType.replace("_", " ")} referrer does not exist.`);
  }
}

export function assertCustomerRecord(
  db: CustomerReferrerLookup,
  customer: Customer,
  context = "Customer",
): void {
  if (!customer.id?.trim()) throw new Error(`${context}: ID is required.`);
  if (!customer.name?.trim()) throw new Error(`${context}: name is required.`);
  if (!["active", "inactive", "blocked"].includes(customer.status)) {
    throw new Error(`${context}: status is invalid.`);
  }
  for (const [label, value] of [
    ["phone", customer.phone],
    ["WhatsApp", customer.whatsapp],
    ["alternate phone", customer.alternate_phone],
  ] as const) {
    if (!isValidIndianMobile(value)) {
      throw new Error(`${context}: ${label} must be a valid Indian mobile number or empty.`);
    }
  }
  if (!validCustomerEmailValue(customer.email)) {
    throw new Error(`${context}: email must contain @ or be empty.`);
  }
  assertCustomerReferrer(db, customer, context);
}

export function workRequiredHasTaxonomy(work: Pick<WorkRequired, "work_subcategory_ids">): boolean {
  return Boolean(work.work_subcategory_ids?.length);
}

/**
 * A Work Required record has exactly two valid shapes:
 * - general scope: no subcategories/work types;
 * - taxonomy scope: one or more subcategories, with every work type
 *   belonging to one of those selected subcategories.
 */
export function assertWorkRequiredDefinition(
  db: WorkRequiredValidationContext,
  work: Pick<WorkRequired,
    "title" | "work_subcategory_ids" | "work_type_ids" | "area_ids" | "customer_id" | "site_id" | "structured_items"
  >,
  context = "Work Required",
  areas: Area[] = db.areas,
): void {
  if (!work.title?.trim()) throw new Error(`${context}: title is required.`);
  if (!work.customer_id?.trim()) throw new Error(`${context}: Customer is required.`);

  const subcategoryIds = [...new Set((work.work_subcategory_ids || []).filter(Boolean))];
  const workTypeIds = [...new Set((work.work_type_ids || []).filter(Boolean))];
  const hasSubcategories = subcategoryIds.length > 0;

  if (!hasSubcategories) {
    if (workTypeIds.length) {
      throw new Error(`${context}: a general scope cannot contain work types without a subcategory.`);
    }
  } else {
    if (!workTypeIds.length) {
      throw new Error(`${context}: select at least one Work Type for the selected Work Subcategories.`);
    }
    const subcategories = subcategoryIds.map((id) => {
      const row = db.master.workSubcategories.find((candidate) => candidate.id === id);
      if (!row) throw new Error(`${context}: Work Subcategory "${id}" does not exist.`);
      if (!db.master.workCategories.some((category) => category.id === row.category_id)) throw new Error(`${context}: Work Subcategory "${row.name}" has no Work Category.`);
      return row;
    });
    const allowedWorkTypeIds = new Set(resolveWorkTypes(subcategories, workTypeIds).map((row) => row.id));
    const invalidWorkTypeId = workTypeIds.find((id) => !allowedWorkTypeIds.has(id));
    if (invalidWorkTypeId) {
      throw new Error(`${context}: work type "${invalidWorkTypeId}" does not belong to the selected Work Subcategories.`);
    }
  }

  for (const item of work.structured_items || []) {
    const pairs = item.option_pairs?.length
      ? item.option_pairs
      : item.subcategory_id
        ? [{ subcategory_id: item.subcategory_id, work_type_id: item.work_type_id }]
        : [];
    for (const pair of pairs) {
      if (!subcategoryIds.includes(pair.subcategory_id) || (pair.work_type_id && !workTypeIds.includes(pair.work_type_id))) {
        throw new Error(`${context}: detailed work still uses an unticked Work Subcategory or Work Type. Remove or replace that detailed option before changing the selection.`);
      }
    }
  }

  if (work.site_id) {
    const site = db.sites.find((row) => row.id === work.site_id);
    if (!site) throw new Error(`${context}: Site does not exist.`);
    if (site.customer_id !== work.customer_id) {
      throw new Error(`${context}: Site belongs to a different Customer.`);
    }
    const validAreaIds = new Set(areas.filter((area) => area.site_id === work.site_id && !area.is_archived).map((area) => area.id));
    const invalidAreaId = (work.area_ids || []).find((id) => !validAreaIds.has(id));
    if (invalidAreaId) throw new Error(`${context}: covered Area belongs to another Site or is archived.`);
  } else if ((work.area_ids || []).some((id) => areas.some((area) => area.id === id && Boolean(area.site_id)))) {
    throw new Error(`${context}: customer-level general scope cannot include a Site Area.`);
  }
}
