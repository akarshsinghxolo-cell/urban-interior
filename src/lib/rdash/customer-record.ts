import type { Customer } from "./types";
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
    .replace(/\s+/g, " ")
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
