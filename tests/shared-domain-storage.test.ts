import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { COLLECTION_TO_TABLE, PERSISTED_COLLECTION_TO_TABLE, SHARED_DOMAIN_COLLECTIONS } from "../src/lib/rdash/shared-domain-storage";

const fixture = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
}));

vi.mock("../src/lib/supabase/server", () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let single = false;
      let from = 0, to = Infinity;
      let withCount = false;
      const query = {
        select: (_columns: string, options?: { count?: string }) => { withCount = !!options?.count; return query; },
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        // All selector test rows have the same ID: the collection predicate
        // must isolate them independently of the relationship OR expression.
        or: () => query,
        overrideTypes: () => query,
        order: () => query,
        range: (start: number, end: number) => { from = start; to = end; return query; },
        maybeSingle: () => { single = true; return query; },
        then: (resolve: (result: { data: unknown; error: null }) => unknown) => {
          const rows = (fixture.tables.get(table) || []).filter((row) => filters.every((filter) => filter(row)));
          return Promise.resolve({ data: single ? rows[0] : rows.slice(from, to + 1), count: withCount ? rows.length : null, error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import { getRestWorkspaceSubset } from "../src/lib/rdash/server/commit-rest";
import { getRestWorkspaceBySelectors } from "../src/lib/rdash/server/entity-scoped-rest";
import { rowsFor } from "../src/lib/rdash/server/rows";

beforeEach(() => {
  fixture.tables.clear();
  fixture.tables.set("entity_workspace_revision", [{ id: "default", revision: 10, updated_at: "2026-10-25" }]);
  for (const collections of Object.values(SHARED_DOMAIN_COLLECTIONS)) {
    for (const [index, collection] of collections.entries()) {
      const table = COLLECTION_TO_TABLE[collection];
      fixture.tables.set(table, [...(fixture.tables.get(table) || []),
        { id: "same-id", collection, workspace_id: "default", revision: index, data: { id: "same-id", marker: collection } },
        { id: "same-id", collection, workspace_id: "other", revision: 99, data: { id: "same-id", marker: "other workspace" } },
      ]);
    }
  }
});

describe("shared domain persistence", () => {
  test("module and entity reads include every typed row beyond the default API limit", async () => {
    const collection = "invoices";
    const table = COLLECTION_TO_TABLE[collection];
    fixture.tables.set(table, Array.from({ length: 1251 }, (_, index) => ({
      id: `invoice-${String(index).padStart(5, "0")}`, collection, workspace_id: "default", revision: index,
      data: { id: `invoice-${String(index).padStart(5, "0")}`, amount: 10 },
    })));
    for (const result of [await getRestWorkspaceSubset({ fullCollections: [collection] }),
      await getRestWorkspaceBySelectors({ fullCollections: [collection] })]) {
      expect(rowsFor(result.data, collection)).toHaveLength(1251);
      expect(result.queryCount).toBe(4); // revision + three deterministic pages
      expect(Object.keys(result.rowVersions || {})).toHaveLength(1251);
    }
  });
  test.each(Object.entries(SHARED_DOMAIN_COLLECTIONS))("%s reads preserve kind and workspace isolation", async (_domain, collections) => {
    const collectionNames = [...collections];
    const full = await getRestWorkspaceSubset({ fullCollections: collectionNames });
    const byId = await getRestWorkspaceSubset({ rowsByCollection: Object.fromEntries(collectionNames.map((c) => [c, ["same-id"]])) });
    const selectors = await getRestWorkspaceBySelectors({ rowsByCollection: Object.fromEntries(collectionNames.map((c) => [c, ["same-id"]])) });
    for (const result of [full, byId, selectors]) {
      for (const [index, collection] of collections.entries()) {
        expect(rowsFor(result.data, collection)).toEqual([{ id: "same-id", marker: collection }]);
        expect(result.rowVersions?.[`${collection}:same-id`]).toBe(index);
      }
    }
  });

  test("SQL writes and TypeScript reads agree on every canonical collection", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.endsWith("_shared_domain_connections.sql"));
    if (!file) throw new Error("Shared-domain migration is missing");
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const [collection, table] of Object.entries(PERSISTED_COLLECTION_TO_TABLE)) {
      expect(sql).toContain(`WHEN '${collection}' THEN '${table}'`);
    }
  });

  test("unknown collections fail closed before querying storage", async () => {
    await expect(getRestWorkspaceSubset({ fullCollections: ["master.nonexistent"] })).rejects.toThrow("Unknown workspace collection");
    await expect(getRestWorkspaceBySelectors({ fullCollections: ["uc_whatsapp_auth_state"] })).rejects.toThrow("Unknown workspace collection");
  });
});
