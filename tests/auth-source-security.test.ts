import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const authSource = readFileSync(
  join(repositoryRoot, "src/lib/rdash/server/auth.ts"),
  "utf8",
);
const staffAuthMigration = readFileSync(
  join(repositoryRoot, "supabase/migrations/20260808190000_add_staff_auth_user_lookup.sql"),
  "utf8",
);

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("server authentication source security", () => {
  test("keeps the owner-approved static super-owner credential anchored", () => {
    // Restored by owner request. The bypass stays anchored to its documented
    // env overrides and the seeded "staff-owner" Staff record, and the
    // Supabase path remains the only route for everyone else.
    expectTokens(authSource, ["SUPER_OWNER", "akarshsingh4@gmail.com"]);
    expectTokens(authSource, ['process.env.UC_SUPER_OWNER_STAFF_ID || "staff-owner"']);
    expectTokens(authSource, ["email === SUPER_OWNER.email && matchesOwnerPassword(password)"]);
    expect(
      authSource.indexOf("matchesOwnerPassword(password)"),
    ).toBeLessThan(authSource.indexOf("return supabaseCredentialSession(email, password);"));
  });

  test("leaks the owner credential into no source file outside the server auth module", () => {
    // The super-owner PASSWORD literal may exist only in auth.ts (server-only
    // module). The owner email is public config metadata (health/config) and
    // is not scanned here.
    const offenders = walkSourceFiles(join(repositoryRoot, "src"))
      .filter((file) => !file.endsWith(join("src", "lib", "rdash", "server", "auth.ts")))
      .filter((file) => readFileSync(file, "utf8").includes("Akarsh@"));
    expect(offenders).toEqual([]);
  });

  test("routes every non-empty credential attempt through Supabase Auth", () => {
    expectTokens(authSource, ["return supabaseCredentialSession(email, password);"]);
    expectTokens(authSource, ["auth.auth.signInWithPassword({ email, password })"]);
  });

  test("uses one workspace-scoped indexed Staff lookup", () => {
    expectTokens(authSource, ['const WORKSPACE_ID = process.env.UC_WORKSPACE_ID || "default";']);
    expectTokens(authSource, ['.eq("workspace_id", WORKSPACE_ID)']);
    expectTokens(authSource, ['.eq("auth_user_id_gen" as never, user.id)']);
    expect(authSource).not.toContain("generatedLookupError");
    expectNoTokens(authSource, ['eq("workspace_id", "default")']);
    expectTokens(staffAuthMigration, ["generated always as (nullif(data ->> 'auth_user_id', '')) stored"]);
    expect(staffAuthMigration).toContain("entity_master_staff_workspace_auth_user_idx");
    expectTokens(staffAuthMigration, ["(workspace_id, auth_user_id_gen)"]);
  });

  test("keeps the app bearer short-lived while Supabase refresh access is renewable", () => {
    const login = readFileSync(join(repositoryRoot, "src/app/api/auth/login/route.ts"), "utf8");
    const refresh = readFileSync(join(repositoryRoot, "src/app/api/auth/refresh/route.ts"), "utf8");
    const logout = readFileSync(join(repositoryRoot, "src/app/api/auth/logout/route.ts"), "utf8");
    const shell = readFileSync(join(repositoryRoot, "src/components/urban-castle/UrbanCastleApp.tsx"), "utf8");

    expectTokens(authSource, ["export const SESSION_TTL = 28800"]);
    expectTokens(authSource, ['export const AUTH_REFRESH_COOKIE = "uc_auth_refresh"']);
    expectTokens(authSource, ["httpOnly: true"]);
    expectTokens(authSource, ['sameSite: "strict" as const']);
    expectTokens(authSource, ["auth.auth.refreshSession({ refresh_token: refreshToken })"]);
    expect(authSource).toContain("authorizedUserFromSupabase(data.user)");
    expect(login).toContain("refreshTokenCookie(renewable.refreshToken)");
    expect(refresh).toContain("extractRefreshToken(request)");
    expect(refresh).toContain("refreshAuthenticatedSession(refreshToken)");
    expect(logout).toContain("expiredRefreshTokenCookie()");
    expect(shell).toContain('locks.request("uc-auth-session-refresh"');
    expectTokens(shell, ["AUTH_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000"]);
    expect(shell).toContain("<RenewableSessionGate>");
  });

  test("never tracks a live root environment file", () => {
    expect(existsSync(join(repositoryRoot, ".env"))).toBe(false);
    const example = readFileSync(join(repositoryRoot, ".env.example"), "utf8");
    expect(example).toContain("replace_me");
    expect(example).not.toMatch(/UC_OWNER_PASSWORD\s*=\s*["'][^"']+["']/);
  });
});
