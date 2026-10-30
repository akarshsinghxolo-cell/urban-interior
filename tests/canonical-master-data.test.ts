import { expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { attachWorkspaceDerivedFields, canonicalMasterRow } from "../src/lib/rdash/canonical-master-data";
import { diffWorkspaceOperations } from "../src/lib/rdash/workspace-operations";
import { aggregateWorkspaceChangeBatches } from "../src/lib/rdash/server/workspace-changes";

function fixture() {
 const db=buildSeedDatabase();
 db.master.workSubcategories=[{id:'sub',name:'Work',unit_id:'sqft',work_types:[{id:'type',name:'Type',unit_id:'sqft'}]}] as never;
 db.master.contractors=[{id:'c',name:'Contractor',work_capabilities:[{subcategory_id:'sub',subcategory_name:'Work',work_type_rates:[{work_type_id:'type',work_type_name:'Type',unit_id:'sqft',material_rate:10,labour_rate:20}]}]}] as never;
 db.master.contractorRates=[{id:'crate-c-sub-type',contractor_id:'c',rate:30,work_subcategory_id:'sub',work_type_id:'type'}] as never;
 return db;
}

test("derived counters and rate drift never become independent writes", () => {
 const base=fixture(); const edited=structuredClone(base);
 edited.master.contractorRates[0].rate=999999;
 expect(diffWorkspaceOperations(base,edited).some(op=>op.collection==='master.contractorRates')).toBe(false);
 expect(canonicalMasterRow('master.contractors',{id:'c',outstanding:99,active_jobs:88,name:'Name'})).toEqual({id:'c',name:'Name'});
 expect(canonicalMasterRow('master.vendors',{id:'v',outstanding:99})).toEqual({id:'v'});
});

test("hydration derives rates from capabilities and current Customer labels", () => {
 const db=fixture();
 const contractor=db.master.contractors.find(c=>c.work_capabilities?.some(cap=>cap.work_type_rates?.length));
 if(!contractor) throw Error('Seed must contain capabilities');
 const rate=contractor.work_capabilities![0].work_type_rates![0]; rate.material_rate=4321; rate.labour_rate=123;
 contractor.outstanding=999; contractor.active_jobs=999;
 attachWorkspaceDerivedFields(db);
 expect(contractor.outstanding).toBe(999); // Caller reference is not mutated.
 expect(db.master.contractors.find(c=>c.id===contractor.id)).not.toHaveProperty('outstanding');
 expect(db.master.contractorRates.find(r=>r.contractor_id===contractor.id && r.work_type_id===rate.work_type_id)?.rate).toBe(4444);
});

test("canonical parent changes invalidate loaded virtual rates even when parent is loaded", () => {
 const delta=aggregateWorkspaceChangeBatches({afterRevision:1,currentRevision:2,baselineRevision:0,
  allowedCollections:new Set(['master.contractors','master.contractorRates']),
  batches:[{revision:2,operations:[{collection:'master.contractors',upsert:[{id:'c'}]}],row_versions:{}}] as never});
 expect(delta).toMatchObject({requiresFullReload:true,reason:'projection_changed'});
});
