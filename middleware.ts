import { NextRequest, NextResponse } from "next/server";
const PUBLIC = new Set(["/signin", "/api/auth/login", "/api/auth/signup", "/api/auth/logout", "/api/auth/session", "/api/health/config", "/api/changelog", "/api/qa/cron", "/logo.svg", "/sw.js", "/manifest.json"]);
export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (PUBLIC.has(path) || path.startsWith("/_next/"))
        return NextResponse.next();

    // CORS headers for Capacitor (Android) — allows the WebView to make API requests
    const origin = request.headers.get("origin");
    const response = NextResponse.next();
    if (origin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
    }

    // Handle preflight OPTIONS requests
    if (request.method === "OPTIONS") {
        return response;
    }

    // Accept either the rdash_session cookie OR an Authorization: Bearer <token> header.
    const authHeader = request.headers.get("authorization");
    const hasBearer = authHeader && authHeader.toLowerCase().startsWith("bearer ");
    if (!request.cookies.get("rdash_session")?.value && !hasBearer) {
        if (path.startsWith("/api/"))
            return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        return NextResponse.redirect(new URL("/signin", request.url));
    }
    return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
