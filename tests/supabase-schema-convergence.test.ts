import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260801193000_supabase_schema_convergence.sql"),
  "utf8",
);
const ownership = readFileSync(
  join(root, "docs/supabase-data-ownership.md"),
  "utf8",
);

describe("Supabase schema convergence", () => {
  test("removes only confirmed legacy workspace writers", () => {
    expect(migration).toContain(
      "drop function if exists public.commit_operations(text, jsonb, jsonb, text)",
    );
    expect(migration).toContain(
      "drop function if exists public.write_workspace_snapshot(text, text, integer)",
    );
    expect(migration).toContain('drop table if exists public."CollectionMeta"');
    expect(migration).not.toContain('drop table if exists public."GenericRecord"');
    expect(migration).not.toMatch(/drop table if exists public\.entity_(customers|sites|master_contractors|master_vendors)/);
  });

  test("guards against deleting live legacy data", () => {
    expect(migration).toContain("CollectionMeta is not empty");
    expect(migration).toContain("Legacy workspace.snapshot rows still exist");
  });

  test("publishes Staff master updates to the workspace journal", () => {
    expect(migration).toContain("sync_staff_identity_bundle_core");
    expect(migration).toContain("'collection', 'master.staff'");
    expect(migration).toContain("insert into public.entity_workspace_change_batches");
    expect(migration).toContain("'master.staff:' || v_staff_id");
  });

  test("establishes a baseline across pre-existing revision gaps", () => {
    expect(migration).toContain("from public.entity_workspace_revision");
    expect(migration).toContain("is_baseline");
    expect(migration).toContain("on conflict (workspace_id, revision) do update set");
  });

  test("documents canonical write ownership", () => {
    expect(ownership).toContain("exactly one canonical writable owner");
    expect(ownership).toContain("Contractor capability and agreed rate");
    expect(ownership).toContain("sync_staff_identity_bundle");
    expect(ownership).toContain("GenericRecord is not retired");
  });
});
