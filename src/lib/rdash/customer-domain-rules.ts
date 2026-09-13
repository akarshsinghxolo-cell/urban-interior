import { sanitizeIndianMobile } from "./phone-validation";
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

export function validCustomerPhone(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  return /^[6-9]\d{9}$/.test(sanitizeIndianMobile(raw));
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
    if (!validCustomerPhone(value)) {
      throw new Error(`${context}: ${label} must be a valid Indian mobile number or empty.`);
    }
  }
  if (!validCustomerEmailValue(customer.email)) {
    throw new Error(`${context}: email must contain @ or be empty.`);
  }
  assertCustomerReferrer(db, customer, context);
}

export function workRequiredHasTaxonomy(work: Pick<WorkRequired, "work_category_id" | "work_subcategory_ids">): boolean {
  return Boolean(work.work_category_id) && Boolean(work.work_subcategory_ids?.length);
}

/**
 * A Work Required record has exactly two valid shapes:
 * - general scope: no category and no subcategories/work types;
 * - taxonomy scope: category + one or more subcategories, with every work type
 *   belonging to one of those selected subcategories.
 */
export function assertWorkRequiredDefinition(
  db: WorkRequiredValidationContext,
  work: Pick<WorkRequired,
    "title" | "work_category_id" | "work_subcategory_ids" | "work_type_ids" | "area_ids" | "customer_id" | "site_id"
  >,
  context = "Work Required",
  areas: Area[] = db.areas,
): void {
  if (!work.title?.trim()) throw new Error(`${context}: title is required.`);
  if (!work.customer_id?.trim()) throw new Error(`${context}: Customer is required.`);

  const categoryId = work.work_category_id?.trim() || "";
  const subcategoryIds = [...new Set((work.work_subcategory_ids || []).filter(Boolean))];
  const workTypeIds = [...new Set((work.work_type_ids || []).filter(Boolean))];
  const hasCategory = Boolean(categoryId);
  const hasSubcategories = subcategoryIds.length > 0;

  if (hasCategory !== hasSubcategories) {
    throw new Error(`${context}: choose both a Work Category and at least one Work Subcategory, or leave both empty for a general scope.`);
  }
  if (!hasCategory) {
    if (workTypeIds.length) {
      throw new Error(`${context}: a general scope cannot contain work types without a category/subcategory.`);
    }
  } else {
    const category = db.master.workCategories.find((row) => row.id === categoryId);
    if (!category) throw new Error(`${context}: Work Category "${categoryId}" does not exist.`);
    const subcategories = subcategoryIds.map((id) => {
      const row = db.master.workSubcategories.find((candidate) => candidate.id === id);
      if (!row) throw new Error(`${context}: Work Subcategory "${id}" does not exist.`);
      if (row.category_id !== category.id) {
        throw new Error(`${context}: Work Subcategory "${row.name}" belongs to another Work Category.`);
      }
      return row;
    });
    const allowedWorkTypeIds = new Set(resolveWorkTypes(subcategories, workTypeIds).map((row) => row.id));
    const invalidWorkTypeId = workTypeIds.find((id) => !allowedWorkTypeIds.has(id));
    if (invalidWorkTypeId) {
      throw new Error(`${context}: work type "${invalidWorkTypeId}" does not belong to the selected Work Subcategories.`);
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
