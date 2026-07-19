import type { NextRequest } from "next/server";

/**
 * Resolve the public-facing origin URL for the app, respecting gateway/proxy
 * forwarded headers. When behind the Caddy gateway, Vercel, or any reverse proxy,
 * request.nextUrl.origin returns the internal origin (e.g. http://localhost:3000)
 * which the user's browser cannot reach.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_APP_URL env var (explicit — set this on Vercel for reliability)
 * 2. X-Forwarded-Host header (Vercel, standard proxies)
 * 3. Host header (Caddy gateway sets header_up Host {host})
 * 4. request.nextUrl.origin (fallback)
 */
export function resolvePublicOrigin(request: NextRequest): string {
    // 1. Explicit env var — most reliable for production (Vercel, custom domains)
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) {
        return envUrl.replace(/\/$/, ""); // trim trailing slash
    }

    // 2. X-Forwarded-Host (Vercel sets this)
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedHost) {
        const proto = forwardedProto || "https";
        return `${proto}://${forwardedHost}`;
    }

    // 3. Host header (Caddy gateway sets header_up Host {host})
    const host = request.headers.get("host");
    if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("21.0.") && !host.startsWith("10.") && !host.startsWith("192.168.")) {
        const proto = forwardedProto || "https";
        return `${proto}://${host}`;
    }

    // 4. Fallback
    return request.nextUrl.origin;
}
