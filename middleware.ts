import { NextRequest, NextResponse } from "next/server";

const PUBLIC = new Set([
  "/signin",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/health/config",
  "/api/changelog",
  "/api/qa/cron",
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

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const origin = request.headers.get("origin");
  const cors = corsHeadersFor(origin);

  // Preflight: reject non-allowlisted origins.
  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 403 });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  if (PUBLIC.has(path) || path.startsWith("/_next/")) {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  const authHeader = request.headers.get("authorization");
  const hasBearer = authHeader && authHeader.toLowerCase().startsWith("bearer ");
  if (!request.cookies.get("uc_session")?.value && !hasBearer) {
    if (path.startsWith("/api/")) {
      const res = NextResponse.json({ error: "Authentication is required." }, { status: 401 });
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
    const res = NextResponse.redirect(new URL("/signin", request.url));
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
