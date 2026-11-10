import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";

const migration = (suffix: string) => readFileSync(`supabase/migrations/${readdirSync("supabase/migrations").find((name) => name.endsWith(suffix))}`, "utf8");

test("taxonomy deletion checks final references atomically, preserving the guard and audit history", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/shared-domain-before-expansion.sql", "utf8"));
    for (const suffix of ["_shared_domain_expansion.sql", "_shared_domain_foreign_keys.sql", "_shared_domain_index_cleanup.sql", "_shared_domain_connections.sql", "_shared_business_keys.sql", "_canonical_partner_sources.sql", "_atomic_taxonomy_deletion.sql"]) await db.exec(migration(suffix));
    await db.exec(`
      INSERT INTO entity_master_units(id,workspace_id,data) VALUES ('unit','taxonomy-test','{"id":"unit","name":"Unit"}');
      INSERT INTO entity_work_definitions(collection,id,workspace_id,data) VALUES ('master.workCategories','cat','taxonomy-test','{"id":"cat","name":"Category"}');
      INSERT INTO entity_work_definitions(collection,id,workspace_id,data) VALUES ('master.workSubcategories','sub','taxonomy-test','{"id":"sub","name":"Service","category_id":"cat","unit_id":"unit","work_types":[{"id":"old","name":"Old","unit_id":"unit"},{"id":"premium","name":"Premium","unit_id":"unit"}]}');
      INSERT INTO entity_master_contractors(id,workspace_id,data) VALUES ('contractor','taxonomy-test','{"id":"contractor","name":"Contractor","work_capabilities":[{"subcategory_id":"sub","work_type_rates":[{"work_type_id":"old","unit_id":"unit","labour_rate":17}]}]}');
      INSERT INTO "entity_auditLog"(id,workspace_id,data) VALUES ('history','taxonomy-test','{"id":"history","entity_id":"sub","before":{"work_type_id":"old"}}');
    `);
    const removeType = `UPDATE entity_work_definitions SET data=jsonb_set(data,'{work_types}','[{"id":"premium","name":"Premium","unit_id":"unit"}]') WHERE workspace_id='taxonomy-test' AND id='sub'`;
    await expect(db.exec(removeType)).rejects.toMatchObject({ code: "23503" });
    expect((await db.query<{ count: number }>(`SELECT jsonb_array_length(data->'work_types') count FROM entity_work_definitions WHERE workspace_id='taxonomy-test' AND id='sub'`)).rows[0].count).toBe(2);
    await db.exec(`BEGIN; ${removeType}; UPDATE entity_master_contractors SET data=jsonb_set(data,'{work_capabilities,0,work_type_rates,0,work_type_id}','"premium"') WHERE workspace_id='taxonomy-test'; COMMIT;`);
    expect((await db.query<{ rate: string }>(`SELECT data#>>'{work_capabilities,0,work_type_rates,0,labour_rate}' rate FROM entity_master_contractors WHERE workspace_id='taxonomy-test'`)).rows[0].rate).toBe("17");
    await expect(db.exec(`DELETE FROM entity_work_definitions WHERE workspace_id='taxonomy-test' AND id='sub'`)).rejects.toMatchObject({ code: "23503" });
    await db.exec(`BEGIN; DELETE FROM entity_work_definitions WHERE workspace_id='taxonomy-test' AND id='sub'; UPDATE entity_master_contractors SET data=jsonb_set(data,'{work_capabilities}','[]') WHERE workspace_id='taxonomy-test'; COMMIT;`);
    expect((await db.query(`SELECT * FROM entity_work_definitions WHERE workspace_id='taxonomy-test' AND id='sub'`)).rows).toHaveLength(0);
    expect((await db.query(`SELECT * FROM "entity_auditLog" WHERE workspace_id='taxonomy-test' AND id='history'`)).rows).toHaveLength(1);
    expect((await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('anon','public.uc_taxonomy_reference_table(text,text,regclass,text,text)','EXECUTE') allowed`)).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 60000);
