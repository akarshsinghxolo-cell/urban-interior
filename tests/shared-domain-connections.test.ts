import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { COLLECTION_TO_TABLE } from "../src/lib/rdash/shared-domain-storage";
import { FOREIGN_KEYS } from "../src/lib/rdash/integrity/fk-registry";
import { databaseBusinessRuleMessage } from "../src/lib/rdash/server/workspace-db-error";
import { collectionMapping, constraints, databaseReferences, foreignKeyFingerprints } from "./support/postgres-reference-audit";

const sql = (path: string) => readFileSync(path, "utf8");
const migration = (suffix: string) => sql(`supabase/migrations/${readdirSync("supabase/migrations").find((name) => name.endsWith(suffix))}`);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const key = (rule: { collection: string; field: string; targetCollection: string }) => `${rule.collection}.${rule.field}->${rule.targetCollection}`;

async function snapshot(db: PGlite) {
  const mapping = await collectionMapping(db);
  const tables = Object.values(mapping);
  const query = Object.entries(mapping).map(([collection, table]) =>
    `SELECT '${collection}'::text AS collection,id,workspace_id,revision,updated_at,updated_by,data FROM public.${quote(table)}`
    + (tables.filter((other) => other === table).length > 1 ? ` WHERE collection='${collection}'` : "")).join(" UNION ALL ");
  return (await db.query(`SELECT * FROM (${query}) business ORDER BY collection,workspace_id,id`)).rows;
}

test("connects shared project/finance/resource records, preserves all FKs and reverses current rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(sql("tests/fixtures/shared-domain-before-expansion.sql"));
    for (const suffix of ["_shared_domain_expansion.sql", "_shared_domain_foreign_keys.sql", "_shared_domain_index_cleanup.sql"]) {
      await db.exec(migration(suffix));
    }
    const originalGraph = await foreignKeyFingerprints(db);
    const originalConstraints = await constraints(db);
    const indexDefinitions = async () => (await db.query(`SELECT pg_get_indexdef(i.indexrelid) definition FROM pg_index i
      JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY definition`)).rows;
    const originalIndexes = await indexDefinitions();
    expect(originalGraph).toHaveLength(251);
    await db.exec(migration("_shared_domain_connections.sql"));
    expect(await foreignKeyFingerprints(db)).toEqual(originalGraph);
    expect(await collectionMapping(db)).toEqual(COLLECTION_TO_TABLE);
    expect((await db.query<{ count: number }>("SELECT count(*)::integer count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].count).toBe(47);
    await db.exec(migration("_shared_business_keys.sql"));
    expect((await constraints(db)).filter((c) => c.type === "f")).toHaveLength(254);
    const duplicateIndexes = await db.query(`SELECT t.relname, array_agg(x.relname) indexes FROM pg_index i
      JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' GROUP BY t.relname,i.indkey,i.indclass,i.indcollation,i.indoption,i.indisunique,i.indexprs::text,i.indpred::text
      HAVING count(*)>1`);
    expect(duplicateIndexes.rows).toEqual([]);
    const references = await databaseReferences(db);
    const covered = new Set(references.filter((r) => r.scoped && r.validated).map(key));
    const persisted = FOREIGN_KEYS.filter((r) => !r.isArray && r.onDelete !== "ignore" && COLLECTION_TO_TABLE[r.collection] && COLLECTION_TO_TABLE[r.targetCollection]);
    expect(persisted.filter((r) => !covered.has(key(r)))).toEqual([]);
    await db.exec(sql("supabase/tests/shared-domain-connections.sql"));

    // New writes and identical IDs in different logical kinds survive reversal.
    await db.exec(`INSERT INTO entity_customers(id,workspace_id,data) VALUES ('post-customer','connections-review','{"id":"post-customer","name":"Post-release customer"}');
      INSERT INTO entity_sites(id,workspace_id,data) VALUES ('post-site','connections-review','{"id":"post-site","customer_id":"post-customer"}');`);
    const sharedId = "same-project-id";
    const work = { id: sharedId, customer_id: "post-customer", site_id: "post-site", title: "Original requirement", work_subcategory_ids: [], work_type_ids: [], area_ids: [], status: "new", priority: "medium" };
    const order = { id: sharedId, customer_id: "post-customer", site_id: "post-site", title: "Original order", work_order_no: "WO-CONNECTIONS", status: "scheduled", value: 100, accepted_scope_ids: [], work_required_ids: [], quotation_ids: [], area_ids: [] };
    await db.query("SELECT commit_workspace_operations($1,0,$2::jsonb)", ["connections-review", JSON.stringify([
      { collection: "workRequired", table: "entity_project_work", upsert: [work] },
      { collection: "workOrders", table: "entity_project_work", upsert: [order] },
    ])]);
    await db.query("SELECT commit_workspace_operations($1,1,$2::jsonb,$3::jsonb)", ["connections-review", JSON.stringify([
      { collection: "workRequired", table: "entity_project_work", upsert: [{ ...work, title: "Updated requirement" }] },
    ]), JSON.stringify({ [`workRequired:${sharedId}`]: 0 })]);
    expect((await db.query<{ data: typeof order }>("SELECT data FROM entity_project_work WHERE collection='workOrders' AND id=$1", [sharedId])).rows[0].data.title).toBe("Original order");
    await db.exec(`INSERT INTO entity_catalogue_items(collection,id,workspace_id,data) VALUES
      ('master.articles','race-original','connections-review','{"id":"race-original","name":"Shared material"}');`);
    const beforeRejectedSave = await snapshot(db);
    let rejected: { code?: string; message?: string } | undefined;
    try {
      await db.query("SELECT commit_workspace_operations($1,2,$2::jsonb)", ["connections-review", JSON.stringify([
        { collection: "payments", table: "entity_financial_documents", upsert: [{ id: "must-rollback", customer_id: "post-customer", site_id: "post-site", amount: 10, status: "pending" }] },
        { collection: "master.articles", table: "entity_catalogue_items", upsert: [{ id: "race-duplicate", name: " SHARED   MATERIAL " }] },
      ])]);
    } catch (error) { rejected = error as typeof rejected; }
    expect(rejected?.code).toBe("23505");
    if (!rejected) throw new Error("The duplicate Article save unexpectedly succeeded");
    expect(databaseBusinessRuleMessage(rejected)).toBe("An Article with this name already exists. Use the existing Article.");
    expect(await snapshot(db)).toEqual(beforeRejectedSave);
    expect((await db.query<{ revision: number }>("SELECT revision FROM entity_workspace_revision WHERE id='connections-review'")).rows[0].revision).toBe(2);
    expect((await db.query("SELECT * FROM entity_workspace_change_batches WHERE workspace_id='connections-review'")).rows).toHaveLength(2);

    const beforeRollback = await snapshot(db);
    await db.exec(sql("supabase/rollback/shared_business_keys.sql"));
    await db.exec(sql("supabase/rollback/shared_domain_connections.sql"));
    expect(await snapshot(db)).toEqual(beforeRollback);
    expect(await indexDefinitions()).toEqual(originalIndexes);
    expect((await constraints(db)).filter((c) => c.type === "f").map((c) => [c.table,c.name,c.definition]).sort())
      .toEqual(originalConstraints.filter((c) => c.type === "f").map((c) => [c.table,c.name,c.definition]).sort());
    await db.exec(migration("_shared_domain_connections.sql"));
    await db.exec(migration("_shared_business_keys.sql"));
    expect(await snapshot(db)).toEqual(beforeRollback);
    expect(await collectionMapping(db)).toEqual(COLLECTION_TO_TABLE);
  } finally { await db.close(); }
}, 90_000);
