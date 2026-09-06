import type { Customer } from "@/lib/rdash/types";
import { normalizeEmail, normalizePhone } from "@/lib/rdash/customer-identity";

/**
 * Historical duplicate customer contact identities inside one workspace.
 *
 * Semantics mirror the UI guard exactly (customer-identity.ts
 * findCustomerIdentityMatches): the phone family (phone, whatsapp,
 * alternate_phone) shares one normalized value space, so a phone value that
 * appears as one customer's whatsapp and another customer's alternate_phone
 * is the same identity collision. Email lives in its own space.
 *
 * New same-field duplicates are impossible while the DB unique indexes exist
 * (entity_customers_phone_uidx / entity_customers_email_uidx). Cross-field
 * collisions cannot be expressed as a single jsonb unique index — this report
 * is the audit surface for those. Pure and synchronous so it stays unit
 * testable and cheap on the in-memory workspace snapshot.
 */

export type CustomerIdentityField = "phone" | "whatsapp" | "alternate_phone" | "email";

export interface CustomerDuplicateMember {
    id: string;
    name: string;
    phone: string;
    whatsapp: string;
    alternatePhone: string;
    email: string;
    createdAt: string;
    /** Which of this customer's identity fields hold the duplicated value. */
    fields: CustomerIdentityField[];
}

export interface CustomerDuplicateGroup {
    /** "phone" = phone-family collision, "email" = email collision. */
    kind: "phone" | "email";
    normalized: string;
    members: CustomerDuplicateMember[];
}

const PHONE_FIELDS: CustomerIdentityField[] = ["phone", "whatsapp", "alternate_phone"];

interface Bucket {
    kind: "phone" | "email";
    normalized: string;
    members: Map<string, CustomerDuplicateMember>;
}

function memberOf(customer: Customer, fields: CustomerIdentityField[]): CustomerDuplicateMember {
    return {
        id: String(customer.id || ""),
        name: customer.name || "",
        phone: customer.phone || "",
        whatsapp: customer.whatsapp || "",
        alternatePhone: customer.alternate_phone || "",
        email: customer.email || "",
        createdAt: customer.created_at || "",
        fields,
    };
}

export function collectCustomerIdentityDuplicateGroups(customers: Customer[]): CustomerDuplicateGroup[] {
    const buckets = new Map<string, Bucket>();
    const record = (key: string, bucket: Bucket) => {
        const existing = buckets.get(key);
        if (existing) return existing;
        buckets.set(key, bucket);
        return bucket;
    };

    for (const customer of customers) {
        const customerId = String(customer.id || "");
        // Phone family: one shared value space, exactly like the UI guard.
        for (const field of PHONE_FIELDS) {
            const normalized = normalizePhone(customer[field]);
            if (!normalized) continue;
            const bucket = record(`phone:${normalized}`, {
                kind: "phone",
                normalized,
                members: new Map(),
            });
            const existing = bucket.members.get(customerId);
            if (existing) existing.fields.push(field);
            else bucket.members.set(customerId, memberOf(customer, [field]));
        }
        const email = normalizeEmail(customer.email);
        if (email) {
            const bucket = record(`email:${email}`, {
                kind: "email",
                normalized: email,
                members: new Map(),
            });
            if (!bucket.members.has(customerId)) {
                bucket.members.set(customerId, memberOf(customer, ["email"]));
            }
        }
    }

    return [...buckets.values()]
        .filter((bucket) => bucket.members.size > 1)
        .map((bucket) => ({
            kind: bucket.kind,
            normalized: bucket.normalized,
            members: [...bucket.members.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }))
        .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "phone" ? -1 : 1;
            return b.members.length - a.members.length;
        });
}
