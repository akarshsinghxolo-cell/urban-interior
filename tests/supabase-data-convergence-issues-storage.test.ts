import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260802175500_add_issue_pilot_storage.sql";

const read = (path: string) => Bun.file(path).text();

describe("Issue consolidation P2 shadow storage", () => {
  test("creates additive canonical Issue storage with typed generated fields", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create table public.entity_issues");
    expect(migration).toContain("data jsonb not null");
    expect(migration).toContain("issue_type text generated always as");
    expect(migration).toContain("status text generated always as");
    expect(migration).toContain("customer_id text generated always as");
    expect(migration).toContain("work_order_id text generated always as");
    expect(migration).toContain("task_id text generated always as");
    expect(migration).toContain("amount numeric generated always as");
    expect(migration).toContain("entity_issues_workspace_type_status_idx");
    expect(migration).toContain("entity_issues_customer_idx");
    expect(migration).toContain("entity_issues_work_order_idx");
  });

  test("keeps the shadow table server-only during the pilot", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("alter table public.entity_issues enable row level security");
    expect(migration).toContain("revoke all on table public.entity_issues from anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.entity_issues to service_role");
  });

  test("backfills both legacy types while retaining the complete source row", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("from public.entity_blocked b");
    expect(migration).toContain("from public.entity_risks r");
    expect(migration).toContain("'issue_type', 'blocker'");
    expect(migration).toContain("'issue_type', 'risk'");
    expect(migration).toContain("'legacy_payload', b.data");
    expect(migration).toContain("'legacy_payload', r.data");
    expect(migration).toContain("b.data ->> 'linked_quotation_id'");
    expect(migration).toContain("r.data -> 'amount'");
  });

  test("aborts on ID collision or incomplete backfill instead of guessing", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("ISSUE_PILOT_LEGACY_ID_COLLISION");
    expect(migration).toContain("ISSUE_PILOT_BLOCKER_COUNT_MISMATCH");
    expect(migration).toContain("ISSUE_PILOT_RISK_COUNT_MISMATCH");
    expect(migration).toContain("ISSUE_PILOT_BLOCKER_ID_MISMATCH");
    expect(migration).toContain("ISSUE_PILOT_RISK_ID_MISMATCH");
    expect(migration).toContain("except\n    select i.id");
  });

  test("does not cut over, drop, or mutate legacy client-visible storage", async () => {
    const migration = await read(MIGRATION);
    const commitRest = await read("src/lib/rdash/server/commit-rest.ts");

    expect(migration).not.toContain("drop table public.entity_blocked");
    expect(migration).not.toContain("drop table public.entity_risks");
    expect(migration).not.toContain("delete from public.entity_blocked");
    expect(migration).not.toContain("delete from public.entity_risks");
    expect(migration).not.toContain("update public.entity_workspace_revision");
    expect(migration).not.toContain("insert into public.entity_workspace_change_batches");

    expect(commitRest).toContain('blocked: "entity_blocked"');
    expect(commitRest).toContain('risks: "entity_risks"');
    expect(commitRest).not.toContain('issues: "entity_issues"');
  });

  test("classifies the new physical table before it exists in a runtime map", async () => {
    const registry = await read("src/lib/rdash/database-physical-object-registry.ts");

    expect(registry).toContain("entity_issues: physical(");
    expect(registry).toContain('"Canonical Issue pilot storage"');
    expect(registry).toContain('"Risks/Blockers consolidation shadow and parity storage"');
  });
});
