import type { Customer } from "./types";

export const CUSTOMER_RECORD_FIELDS = [
  "id",
  "name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "status",
  "interest_category_ids",
  "interest_work_subcategory_ids",
  "source_partner_id",
  "source_partner_name",
  "notes",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof Customer)[];

export const CUSTOMER_RECORD_FIELDS_COMPLETE:
  Exclude<keyof Customer, (typeof CUSTOMER_RECORD_FIELDS)[number]> extends never ? true : never = true;

export function canonicalizeCustomerRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of CUSTOMER_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) safe[field] = row[field];
  }
  return safe;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeCustomerRow(row: unknown): Customer {
  const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const safe = canonicalizeCustomerRow(source);
  const status = safe.status === "inactive" || safe.status === "blocked" ? safe.status : "active";
  return {
    id: String(safe.id || ""),
    name: String(safe.name || ""),
    phone: String(safe.phone || ""),
    whatsapp: typeof safe.whatsapp === "string" ? safe.whatsapp : undefined,
    alternate_phone: typeof safe.alternate_phone === "string" ? safe.alternate_phone : undefined,
    email: typeof safe.email === "string" ? safe.email : undefined,
    status,
    interest_category_ids: stringArray(safe.interest_category_ids),
    interest_work_subcategory_ids: stringArray(safe.interest_work_subcategory_ids),
    source_partner_id: typeof safe.source_partner_id === "string" ? safe.source_partner_id : undefined,
    source_partner_name: typeof safe.source_partner_name === "string" ? safe.source_partner_name : undefined,
    notes: typeof safe.notes === "string" ? safe.notes : undefined,
    created_at: String(safe.created_at || ""),
    updated_at: String(safe.updated_at || ""),
  };
}
