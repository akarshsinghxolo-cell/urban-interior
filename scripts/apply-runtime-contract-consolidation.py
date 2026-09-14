from __future__ import annotations

from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, value: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(value)


def replace(path: str, old: str, new: str, *, minimum: int = 1) -> int:
    value = read(path)
    count = value.count(old)
    if count < minimum:
        raise RuntimeError(f"{path}: expected at least {minimum} occurrences of {old!r}, found {count}")
    write(path, value.replace(old, new))
    return count


def regex(path: str, pattern: str, replacement: str, *, minimum: int = 1, flags: int = 0) -> int:
    value = read(path)
    updated, count = re.subn(pattern, replacement, value, flags=flags)
    if count < minimum:
        raise RuntimeError(f"{path}: expected at least {minimum} matches for {pattern!r}, found {count}")
    write(path, updated)
    return count


def source_files() -> list[Path]:
    roots = [ROOT / "src", ROOT / "tests", ROOT / "scripts"]
    out: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in {".ts", ".tsx", ".mjs", ".mts", ".md"}:
                out.append(path)
    return out


# ---------------------------------------------------------------------------
# 1. Finish the store split: the composition root is no longer a "raw" legacy
#    store. Keep it at the same directory depth so internal imports stay stable.
# ---------------------------------------------------------------------------
raw_store = ROOT / "src/lib/rdash/raw-store.ts"
runtime_store = ROOT / "src/lib/rdash/store-runtime.ts"
if raw_store.exists():
    if runtime_store.exists():
        raise RuntimeError("Both raw-store.ts and store-runtime.ts exist")
    shutil.move(raw_store, runtime_store)

for path in source_files():
    value = path.read_text()
    updated = value.replace("raw-store", "store-runtime")
    if updated != value:
        path.write_text(updated)

# Remove migration-era comments that claimed functions were still moving between
# the monolith and slices. The runtime file is now explicitly the composition root.
runtime_value = runtime_store.read_text()
runtime_value = re.sub(r"^// .*moved to slices.*\n", "", runtime_value, flags=re.MULTILINE)
runtime_value = re.sub(r"^// Re-export UI types from the store/ subfolder \(Phase 1 split\)\n", "", runtime_value, flags=re.MULTILINE)
runtime_store.write_text(runtime_value)

# ---------------------------------------------------------------------------
# 2. Remove module-id and URL compatibility aliases. Only canonical module ids
#    and canonical workspace URLs remain accepted.
# ---------------------------------------------------------------------------
modules_path = "src/lib/rdash/modules.ts"
replace(modules_path, 'import { canonicalLegacyModuleId } from "./module-aliases";\n\n', "")
regex(
    modules_path,
    r"export function canonicalModuleId\(id: string\): string \{\n  const canonicalId = canonicalLegacyModuleId\(id\);\n  return MODULE_ROUTE_REGISTRY\.has\(canonicalId\)\n    \? canonicalId\n    : DEFAULT_MODULE_ID;\n\}",
    "export function canonicalModuleId(id: string): string {\n  return MODULE_ROUTE_REGISTRY.has(id) ? id : DEFAULT_MODULE_ID;\n}",
)

routes_path = "src/lib/rdash/workspace-routes.ts"
routes = read(routes_path)
routes = routes.replace('import {\n  LEGACY_MODULE_ALIASES,\n  canonicalLegacyModuleId,\n} from "./module-aliases";\n', "")
routes = routes.replace("  aliases?: readonly string[];\n", "")
routes = re.sub(r", aliases: \[[^\]]*\]", "", routes)
routes = re.sub(r"\nfunction legacyIdPath\(moduleId: string\): string \{.*?\n\}\n", "\n", routes, flags=re.S)
routes = re.sub(
    r"      aliases: Object\.freeze\(\n        \[\.\.\.\(rawDefinition\.aliases \|\| \[\]\)\]\.map\(normalizeWorkspacePath\),\n      \),\n",
    "",
    routes,
)
routes = re.sub(
    r"    registerPath\(\n      legacyIdPath\(definition\.moduleId\),\n      definition,\n      definition\.canonicalPath !== legacyIdPath\(definition\.moduleId\),\n    \);\n    for \(const alias of definition\.aliases \|\| \[\]\) \{\n      registerPath\(alias, definition, true\);\n    \}\n",
    "",
    routes,
)
routes = re.sub(
    r"\n  for \(const \[legacyModuleId, canonicalModuleId\] of Object\.entries\(\n    LEGACY_MODULE_ALIASES,\n  \)\) \{.*?\n  \}\n",
    "\n",
    routes,
    flags=re.S,
)
routes = routes.replace(
    "export function workspacePathForModule(moduleId: string): string {\n  const canonicalModuleId = canonicalLegacyModuleId(moduleId);\n  return (\n    REGISTRY.byModuleId.get(canonicalModuleId)?.canonicalPath ||",
    "export function workspacePathForModule(moduleId: string): string {\n  return (\n    REGISTRY.byModuleId.get(moduleId)?.canonicalPath ||",
)
write(routes_path, routes)

module_aliases = ROOT / "src/lib/rdash/module-aliases.ts"
if module_aliases.exists():
    module_aliases.unlink()

# Update the navigation-id regression test to validate only canonical ids.
nav_test = ROOT / "tests/module-navigation-ids.test.ts"
if nav_test.exists():
    value = nav_test.read_text()
    value = value.replace('import { LEGACY_MODULE_ALIASES } from "../src/lib/rdash/module-aliases";\n', "")
    value = re.sub(r"\n\s*for \(const \[legacyId, canonicalId\] of Object\.entries\(LEGACY_MODULE_ALIASES\)\) \{.*?\n\s*\}\n", "\n", value, flags=re.S)
    value = value.replace(" || id in LEGACY_MODULE_ALIASES", "")
    nav_test.write_text(value)

# ---------------------------------------------------------------------------
# 3. Canonicalize staff assignment references. Task/follow-up identity is only
#    assigned_staff_id; presentation labels get one explicit projected name/role.
# ---------------------------------------------------------------------------
for path in source_files():
    value = path.read_text()
    value = re.sub(r"\bassignee_id\b", "assigned_staff_id", value)
    value = re.sub(r"\bassignee_name\b", "assigned_staff_name", value)
    value = re.sub(r"\bassigned_to\b", "assigned_staff_name", value)
    value = re.sub(r"\bassigned_role\b", "assigned_staff_role", value)
    path.write_text(value)

# Canonical type declarations after token migration (which temporarily creates
# duplicate declarations).
types_path = "src/lib/rdash/types.ts"
types = read(types_path)
types = re.sub(
    r"    assigned_staff_id\?: ID;\n    /\*\* @deprecated Runtime compatibility alias; persist assigned_staff_id instead\. \*/\n    assigned_staff_id\?: ID;\n    /\*\* @deprecated Derived from canonical Staff at read time\. \*/\n    assigned_staff_name\?: string;\n    /\*\* @deprecated Derived from canonical Staff at read time\. \*/\n    assigned_staff_name\?: string;\n    /\*\* @deprecated Derived from canonical Staff at read time\. \*/\n    assigned_staff_role\?: string;",
    "    assigned_staff_id?: ID;\n    /** Derived from canonical Staff at read time; never persisted. */\n    readonly assigned_staff_name?: string;\n    /** Derived from canonical Staff at read time; never persisted. */\n    readonly assigned_staff_role?: string;",
    types,
)
types = types.replace(
    "    assigned_staff_id?: ID;\n    /** @deprecated Runtime compatibility alias; persist assigned_staff_id instead. */\n    staff_id: ID;\n    /** @deprecated Derived from canonical Staff at read time. */\n    staff_name: string;",
    "    assigned_staff_id?: ID;\n    /** Derived from canonical Staff at read time; never persisted. */\n    readonly assigned_staff_name?: string;",
)
# Follow-up token migration can produce duplicate projected names.
types = re.sub(
    r"    assigned_staff_id\?: ID;\n    /\*\* @deprecated Derived from canonical Staff at read time\. \*/\n    assigned_staff_name\?: string;\n    /\*\* @deprecated Derived from canonical Staff at read time\. \*/\n    assigned_staff_role\?: string;",
    "    assigned_staff_id?: ID;\n    /** Derived from canonical Staff at read time; never persisted. */\n    readonly assigned_staff_name?: string;\n    /** Derived from canonical Staff at read time; never persisted. */\n    readonly assigned_staff_role?: string;",
    types,
)
write(types_path, types)

# Visit was the final runtime holdout using staff_id as its assignment identity.
visit_replacements = {
    "src/lib/rdash/attendance-policy.ts": [("\"staff_id\"", "\"assigned_staff_id\""), ("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/AutoGeofenceMonitor.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/EditDetailsDialog.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/TeamPerformance.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/lib/rdash/store/slices/visits.ts": [("visit.staff_id", "visit.assigned_staff_id"), ("visit?.staff_id", "visit?.assigned_staff_id"), ('Pick<Visit, "staff_id" | "contractor_id" | "assignee_type">', 'Pick<Visit, "assigned_staff_id" | "contractor_id" | "assignee_type">')],
    "src/lib/rdash/business-rules-core.ts": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/lib/rdash/store/slices/masters.ts": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/modules/FieldModeModule.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/modules/VisitProofsModule.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/modules/GpsTrackingModule.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/modules/RemainingModules.tsx": [("visit.staff_id", "visit.assigned_staff_id"), ("visit.staff_name", "visit.assigned_staff_name")],
    "src/components/rdash/modules/AttendancePayrollModule.tsx": [("visit.staff_id", "visit.assigned_staff_id")],
    "src/components/rdash/modules/StaffBoardHistoryModule.tsx": [("v.staff_id", "v.assigned_staff_id")],
}
for path, pairs in visit_replacements.items():
    if not (ROOT / path).exists():
        continue
    value = read(path)
    for old, new in pairs:
        value = value.replace(old, new)
    write(path, value)

# Visit writers/readers in the visits slice: staff_id/staff_name keys are Visit
# fields here (attendance has a separate legitimate staff_id and is untouched).
visits_path = "src/lib/rdash/store/slices/visits.ts"
visits = read(visits_path)
visits = re.sub(r"(?m)^(\s*)staff_id:\s*", r"\1assigned_staff_id: ", visits)
visits = re.sub(r"(?m)^(\s*)staff_name:\s*", r"\1assigned_staff_name: ", visits)
visits = visits.replace(".staff_name", ".assigned_staff_name")
write(visits_path, visits)

# Staff label hydration no longer reads identity aliases and writes one projected
# label vocabulary.
labels_path = "src/lib/rdash/staff-reference-labels.ts"
labels = read(labels_path)
labels = labels.replace("text(row.assigned_staff_id) || text(row.assigned_staff_id)", "text(row.assigned_staff_id)")
labels = labels.replace("row.assigned_staff_name", "row.assigned_staff_name")
labels = re.sub(r"delete row\.assigned_staff_id;\n", "", labels)
write(labels_path, labels)

visibility_path = "src/lib/rdash/field-staff-visibility.ts"
visibility = read(visibility_path)
visibility = visibility.replace('["staff_id", "assigned_staff_id", "assigned_staff_id"]', '["assigned_staff_id"]')
visibility = visibility.replace('["staff_id", "assigned_staff_id"]', '["assigned_staff_id"]')
write(visibility_path, visibility)

# ---------------------------------------------------------------------------
# 4. Thread identity is kind + record_id only. Remove record_type from the
#    runtime model, writers, validators and fixtures. linked_record_type is a
#    different field and is intentionally untouched.
# ---------------------------------------------------------------------------
types = read(types_path).replace("    record_type: ThreadKind;\n", "")
write(types_path, types)

thread_files = [
    "src/lib/rdash/store/slices/threads.ts",
    "src/lib/rdash/backfill-threads.ts",
]
for path in thread_files:
    value = read(path)
    value = re.sub(r"(?m)^\s*record_type:\s*kind,\n", "", value)
    write(path, value)

for path in [
    "src/lib/rdash/server/authorized-commit.ts",
    "src/lib/rdash/server/mutation-policy.ts",
    "src/lib/rdash/server/direct-upload-workspace.ts",
]:
    value = read(path)
    value = value.replace('String(row.kind || row.record_type || "")', 'String(row.kind || "")')
    write(path, value)

for path in ["src/lib/rdash/server/targeted-commit.ts", "src/lib/rdash/business-rules-core.ts"]:
    value = read(path)
    value = re.sub(
        r"\s*if \(thread\.record_type !== thread\.kind\) \{\n\s*throw new Error\([^\n]*\);\n\s*\}\n",
        "\n",
        value,
    )
    write(path, value)

replace("src/components/rdash/DetailPanel.tsx", "t.record_type === threadKind", "t.kind === threadKind")

# Thread test fixtures: only remove literal record_type entries whose value is a
# ThreadKind-like string; linked_record_type remains intact.
for path in (ROOT / "tests").rglob("*.test.ts"):
    value = path.read_text()
    value = re.sub(r"(?m)^\s*record_type:\s*(?:\"[^\"]+\"|'[^']+'),\n", "", value)
    value = re.sub(r"\s*record_type:\s*(?:\"[^\"]+\"|'[^']+'),", "", value)
    path.write_text(value)

# ---------------------------------------------------------------------------
# 5. Work-order cost lines get a neutral canonical counterparty contract instead
#    of vendor_* overloaded for contractors plus mirrored contractor_* aliases.
# ---------------------------------------------------------------------------
types = read(types_path)
types = re.sub(
    r"    // FIX-CONTRACTOR-BATCH1 / F\.3: `vendor_id` / `vendor_name` is the\n.*?    contractor_name\?: string;\n",
    "    counterparty_type?: \"vendor\" | \"contractor\";\n    counterparty_id?: ID;\n    counterparty_name?: string;\n",
    types,
    flags=re.S,
)
write(types_path, types)

contractors_path = "src/lib/rdash/store/slices/contractors.ts"
contractors = read(contractors_path)
contractors = re.sub(
    r"\s*// FIX-CONTRACTOR-BATCH1 / F\.3: vendor_id is canonical; mirror to\n\s*// contractor_id for backward compat with any consumer that still\n\s*// reads the legacy field\.\n\s*vendor_id: contractor\.id,\n\s*vendor_name: contractor\.name,\n\s*contractor_id: contractor\.id,\n\s*contractor_name: contractor\.name,",
    '\n                    counterparty_type: "contractor",\n                    counterparty_id: contractor.id,\n                    counterparty_name: contractor.name,',
    contractors,
)
write(contractors_path, contractors)

vendor_bills_path = "src/lib/rdash/store/slices/vendor-bills.ts"
vendor_bills = read(vendor_bills_path)
vendor_bills = vendor_bills.replace(
    "                    vendor_id: bill.vendor_id,\n                    vendor_name: bill.vendor_name,",
    '                    counterparty_type: "vendor",\n                    counterparty_id: bill.vendor_id,\n                    counterparty_name: bill.vendor_name,',
)
write(vendor_bills_path, vendor_bills)

execution_path = "src/lib/rdash/store/slices/execution.ts"
execution = read(execution_path)
execution = execution.replace("vendor_id: c.vendor_id,", "counterparty_type: c.counterparty_type,")
execution = execution.replace("vendor_name: c.vendor_name,", "counterparty_id: c.counterparty_id,\n                        counterparty_name: c.counterparty_name,")
write(execution_path, execution)

replace(
    "src/components/rdash/modules/ContractorDetailModule.tsx",
    'db.workOrderCostLines.filter((cl) => cl.vendor_id === c.id && cl.type === "contractor")',
    'db.workOrderCostLines.filter((cl) => cl.counterparty_type === "contractor" && cl.counterparty_id === c.id && cl.type === "contractor")',
)

# Seed cost lines are compact single-line objects, so convert the known sample
# fields without touching genuine vendor_id fields on POs/bills/etc.
seed_path = "src/lib/rdash/seed.ts"
seed = read(seed_path)
seed = seed.replace(
    'vendor_id: "con-gypsum", vendor_name: "Sharma Ceiling Works", contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works"',
    'counterparty_type: "contractor", counterparty_id: "con-gypsum", counterparty_name: "Sharma Ceiling Works"',
)
seed = seed.replace(
    'vendor_id: "ven-build", vendor_name: "Build Mart"',
    'counterparty_type: "vendor", counterparty_id: "ven-build", counterparty_name: "Build Mart"',
)
seed = re.sub(r"\s*// FIX-CONTRACTOR-BATCH1 / F\.3: Standardize on `vendor_id` / `vendor_name`.*?(?=\n\s*\{ id: \"cost-)", "", seed, flags=re.S)
write(seed_path, seed)

repair_path = "src/lib/rdash/operational-repair.ts"
repair = read(repair_path)
repair = re.sub(
    r"\n\s*// this repair function UNSET vendor_id.*?\n\s*db\.workOrderCostLines = db\.workOrderCostLines\.map\(\(line\) => \{.*?\n\s*\}\);",
    "",
    repair,
    flags=re.S,
)
write(repair_path, repair)

# ---------------------------------------------------------------------------
# 6. Use the authorized commit boundary for every request/user-driven server
#    write. The low-level CAS writer remains an implementation detail of the
#    authorized commit and workspace reset internals.
# ---------------------------------------------------------------------------
callback_path = "src/app/api/google-drive/oauth/callback/route.ts"
callback = read(callback_path)
callback = callback.replace(
    'import { commitWorkspaceOperations, getWorkspaceSubset } from "@/lib/rdash/server/workspace";',
    'import { getWorkspaceSubset } from "@/lib/rdash/server/workspace";\nimport { commitAuthorizedPostgresOperations } from "@/lib/rdash/server/authorized-commit";',
)
callback = callback.replace("await commitWorkspaceOperations(\n          current.revision,", "await commitAuthorizedPostgresOperations(\n          user,\n          current.revision,")
callback = callback.replace("          current.rowVersions || {},\n        );", "          undefined,\n          current.rowVersions || {},\n        );")
write(callback_path, callback)

refresh_path = "src/app/api/google-drive/refresh-account/route.ts"
refresh = read(refresh_path)
refresh = refresh.replace(
    'import { commitWorkspaceOperations, getWorkspaceSubset } from "@/lib/rdash/server/workspace";',
    'import { getWorkspaceSubset } from "@/lib/rdash/server/workspace";\nimport { commitAuthorizedPostgresOperations } from "@/lib/rdash/server/authorized-commit";',
)
refresh = refresh.replace("const saved = await commitWorkspaceOperations(\n          current.workspace.revision,", "const saved = await commitAuthorizedPostgresOperations(\n          user,\n          current.workspace.revision,")
refresh = refresh.replace("          current.workspace.rowVersions || {},\n        );", "          undefined,\n          current.workspace.rowVersions || {},\n        );")
write(refresh_path, refresh)

cleanup_path = "src/lib/rdash/server/file-cleanup.ts"
cleanup = read(cleanup_path)
cleanup = cleanup.replace('import { commitWorkspaceOperations, getWorkspaceSubset } from "./workspace";', 'import { getWorkspaceSubset } from "./workspace";\nimport { commitAuthorizedPostgresOperations } from "./authorized-commit";')
cleanup = cleanup.replace("async function claimUnreferencedFileAsset(fileAssetId: string): Promise<CleanupClaim>", "async function claimUnreferencedFileAsset(user: AuthenticatedUser, fileAssetId: string): Promise<CleanupClaim>")
cleanup = cleanup.replace("async function restoreFileAsset(asset: FileAsset): Promise<void>", "async function restoreFileAsset(user: AuthenticatedUser, asset: FileAsset): Promise<void>")
cleanup = cleanup.replace("await commitWorkspaceOperations(\n        workspace.revision,", "await commitAuthorizedPostgresOperations(\n        user,\n        workspace.revision,")
cleanup = cleanup.replace("        workspace.rowVersions || {},\n      );", "        undefined,\n        workspace.rowVersions || {},\n      );")
cleanup = cleanup.replace("  _user: AuthenticatedUser,", "  user: AuthenticatedUser,")
cleanup = cleanup.replace("const claim = await claimUnreferencedFileAsset(fileAssetId);", "const claim = await claimUnreferencedFileAsset(user, fileAssetId);")
cleanup = cleanup.replace("await restoreFileAsset(asset);", "await restoreFileAsset(user, asset);")
write(cleanup_path, cleanup)

upload_path = "src/lib/rdash/server/direct-upload-persistence.ts"
upload = read(upload_path)
upload = upload.replace('import { commitWorkspaceOperations, getWorkspaceSubset } from "./workspace";', 'import { getWorkspaceSubset } from "./workspace";\nimport { commitAuthorizedPostgresOperations } from "./authorized-commit";')
upload = upload.replace("  attachmentUpdate?: AttachmentUpdate;\n};", "  attachmentUpdate?: AttachmentUpdate;\n  user?: AuthenticatedUser;\n};")
upload = upload.replace("  void user;\n  const collection", "  pendingCommit().user = user;\n  const collection", 1)
upload = upload.replace("  void user;\n  if (!field)", "  pendingCommit().user = user;\n  if (!field)", 1)
upload = upload.replace("  const pending = pendingCommit();\n  if (!pending.upserts.length", "  const pending = pendingCommit();\n  if (!pending.upserts.length")
upload = upload.replace("  await commitWorkspaceOperations(snapshot.revision, Array.from(operations.values()), snapshot.rowVersions || {});", "  if (!pending.user) throw new Error(\"Upload workspace commit has no authenticated user.\");\n  await commitAuthorizedPostgresOperations(\n    pending.user,\n    snapshot.revision,\n    Array.from(operations.values()),\n    undefined,\n    snapshot.rowVersions || {},\n  );")
upload = upload.replace("  pending.attachmentUpdate = undefined;", "  pending.attachmentUpdate = undefined;\n  pending.user = undefined;")
write(upload_path, upload)

# ---------------------------------------------------------------------------
# 7. Make subset/full reads share the same row normalization. Full maintenance
#    reads now delegate to the subset implementation rather than reimplementing
#    collection loading with a second normalizer.
# ---------------------------------------------------------------------------
commit_rest_path = "src/lib/rdash/server/commit-rest.ts"
commit_rest = read(commit_rest_path)
commit_rest = commit_rest.replace('import type { WorkspaceOperation } from "../workspace-operations";', 'import type { WorkspaceOperation } from "../workspace-operations";\nimport { normalizeCustomerRow } from "../customer-record";')
commit_rest = commit_rest.replace(
    "    return decodeRow(row);",
    "    const decoded = decodeRow(row);\n    return collection === \"customers\" && decoded\n      ? normalizeCustomerRow(decoded) as unknown as Record<string, unknown>\n      : decoded;",
)
commit_rest = re.sub(
    r"export async function getRestWorkspace\(\): Promise<\{.*?\n\}\> \{.*?\n\}\n\ninterface AtomicCommitResult",
    '''export async function getRestWorkspace(): Promise<{\n  revision: number;\n  data: RDashDatabase;\n  updatedAt: string;\n  rowVersions: Record<string, number>;\n}> {\n  const collections = Object.keys(COLLECTION_TO_TABLE);\n  const subset = await getRestWorkspaceSubset({\n    fullCollections: collections,\n    limitsByCollection: Object.fromEntries(collections.map((collection) => [collection, 0])),\n  });\n  return {\n    revision: subset.revision,\n    data: subset.data,\n    updatedAt: subset.updatedAt,\n    rowVersions: subset.rowVersions,\n  };\n}\n\ninterface AtomicCommitResult''',
    commit_rest,
    flags=re.S,
)
write(commit_rest_path, commit_rest)

# Hydrate projected staff labels for both full and subset reads in one place.
workspace_path = "src/lib/rdash/server/workspace.ts"
workspace = read(workspace_path)
workspace = workspace.replace("  const { getRestWorkspaceSubset } = await getRestModule();\n  return getRestWorkspaceSubset(plan);", "  const { getRestWorkspaceSubset } = await getRestModule();\n  const workspace = await getRestWorkspaceSubset(plan);\n  hydrateStaffReferenceLabels(workspace.data);\n  return workspace;")
# getWorkspace already calls the same label hydrator; no second behavior remains.
write(workspace_path, workspace)

# ---------------------------------------------------------------------------
# 8/9. Customer contract and migration history are already canonical on main.
#    Add a regression test that guards all retired runtime contracts instead of
#    carrying duplicate compatibility code forever.
# ---------------------------------------------------------------------------
regression_test = r'''import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(relative));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

describe("canonical runtime contracts", () => {
  test("runtime code has no retired module alias system or raw store", async () => {
    const files = await walk("src");
    for (const file of files) {
      const text = await source(file);
      expect(text, file).not.toContain("LEGACY_MODULE_ALIASES");
      expect(text, file).not.toContain("canonicalLegacyModuleId");
      expect(text, file).not.toContain("raw-store");
    }
  });

  test("thread runtime identity is kind + record_id only", async () => {
    const types = await source("src/lib/rdash/types.ts");
    expect(types).not.toContain("record_type: ThreadKind");
    for (const file of await walk("src")) {
      const text = await source(file);
      expect(text, file).not.toMatch(/\bthread\.record_type\b/);
      expect(text, file).not.toMatch(/\brow\.record_type\b/);
    }
  });

  test("task/follow-up assignment has one identity field", async () => {
    const files = await walk("src");
    for (const file of files) {
      const text = await source(file);
      expect(text, file).not.toMatch(/\bassignee_id\b/);
    }
  });

  test("work order cost lines use neutral counterparty fields", async () => {
    const types = await source("src/lib/rdash/types.ts");
    const block = types.match(/export interface WorkOrderCostLine \{[\s\S]*?\n\}/)?.[0] || "";
    expect(block).toContain("counterparty_type");
    expect(block).toContain("counterparty_id");
    expect(block).not.toContain("vendor_id");
    expect(block).not.toContain("contractor_id");
  });

  test("normal server writes outside workspace internals use the authorized boundary", async () => {
    const files = await walk("src");
    const allowed = new Set([
      "src/lib/rdash/server/authorized-commit.ts",
      "src/lib/rdash/server/workspace.ts",
    ]);
    for (const file of files) {
      if (allowed.has(file.replaceAll("\\", "/"))) continue;
      const text = await source(file);
      expect(text, file).not.toContain("commitWorkspaceOperations(");
    }
  });
});
'''
write("tests/runtime-contract-consolidation.test.ts", regression_test)

# Remove old local-storage favorites migration; v2 is the sole contract.
favorites = ROOT / "src/components/rdash/FavoritesBar.tsx"
if favorites.exists():
    value = favorites.read_text()
    value = value.replace('const LEGACY_STORAGE_KEY = "uc_favorites";\n', "")
    value = re.sub(r"\n\s*const legacy[^\n]*LEGACY_STORAGE_KEY.*?(?=\n\s*(?:return|const|React\.|use|\}))", "", value, flags=re.S)
    value = value.replace("localStorage.removeItem(LEGACY_STORAGE_KEY);\n", "")
    favorites.write_text(value)

# Supabase runtime config now requires the modern publishable key name. The
# service-role fallback was already removed previously.
supabase_server = ROOT / "src/lib/supabase/server.ts"
if supabase_server.exists():
    value = supabase_server.read_text()
    value = value.replace('configuredValue("SUPABASE_PUBLISHABLE_KEY") || configuredValue("SUPABASE_ANON_KEY")', 'configuredValue("SUPABASE_PUBLISHABLE_KEY")')
    value = value.replace('SUPABASE_PUBLISHABLE_KEY is required for Supabase authentication. SUPABASE_ANON_KEY is also accepted as a legacy alias.', 'SUPABASE_PUBLISHABLE_KEY is required for Supabase authentication.')
    supabase_server.write_text(value)

# Final application CI: no branch-specific code generation or self-mutating
# vendor cleanup path remains after this one-time consolidation commit.
write(".github/workflows/application-ci.yml", '''name: Application CI

on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: application-ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Test (full vitest suite)
        run: npm run test
      - name: Typecheck application
        run: npx tsc --noEmit
      - name: Lint application
        run: npm run lint
      - name: Build application
        run: npm run build
      - name: Install bun (QA mock runtime)
        uses: oven-sh/setup-bun@v2
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Run e2e smoke pack (real browser UI flows)
        run: npm run test:e2e
      - name: Upload e2e artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            test-results/
            playwright-report/
          retention-days: 7
          if-no-files-found: ignore
''')

# The editing mechanism must not survive the commit.
Path(__file__).unlink()
