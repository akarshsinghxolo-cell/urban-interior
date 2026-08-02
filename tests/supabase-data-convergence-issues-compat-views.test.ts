import { describe, expect, test } from "bun:test";

const MIGRATION = "supabase/migrations/20260802181609_cutover_issue_compatibility_views.sql";
const read = (path: string) => Bun.file(path).text();

describe("Issue compatibility-view physical consolidation", () => {
  test("moves legacy physical tables to a private rollback schema instead of dropping them", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create schema if not exists uc_legacy authorization postgres");
    expect(migration).toContain("alter table public.entity_blocked set schema uc_legacy");
    expect(migration).toContain("alter table public.entity_risks set schema uc_legacy");
    expect(migration).toContain("revoke all on schema uc_legacy from anon, authenticated, service_role");
    expect(migration).not.toContain("drop table public.entity_blocked");
    expect(migration).not.toContain("drop table public.entity_risks");
  });

  test("recreates the old public relation names as security-invoker compatibility views", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create view public.entity_blocked\nwith (security_invoker = true)");
    expect(migration).toContain("create view public.entity_risks\nwith (security_invoker = true)");
    expect(migration).toContain("from public.entity_issues i\nwhere i.issue_type = 'blocker'");
    expect(migration).toContain("where i.issue_type = 'risk'\n  and i.status = 'open'");
    expect(migration).toContain("'resolved', i.status <> 'open'");
    expect(migration).toContain("'type', i.risk_type");
  });

  test("translates legacy writes through one canonical Issue writer", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("create or replace function public.uc_legacy_issue_view_write()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("instead of insert or update or delete on public.entity_blocked");
    expect(migration).toContain("execute function public.uc_legacy_issue_view_write('blocker')");
    expect(migration).toContain("instead of insert or update or delete on public.entity_risks");
    expect(migration).toContain("execute function public.uc_legacy_issue_view_write('risk')");
    expect(migration).toContain("insert into public.entity_issues");
    expect(migration).toContain("update public.entity_issues");
    expect(migration).toContain("delete from public.entity_issues");
  });

  test("preserves complete legacy payloads while typed canonical fields drive the shared table", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("'legacy_payload', new.data");
    expect(migration).toContain("'work_order_id', new.data ->> 'linked_work_order_id'");
    expect(migration).toContain("'quotation_id', new.data ->> 'linked_quotation_id'");
    expect(migration).toContain("'risk_type', new.data ->> 'type'");
    expect(migration).toContain("'severity', new.data ->> 'severity'");
  });

  test("keeps existing logical collection mappings and journal payload contracts unchanged", async () => {
    const migration = await read(MIGRATION);
    const commitRest = await read("src/lib/rdash/server/commit-rest.ts");

    expect(commitRest).toContain('blocked: "entity_blocked"');
    expect(commitRest).toContain('risks: "entity_risks"');
    expect(commitRest).not.toContain('issues: "entity_issues"');
    expect(migration).not.toContain("update public.entity_workspace_revision");
    expect(migration).not.toContain("insert into public.entity_workspace_change_batches");
  });

  test("aborts instead of overwriting unexpected canonical-only Issue rows", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("ISSUE_COMPAT_CANONICAL_ONLY_ROWS_PRESENT");
    expect(migration).toContain("ISSUE_COMPAT_LEGACY_ID_COLLISION");
    expect(migration).toContain("ISSUE_COMPAT_BLOCKER_COUNT_MISMATCH");
    expect(migration).toContain("ISSUE_COMPAT_RISK_COUNT_MISMATCH");
    expect(migration).toContain("ISSUE_COMPAT_CANONICAL_ROW_MISSING");
  });

  test("keeps compatibility views server-only", async () => {
    const migration = await read(MIGRATION);

    expect(migration).toContain("revoke all on table public.entity_blocked from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.entity_risks from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.entity_blocked to service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.entity_risks to service_role");
  });
});
