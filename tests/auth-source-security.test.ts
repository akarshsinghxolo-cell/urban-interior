import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const authSource = readFileSync(
  join(repositoryRoot, "src/lib/rdash/server/auth.ts"),
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

  test("keeps the app bearer short-lived while Supabase refresh access is renewable", () => {
    const login = readFileSync(join(repositoryRoot, "src/app/api/auth/login/route.ts"), "utf8");
    const refresh = readFileSync(join(repositoryRoot, "src/app/api/auth/refresh/route.ts"), "utf8");
    const logout = readFileSync(join(repositoryRoot, "src/app/api/auth/logout/route.ts"), "utf8");
    const shell = readFileSync(join(repositoryRoot, "src/components/urban-castle/UrbanCastleApp.tsx"), "utf8");

    expect(authSource).toContain("export const SESSION_TTL = 28800");
    expect(authSource).toContain('export const AUTH_REFRESH_COOKIE = "uc_auth_refresh"');
    expect(authSource).toContain('httpOnly: true');
    expect(authSource).toContain('sameSite: "strict" as const');
    expect(authSource).toContain("auth.auth.refreshSession({ refresh_token: refreshToken })");
    expect(authSource).toContain("authorizedUserFromSupabase(data.user)");
    expect(login).toContain("refreshTokenCookie(renewable.refreshToken)");
    expect(refresh).toContain("extractRefreshToken(request)");
    expect(refresh).toContain("refreshAuthenticatedSession(refreshToken)");
    expect(logout).toContain("expiredRefreshTokenCookie()");
    expect(shell).toContain('locks.request("uc-auth-session-refresh"');
    expect(shell).toContain("AUTH_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000");
    expect(shell).toContain("<RenewableSessionGate>");
  });

  test("never tracks a live root environment file", () => {
    expect(existsSync(join(repositoryRoot, ".env"))).toBe(false);
    const example = readFileSync(join(repositoryRoot, ".env.example"), "utf8");
    expect(example).toContain("replace_me");
    expect(example).not.toMatch(/UC_OWNER_PASSWORD\s*=\s*["'][^"']+["']/);
  });
});
