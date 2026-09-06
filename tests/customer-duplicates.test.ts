import { describe, expect, test } from "vitest";
import {
  collectCustomerIdentityDuplicateGroups,
} from "../src/lib/rdash/server/customer-duplicates";
import { normalizeEmail, normalizePhone } from "../src/lib/rdash/customer-identity";
import { expectNoTokens, expectTokens, readSrc } from "./helpers/source-contract";
import type { Customer } from "../src/lib/rdash/types";

/**
 * Task 36-b: duplicate customer identities are now impossible to CREATE while
 * the DB unique indexes exist (entity_customers_phone_uidx /
 * entity_customers_email_uidx mirror normalizePhone/normalizeEmail). This
 * report audits whatever predates the indexes. The grouping must use the very
 * same normalizers the indexes and the UI use — one identity, one definition.
 */

let sequence = 0;

function customer(overrides: Partial<Customer> = {}): Customer {
  sequence += 1;
  return {
    id: `cust-${sequence}`,
    name: `Customer ${sequence}`,
    phone: "",
    status: "active",
    created_at: new Date(Date.UTC(2026, 0, sequence)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, sequence)).toISOString(),
    ...overrides,
  };
}

describe("customer identity normalizers (must stay in sync with the DB function)", () => {
  test("phone: digits only, 00/91/0 prefixes stripped", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("00919876543210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("not-a-phone")).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });

  test("email: trimmed and lowercased", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("collectCustomerIdentityDuplicateGroups", () => {
  test("finds duplicates across formatting variants and reports the earliest first", () => {
    const groups = collectCustomerIdentityDuplicateGroups([
      customer({ name: "A", phone: "+91 98765 43210" }),
      customer({ name: "B", phone: "9876543210" }),
      customer({ name: "C", phone: "09876543210" }),
      customer({ name: "D", phone: "1111122222" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("phone");
    expect(groups[0].normalized).toBe("9876543210");
    expect(groups[0].members.map((member) => member.name)).toEqual(["A", "B", "C"]);
    expect(groups[0].members.every((member) => member.fields.join() === "phone")).toBe(true);
  });

  test("groups email duplicates case-insensitively", () => {
    const groups = collectCustomerIdentityDuplicateGroups([
      customer({ name: "A", phone: "9000000001", email: "Buyer@X.com" }),
      customer({ name: "B", phone: "9000000002", email: "  buyer@x.com " }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("email");
    expect(groups[0].normalized).toBe("buyer@x.com");
  });

  test("matches cross-field identity collisions exactly like the UI guard", () => {
    const groups = collectCustomerIdentityDuplicateGroups([
      customer({ name: "A", phone: "9000000001", whatsapp: "9876543210" }),
      customer({ name: "B", phone: "9000000002", alternate_phone: "+91 98765 43210" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("phone");
    expect(groups[0].normalized).toBe("9876543210");
    expect(groups[0].members.map((member) => member.name)).toEqual(["A", "B"]);
    expect(groups[0].members[0].fields).toEqual(["whatsapp"]);
    expect(groups[0].members[1].fields).toEqual(["alternate_phone"]);
  });

  test("one customer holding the same value in two fields lists both fields once", () => {
    const groups = collectCustomerIdentityDuplicateGroups([
      customer({ name: "A", phone: "9876543210", whatsapp: "+91 98765 43210" }),
      customer({ name: "B", phone: "9876543210" }),
    ]);
    expect(groups).toHaveLength(1);
    const owner = groups[0].members.find((member) => member.name === "A");
    expect(owner?.fields).toEqual(["phone", "whatsapp"]);
  });

  test("one customer appearing in several buckets is reported per kind", () => {
    const shared = { phone: "9876543210", email: "shared@x.com" };
    const groups = collectCustomerIdentityDuplicateGroups([
      customer({ name: "A", ...shared }),
      customer({ name: "B", ...shared }),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(["phone", "email"]);
    expect(groups.every((group) => group.members.length === 2)).toBe(true);
  });

  test("a clean book yields no groups; empty input is safe", () => {
    expect(collectCustomerIdentityDuplicateGroups([
      customer({ phone: "9000000001", email: "a@x.com" }),
      customer({ phone: "9000000002", email: "b@x.com" }),
    ])).toEqual([]);
    expect(collectCustomerIdentityDuplicateGroups([])).toEqual([]);
  });
});

describe("source contract — DB-level uniqueness backstop", () => {
  test("migration creates the phone/email unique indexes with the same normalization", () => {
    const migration = readSrc(
      "supabase/migrations/20260906120000_customer_identity_unique_indexes.sql",
    );
    expectTokens(migration, [
      "create or replace function public.uc_normalize_phone(raw text)",
      "language sql",
      "immutable",
      "create unique index if not exists entity_customers_phone_uidx",
      "on public.entity_customers (workspace_id, public.uc_normalize_phone(data->>'phone'))",
      "create unique index if not exists entity_customers_email_uidx",
      "on public.entity_customers (workspace_id, nullif(lower(btrim(data->>'email')), ''))",
    ]);
  });

  test("the duplicate report route authenticates and reuses the shared grouping", () => {
    const route = readSrc("src/app/api/master/duplicates/route.ts");
    expectTokens(route, [
      "const user = await requireSession(request);",
      "collectCustomerIdentityDuplicateGroups(customers)",
      '"Cache-Control": "no-store"',
    ]);
    expectNoTokens(route, [
      // The report must not fall back to an unscoped read.
      "service_role",
      "SUPABASE_SERVICE_KEY",
    ]);
  });
});
