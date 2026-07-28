import { NextRequest, NextResponse } from "next/server";
import {
  decodeWorkspaceReturnTo,
  encodeWorkspaceReturnTo,
  safeWorkspaceReturnTo,
  workspaceDefaultEntry,
  WORKSPACE_RETURN_COOKIE,
  WORKSPACE_RETURN_MAX_AGE_SECONDS,
} from "@/lib/rdash/workspace-auth-return";

const PUBLIC = new Set([
  "/signin",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health/config",
  "/api/changelog",
  "/api/qa/cron",
  "/api/staging/bootstrap-initial-owner",
  "/logo.svg",
  "/sw.js",
  "/manifest.json",
]);

/**
 * CORS origin allowlist (fix for C2: previously reflected ANY origin).
 * Only known deployment origins, localhost (dev + Capacitor), and
 * NEXT_PUBLIC_APP_URL are allowed to make credentialed cross-origin requests.
 */
const ALLOWED_ORIGIN_PATTERNS: readonly RegExp[] = [
  /^https:\/\/urban-castle-[a-z0-9]+-akash264\.vercel\.app$/i,
  /^https:\/\/urban-interior-[a-z0-9]+-akash264\.vercel\.app$/i,
  /^https:\/\/urban-castle\.vercel\.app$/i,
  /^https:\/\/urban-interior\.vercel\.app$/i,
];

const CAPACITOR_ORIGINS = new Set([
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

function isAllowedOrigin(origin: string): boolean {
  if (CAPACITOR_ORIGINS.has(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/localhost(:\d+)?$/.test(origin)) return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && origin === appUrl.replace(/\/$/, "")) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function applyCors(response: NextResponse, cors: Record<string, string>): NextResponse {
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}

function clearWorkspaceReturnCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(WORKSPACE_RETURN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const origin = request.headers.get("origin");
  const cors = corsHeadersFor(origin);

  // Preflight: reject non-allowlisted origins.
  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 403 });
    }
    return applyCors(NextResponse.next(), cors);
  }

  if (PUBLIC.has(path) || path.startsWith("/_next/")) {
    return applyCors(NextResponse.next(), cors);
  }

  const authHeader = request.headers.get("authorization");
  const hasBearer = Boolean(authHeader && authHeader.toLowerCase().startsWith("bearer "));
  const hasSession = Boolean(request.cookies.get("uc_session")?.value || hasBearer);

  if (!hasSession) {
    if (path.startsWith("/api/")) {
      return applyCors(
        NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
        cors,
      );
    }

    const signInUrl = new URL("/signin", request.url);
    const response = NextResponse.redirect(signInUrl);
    const returnTo = safeWorkspaceReturnTo(`${path}${request.nextUrl.search}`);
    if (returnTo) {
      response.cookies.set(WORKSPACE_RETURN_COOKIE, encodeWorkspaceReturnTo(returnTo), {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: WORKSPACE_RETURN_MAX_AGE_SECONDS,
      });
    }
    return applyCors(response, cors);
  }

  // The existing sign-in page navigates to `/` after authentication. Prefer a
  // saved deep link, otherwise enter the canonical routed Workdesk.
  if (path === "/") {
    const returnTo = decodeWorkspaceReturnTo(request.cookies.get(WORKSPACE_RETURN_COOKIE)?.value);
    const destination = returnTo || workspaceDefaultEntry();
    if (destination) {
      const response = NextResponse.redirect(new URL(destination, request.url));
      if (request.cookies.has(WORKSPACE_RETURN_COOKIE)) {
        clearWorkspaceReturnCookie(response, request);
      }
      return applyCors(response, cors);
    }
  }

  return applyCors(NextResponse.next(), cors);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
