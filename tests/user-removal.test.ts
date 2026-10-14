import { describe, expect, test } from "vitest";
import { cascadeDelete } from "../src/lib/rdash/integrity/cascade";
import { assertWorkspaceMutationAllowed } from "../src/lib/rdash/server/mutation-policy";
import type { AuthenticatedUser } from "../src/lib/rdash/server/auth";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { testFile } from "./test-file";

describe("user and Staff removal", () => {
  test("an unused Staff profile is physically removed through the shared cascade planner", () => {
    const db = buildSeedDatabase();
    const unused = {
      ...db.master.staff[0],
      id: "staff-unused-delete-test",
      code: "STF-UNUSED",
      name: "Unused Staff",
      auth_user_id: undefined,
      login_enabled: false,
      login_email: undefined,
    };
    db.master.staff.push(unused);

    const result = cascadeDelete(db, "master.staff", unused.id);

    expect(result.result.success).toBe(true);
    expect(result.db.master.staff.some((staff) => staff.id === unused.id)).toBe(false);
  });

  test("the server protects the signed-in Staff profile and requires login deletion first", () => {
    const db = buildSeedDatabase();
    const target = db.master.staff.find((staff) => staff.id !== "staff-owner");
    expect(target).toBeDefined();
    if (!target) throw new Error("Seed Staff fixture is missing.");
    target.auth_user_id = "11111111-1111-4111-8111-111111111111";
    const owner: AuthenticatedUser = {
      userId: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.com",
      role: "Owner",
      name: "Owner",
      staffId: "staff-owner",
      expiresAt: Date.now() + 60_000,
    };

    expect(() => assertWorkspaceMutationAllowed(owner, [
      { collection: "master.staff", deleteIds: ["staff-owner"] },
    ], db)).toThrow("cannot remove your own Staff profile");
    expect(() => assertWorkspaceMutationAllowed(owner, [
      { collection: "master.staff", deleteIds: [target.id] },
    ], db)).toThrow("Delete this Staff member's login account");
  });

  test("login deletion detaches canonical Staff before hard-deleting Supabase Auth", async () => {
    const migration = await testFile("supabase/migrations/20261014063545_detach_staff_login_identity.sql").text();
    const server = await testFile("src/lib/rdash/server/auth-users.ts").text();
    const route = await testFile("src/app/api/auth/users/route.ts").text();
    const approvals = await testFile("src/components/rdash/modules/UserApprovalsModule.tsx").text();
    const editor = await testFile("src/components/rdash/StaffEditDialog.tsx").text();

    expect(migration).toContain("create or replace function public.detach_staff_login_identity");
    expect(migration).toContain("v_staff.data - 'auth_user_id' - 'login_email'");
    expect(migration).toContain("'login_enabled', false");
    expect(migration).toContain("to service_role");
    expect(server).toContain("export async function deleteLoginAccount");
    expect(server).toContain("You cannot delete your own login account while signed in.");
    const deletion = server.slice(server.indexOf("export async function deleteLoginAccount"));
    expect(deletion.indexOf('admin.rpc("detach_staff_login_identity"')).toBeLessThan(deletion.indexOf("admin.auth.admin.deleteUser"));
    expect(route).toContain('action?: "approve" | "reject" | "revoke" | "delete"');
    expect(route).toContain("deleteLoginAccount(user, body)");
    expect(approvals).toContain("Delete login account?");
    expect(approvals).toContain("payroll, attendance and business history remain");
    expect(editor).toContain('cascadeDeleteRecord("master.staff", staff.id)');
    expect(editor).toContain('status: "exited"');
    expect(editor).toContain("payroll or business history must be preserved");
  });
});
