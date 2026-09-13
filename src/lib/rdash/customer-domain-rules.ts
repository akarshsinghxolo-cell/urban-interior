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
  if (!present(value)) return true;
  const normalized = sanitizeIndianMobile(String(value));
  return /^[6-9]\d{9}$/.test(normalized);
}

export function validCustomerEmailValue(value: unknown): boolean {
  if (!present(value)) return true;
  const email = String(value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function assertCustomerReferrer(
  db: CustomerReferrerLookup,
  customer: Customer,
  context = "Customer",
): void {
  if (!isCustomerReferrerType(customer.referrer_type)) {
    if (present(customer.referrer_type) || present(customer.referrer_id) || present(customer.referrer_name)) {
      throw new Error(`${context}: a valid referrer type is required when referrer details are supplied.`);
    }
    return;
  }

  const referrer = customerReferrer(customer);
  if (!referrer.referrer_name?.trim()) {
    throw new Error(`${context}: referrer name is required.`);
  }
  if (!referrerExists(db, referrer)) {
    throw new Error(`${context}: selected ${referrer.referrer_type.replace("_", " ")} referrer does not exist.`);
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
    throw new Error(`${context}: invalid status.`);
  }
  for (const [label, value] of [
    ["phone", customer.phone],
    ["WhatsApp", customer.whatsapp],
    ["alternate phone", customer.alternate_phone],
  ] as const) {
    if (!validCustomerPhone(value)) throw new Error(`${context}: ${label} must be a valid Indian mobile number.`);
  }
  if (!validCustomerEmailValue(customer.email)) throw new Error(`${context}: email is invalid.`);
  assertCustomerReferrer(db, customer, context);
}

export function workRequiredHasTaxonomy(
  work: Pick<WorkRequired, "work_category_id" | "work_subcategory_ids" | "work_type_ids">,
): boolean {
  return Boolean(
    work.work_category_id
    || work.work_subcategory_ids?.length
    || work.work_type_ids?.length,
  );
}

export function assertWorkRequiredDefinition(
  db: WorkRequiredValidationContext,
  work: Pick<
    WorkRequired,
    "customer_id" | "site_id" | "title" | "work_category_id" | "work_subcategory_ids" | "work_type_ids" | "area_ids"
  >,
  context = "Work Required",
  areas: Area[] = db.areas,
): void {
  if (!work.customer_id?.trim()) throw new Error(`${context}: Customer is required.`);
  if (!work.title?.trim()) throw new Error(`${context}: title is required.`);

  const categoryId = work.work_category_id?.trim() || "";
  const subcategoryIds = [...new Set((work.work_subcategory_ids || []).filter(Boolean))];
  const workTypeIds = [...new Set((work.work_type_ids || []).filter(Boolean))];

  if (!categoryId && !subcategoryIds.length && !workTypeIds.length) {
    if (work.site_id) {
      const site = db.sites.find((row) => row.id === work.site_id);
      if (!site || site.customer_id !== work.customer_id || site.is_archived) {
        throw new Error(`${context}: Site must be an active Site belonging to the Customer.`);
      }
    }
    if ((work.area_ids || []).length) {
      if (!work.site_id) throw new Error(`${context}: Areas require a Site.`);
      const validAreaIds = new Set(
        areas.filter((row) => row.site_id === work.site_id && !row.is_archived).map((row) => row.id),
      );
      if ((work.area_ids || []).some((areaId) => !validAreaIds.has(areaId))) {
        throw new Error(`${context}: every Area must belong to the active Site.`);
      }
    }
    return;
  }

  if (!categoryId || !subcategoryIds.length) {
    throw new Error(`${context}: scoped work requires both a Work Category and at least one Work Subcategory.`);
  }
  if (!db.master.workCategories.some((row) => row.id === categoryId)) {
    throw new Error(`${context}: Work Category does not exist.`);
  }

  const subcategories = subcategoryIds.map((id) => db.master.workSubcategories.find((row) => row.id === id));
  if (subcategories.some((row) => !row || row.category_id !== categoryId)) {
    throw new Error(`${context}: every Work Subcategory must belong to the selected Work Category.`);
  }

  const resolved = resolveWorkTypes(db.master.workSubcategories, subcategoryIds, workTypeIds);
  if (resolved.invalidIds.length) {
    throw new Error(`${context}: every Work Type must belong to a selected Work Subcategory.`);
  }
  if (!resolved.ids.length) {
    throw new Error(`${context}: at least one valid Work Type is required for scoped work.`);
  }

  if (work.site_id) {
    const site = db.sites.find((row) => row.id === work.site_id);
    if (!site || site.customer_id !== work.customer_id || site.is_archived) {
      throw new Error(`${context}: Site must be an active Site belonging to the Customer.`);
    }
  }
  if ((work.area_ids || []).length) {
    if (!work.site_id) throw new Error(`${context}: Areas require a Site.`);
    const validAreaIds = new Set(
      areas.filter((row) => row.site_id === work.site_id && !row.is_archived).map((row) => row.id),
    );
    if ((work.area_ids || []).some((areaId) => !validAreaIds.has(areaId))) {
      throw new Error(`${context}: every Area must belong to the active Site.`);
    }
  }
}
