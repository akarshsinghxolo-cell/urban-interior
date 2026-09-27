import { expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
describe("Supabase convergence rollout ordering", () => {


  test("keeps Contractor capability and lifecycle statuses separate", async () => {
    const types = await testFile("src/lib/rdash/types.ts").text();

    expectTokens(types, ['status?: "active" | "inactive";']);
    expectTokens(types, ['status?: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";']);
  });

  test("keeps auth-owned pending Staff access out of normal Staff edits", async () => {
    const types = await testFile("src/lib/rdash/types.ts").text();
    const dialog = await testFile("src/components/rdash/StaffEditDialog.tsx").text();

    expectTokens(types, ['status?: EntityStatus | "pending" | "blacklisted" | "exited";']);
    expect(dialog).toContain('disabled={Boolean(staff?.auth_user_id)}');
    expectTokens(dialog, ["email: staff?.auth_user_id ? staff.email : draft.email?.trim() || undefined"]);
    expectTokens(dialog, ['disabled={staff?.status === "pending"}']);
    expectTokens(dialog, ['disabled={value === "pending"}']);
  });
});
