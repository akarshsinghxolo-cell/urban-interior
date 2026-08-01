import { readFileSync, writeFileSync } from "node:fs";
import { buildWorkCategoryCatalog, WORK_CATALOG_VERSION } from "../src/lib/rdash/work-category-master";

const migrationPath = "supabase/migrations/20260801153000_persist_work_catalog_master.sql";
const commitRestPath = "src/lib/rdash/server/commit-rest.ts";
const typesPath = "src/lib/rdash/types.ts";
const authorizedCommitPath = "src/lib/rdash/server/authorized-commit.ts";
const contractorProfilePath = "src/lib/rdash/contractor-profile.ts";

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

let types = readFileSync(typesPath, "utf8");
const staffAnchor = `export interface Staff {\n    id: ID;\n    code?: string;\n    name: string;\n    phone?: string;\n    email?: string;\n`;
const authLinkLine = `    auth_user_id?: string;\n`;
if (!types.includes(authLinkLine)) {
  if (!types.includes(staffAnchor)) throw new Error("Could not find Staff type anchor.");
  types = types.replace(staffAnchor, `${staffAnchor}${authLinkLine}`);
}
writeFileSync(typesPath, types);

let contractorProfile = readFileSync(contractorProfilePath, "utf8");
const unitAnchor = "      unit_id: capability.unit_id || previous?.unit_id,\n";
const unitReplacement = "      unit_id: capability.unit_id || db.master.workSubcategories.find((row) => row.id === capability.subcategory_id)?.unit_id || previous?.unit_id,\n";
if (contractorProfile.includes(unitAnchor)) {
  contractorProfile = contractorProfile.replace(unitAnchor, unitReplacement);
}
writeFileSync(contractorProfilePath, contractorProfile);

let authorizedCommit = readFileSync(authorizedCommitPath, "utf8");
if (!authorizedCommit.includes('import { contractorRateProjection } from "../contractor-profile";')) {
  const importAnchor = 'import { applyVendorRateAverages } from "../vendor-rate-average";\n';
  if (!authorizedCommit.includes(importAnchor)) throw new Error("Could not find authorized-commit import anchor.");
  authorizedCommit = authorizedCommit.replace(importAnchor, `${importAnchor}import { contractorRateProjection } from "../contractor-profile";\n`);
}
const auditAnchor = `function audit(user: AuthenticatedUser, operations: WorkspaceOperation[]): AuditLogEntry {\n`;
if (!authorizedCommit.includes("function sanitizeWorkspaceOperations(")) {
  if (!authorizedCommit.includes(auditAnchor)) throw new Error("Could not find authorized-commit audit anchor.");
  const sanitizer = `function sanitizeWorkspaceOperations(operations: WorkspaceOperation[]): WorkspaceOperation[] {\n  return operations.map((operation) => {\n    if (operation.collection !== "master.staff") return operation;\n    return {\n      ...operation,\n      upsert: (operation.upsert || []).map((row) => {\n        const { temporary_password: _password, force_password_change: _forceReset, ...safe } = row;\n        return safe;\n      }),\n    };\n  });\n}\n\n`;
  authorizedCommit = authorizedCommit.replace(auditAnchor, `${sanitizer}${auditAnchor}`);
}
if (!authorizedCommit.includes("function canonicalizeContractorRateOperations(")) {
  if (!authorizedCommit.includes(auditAnchor)) throw new Error("Could not find authorized-commit function anchor.");
  const helper = `function canonicalizeContractorRateOperations(\n  current: RDashDatabase,\n  operations: WorkspaceOperation[],\n): WorkspaceOperation[] {\n  const contractorOperation = operations.find((operation) => operation.collection === "master.contractors");\n  if (!contractorOperation) return operations;\n\n  const candidate = applyWorkspaceOperations(current, operations);\n  let contractorRates = candidate.master.contractorRates || [];\n  const touchedIds = new Set<string>();\n  for (const row of contractorOperation.upsert || []) {\n    const id = String(row.id || "").trim();\n    if (id) touchedIds.add(id);\n  }\n  for (const id of contractorOperation.deleteIds || []) {\n    if (id) touchedIds.add(id);\n  }\n\n  for (const contractorId of touchedIds) {\n    const contractor = candidate.master.contractors.find((row) => row.id === contractorId);\n    if (!contractor) {\n      contractorRates = contractorRates.filter((rate) => rate.contractor_id !== contractorId);\n      continue;\n    }\n    contractorRates = contractorRateProjection(\n      { master: { ...candidate.master, contractorRates } },\n      contractor,\n    );\n  }\n\n  const canonical: RDashDatabase = {\n    ...candidate,\n    master: { ...candidate.master, contractorRates },\n  };\n  return diffWorkspaceOperations(current, canonical);\n}\n\n`;
  authorizedCommit = authorizedCommit.replace(auditAnchor, `${helper}${auditAnchor}`);
}
const initialOps = "  let commitOperations = operations;\n";
const sanitizedOps = "  let commitOperations = sanitizeWorkspaceOperations(operations);\n";
if (!authorizedCommit.includes(sanitizedOps)) {
  if (!authorizedCommit.includes(initialOps)) throw new Error("Could not find authorized-commit operation initialization.");
  authorizedCommit = authorizedCommit.replace(initialOps, sanitizedOps);
}
const vendorCall = "    commitOperations = canonicalizeVendorRateOperations(current.data, commitOperations);\n";
const contractorCall = "    commitOperations = canonicalizeContractorRateOperations(current.data, commitOperations);\n";
if (!authorizedCommit.includes(contractorCall)) {
  if (!authorizedCommit.includes(vendorCall)) throw new Error("Could not find authorized-commit canonicalization anchor.");
  authorizedCommit = authorizedCommit.replace(vendorCall, `${vendorCall}${contractorCall}`);
}
writeFileSync(authorizedCommitPath, authorizedCommit);

console.log(JSON.stringify({
  version: WORK_CATALOG_VERSION,
  units: catalog.units.length,
  categories: catalog.workCategories.length,
  subcategories: catalog.workSubcategories.length,
  articles: catalog.articles.length,
  mappings: catalog.subcategoryArticleMap.length,
  migrationPath,
}, null, 2));
