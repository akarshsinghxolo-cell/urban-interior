import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";

const MIGRATION_PATH =
  "supabase/migrations/20260804060639_canonicalize_staff_identity_storage.sql";

async function migrationSource() {
  return Bun.file(MIGRATION_PATH).text();
}

describe("canonical Staff storage convergence", () => {
  test("records the exact forward migration after historical Staff mirror migrations", async () => {
    const files = (await readdir("supabase/migrations")).sort();
    expect(files).toContain("20260801144500_sync_workspace_staff_mirrors.sql");
    expect(files).toContain("20260804060639_canonicalize_staff_identity_storage.sql");
    expect(
      files.indexOf("20260804060639_canonicalize_staff_identity_storage.sql"),
    ).toBeGreaterThan(
      files.indexOf("20260801144500_sync_workspace_staff_mirrors.sql"),
    );
  });

  test("makes entity_master_staff the only stored Staff profile", async () => {
    const sql = await migrationSource();
    expect(sql).toContain('drop table public."StaffProfile";');
    expect(sql).toContain('create view public."StaffProfile"');
    expect(sql).toContain("from public.entity_master_staff m;");
    expect(sql).toContain(
      "Compatibility read view backed by canonical entity_master_staff; stores no duplicate Staff rows.",
    );
  });

  test("moves GPS route ownership directly onto canonical Staff", async () => {
    const sql = await migrationSource();
    expect(sql).toContain('alter table public."StaffRouteBundle"');
    expect(sql).toContain('foreign key ("staffId")');
    expect(sql).toContain("references public.entity_master_staff(id)");
    expect(sql).toContain("on delete cascade");
  });

  test("stops identity synchronization from dual-writing StaffProfile", async () => {
    const sql = await migrationSource();
    const start = sql.indexOf("create or replace function public.sync_staff_identity_bundle");
    const end = sql.indexOf(
      "revoke all on function public.sync_staff_identity_bundle",
      start,
    );
    const functionSql = sql.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(functionSql).toContain("public.entity_master_staff");
    expect(functionSql).not.toContain('insert into public."StaffProfile"');
    expect(functionSql).not.toContain('update public."StaffProfile"');
    expect(functionSql).not.toContain('from public."StaffProfile"');
  });

  test("replaces the workspace mirror trigger with access-only synchronization", async () => {
    const sql = await migrationSource();
    expect(sql).toContain(
      "drop trigger if exists entity_master_staff_workspace_mirror on public.entity_master_staff;",
    );
    expect(sql).toContain(
      "drop function if exists public.uc_sync_workspace_staff_mirrors();",
    );
    expect(sql).toContain("create function public.uc_sync_workspace_staff_access()");
    expect(sql).toContain("create trigger entity_master_staff_workspace_access");
    const accessStart = sql.indexOf("create function public.uc_sync_workspace_staff_access()");
    const accessEnd = sql.indexOf(
      "revoke all on function public.uc_sync_workspace_staff_access()",
      accessStart,
    );
    const accessSql = sql.slice(accessStart, accessEnd);
    expect(accessSql).toContain("update public.uc_user_roles");
    expect(accessSql).not.toContain('public."StaffProfile"');
  });

  test("keeps the User Approvals drift-report contract without a second Staff source", async () => {
    const sql = await migrationSource();
    const driftStart = sql.indexOf("create view public.staff_identity_drift_report");
    const driftSql = sql.slice(driftStart);
    expect(driftStart).toBeGreaterThanOrEqual(0);
    expect(driftSql).toContain("from public.uc_user_roles r");
    expect(driftSql).toContain("from public.entity_master_staff m");
    expect(driftSql).not.toContain('from public."StaffProfile"');
    expect(driftSql).toContain("profile_email");
    expect(driftSql).toContain("profile_auth_user_id");
    expect(driftSql).toContain("is_drifted");
  });

  test("refuses destructive convergence when identity or route parity is unsafe", async () => {
    const sql = await migrationSource();
    expect(sql).toContain("STAFF_CANONICALIZATION_ABORTED: StaffProfile contains rows missing from entity_master_staff");
    expect(sql).toContain("STAFF_CANONICALIZATION_ABORTED: StaffRouteBundle contains orphan Staff ids");
    expect(sql).toContain("STAFF_CANONICALIZATION_ABORTED: Staff identity drift must be resolved first");
  });
});
