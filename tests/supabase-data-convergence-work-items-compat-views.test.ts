import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260803010000_cutover_work_item_compatibility_views.sql";
const read = (path: string) => Bun.file(path).text();

describe("WorkItem compatibility-view physical consolidation", () => {
  test("moves Task and Follow-up physical tables to private rollback storage", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create schema if not exists uc_legacy authorization postgres");
    expect(migration).toContain("alter table public.entity_tasks set schema uc_legacy");
    expect(migration).toContain("alter table public.entity_followups set schema uc_legacy");
    expect(migration).not.toContain("drop table public.entity_tasks");
    expect(migration).not.toContain("drop table public.entity_followups");
  });

  test("recreates the existing public names as security-invoker compatibility views", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create view public.entity_tasks\nwith (security_invoker = true)");
    expect(migration).toContain("create view public.entity_followups\nwith (security_invoker = true)");
    expect(migration).toContain("from public.\"entity_workItems\" w\nwhere w.item_type = 'task'");
    expect(migration).toContain("from public.\"entity_workItems\" w\nwhere w.item_type = 'followup'");
  });

  test("preserves exact legacy payloads while canonical shared fields drive reads", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("coalesce(w.data -> 'legacy_payload', '{}'::jsonb)");
    expect(migration).toContain("'status', w.lifecycle_status");
    expect(migration).toContain("'task_type', w.work_kind");
    expect(migration).toContain("'followup_type', w.work_kind");
    expect(migration).toContain("'due_date', w.due_date");
    expect(migration).toContain("'due_at', w.due_at");
    expect(migration).toContain("'legacy_payload', new.data");
  });

  test("translates legacy writes through one canonical WorkItem writer", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create or replace function public.uc_legacy_work_item_view_write()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("instead of insert or update or delete on public.entity_tasks");
    expect(migration).toContain("execute function public.uc_legacy_work_item_view_write('task')");
    expect(migration).toContain("instead of insert or update or delete on public.entity_followups");
    expect(migration).toContain("execute function public.uc_legacy_work_item_view_write('followup')");
    expect(migration).toContain("insert into public.\"entity_workItems\"");
    expect(migration).toContain("update public.\"entity_workItems\"");
    expect(migration).toContain("delete from public.\"entity_workItems\"");
  });

  test("keeps logical collection mappings and journal contracts unchanged", async () => {
    const migration = await read(MIGRATION);
    const commitRest = await read("src/lib/rdash/server/commit-rest.ts");

    expect(commitRest).toContain('tasks: "entity_tasks"');
    expect(commitRest).toContain('followups: "entity_followups"');
    expect(commitRest).not.toContain('workItems: "entity_workItems"');
    expect(migration).not.toContain("update public.entity_workspace_revision");
    expect(migration).not.toContain("insert into public.entity_workspace_change_batches");
  });

  test("refreshes shadow data immediately before cutover and aborts on unsafe drift", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("WORK_ITEM_COMPAT_CANONICAL_ONLY_ROWS_PRESENT");
    expect(migration).toContain("WORK_ITEM_COMPAT_LEGACY_ID_COLLISION");
    expect(migration).toContain("WORK_ITEM_COMPAT_ROLLBACK_COPY_ALREADY_EXISTS");
    expect(migration).toContain("delete from public.\"entity_workItems\"");
    expect(migration).toContain("WORK_ITEM_COMPAT_TASK_PARITY_MISMATCH");
    expect(migration).toContain("WORK_ITEM_COMPAT_FOLLOWUP_PARITY_MISMATCH");
    expect(migration).toContain("WORK_ITEM_COMPAT_CANONICAL_ROW_MISSING");
  });

  test("keeps compatibility views server-only", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("revoke all on table public.entity_tasks from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.entity_followups from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.entity_tasks to service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.entity_followups to service_role");
  });
});
