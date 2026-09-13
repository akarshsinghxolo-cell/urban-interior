import type { Customer, ID, RDashDatabase } from "./types";

export type CustomerReferrerType = "customer" | "contractor" | "vendor" | "source_partner" | "external";

export type CustomerReferrerFields = {
  referrer_type?: CustomerReferrerType;
  referrer_id?: ID;
  referrer_name?: string;
};

export type CustomerRecord = Customer & CustomerReferrerFields;

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

/**
 * Reads the canonical referrer fields. The source_partner fallback is only a
 * compatibility bridge for snapshots created before the referrer migration;
 * new writes should always carry referrer_* fields.
 */
export function customerReferrer(customer: Customer | CustomerRecord): CustomerReferrerFields {
  const raw = customer as CustomerRecord;
  if (isCustomerReferrerType(raw.referrer_type)) {
    return {
      referrer_type: raw.referrer_type,
      referrer_id: raw.referrer_id || undefined,
      referrer_name: raw.referrer_name?.trim() || undefined,
    };
  }

  if (customer.source_partner_id) {
    return {
      referrer_type: "source_partner",
      referrer_id: customer.source_partner_id,
      referrer_name: customer.source_partner_name?.trim() || undefined,
    };
  }

  if (customer.source_partner_name?.trim()) {
    return {
      referrer_type: "external",
      referrer_name: customer.source_partner_name.trim(),
    };
  }

  return {};
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

export function referrerExists(db: RDashDatabase, referrer: CustomerReferrerFields): boolean {
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
 * source_partner_* remains a commission-specific compatibility projection.
 * It is populated only when the generic referrer is actually a Source Partner.
 */
export function sourcePartnerProjection(referrer: CustomerReferrerFields): Pick<Customer, "source_partner_id" | "source_partner_name"> {
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
