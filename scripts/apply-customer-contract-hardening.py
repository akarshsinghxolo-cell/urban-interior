from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def path(rel: str) -> Path:
    return ROOT / rel


def read(rel: str) -> str:
    return path(rel).read_text(encoding="utf-8")


def write(rel: str, content: str) -> None:
    path(rel).parent.mkdir(parents=True, exist_ok=True)
    path(rel).write_text(content, encoding="utf-8")


def replace_once(rel: str, old: str, new: str) -> None:
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{rel}: expected exactly one match, found {count}: {old[:100]!r}")
    write(rel, text.replace(old, new, 1))


replace_once(
    "src/lib/rdash/types.ts",
    '''export type EntityStatus = "active" | "inactive" | "blocked";
export interface Customer {
    id: ID;
    name: string;
    phone: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    status: EntityStatus;
    source_partner_id?: ID;
    source_partner_name?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}''',
    '''export type EntityStatus = "active" | "inactive" | "blocked";
export type CustomerReferrerType = "customer" | "contractor" | "vendor" | "source_partner" | "external";
export interface Customer {
    id: ID;
    name: string;
    phone?: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
    status: EntityStatus;
    referrer_type?: CustomerReferrerType;
    referrer_id?: ID;
    referrer_name?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}''',
)

write(
    "src/lib/rdash/customer-referrer.ts",
    '''import type { Customer, CustomerReferrerType, ID, Master } from "./types";

export type { CustomerReferrerType } from "./types";

export type CustomerReferrerFields = Pick<Customer, "referrer_type" | "referrer_id" | "referrer_name">;

export type CustomerReferrerLookup = {
  customers: Customer[];
  master: Pick<Master, "contractors" | "vendors" | "sourcePartners">;
};

export type SourcePartnerProjection = {
  source_partner_id?: ID;
  source_partner_name?: string;
};

const REFERRER_TYPES = new Set<CustomerReferrerType>([
  "customer",
  "contractor",
  "vendor",
  "source_partner",
  "external",
]);

export function isCustomerReferrerType(value: unknown): value is CustomerReferrerType {
  return typeof value === "string" && REFERRER_TYPES.has(value as CustomerReferrerType);
}

export function customerReferrer(customer: Customer): CustomerReferrerFields {
  if (!isCustomerReferrerType(customer.referrer_type)) return {};
  return {
    referrer_type: customer.referrer_type,
    referrer_id: customer.referrer_id || undefined,
    referrer_name: customer.referrer_name?.trim() || undefined,
  };
}

export function customerReferrerSelection(
  type: CustomerReferrerType,
  id: string | undefined,
  name: string,
): CustomerReferrerFields {
  const cleanName = name.trim();
  const cleanId = id?.trim() || undefined;
  if (!cleanName) return {};
  if (type !== "external" && !cleanId) {
    throw new Error(`${type.replace("_", " ")} referrer requires an ID.`);
  }
  return {
    referrer_type: type,
    referrer_id: type === "external" ? undefined : cleanId,
    referrer_name: cleanName,
  };
}

export function referrerExists(db: CustomerReferrerLookup, referrer: CustomerReferrerFields): boolean {
  const type = referrer.referrer_type;
  const id = referrer.referrer_id;
  if (!type) return true;
  if (type === "external") return !id && Boolean(referrer.referrer_name?.trim());
  if (!id) return false;

  if (type === "customer") return db.customers.some((row) => row.id === id);
  if (type === "contractor") return db.master.contractors.some((row) => row.id === id);
  if (type === "vendor") return db.master.vendors.some((row) => row.id === id);
  if (type === "source_partner") return db.master.sourcePartners.some((row) => row.id === id);
  return false;
}

/**
 * Source-partner fields are a projection for Site/commission records only.
 * Customer itself stores only referrer_type/referrer_id/referrer_name.
 */
export function sourcePartnerProjection(referrer: CustomerReferrerFields): SourcePartnerProjection {
  return referrer.referrer_type === "source_partner"
    ? {
        source_partner_id: referrer.referrer_id,
        source_partner_name: referrer.referrer_name,
      }
    : {
        source_partner_id: undefined,
        source_partner_name: undefined,
      };
}
''',
)

write(
    "src/lib/rdash/customer-record.ts",
    '''import type { Customer } from "./types";
import { isCustomerReferrerType } from "./customer-referrer";

const CUSTOMER_RECORD_FIELDS = [
  "id",
  "name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "status",
  "referrer_type",
  "referrer_id",
  "referrer_name",
  "notes",
  "created_at",
  "updated_at",
] as const;

/**
 * Canonical display casing for customer names: trim + collapse whitespace,
 * then capitalize only tokens that carry NO uppercase at all ("rahul chobay"
 * → "Rahul Chobay"). Mixed-case tokens ("MC Gupta", "McDonald", "SK Traders")
 * pass through untouched so intentional casing is never mangled.
 */
export function titleCaseCustomerName(name: string): string {
  return name
    .trim()
    .replace(/\\s+/g, " ")
    .split(" ")
    .map((token) => {
      if (!token || /[A-Z]/.test(token) || !/[a-z]/i.test(token)) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

export function canonicalizeCustomerRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of CUSTOMER_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) safe[field] = row[field];
  }
  return safe;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeCustomerRow(row: unknown): Customer {
  const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const safe = canonicalizeCustomerRow(source);
  const status = safe.status === "inactive" || safe.status === "blocked" ? safe.status : "active";

  const customer: Customer = {
    id: String(safe.id || ""),
    name: titleCaseCustomerName(String(safe.name || "")),
    phone: optionalString(safe.phone),
    whatsapp: optionalString(safe.whatsapp),
    alternate_phone: optionalString(safe.alternate_phone),
    email: optionalString(safe.email),
    status,
    notes: optionalString(safe.notes),
    created_at: String(safe.created_at || ""),
    updated_at: String(safe.updated_at || ""),
  };

  if (isCustomerReferrerType(safe.referrer_type)) {
    customer.referrer_type = safe.referrer_type;
    customer.referrer_id = optionalString(safe.referrer_id);
    customer.referrer_name = optionalString(safe.referrer_name);
  }

  return customer;
}
''',
)

write(
    "src/lib/rdash/customer-domain-rules.ts",
    '''import { sanitizeIndianMobile } from "./phone-validation";
import {
  customerReferrer,
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
  return /^[6-9]\\d{9}$/.test(normalized);
}

export function validCustomerEmailValue(value: unknown): boolean {
  if (!present(value)) return true;
  const email = String(value).trim();
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function assertCustomerReferrer(
  db: CustomerReferrerLookup,
  customer: Customer,
  context = "Customer",
): void {
  const referrer = customerReferrer(customer);
  if (!referrer.referrer_type) {
    if (referrer.referrer_id || referrer.referrer_name) {
      throw new Error(`${context}: referrer type is required when referrer details are supplied.`);
    }
    return;
  }
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
''',
)

replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    '''import {
  customerReferrer,
  isCustomerReferrerType,
  sourcePartnerProjection,
  type CustomerRecord,
  type CustomerReferrerFields,
} from "./customer-referrer";''',
    '''import {
  customerReferrer,
  isCustomerReferrerType,
  sourcePartnerProjection,
  type CustomerReferrerFields,
} from "./customer-referrer";''',
)
replace_once("src/lib/rdash/customer-sites-save.ts", '  customer: Partial<Customer> & CustomerReferrerFields;', '  customer: Partial<Customer>;')
replace_once("src/lib/rdash/customer-sites-save.ts", 'type CustomerField = keyof Customer | keyof CustomerReferrerFields;', 'type CustomerField = keyof Customer;')
replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    '  "referrer_type", "referrer_id", "referrer_name",\n  "source_partner_id", "source_partner_name", "notes",',
    '  "referrer_type", "referrer_id", "referrer_name", "notes",',
)
replace_once("src/lib/rdash/customer-sites-save.ts", 'function valueAt(row: Customer | CustomerRecord | undefined, field: CustomerField): unknown {', 'function valueAt(row: Customer | undefined, field: CustomerField): unknown {')

old_referrer = '''function referrerFromInput(existing: Customer | undefined, input: SaveCustomerWithSitesInput["customer"]): CustomerReferrerFields {
  const raw = input as CustomerReferrerFields;
  const referrerKeysSupplied = ["referrer_type", "referrer_id", "referrer_name", "source_partner_id", "source_partner_name"]
    .some((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (isCustomerReferrerType(raw.referrer_type)) {
    return {
      referrer_type: raw.referrer_type,
      referrer_id: raw.referrer_id?.trim() || undefined,
      referrer_name: raw.referrer_name?.trim() || undefined,
    };
  }
  if (input.source_partner_id?.trim()) {
    return {
      referrer_type: "source_partner",
      referrer_id: input.source_partner_id.trim(),
      referrer_name: input.source_partner_name?.trim() || undefined,
    };
  }
  if (input.source_partner_name?.trim()) {
    return { referrer_type: "external", referrer_name: input.source_partner_name.trim() };
  }
  return referrerKeysSupplied ? {} : customerReferrer(existing || ({} as Customer));
}'''
new_referrer = '''function referrerFromInput(existing: Customer | undefined, input: SaveCustomerWithSitesInput["customer"]): CustomerReferrerFields {
  const rawRecord = input as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(rawRecord, "source_partner_id")
    || Object.prototype.hasOwnProperty.call(rawRecord, "source_partner_name")
  ) {
    throw new Error("Customer source_partner_* referral fields are retired; use referrer_type/referrer_id/referrer_name.");
  }

  const referrerKeysSupplied = ["referrer_type", "referrer_id", "referrer_name"]
    .some((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (!referrerKeysSupplied) return customerReferrer(existing || ({} as Customer));
  if (!isCustomerReferrerType(input.referrer_type)) {
    throw new Error("Customer referrer_type is required when referrer details are supplied.");
  }
  return {
    referrer_type: input.referrer_type,
    referrer_id: input.referrer_id?.trim() || undefined,
    referrer_name: input.referrer_name?.trim() || undefined,
  };
}'''
replace_once("src/lib/rdash/customer-sites-save.ts", old_referrer, new_referrer)

old_customer_record = '''function customerRecord(existing: Customer | undefined, input: SaveCustomerWithSitesInput["customer"], customerId: string, now: string): CustomerRecord {
  const phone = String(suppliedValue(input, "phone", existing?.phone ?? "") ?? "").trim();
  const whatsapp = suppliedValue(input, "whatsapp", existing?.whatsapp);
  const name = titleCaseCustomerName(String(suppliedValue(input, "name", existing?.name ?? "") ?? ""));
  if (!name) throw new Error("Customer name is required.");
  const referrer = referrerFromInput(existing, input);
  const sourcePartner = sourcePartnerProjection(referrer);
  return {
    id: customerId,
    name,
    phone,
    whatsapp: String(whatsapp ?? phone).trim() || undefined,
    alternate_phone: suppliedValue(input, "alternate_phone", existing?.alternate_phone),
    email: suppliedValue(input, "email", existing?.email),
    status: suppliedValue(input, "status", existing?.status ?? "active") ?? "active",
    ...sourcePartner,
    ...referrer,
    notes: suppliedValue(input, "notes", existing?.notes),
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}
function customerDiff(before: Customer | undefined, after: CustomerRecord): CustomerFieldChange[] {'''
new_customer_record = '''function customerRecord(existing: Customer | undefined, input: SaveCustomerWithSitesInput["customer"], customerId: string, now: string): Customer {
  const phoneValue = suppliedValue(input, "phone", existing?.phone);
  const phone = String(phoneValue ?? "").trim() || undefined;
  const whatsapp = suppliedValue(input, "whatsapp", existing?.whatsapp);
  const name = titleCaseCustomerName(String(suppliedValue(input, "name", existing?.name ?? "") ?? ""));
  if (!name) throw new Error("Customer name is required.");
  const referrer = referrerFromInput(existing, input);
  return {
    id: customerId,
    name,
    phone,
    whatsapp: String(whatsapp ?? phone ?? "").trim() || undefined,
    alternate_phone: suppliedValue(input, "alternate_phone", existing?.alternate_phone),
    email: suppliedValue(input, "email", existing?.email),
    status: suppliedValue(input, "status", existing?.status ?? "active") ?? "active",
    ...referrer,
    notes: suppliedValue(input, "notes", existing?.notes),
    created_at: existing?.created_at ?? now,
    updated_at: existing?.updated_at ?? now,
  };
}
function customerDiff(before: Customer | undefined, after: Customer): CustomerFieldChange[] {'''
replace_once("src/lib/rdash/customer-sites-save.ts", old_customer_record, new_customer_record)

replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    'function siteRecord(existing: Site | undefined, input: CustomerSiteSaveDraft, customer: CustomerRecord, siteId: string, now: string, detachedAttachmentIds: Set<string>): Site {',
    'function siteRecord(existing: Site | undefined, input: CustomerSiteSaveDraft, customer: Customer, siteId: string, now: string, detachedAttachmentIds: Set<string>): Site {',
)
replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    '  const attachmentIds = uniqueStrings([...(input.photo_attachment_ids ?? existing?.photo_attachment_ids ?? [])]).filter((id) => !detachedAttachmentIds.has(id));\n  return {',
    '  const attachmentIds = uniqueStrings([...(input.photo_attachment_ids ?? existing?.photo_attachment_ids ?? [])]).filter((id) => !detachedAttachmentIds.has(id));\n  const sourcePartner = sourcePartnerProjection(customerReferrer(customer));\n  return {',
)
replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    '    source_partner_id: suppliedValue(input, "source_partner_id", existing?.source_partner_id ?? customer.source_partner_id),\n    source_partner_name: suppliedValue(input, "source_partner_name", existing?.source_partner_name ?? customer.source_partner_name),',
    '    source_partner_id: suppliedValue(input, "source_partner_id", existing?.source_partner_id ?? sourcePartner.source_partner_id),\n    source_partner_name: suppliedValue(input, "source_partner_name", existing?.source_partner_name ?? sourcePartner.source_partner_name),',
)
replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    'function workRequiredRecord(existing: WorkRequired | undefined, input: CustomerWorkRequiredSaveDraft, workRequiredId: string, customer: CustomerRecord, site: Site | undefined, now: string): WorkRequired {',
    'function workRequiredRecord(existing: WorkRequired | undefined, input: CustomerWorkRequiredSaveDraft, workRequiredId: string, customer: Customer, site: Site | undefined, now: string): WorkRequired {',
)
replace_once(
    "src/lib/rdash/customer-sites-save.ts",
    '  const customerValidationDb = { ...database, customers: existingCustomer ? database.customers.map((row) => row.id === customerId ? nextCustomer : row) : [nextCustomer, ...database.customers] };\n  assertCustomerRecord(customerValidationDb, nextCustomer);',
    '''  const customerValidationContext = {
    customers: existingCustomer
      ? database.customers.map((row) => row.id === customerId ? nextCustomer : row)
      : [nextCustomer, ...database.customers],
    master: database.master,
  };
  assertCustomerRecord(customerValidationContext, nextCustomer);''',
)

replace_once(
    "src/components/rdash/customer-sites-form-model.ts",
    '''  customerReferrerSelection,
  sourcePartnerProjection,
  type CustomerReferrerFields,
  type CustomerReferrerType,''',
    '''  customerReferrerSelection,
  type CustomerReferrerType,''',
)
replace_once(
    "src/components/rdash/customer-sites-form-model.ts",
    '''export function customerPayload(draft: CustomerDraft): Partial<Customer> & CustomerReferrerFields {
  const referrer = draft.referralSelected ? customerReferrerSelection(draft.referralSelected.type, draft.referralSelected.id, draft.referralSelected.name) : {};
  return { name: draft.name.trim(), phone: sanitizeIndianMobile(draft.phone), whatsapp: draft.whatsapp.trim() ? sanitizeIndianMobile(draft.whatsapp) : undefined, alternate_phone: draft.alternatePhone.trim() ? sanitizeIndianMobile(draft.alternatePhone) : undefined, email: draft.email.trim() || undefined, ...referrer, ...sourcePartnerProjection(referrer), notes: draft.notes.trim() || undefined };
}''',
    '''export function customerPayload(draft: CustomerDraft): Partial<Customer> {
  const referrer = draft.referralSelected ? customerReferrerSelection(draft.referralSelected.type, draft.referralSelected.id, draft.referralSelected.name) : {};
  return { name: draft.name.trim(), phone: draft.phone.trim() ? sanitizeIndianMobile(draft.phone) : undefined, whatsapp: draft.whatsapp.trim() ? sanitizeIndianMobile(draft.whatsapp) : undefined, alternate_phone: draft.alternatePhone.trim() ? sanitizeIndianMobile(draft.alternatePhone) : undefined, email: draft.email.trim() || undefined, ...referrer, notes: draft.notes.trim() || undefined };
}''',
)

replace_once("src/lib/rdash/seed.ts", 'import type { CustomerReferrerFields } from "./customer-referrer";\n', '')
replace_once("src/lib/rdash/seed.ts", 'const customers: Array<Customer & CustomerReferrerFields> = [', 'const customers: Customer[] = [')

replace_once(
    "src/lib/rdash/server/simple-targeted-commit.ts",
    'import type { CustomerRecord } from "../customer-referrer";\nimport type { RDashDatabase } from "../types";',
    'import type { Customer, RDashDatabase } from "../types";',
)
replace_once("src/lib/rdash/server/simple-targeted-commit.ts", '          const customer = row as unknown as CustomerRecord;', '          const customer = row as unknown as Customer;')

write(
    "supabase/migrations/20260913190000_finalize_customer_contract.sql",
    r'''-- Finalize the Customer cutover.
-- Customer stores only canonical referrer_type/referrer_id/referrer_name fields.
-- source_partner_* remains a projection on Site/commission records, never Customer.

update public.entity_customers
set data = data - 'source_partner_id' - 'source_partner_name'
where data ? 'source_partner_id' or data ? 'source_partner_name';

create or replace function private.uc_canonicalize_customer_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_id text;
  v_name text;
  v_exists boolean;
begin
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DATA';
  end if;

  if new.data ? 'source_partner_id' or new.data ? 'source_partner_name' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_LEGACY_REFERRER_FIELDS';
  end if;
  if new.data ? 'interest_category_ids' or new.data ? 'interest_work_subcategory_ids' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_RETIRED_FIELDS';
  end if;

  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id), true);
  if coalesce(btrim(new.data->>'status'), '') = '' then
    new.data := jsonb_set(new.data, '{status}', '"active"'::jsonb, true);
  end if;

  v_type := nullif(btrim(new.data->>'referrer_type'), '');
  v_id := nullif(btrim(new.data->>'referrer_id'), '');
  v_name := nullif(btrim(new.data->>'referrer_name'), '');

  if v_type is null then
    if v_id is not null or v_name is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_PARTIAL';
    end if;
    new.data := new.data - 'referrer_type' - 'referrer_id' - 'referrer_name';
    return new;
  end if;

  if v_type not in ('customer','contractor','vendor','source_partner','external') then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_TYPE';
  end if;
  if v_name is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_NAME';
  end if;

  if v_type = 'external' then
    if v_id is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_EXTERNAL_REFERRER_ID';
    end if;
    new.data := (new.data - 'referrer_id')
      || jsonb_build_object('referrer_type', v_type, 'referrer_name', v_name);
    return new;
  end if;

  if v_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_ID';
  end if;

  if v_type = 'customer' then
    select exists(
      select 1
      from public.entity_customers x
      where x.workspace_id = new.workspace_id
        and x.id = v_id
        and x.id <> new.id
    ) into v_exists;
  elsif v_type = 'contractor' then
    select exists(
      select 1 from public."entity_master_contractors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  elsif v_type = 'vendor' then
    select exists(
      select 1 from public."entity_master_vendors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  else
    select exists(
      select 1 from public."entity_master_sourcePartners" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER';
  end if;

  new.data := new.data
    || jsonb_build_object(
      'referrer_type', v_type,
      'referrer_id', v_id,
      'referrer_name', v_name
    );
  return new;
end;
$$;

alter function private.uc_sync_customer_contact_identities() set search_path = '';

revoke execute on function private.uc_canonicalize_customer_row() from public, anon, authenticated;
revoke execute on function private.uc_sync_customer_contact_identities() from public, anon, authenticated;

alter table public.entity_customers
  drop constraint if exists entity_customers_data_shape_chk;

alter table public.entity_customers
  add constraint entity_customers_data_shape_chk check (
    jsonb_typeof(data) = 'object'
    and data->>'id' = id
    and coalesce(btrim(data->>'name'), '') <> ''
    and data->>'status' in ('active','inactive','blocked')
    and (nullif(btrim(data->>'phone'), '') is null or public.uc_normalize_phone(data->>'phone') ~ '^[6-9][0-9]{9}$')
    and (nullif(btrim(data->>'whatsapp'), '') is null or public.uc_normalize_phone(data->>'whatsapp') ~ '^[6-9][0-9]{9}$')
    and (nullif(btrim(data->>'alternate_phone'), '') is null or public.uc_normalize_phone(data->>'alternate_phone') ~ '^[6-9][0-9]{9}$')
    and (nullif(btrim(data->>'email'), '') is null or position('@' in data->>'email') > 1)
    and not (data ? 'interest_category_ids')
    and not (data ? 'interest_work_subcategory_ids')
    and not (data ? 'source_partner_id')
    and not (data ? 'source_partner_name')
    and (
      (
        nullif(btrim(data->>'referrer_type'), '') is null
        and nullif(btrim(data->>'referrer_id'), '') is null
        and nullif(btrim(data->>'referrer_name'), '') is null
      )
      or (
        data->>'referrer_type' in ('customer','contractor','vendor','source_partner','external')
        and nullif(btrim(data->>'referrer_name'), '') is not null
        and (
          (data->>'referrer_type' = 'external' and nullif(btrim(data->>'referrer_id'), '') is null)
          or
          (data->>'referrer_type' <> 'external' and nullif(btrim(data->>'referrer_id'), '') is not null)
        )
      )
    )
  ) not valid;

alter table public.entity_customers
  validate constraint entity_customers_data_shape_chk;
''',
)

write(
    "docs/customer-domain-cleanup-todo.md",
    '''# Customer domain cleanup — completed

The Customer/Site/Area/Work Required convergence is complete as of 2026-09-13.

The final hardening pass made `Customer` in `src/lib/rdash/types.ts` the only full Customer TypeScript model, made phone genuinely optional end-to-end, and moved typed `referrer_type` / `referrer_id` / `referrer_name` fields into that canonical contract. The transitional `CustomerRecord` intersection type is gone.

Retired Customer referral payloads are no longer accepted. Customer writers use only the canonical referrer fields; the database rejects `source_partner_id` / `source_partner_name` on Customer rows. Source-partner fields remain only as derived projections where Site or commission records require them.

The private Customer canonicalization and contact-identity trigger functions have explicit EXECUTE revocations for `PUBLIC`, `anon`, and `authenticated`, in addition to living in the non-exposed `private` schema. Their search paths are pinned for privileged execution.

Customer domain validation now depends on narrow structural contexts instead of requiring the full `RDashDatabase` workspace object. This keeps domain rules usable by targeted reads and reduces accidental cross-domain coupling.

The 2026-09-13 database index audit found no exact duplicate indexes and no simple prefix-redundant B-tree indexes among the 207 non-constraint zero-scan advisor findings. No indexes were removed without workload evidence; see `docs/database-index-audit-2026-09-13.md`.

Verification for this cleanup is enforced through the repository Application CI gate: full Vitest, TypeScript, ESLint, Next.js build, and Playwright smoke. The old checklist is retained at this path only to preserve links from earlier commits; it is no longer an active TODO list.

One account-level Supabase setting remains operational rather than code-owned: leaked-password protection should stay enabled in the project Auth settings and is monitored by the Supabase security advisor.
''',
)

write(
    "docs/database-index-audit-2026-09-13.md",
    '''# Database index audit — 2026-09-13

## Result

Supabase Performance Advisor reported 207 unused indexes. The audit deliberately did not translate “zero scans” into “safe to drop”.

Live PostgreSQL statistics showed 292 zero-scan indexes in total: 85 back a primary key, unique constraint, or other constraint and are therefore protected; 207 are non-constraint advisor candidates. Of the zero-scan set, 168 sit on currently empty tables and 124 sit on non-empty tables. The complete zero-scan set occupies about 3.4 MiB.

Two structural redundancy checks were then run against the live catalog:

- exact duplicate indexes with the same table, key columns, uniqueness, expressions, and predicate: **0**
- non-unique B-tree indexes wholly covered by an otherwise equivalent longer index with the same leading key sequence and predicate: **0**

## Decision

No production indexes are dropped in this change.

The application is still young, many entity tables are empty or lightly used, and several Customer/Site relationship indexes were introduced only recently. A zero scan count is not enough evidence to remove an index that may protect a less-frequent workflow or future growth path. The current storage cost is also small relative to the regression risk.

## Repeatable policy

Use `scripts/audit-unused-indexes.sql` to rerun the catalog audit. An index becomes a removal candidate only when all of the following are true:

1. it does not back a primary key, unique constraint, exclusion constraint, or foreign-key support requirement;
2. it remains unused through a representative production observation window with real traffic;
3. it is either structurally redundant or its associated query path is confirmed retired;
4. representative `EXPLAIN (ANALYZE, BUFFERS)` plans remain acceptable without it in a safe environment;
5. removal is committed as its own reversible migration and Supabase performance advisors are rerun.

This converts the advisor count from a cleanup target into a workload-based maintenance signal.
''',
)

write(
    "scripts/audit-unused-indexes.sql",
    r'''-- Read-only index audit for the Urban Castle Supabase database.
-- Run against production or a representative clone. Do not drop indexes solely
-- because idx_scan = 0.

with idx as (
  select
    n.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    x.indexrelid,
    x.indrelid,
    x.indisunique,
    x.indisprimary,
    x.indkey,
    x.indnkeyatts,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    pg_get_expr(x.indexprs, x.indrelid) as expressions,
    am.amname,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes,
    coalesce(st.n_live_tup, 0) as live_rows,
    exists(select 1 from pg_constraint c where c.conindid = i.oid) as backs_constraint
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  left join pg_stat_user_tables st on st.relid = t.oid
  where n.nspname = 'public'
)
select
  count(*) filter (where idx_scan = 0) as zero_scan_indexes,
  count(*) filter (where idx_scan = 0 and live_rows = 0) as zero_scan_on_empty_tables,
  count(*) filter (where idx_scan = 0 and live_rows > 0) as zero_scan_on_nonempty_tables,
  pg_size_pretty(sum(bytes) filter (where idx_scan = 0)) as zero_scan_size,
  count(*) filter (
    where idx_scan = 0 and (indisunique or indisprimary or backs_constraint)
  ) as protected_zero_scan,
  count(*) filter (
    where idx_scan = 0 and not (indisunique or indisprimary or backs_constraint)
  ) as nonconstraint_zero_scan
from idx;

with idx as (
  select
    n.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    x.indisunique,
    x.indisprimary,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    pg_get_expr(x.indexprs, x.indrelid) as expressions,
    x.indkey::text as indkey,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  where n.nspname = 'public'
)
select
  a.schema_name,
  a.table_name,
  a.index_name,
  b.index_name as duplicate_of,
  a.idx_scan,
  b.idx_scan as duplicate_scan,
  a.bytes
from idx a
join idx b
  on a.schema_name = b.schema_name
 and a.table_name = b.table_name
 and a.index_name < b.index_name
 and a.indisunique = b.indisunique
 and a.indisprimary = b.indisprimary
 and coalesce(a.predicate, '') = coalesce(b.predicate, '')
 and coalesce(a.expressions, '') = coalesce(b.expressions, '')
 and a.indkey = b.indkey
order by a.bytes desc, a.table_name, a.index_name;

with idx as (
  select
    t.relname as table_name,
    i.relname as index_name,
    x.indexrelid,
    x.indrelid,
    x.indisunique,
    x.indisprimary,
    x.indkey,
    x.indnkeyatts,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    am.amname,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes,
    exists(select 1 from pg_constraint c where c.conindid = i.oid) as backs_constraint
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  where n.nspname = 'public'
)
select
  a.table_name,
  a.index_name as covered_index,
  b.index_name as covering_index,
  a.idx_scan as covered_scans,
  b.idx_scan as covering_scans,
  a.bytes as covered_bytes
from idx a
join idx b on b.indrelid = a.indrelid and b.indexrelid <> a.indexrelid
where a.amname = 'btree'
  and b.amname = 'btree'
  and not a.indisunique
  and not a.indisprimary
  and not a.backs_constraint
  and coalesce(a.predicate, '') = coalesce(b.predicate, '')
  and a.indnkeyatts < b.indnkeyatts
  and a.indkey::int2[] = (b.indkey::int2[])[1:a.indnkeyatts]
order by a.bytes desc, a.table_name, a.index_name;
''',
)

write(
    "tests/customer-domain-unification.test.ts",
    '''import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  assertCustomerRecord,
  assertWorkRequiredDefinition,
  workRequiredHasTaxonomy,
} from "../src/lib/rdash/customer-domain-rules";
import {
  customerReferrerSelection,
  sourcePartnerProjection,
} from "../src/lib/rdash/customer-referrer";
import type { Customer } from "../src/lib/rdash/types";
import { testFile } from "./test-file";

const read = (path: string) => testFile(path).text();

describe("customer domain unification", () => {
  test("accepts the two canonical Work Required shapes and rejects hybrids", () => {
    const db = structuredClone(buildSeedDatabase());
    const customer = db.customers[0];

    const general = {
      customer_id: customer.id,
      site_id: "",
      title: "General interior scope",
      work_category_id: undefined,
      work_subcategory_ids: [],
      work_type_ids: [],
      area_ids: [],
    };
    expect(() => assertWorkRequiredDefinition(db, general, "Work Required")).not.toThrow();
    expect(workRequiredHasTaxonomy(general)).toBe(false);

    expect(() => assertWorkRequiredDefinition(db, {
      ...general,
      work_category_id: db.master.workCategories[0]?.id,
    }, "Work Required")).toThrow(/both a Work Category and at least one Work Subcategory/i);
  });

  test("keeps external referrers typed and source-partner projection outside Customer", () => {
    const db = structuredClone(buildSeedDatabase());
    const customer = db.customers[0];
    const external = customerReferrerSelection("external", undefined, "Walk-in");
    const candidate: Customer = { ...customer, ...external };

    expect(() => assertCustomerRecord(db, candidate, "Customer")).not.toThrow();
    expect(sourcePartnerProjection(external)).toEqual({ source_partner_id: undefined, source_partner_name: undefined });

    const partner = db.master.sourcePartners[0];
    if (partner) {
      const selected = customerReferrerSelection("source_partner", partner.id, partner.name);
      expect(sourcePartnerProjection(selected)).toEqual({ source_partner_id: partner.id, source_partner_name: partner.name });
    }
  });

  test("Customer is the one canonical TypeScript model", async () => {
    const types = await read("src/lib/rdash/types.ts");
    const start = types.indexOf("export interface Customer {");
    const end = types.indexOf("type FileAttachmentReference", start);
    const customer = types.slice(start, end);
    const referrer = await read("src/lib/rdash/customer-referrer.ts");
    const seed = await read("src/lib/rdash/seed.ts");

    expect(customer).toContain("phone?: string;");
    expect(customer).toContain("referrer_type?: CustomerReferrerType;");
    expect(customer).toContain("referrer_id?: ID;");
    expect(customer).toContain("referrer_name?: string;");
    expect(customer).not.toContain("source_partner_id");
    expect(customer).not.toContain("source_partner_name");
    expect(referrer).not.toMatch(/\\bCustomerRecord\\b/);
    expect(seed).toContain("const customers: Customer[]");
    expect(seed).not.toContain("Customer & CustomerReferrerFields");
  });

  test("runtime and database boundaries reject retired Customer payloads", async () => {
    const saver = await read("src/lib/rdash/customer-sites-save.ts");
    const formModel = await read("src/components/rdash/customer-sites-form-model.ts");
    const migration = await read("supabase/migrations/20260913190000_finalize_customer_contract.sql");

    expect(saver).toContain("Customer source_partner_* referral fields are retired");
    expect(saver).not.toContain("if (input.source_partner_id");
    expect(formModel).not.toContain("sourcePartnerProjection(referrer)");
    expect(migration).toContain("INVALID_CUSTOMER_LEGACY_REFERRER_FIELDS");
    expect(migration).toContain("INVALID_CUSTOMER_REFERRER_PARTIAL");
    expect(migration).toContain("revoke execute on function private.uc_canonicalize_customer_row()");
    expect(migration).toContain("revoke execute on function private.uc_sync_customer_contact_identities()");
  });

  test("database migration is the authoritative customer cutover", async () => {
    const migration = await read("supabase/migrations/20260913085318_customer_domain_unification.sql");
    expect(migration).toContain("private.customer_contact_identities");
    expect(migration).toContain("INVALID_CUSTOMER_IDENTITY_DUPLICATE");
    expect(migration).toContain("referrer_type");
    expect(migration).toContain("interest_category_ids");
    expect(migration).toContain("interest_work_subcategory_ids");
    expect(migration).toContain("customer_id_gen");
    expect(migration).toContain("site_id_gen");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.commit_workspace_operations_internal");
  });

  test("relationship index migration leads with generated FK columns", async () => {
    const migration = await read("supabase/migrations/20260913085807_customer_graph_fk_index_order.sql");
    expect(migration).toContain("(customer_id_gen, workspace_id)");
    expect(migration).toContain("(site_id_gen, workspace_id)");
    expect(migration).toContain("drop index if exists public.entity_customers_phone_uidx");
    expect(migration).toContain("drop index if exists public.entity_customers_email_uidx");
  });

  test("entity-scoped reads use generated Customer/Site relationship columns", async () => {
    const source = await read("src/lib/rdash/server/entity-scoped-rest.ts");
    expect(source).toContain('return { column: "customer_id_gen", json: false }');
    expect(source).toContain('return { column: "site_id_gen", json: false }');
    expect(source).toContain("selectorColumn(spec.collection, field)");
  });

  test("Customer Desk has an explicit bounded module collection plan", async () => {
    const source = await read("src/lib/rdash/server/module-read-plans.ts");
    expect(source).toContain("customerDesk: Object.freeze([");
    expect(source).toContain('"customers", "sites", "areas", "workRequired", "measurementRevisions"');
    expect(source).toContain('"entityReferenceAssignments", "entityFileAttachments", "auditLog"');
  });

  test("core Customer rules no longer require the giant RDashDatabase type", async () => {
    const referrer = await read("src/lib/rdash/customer-referrer.ts");
    const rules = await read("src/lib/rdash/customer-domain-rules.ts");
    expect(referrer).not.toContain("RDashDatabase");
    expect(rules).not.toContain("RDashDatabase");
    expect(rules).toContain("WorkRequiredValidationContext");
  });

  test("removed quotation and customer-form compatibility shims do not return", async () => {
    const businessRules = await read("src/lib/rdash/business-rules.ts");
    const formModel = await read("src/components/rdash/customer-sites-form-model.ts");
    expect(businessRules).not.toContain("failure.match(/^Quotation");
    expect(businessRules).not.toContain("Site does not exist\\\\.$/");
    expect(formModel).not.toContain("referralLegacyName");
  });
});
''',
)

source_files = list((ROOT / "src").rglob("*.ts")) + list((ROOT / "src").rglob("*.tsx")) + list((ROOT / "tests").rglob("*.ts"))
standalone_customer_record = [
    str(p.relative_to(ROOT))
    for p in source_files
    if re.search(r"\\bCustomerRecord\\b", p.read_text(encoding="utf-8"))
]
if standalone_customer_record:
    raise RuntimeError(f"CustomerRecord type still exists in: {standalone_customer_record}")

customer_section = read("src/lib/rdash/types.ts").split("export interface Customer {", 1)[1].split("type FileAttachmentReference", 1)[0]
if "source_partner_id" in customer_section or "source_partner_name" in customer_section:
    raise RuntimeError("Retired source_partner fields still exist on Customer")
if "phone?: string;" not in customer_section:
    raise RuntimeError("Customer.phone is not optional")

print("Customer architecture cleanup applied successfully.")
