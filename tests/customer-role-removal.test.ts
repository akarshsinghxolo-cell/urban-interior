import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalizeCustomerRow, normalizeCustomerRow } from "../src/lib/rdash/customer-record";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { applyCustomerWithSitesSave } from "../src/lib/rdash/customer-sites-save";

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const removedField = ["customer", "segments"].join("_");
const removedType = ["Customer", "Segment"].join("");
const removedConstants = [["DEFAULT_CUSTOMER", "SEGMENTS"].join("_"), ["CUSTOMER", "SEGMENTS"].join("_")];
const removedValues = [
  ["walk", "in"].join("_"),
  ["service", "customer"].join("_"),
  ["product", "buyer"].join("_"),
  ["repeat", "customer"].join("_"),
  ["trade", "customer"].join("_"),
];
const removedUiLabel = ["Customer", "roles"].join(" ");

describe("Customer Roles removal", () => {
  test("active application source has no Customer Roles model, defaults, values, or UI", async () => {
    const banned = [removedField, removedType, ...removedConstants, ...removedValues, removedUiLabel];
    for (const path of await sourceFiles("src")) {
      const text = await readFile(path, "utf8");
      for (const token of banned) expect(text, `${path} still contains ${token}`).not.toContain(token);
    }
  });

  test("Data Import counts all Customers rather than a removed role subset", async () => {
    const text = await readFile("src/components/rdash/modules/DataImportModule.tsx", "utf8");
    expect(text).toContain('label="Existing customers"');
    expect(text).toContain("value={db.customers.length}");
  });

  test("canonical Customer rows discard unknown stale-client fields", () => {
    const input: Record<string, unknown> = {
      id: "cust-1",
      name: "Customer",
      phone: "9876543210",
      status: "active",
      created_at: "2026-08-18T00:00:00.000Z",
      updated_at: "2026-08-18T00:00:00.000Z",
      [removedField]: ["obsolete"],
      unrelated_unknown_key: "drop-me",
    };
    const canonical = canonicalizeCustomerRow(input);
    expect(canonical).not.toHaveProperty(removedField);
    expect(canonical).not.toHaveProperty("unrelated_unknown_key");
    expect(normalizeCustomerRow(input)).not.toHaveProperty(removedField);
  });

  test("Customer save transformation cannot persist the removed field from an old caller", () => {
    const db = structuredClone(buildSeedDatabase());
    db.customers = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: {
        id: "cust-old-caller",
        name: "Old caller",
        phone: "9876543210",
        status: "active",
        [removedField]: ["obsolete"],
      } as never,
    }, { now: "2026-08-18T00:00:00.000Z" });
    expect(result.db.customers[0]).not.toHaveProperty(removedField);
  });
});
