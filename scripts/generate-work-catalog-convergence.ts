import { readFileSync, writeFileSync } from "node:fs";
import { buildWorkCategoryCatalog, WORK_CATALOG_VERSION } from "../src/lib/rdash/work-category-master";

const migrationPath = "supabase/migrations/20260801153000_persist_work_catalog_master.sql";
const commitRestPath = "src/lib/rdash/server/commit-rest.ts";

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotedTable(table: string) {
  return `public."${table.replaceAll('"', '""')}"`;
}

function seedStatement(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const values = rows.map((row) => {
    const id = String(row.id || "").trim();
    if (!id) throw new Error(`Missing id while generating ${table}.`);
    return `(${sqlString(id)}, ${sqlString(JSON.stringify(row))}::jsonb)`;
  }).join(",\n      ");
  const target = quotedTable(table);
  return `insert into ${target} (id, workspace_id, revision, updated_at, updated_by, data)\nselect seed.id, ws.workspace_id, 0, now(), 'work-catalog-seed', seed.data\nfrom public.entity_workspace_revision ws\ncross join (\n  values\n      ${values}\n) as seed(id, data)\non conflict (id) do update set\n  workspace_id = excluded.workspace_id,\n  revision = ${target}.revision + 1,\n  updated_at = excluded.updated_at,\n  updated_by = excluded.updated_by,\n  -- Existing persisted values win; bundled catalog only fills missing canonical fields.\n  data = excluded.data || ${target}.data;`;
}

const catalog = buildWorkCategoryCatalog();
const sections = [
  seedStatement("entity_master_units", catalog.units as unknown as Array<Record<string, unknown>>),
  seedStatement("entity_master_workCategories", catalog.workCategories as unknown as Array<Record<string, unknown>>),
  seedStatement("entity_master_workSubcategories", catalog.workSubcategories as unknown as Array<Record<string, unknown>>),
  seedStatement("entity_master_articles", catalog.articles as unknown as Array<Record<string, unknown>>),
  seedStatement("entity_master_subcategoryArticleMap", catalog.subcategoryArticleMap as unknown as Array<Record<string, unknown>>),
].filter(Boolean).join("\n\n");

const migration = `-- Persist the bundled Urban Castle work catalog into the canonical Supabase\n-- master tables. Runtime reads must use these rows rather than silently replacing\n-- them from bundled JSON. Existing persisted fields win on conflict so custom\n-- names/rates/metadata already entered in Supabase are preserved.\n\nbegin;\n\n${sections}\n\n-- These writes occur as a migration rather than a normal workspace operation.\n-- Advance each workspace once and make that revision the fresh delta baseline,\n-- forcing already-open clients to do one safe reload into the persisted catalog.\ndo $catalog_baseline$\ndeclare\n  v_row record;\n  v_next_revision integer;\nbegin\n  for v_row in\n    select id, workspace_id, revision\n      from public.entity_workspace_revision\n      for update\n  loop\n    v_next_revision := v_row.revision + 1;\n\n    insert into public.entity_workspace_change_batches (\n      workspace_id, revision, operations, row_versions, is_baseline, created_at\n    ) values (\n      v_row.workspace_id, v_next_revision, '[]'::jsonb, '{}'::jsonb, true, now()\n    )\n    on conflict (workspace_id, revision) do update set\n      operations = '[]'::jsonb,\n      row_versions = '{}'::jsonb,\n      is_baseline = true;\n\n    update public.entity_workspace_revision\n       set revision = v_next_revision, updated_at = now()\n     where id = v_row.id;\n  end loop;\nend;\n$catalog_baseline$;\n\ncomment on table public.\"entity_master_workCategories\" is\n  'Canonical persisted work-category master. Bundled JSON is seed/fallback material only.';\ncomment on table public.\"entity_master_workSubcategories\" is\n  'Canonical persisted work-subcategory master. Runtime reads must preserve Supabase rows.';\n\ncommit;\n`;

writeFileSync(migrationPath, migration);

let commitRest = readFileSync(commitRestPath, "utf8");
if (!commitRest.includes('import { WORK_CATALOG_VERSION } from "../work-category-master";')) {
  const anchor = 'import type { RDashDatabase, Master } from "../types";\n';
  if (!commitRest.includes(anchor)) throw new Error("Could not find commit-rest import anchor.");
  commitRest = commitRest.replace(anchor, `${anchor}import { WORK_CATALOG_VERSION } from "../work-category-master";\n`);
}
const masterAnchor = '  const master = data.master as Record<string, unknown>;\n';
const versionLine = '  master.catalog_version = WORK_CATALOG_VERSION;\n';
if (!commitRest.includes(versionLine)) {
  if (!commitRest.includes(masterAnchor)) throw new Error("Could not find emptyWorkspaceData master anchor.");
  commitRest = commitRest.replace(masterAnchor, `${masterAnchor}${versionLine}`);
}
writeFileSync(commitRestPath, commitRest);

console.log(JSON.stringify({
  version: WORK_CATALOG_VERSION,
  units: catalog.units.length,
  categories: catalog.workCategories.length,
  subcategories: catalog.workSubcategories.length,
  articles: catalog.articles.length,
  mappings: catalog.subcategoryArticleMap.length,
  migrationPath,
}, null, 2));
