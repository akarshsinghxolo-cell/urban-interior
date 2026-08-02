import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260802183500_remove_issue_pilot_rollback_tables.sql";
const read = (path: string) => Bun.file(path).text();

describe("Issue consolidation rollback cleanup", () => {
  test("requires compatibility views and canonical table before cleanup", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("ISSUE_CLEANUP_BLOCKED_NOT_VIEW");
    expect(migration).toContain("ISSUE_CLEANUP_RISKS_NOT_VIEW");
    expect(migration).toContain("ISSUE_CLEANUP_CANONICAL_NOT_TABLE");
    expect(migration).toContain("v_blocked_kind is distinct from 'v'");
    expect(migration).toContain("v_risks_kind is distinct from 'v'");
    expect(migration).toContain("v_issues_kind is distinct from 'r'");
  });

  test("refuses to remove rollback tables if they unexpectedly contain rows", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("ISSUE_CLEANUP_BLOCKED_BACKUP_NOT_EMPTY");
    expect(migration).toContain("ISSUE_CLEANUP_RISKS_BACKUP_NOT_EMPTY");
    expect(migration).toContain("exists (select 1 from uc_legacy.entity_blocked)");
    expect(migration).toContain("exists (select 1 from uc_legacy.entity_risks)");
  });

  test("drops only the two private stale tables and never cascades", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("drop table uc_legacy.entity_blocked;");
    expect(migration).toContain("drop table uc_legacy.entity_risks;");
    expect(migration.toLowerCase()).not.toContain("drop table uc_legacy.entity_blocked cascade");
    expect(migration.toLowerCase()).not.toContain("drop table uc_legacy.entity_risks cascade");
    expect(migration).not.toContain("drop view public.entity_blocked");
    expect(migration).not.toContain("drop view public.entity_risks");
    expect(migration).not.toContain("drop table public.entity_issues");
  });

  test("removes the private schema only when no relation remains", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("if not exists (");
    expect(migration).toContain("n.nspname = 'uc_legacy'");
    expect(migration).toContain("execute 'drop schema uc_legacy'");
  });
});
