import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const MIGRATION = "supabase/migrations/20260926070000_canonicalize_user_access_identity.sql";

describe("canonical user access identity", () => {
  test("keeps uc_user_roles as approval/link state rather than a second Staff profile", async () => {
    const sql = await testFile(MIGRATION).text();
    expect(sql).toContain("drop column if exists email");
    expect(sql).toContain("drop column if exists display_name");
    expect(sql).toContain("drop column if exists role");
    expect(sql).toContain("alter column staff_id set not null");
    expect(sql).toContain("constraint uc_user_roles_staff_id_fkey");
    expect(sql).toContain("references public.entity_master_staff(id)");
  });

  test("stores identity and role only on canonical Staff during auth sync", async () => {
    const sql = await testFile(MIGRATION).text();
    const start = sql.indexOf("create or replace function public.sync_staff_identity_bundle");
    const end = sql.indexOf("revoke all on function public.sync_staff_identity_bundle", start);
    const fn = sql.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(fn).toContain("'role_key',p_role");
    expect(fn).toContain("'email',v_email");
    expect(fn).toContain("insert into public.uc_user_roles");
    expect(fn).not.toContain("user_id,email,role,staff_id,display_name,status");
    expect(fn).not.toContain("email=v_email");
    expect(fn).not.toContain("display_name=v_name");
  });

  test("restores canonical Staff-reference normalization", async () => {
    const sql = await testFile(MIGRATION).text();
    expect(sql).toContain("update public.entity_attendance");
    expect(sql).toContain("data = data - 'staff_name'");
    expect(sql).toContain("create trigger entity_attendance_staff_history_normalizer");
    expect(sql).toContain("create trigger entity_tasks_staff_assignment_guard");
    expect(sql).toContain("public.uc_normalize_staff_history_payload()");
    expect(sql).toContain("public.uc_guard_staff_assignment()");
  });

  test("application enriches approval identity from canonical Staff", async () => {
    const approvals = await testFile("src/lib/rdash/server/auth-users.ts").text();
    expect(approvals).toContain('.from("entity_master_staff")');
    expect(approvals).toContain("enrichRoleAssignments");
    expect(approvals).toContain('const ROLE_ASSIGNMENT_SELECT = "id,user_id,staff_id,status');
    expect(approvals).not.toContain('.ilike("email", email)');
  });

  test("login authorization has no independent role-table fallback", async () => {
    const auth = await testFile("src/lib/rdash/server/auth.ts").text();
    expect(auth).toContain('.from("entity_master_staff")');
    expect(auth).not.toContain('.from("uc_user_roles")');
    expect(auth).not.toContain("role,staff_id,display_name,status");
  });
});
