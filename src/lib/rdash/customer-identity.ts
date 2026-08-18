import type { ID, Customer } from "./types";
export type CustomerIdentityField = "phone" | "whatsapp" | "alternate_phone" | "email";
export interface CustomerIdentityMatch {
    customer: Customer;
    fields: CustomerIdentityField[];
}
export interface CustomerIdentityInput {
    name?: string;
    phone?: string;
    whatsapp?: string;
    alternate_phone?: string;
    email?: string;
}
export class CustomerIdentityConflictError extends Error {
    readonly matches: CustomerIdentityMatch[];
    constructor(matches: CustomerIdentityMatch[]) {
        const summary = matches
            .map((match) => `${match.customer.name} (${match.fields.map(labelForField).join(", ")})`)
            .join("; ");
        super(`A customer with the same contact identity already exists: ${summary}. Open the existing customer and add a Site instead.`);
        this.name = "CustomerIdentityConflictError";
        this.matches = matches;
    }
}
function labelForField(field: CustomerIdentityField) {
    return field === "alternate_phone" ? "alternate phone" : field;
}
export function normalizePhone(value?: string | null) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits)
        return "";
    const withoutInternationalPrefix = digits.startsWith("00") ? digits.slice(2) : digits;
    if (withoutInternationalPrefix.length === 12 && withoutInternationalPrefix.startsWith("91")) {
        return withoutInternationalPrefix.slice(2);
    }
    if (withoutInternationalPrefix.length === 11 && withoutInternationalPrefix.startsWith("0")) {
        return withoutInternationalPrefix.slice(1);
    }
    return withoutInternationalPrefix;
}
export function normalizeEmail(value?: string | null) {
    return String(value || "").trim().toLowerCase();
}
export function normalizeCustomerName(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}
export function customerIdentityValues(input: CustomerIdentityInput) {
    const values: Partial<Record<CustomerIdentityField, string>> = {
        phone: normalizePhone(input.phone),
        whatsapp: normalizePhone(input.whatsapp),
        alternate_phone: normalizePhone(input.alternate_phone),
        email: normalizeEmail(input.email),
    };
    return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value))) as Partial<Record<CustomerIdentityField, string>>;
}
export function findCustomerIdentityMatches(customers: Customer[], candidate: CustomerIdentityInput, options: {
    excludeCustomerId?: ID;
} = {}): CustomerIdentityMatch[] {
    const candidateValues = customerIdentityValues(candidate);
    if (Object.keys(candidateValues).length === 0)
        return [];
    return customers
        .filter((customer) => customer.id !== options.excludeCustomerId)
        .map((customer) => {
        const existingValues = customerIdentityValues(customer);
        const fields = (Object.keys(candidateValues) as CustomerIdentityField[]).filter((candidateField) => {
            const candidateValue = candidateValues[candidateField];
            if (!candidateValue)
                return false;
            return (Object.keys(existingValues) as CustomerIdentityField[]).some((existingField) => existingValues[existingField] === candidateValue);
        });
        return { customer, fields };
    })
        .filter((match) => match.fields.length > 0);
}
export function findSameNameCustomers(customers: Customer[], candidate: CustomerIdentityInput, options: {
    excludeCustomerId?: ID;
} = {}) {
    const normalizedName = normalizeCustomerName(candidate.name);
    if (!normalizedName)
        return [];
    return customers.filter((customer) => customer.id !== options.excludeCustomerId &&
        normalizeCustomerName(customer.name) === normalizedName);
}
export function assertUniqueCustomerIdentity(customers: Customer[], candidate: CustomerIdentityInput, options: {
    excludeCustomerId?: ID;
} = {}) {
    const matches = findCustomerIdentityMatches(customers, candidate, options);
    if (matches.length > 0)
        throw new CustomerIdentityConflictError(matches);
}
