import type { Customer } from "./types";

const CUSTOMER_RECORD_FIELDS = [
  "id",
  "name",
  "phone",
  "whatsapp",
  "alternate_phone",
  "email",
  "status",
  "source_partner_id",
  "source_partner_name",
  "notes",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof Customer)[];


export function canonicalizeCustomerRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of CUSTOMER_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, field)) safe[field] = row[field];
  }
  return safe;
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
    source_partner_id: typeof safe.source_partner_id === "string" ? safe.source_partner_id : undefined,
    source_partner_name: typeof safe.source_partner_name === "string" ? safe.source_partner_name : undefined,
    notes: typeof safe.notes === "string" ? safe.notes : undefined,
    created_at: String(safe.created_at || ""),
    updated_at: String(safe.updated_at || ""),
  };
}
