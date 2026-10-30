import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";
const sql = (p: string) => readFileSync(p, "utf8");
const migration = (s: string) => sql(`supabase/migrations/${readdirSync("supabase/migrations").find(n => n.endsWith(s))}`);

test("one stored capability source, no writable counters, unit integrity and current-data rollback", async () => {
 const db = new PGlite();
 try {
  await db.exec(sql("tests/fixtures/shared-domain-before-expansion.sql"));
  for (const suffix of ["_shared_domain_expansion.sql", "_shared_domain_foreign_keys.sql", "_shared_domain_index_cleanup.sql", "_shared_domain_connections.sql", "_shared_business_keys.sql"]) await db.exec(migration(suffix));
  await db.exec(`INSERT INTO entity_master_units(id,workspace_id,data) VALUES ('unit','canonical-test','{"id":"unit","name":"Unit"}'),('rate-unit','canonical-test','{"id":"rate-unit","name":"Rate Unit"}');`);
  await db.exec(`INSERT INTO entity_work_definitions(collection,id,workspace_id,data) VALUES ('master.workCategories','cat','canonical-test','{"id":"cat","name":"Category"}');`);
  await db.exec(`INSERT INTO entity_work_definitions(collection,id,workspace_id,data) VALUES ('master.workSubcategories','sub','canonical-test','{"id":"sub","name":"Canonical Work","category_id":"cat","category_ids":["cat"],"unit_id":"unit","work_types":[{"id":"type","name":"Canonical Type","unit_id":"unit"}]}');`);
  const contractor = { id:"contractor", name:"Canonical", outstanding:999, active_jobs:88, work_capabilities:[{subcategory_id:"sub",subcategory_name:"Work",work_type_rates:[{work_type_id:"type",work_type_name:"Type",unit_id:"rate-unit",material_rate:10,labour_rate:5}]}] };
  // Old commit behavior materializes rates and inflated independent counters.
  await db.query("SELECT commit_workspace_operations($1,0,$2::jsonb)", ["canonical-test",JSON.stringify([{collection:"master.contractors",table:"entity_master_contractors",upsert:[contractor]}])]);
  const before = (await db.query<{data:Record<string,unknown>}>("SELECT data FROM entity_rate_cards WHERE collection='master.contractorRates' AND workspace_id='canonical-test'")).rows;
  expect(before).toHaveLength(1);
  await db.exec(migration("_canonical_partner_sources.sql"));
  const read=(await db.query<{data:Record<string,unknown>}>("SELECT data FROM entity_contractor_rate_read WHERE workspace_id='canonical-test'")).rows;
  expect(read[0].data).toMatchObject({...before[0].data as object,trade:'Canonical Work · Canonical Type',work_subcategory_name:'Canonical Work',work_type_name:'Canonical Type'});
  await db.exec(`UPDATE entity_work_definitions SET data=jsonb_set(data,'{name}','"Renamed work"') WHERE workspace_id='canonical-test' AND id='sub' AND collection='master.workSubcategories'`);
  expect((await db.query<{trade:string}>("SELECT data->>'trade' trade FROM entity_contractor_rate_read WHERE workspace_id='canonical-test'")).rows[0].trade).toBe('Renamed work · Canonical Type');
  expect((await db.query("SELECT * FROM entity_rate_cards WHERE collection='master.contractorRates'")).rows).toHaveLength(0);
  expect((await db.query<{data:Record<string,unknown>}>("SELECT data FROM entity_master_contractors WHERE workspace_id='canonical-test'")).rows[0].data).not.toHaveProperty("outstanding");
  const revision = (await db.query<{revision:number}>("SELECT revision FROM entity_workspace_revision WHERE id='canonical-test'")).rows[0].revision;
  const updated = structuredClone(contractor); updated.work_capabilities[0].work_type_rates[0].labour_rate=20;
  await db.query("SELECT commit_workspace_operations($1,$2,$3::jsonb)",["canonical-test",revision,JSON.stringify([{collection:"master.contractors",table:"entity_master_contractors",upsert:[updated]},{collection:"master.contractorRates",table:"entity_contractor_rate_read",upsert:[{id:"forged",rate:99999}]}])]);
  expect((await db.query<{rate:string}>("SELECT data->>'rate' rate FROM entity_contractor_rate_read WHERE workspace_id='canonical-test'")).rows[0].rate).toBe("30");
  const parent = (await db.query<{data:Record<string,unknown>}>("SELECT data FROM entity_master_contractors WHERE workspace_id='canonical-test'")).rows[0].data;
  expect(parent).not.toHaveProperty("active_jobs"); expect(parent).not.toHaveProperty("outstanding");
  await expect(db.exec(`UPDATE entity_master_contractors SET data=data || '{"outstanding":9}' WHERE workspace_id='canonical-test'`)).rejects.toMatchObject({code:"23514"});
  await expect(db.exec(`DELETE FROM entity_master_units WHERE workspace_id='canonical-test' AND id='rate-unit'`)).rejects.toMatchObject({code:"23503"});
  await expect(db.exec(`UPDATE entity_master_contractors SET data=jsonb_set(data,'{work_capabilities,0,work_type_rates,0,unit_id}','"missing"') WHERE workspace_id='canonical-test'`)).rejects.toMatchObject({code:"23503"});
  expect((await db.query("SELECT * FROM entity_contractor_rate_read WHERE workspace_id='other'")).rows).toHaveLength(0);
  const journal = (await db.query<{operations:Array<{collection:string;upsert?:Array<Record<string,unknown>>}>}>("SELECT operations FROM entity_workspace_change_batches WHERE workspace_id='canonical-test' ORDER BY revision DESC LIMIT 1")).rows[0].operations;
  expect(journal.some(op=>op.collection==='master.contractorRates')).toBe(false);
  expect(journal.find(op=>op.collection==='master.contractors')?.upsert?.[0]).not.toHaveProperty('outstanding');
  await db.exec(sql("supabase/rollback/canonical_partner_sources.sql"));
  expect((await db.query<{rate:string}>("SELECT data->>'rate' rate FROM entity_rate_cards WHERE workspace_id='canonical-test' AND collection='master.contractorRates'")).rows[0].rate).toBe("30");
  await db.exec(migration("_canonical_partner_sources.sql"));
  expect((await db.query<{rate:string}>("SELECT data->>'rate' rate FROM entity_contractor_rate_read WHERE workspace_id='canonical-test'")).rows[0].rate).toBe("30");
 } finally { await db.close(); }
},120000);
