import type { Customer, CustomerReferrerType, ID, Master } from "./types";

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
