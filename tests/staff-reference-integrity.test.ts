import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { staffNameForId } from "@/lib/rdash/staff-directory";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import type { RDashDatabase } from "@/lib/rdash/types";

const RUNTIME_ROOTS = ["src", "scripts", "supabase/functions"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"]);
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
  test("keeps assignment records ID-only and resolves presentation labels from Staff master", () => {
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
      checklist: [],
      proofs: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }];
    db.followups = [{
      id: "follow-canonical",
      title: "Canonical follow-up",
      status: "pending",
      priority: "medium",
      due_at: new Date(0).toISOString(),
      due_date: "2026-08-05",
      assigned_staff_id: "staff-active",
      notes_history: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }];
    db.visits = [{
      id: "visit-canonical",
      customer_id: "customer-1",
      assigned_staff_id: "staff-active",
      assignee_type: "staff",
      visit_type: "site_visit",
      location_name: "Site",
      status: "scheduled",
      scheduled_at: new Date(0).toISOString(),
      proof_attachment_ids: [],
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }];

    expect(staffNameForId(db, db.tasks[0].assigned_staff_id)).toBe("Canonical Staff");
    expect(staffNameForId(db, db.followups[0].assigned_staff_id)).toBe("Canonical Staff");
    expect(staffNameForId(db, db.visits[0].assigned_staff_id)).toBe("Canonical Staff");

    expect((db.tasks[0] as unknown as Record<string, unknown>).assignee_name).toBeUndefined();
    expect((db.followups[0] as unknown as Record<string, unknown>).assigned_to).toBeUndefined();
    expect((db.visits[0] as unknown as Record<string, unknown>).staff_name).toBeUndefined();
    expect((db.visits[0] as unknown as Record<string, unknown>).staff_id).toBeUndefined();
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

  test("does not reintroduce Staff compatibility hydration in workspace read paths", async () => {
    const scoped = await readFile("src/lib/rdash/server/module-scoped-read.ts", "utf8");
    const full = await readFile("src/lib/rdash/server/workspace.ts", "utf8");
    const delta = await readFile("src/lib/rdash/workspace-delta.ts", "utf8");
    expect(scoped).not.toContain("hydrateStaffReferenceLabels");
    expect(full).not.toContain("hydrateStaffReferenceLabels");
    expect(delta).not.toContain("hydrateStaffReferenceLabels");
  });

});
