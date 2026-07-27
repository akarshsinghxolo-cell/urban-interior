import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import {
  encodeWorkspaceReturnTo,
  WORKSPACE_RETURN_COOKIE,
} from "../src/lib/rdash/workspace-auth-return";

const origin = "https://urban-castle.vercel.app";

describe("workspace auth middleware", () => {
  test("captures an unauthenticated workspace destination before sign-in", () => {
    const response = middleware(new NextRequest(`${origin}/workspace/customers?tab=activity`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/signin`);
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain(`${WORKSPACE_RETURN_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Max-Age=600");
  });

  test("preserves API authentication failures as JSON 401 responses", async () => {
    const response = middleware(new NextRequest(`${origin}/api/workspace`));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication is required." });
    expect(response.headers.get("location")).toBeNull();
  });

  test("restores and consumes a validated destination after authentication", () => {
    const returnTo = encodeWorkspaceReturnTo("/workspace/field/gps?staff=staff-1");
    const request = new NextRequest(`${origin}/`, {
      headers: {
        cookie: `uc_session=session-token; ${WORKSPACE_RETURN_COOKIE}=${returnTo}`,
      },
    });
    const response = middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/workspace/field/gps?staff=staff-1`);
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain(`${WORKSPACE_RETURN_COOKIE}=`);
    expect(cookie).toContain("Max-Age=0");
  });

  test("never redirects an authenticated root request to an external cookie value", () => {
    const request = new NextRequest(`${origin}/`, {
      headers: {
        cookie: `uc_session=session-token; ${WORKSPACE_RETURN_COOKIE}=${encodeURIComponent("https://example.com")}`,
      },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
