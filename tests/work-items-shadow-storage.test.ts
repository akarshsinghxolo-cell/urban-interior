import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../supabase/migrations/20260803001500_add_work_item_shadow_storage.sql",
  import.meta.url,
);

const migration = await Bun.file(migrationPath).text();

describe("WorkItem shadow storage migration", () => {
  test("is additive and does not cut over legacy runtime relations", () => {
    expect(migration).toContain('create table public."entity_workItems"');
    expect(migration).toContain("from public.entity_tasks t");
    expect(migration).toContain("from public.entity_followups f");
    expect(migration).not.toContain("drop table public.entity_tasks");
    expect(migration).not.toContain("drop table public.entity_followups");
    expect(migration).not.toContain("alter table public.entity_tasks set schema");
    expect(migration).not.toContain("alter table public.entity_followups set schema");
  });

  test("preserves exact subtype lifecycle and both Follow-up due fields", () => {
    expect(migration).toContain("'lifecycle_status', t.data ->> 'status'");
    expect(migration).toContain("'lifecycle_status', f.data ->> 'status'");
    expect(migration).toContain("'due_date', f.data ->> 'due_date'");
    expect(migration).toContain("'due_at', f.data ->> 'due_at'");
    expect(migration).toContain("w.data -> 'legacy_payload' is distinct from t.data");
    expect(migration).toContain("w.data -> 'legacy_payload' is distinct from f.data");
  });

  test("fails loudly on collisions and parity drift", () => {
    expect(migration).toContain("WORK_ITEM_SHADOW_ID_COLLISION");
    expect(migration).toContain("WORK_ITEM_SHADOW_TASK_COUNT_MISMATCH");
    expect(migration).toContain("WORK_ITEM_SHADOW_FOLLOWUP_COUNT_MISMATCH");
    expect(migration).toContain("WORK_ITEM_SHADOW_TASK_PARITY_MISMATCH");
    expect(migration).toContain("WORK_ITEM_SHADOW_FOLLOWUP_PARITY_MISMATCH");
  });

  test("keeps the shadow table server-only", () => {
    expect(migration).toContain('alter table public."entity_workItems" enable row level security');
    expect(migration).toContain('revoke all on table public."entity_workItems" from public, anon, authenticated');
    expect(migration).toContain('grant select, insert, update, delete on table public."entity_workItems" to service_role');
  });
});
