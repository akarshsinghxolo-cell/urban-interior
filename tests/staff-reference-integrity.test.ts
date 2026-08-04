import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { hydrateStaffReferenceLabels } from "@/lib/rdash/staff-reference-labels";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";

const RUNTIME_ROOTS = ["src", "scripts", "supabase/functions"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);
const STAFF_REFERENCE_MIGRATION = "supabase/migrations/20260804094126_canonical_staff_reference_integrity.sql";

async function runtimeFiles(root: string): Promise<string[]> {
  try {
    if (!(await stat(root)).isDirectory()) return [];
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await runtimeFiles(path));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

describe("canonical Staff references", () => {
  test("derives compatibility labels from canonical Staff IDs", () => {
    const db = buildSeedDatabase() as RDashDatabase;
    db.master.staff = [
      {
        id: "staff-active",
        code: "S-001",
        name: "Canonical Staff",
        phone: "",
        email: "staff@example.com",
        role: "Field Staff",
        role_key: "FIELD_STAFF",
        department: "Field",
        designation: "Executive",
        city: "",
        status: "active",
        gps_tracking_enabled: true,
        salary_type: "monthly",
        attendance_policy: {
          id: "policy-staff-active",
          grace_period_minutes: 15,
          late_grace_minutes: 15,
          absent_deduction_enabled: false,
          absent_deduction_days: 0,
        },
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      } as never,
    ];
    db.tasks = [{
      id: "task-canonical",
      title: "Canonical assignment",
      status: "todo",
      priority: "medium",
      assigned_staff_id: "staff-active",
      due_date: "2026-08-05",
      task_scope: "general",
      comments: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as never];
    db.followups = [{
      id: "follow-canonical",
      title: "Canonical follow-up",
      status: "pending",
      priority: "medium",
      due_at: new Date(0).toISOString(),
      due_date: "2026-08-05",
      assigned_staff_id: "staff-active",
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as never];
    db.visits = [{
      id: "visit-canonical",
      customer_id: "customer-1",
      assigned_staff_id: "staff-active",
      visit_type: "site_visit",
      location_name: "Site",
      status: "scheduled",
      scheduled_at: new Date(0).toISOString(),
      proof_attachment_ids: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as never];

    hydrateStaffReferenceLabels(db);

    expect((db.tasks[0] as unknown as Record<string, unknown>).assignee_name).toBe("Canonical Staff");
    expect((db.followups[0] as unknown as Record<string, unknown>).assigned_to).toBe("Canonical Staff");
    expect((db.visits[0] as unknown as Record<string, unknown>).staff_name).toBe("Canonical Staff");
    expect((db.visits[0] as unknown as Record<string, unknown>).staff_id).toBe("staff-active");
  });

  test("has no legacy Staff profile runtime dependency", async () => {
    const matches: string[] = [];
    for (const root of RUNTIME_ROOTS) {
      for (const file of await runtimeFiles(root)) {
        const source = await readFile(file, "utf8");
        const legacyRelationName = ["Staff", "Profile"].join("");
        if (source.includes(legacyRelationName)) matches.push(file);
      }
    }
    expect(matches, `Legacy Staff profile runtime references remain: ${matches.join(", ")}`).toEqual([]);
  });

  test("hydrates scoped, full and delta workspace read paths", async () => {
    const scoped = await readFile("src/lib/rdash/server/module-scoped-read.ts", "utf8");
    const full = await readFile("src/lib/rdash/server/workspace.ts", "utf8");
    const delta = await readFile("src/lib/rdash/workspace-delta.ts", "utf8");
    expect(scoped).toContain("hydrateStaffReferenceLabels(data)");
    expect(full).toContain("hydrateStaffReferenceLabels(workspace.data)");
    expect(delta).toContain("hydrateStaffReferenceLabels(next)");
  });

  test("records the relational Staff lifecycle cutover", async () => {
    const migration = await readFile(STAFF_REFERENCE_MIGRATION, "utf8");
    const legacyRelationName = ["Staff", "Profile"].join("");

    expect(migration).toContain("generated always as");
    expect(migration).toContain("entity_attendance_staff_fkey");
    expect(migration).toContain("entity_visits_staff_fkey");
    expect(migration).toContain("entity_payroll_lines_staff_fkey");
    expect(migration).toContain("entity_leave_requests_staff_fkey");
    expect(migration).toContain("entity_salary_adjustments_staff_fkey");
    expect(migration).toContain("STAFF_ASSIGNMENT_REQUIRES_ACTIVE_STAFF");
    expect(migration).toContain("STAFF_DELETE_FORBIDDEN_USE_INACTIVE");
    expect(migration).toContain("on delete restrict");
    expect(migration).toContain(`drop view if exists public.\"${legacyRelationName}\"`);
  });
});
