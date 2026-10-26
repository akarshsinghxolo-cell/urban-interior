import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FOREIGN_KEYS } from "../src/lib/rdash/integrity/fk-registry";
import { COLLECTION_TO_TABLE } from "../src/lib/rdash/shared-domain-storage";
import { collectionMapping, constraints, databaseReferences, foreignKeyFingerprints } from "./support/postgres-reference-audit";

const sql = (path: string) => readFileSync(path, "utf8");
const migration = (suffix: string) => sql(`supabase/migrations/${readdirSync("supabase/migrations").find((name) => name.endsWith(suffix))}`);
const key = (rule: { collection: string; field: string; targetCollection: string }) => `${rule.collection}.${rule.field}->${rule.targetCollection}`;

describe("shared domain migrations against PostgreSQL", () => {
  test("preserves every existing FK and enforces every registered scalar relationship", async () => {
    const db = new PGlite();
    try {
      await db.exec(sql("tests/fixtures/shared-domain-before-expansion.sql"));
      const originalConstraints = await constraints(db);
      const originalReferences = await databaseReferences(db);
      const originalFingerprints = await foreignKeyFingerprints(db);
      const originalForeignKeys = originalConstraints.filter((constraint) => constraint.type === "f");
      expect(originalForeignKeys).toHaveLength(97);
      await db.exec(migration("_shared_domain_expansion.sql"));
      const expansionConstraints = await constraints(db);
      const expandedReferences = await databaseReferences(db);
      expect(new Set(expandedReferences.map(key))).toEqual(new Set(originalReferences.map(key)));
      expect((await constraints(db)).filter((constraint) => constraint.type === "f")).toHaveLength(97);
      expect(await foreignKeyFingerprints(db)).toEqual(originalFingerprints);

      await db.exec(migration("_shared_domain_foreign_keys.sql"));
      const hardened = await databaseReferences(db);
      const registeredScalars = FOREIGN_KEYS.filter((rule) => !rule.isArray && rule.onDelete !== "ignore"
        && COLLECTION_TO_TABLE[rule.collection] && COLLECTION_TO_TABLE[rule.targetCollection]);
      expect(registeredScalars).toHaveLength(229);
      const enforced = new Set(hardened.filter((reference) => reference.scoped && reference.validated).map(key));
      expect(registeredScalars.filter((rule) => !enforced.has(key(rule)))).toEqual([]);
      expect(hardened.filter((reference) => !reference.scoped || !reference.validated)).toEqual([]);
      const unindexed = await db.query<{ name: string }>(`SELECT fk.conname AS name FROM pg_constraint fk
        WHERE fk.contype='f' AND fk.conname LIKE 'fk_%' AND NOT EXISTS (
          SELECT FROM pg_index i WHERE i.indrelid=fk.conrelid AND i.indisvalid AND i.indpred IS NULL
          AND ARRAY(SELECT attribute FROM unnest(i.indkey) WITH ORDINALITY k(attribute,position)
            WHERE position<=array_length(fk.conkey,1) ORDER BY attribute)
            = ARRAY(SELECT attribute FROM unnest(fk.conkey) attribute ORDER BY attribute))`);
      expect(unindexed.rows).toEqual([]);
      expect(await collectionMapping(db)).toEqual(COLLECTION_TO_TABLE);
      const count = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'");
      expect(count.rows[0].count).toBe(52);

      for (const pack of ["shared-domain-storage.sql", "shared-domain-expansion.sql", "shared-domain-foreign-keys.sql"]) {
        await db.exec(sql(`supabase/tests/${pack}`));
      }

      // Rollback must use current rows, including writes made after migration.
      await db.exec(`SELECT commit_workspace_operations('rollback-review',0,'[
        {"collection":"master.storageFolderTemplates","table":"entity_storage_structure","upsert":[{"id":"post-release-template","purpose":"general"}]}
      ]'::jsonb)`);
      await db.exec(sql("supabase/rollback/shared_domain_foreign_keys.sql"));
      expect((await constraints(db)).filter((constraint) => constraint.type === "f").map((constraint) => [constraint.name, constraint.definition]).sort())
        .toEqual(expansionConstraints.filter((constraint) => constraint.type === "f").map((constraint) => [constraint.name, constraint.definition]).sort());
      await db.exec(sql("supabase/rollback/shared_domain_expansion.sql"));
      expect((await constraints(db)).filter((constraint) => constraint.type === "f").map((constraint) => [constraint.name, constraint.definition]).sort())
        .toEqual(originalForeignKeys.map((constraint) => [constraint.name, constraint.definition]).sort());
      expect((await db.query(`SELECT id FROM public."entity_master_storageFolderTemplates" WHERE id='post-release-template'`)).rows).toHaveLength(1);

      await db.exec(migration("_shared_domain_expansion.sql"));
      await db.exec(migration("_shared_domain_foreign_keys.sql"));
      expect((await db.query(`SELECT id FROM entity_storage_structure WHERE collection='master.storageFolderTemplates' AND id='post-release-template'`)).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 60_000);
});
