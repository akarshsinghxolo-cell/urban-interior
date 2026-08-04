from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    file_path.write_text(text.replace(old, new, 1))


# The live Supabase project no longer has workspace_health_snapshot or
# get_workspace_health_summary. Remove their runtime callers while preserving
# the bounded health calculation and UI/API contracts.
health_path = Path("src/lib/rdash/server/workspace-health.ts")
health = health_path.read_text()
health = health.replace('import { getSupabaseAdminClient } from "../../supabase/server";\n', "")

snapshot_start = health.index("type SnapshotRow = {")
build_start = health.index("function buildOperationalHealth", snapshot_start)
health = health[:snapshot_start] + health[build_start:]

rpc_helper_start = health.index("function isMissingHealthRpc(")
health = health[:rpc_helper_start] + '''export async function getWorkspaceHealthSummary() {
  const startedAt = performance.now();
  const workspace = await getWorkspaceSubset({
    fullCollections: [...HEALTH_SUMMARY_COLLECTIONS],
  });
  return {
    revision: workspace.revision,
    queryCount: workspace.queryCount,
    collectionCount: HEALTH_SUMMARY_COLLECTIONS.length,
    loadMs: Math.round((performance.now() - startedAt) * 100) / 100,
    ...buildOperationalHealth(workspace.data, null),
  };
}
'''
health_path.write_text(health)

# QA still runs the scheduled integrity scan and route-bundle maintenance, but
# it no longer attempts to persist a snapshot into a table that does not exist.
replace_once(
    "src/app/api/qa/cron/route.ts",
    'import { saveStoredIntegritySnapshot } from "@/lib/rdash/server/workspace-health";\n',
    "",
)
replace_once(
    "src/app/api/qa/cron/route.ts",
    " * The expensive full integrity scan runs here instead of on every dashboard\n * health request. Its compact result is persisted for the lightweight health\n * endpoint. Expired route bundles are also removed once per day.\n",
    " * The expensive full integrity scan runs here as scheduled validation instead\n * of on every dashboard health request. Expired route bundles are also removed\n * once per day.\n",
)
qa_path = Path("src/app/api/qa/cron/route.ts")
qa = qa_path.read_text()
start = qa.index("    const [\n      snapshotSaved,")
end = qa.index("\n\n    const counts = {", start)
qa = qa[:start] + '''    const expiredRouteBundlesDeleted = await cleanupExpiredStaffRouteBundles().catch((error) => {
      console.error(
        "[qa/cron] route-bundle cleanup failed:",
        error,
      );
      return -1;
    });''' + qa[end:]
qa = qa.replace("          integritySnapshotSaved: snapshotSaved,\n", "")
qa_path.write_text(qa)

# Keep a regression guard that forbids reintroducing calls to the removed DB
# objects while proving the bounded server calculation remains in place.
replace_once(
    "tests/egress-guardrails.test.ts",
    '''  test("health uses one database aggregate RPC", () => {
    expect(healthServer).toContain('.rpc("get_workspace_health_summary"');
  });
''',
    '''  test("health avoids removed database fast paths", () => {
    expect(healthServer).not.toContain('.rpc("get_workspace_health_summary"');
    expect(healthServer).not.toContain('.from("workspace_health_snapshot")');
    expect(healthServer).toContain("getWorkspaceSubset");
  });
''',
)
