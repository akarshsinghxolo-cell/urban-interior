import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const authSource = readFileSync(
  join(import.meta.dir, "../src/lib/rdash/server/auth.ts"),
  "utf8",
);

describe("server authentication source security", () => {
  test("contains no static owner credential bypass", () => {
    expect(authSource).not.toContain("SUPER_OWNER");
    expect(authSource).not.toContain("UC_SUPER_OWNER_STAFF_ID");
    expect(authSource.toLowerCase()).not.toContain("hardcoded super owner");
  });

  test("contains no inline password literal in the authentication module", () => {
    expect(authSource).not.toMatch(/password\s*:\s*["'`][^"'`]+["'`]/i);
  });

  test("routes every non-empty credential attempt through Supabase Auth", () => {
    expect(authSource).toContain("return supabaseCredentials(email, password);");
    expect(authSource).toContain("auth.auth.signInWithPassword({ email, password })");
  });
});
