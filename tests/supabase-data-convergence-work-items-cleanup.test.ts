import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260803013000_remove_work_item_rollback_tables.sql";
const read = (path: string) => Bun.file(path).text();

describe("WorkItem rollback cleanup", () => {
  test("requires the compatibility views and canonical table before cleanup", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("WORK_ITEM_CLEANUP_REQUIRED_PUBLIC_RELATION_MISSING");
    expect(migration).toContain("WORK_ITEM_CLEANUP_COMPAT_VIEW_MISSING");
    expect(migration).toContain("public.\"entity_workItems\"");
  });

  test("requires both private rollback copies", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("to_regclass('uc_legacy.entity_tasks')");
    expect(migration).toContain("to_regclass('uc_legacy.entity_followups')");
    expect(migration).toContain("WORK_ITEM_CLEANUP_ROLLBACK_COPY_MISSING");
  });

  test("requires exact count and payload parity before deletion", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("WORK_ITEM_CLEANUP_TASK_COUNT_MISMATCH");
    expect(migration).toContain("WORK_ITEM_CLEANUP_FOLLOWUP_COUNT_MISMATCH");
    expect(migration).toContain("WORK_ITEM_CLEANUP_TASK_PARITY_MISMATCH");
    expect(migration).toContain("WORK_ITEM_CLEANUP_FOLLOWUP_PARITY_MISMATCH");
    expect(migration).toContain("compat.data is distinct from legacy.data");
  });

  test("drops only the two rollback tables and never uses CASCADE", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("drop table uc_legacy.entity_tasks;");
    expect(migration).toContain("drop table uc_legacy.entity_followups;");
    expect(migration.toLowerCase()).not.toContain("cascade");
    expect(migration).not.toContain("drop view public.entity_tasks");
    expect(migration).not.toContain("drop view public.entity_followups");
    expect(migration).not.toContain("drop table public.\"entity_workItems\"");
  });

  test("does not alter workspace revisions or journals", async () => {
    const migration = await read(MIGRATION);

    expect(migration).not.toContain("update public.entity_workspace_revision");
    expect(migration).not.toContain("insert into public.entity_workspace_change_batches");
  });
});
