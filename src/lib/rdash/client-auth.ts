"use client";
/**
 * Client-side session token manager for Urban Castle.
 *
 * Stores the HMAC session token in localStorage and automatically attaches
 * it as a Bearer token on every /api/ request via a fetch wrapper.
 * The cookie auth path also works for same-origin access.
 */
const TOKEN_KEY = "uc_session_token";

export function getSessionToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setSessionToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // localStorage may be unavailable in some privacy modes
    }
}

export function clearSessionToken(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // ignore
    }
}

let fetchPatched = false;

/**
 * Patches window.fetch so every /api/ request (except auth endpoints)
 * automatically includes the Authorization: Bearer <token> header.
 * Safe to call multiple times — only patches once.
 */
export function initAuthFetch(): void {
    if (fetchPatched || typeof window === "undefined") return;
    fetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/logout"];
    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        const isApi = url.startsWith("/api/") || url.includes("/api/");
        const isAuthEndpoint = AUTH_ENDPOINTS.some((ep) => url.includes(ep));
        const token = getSessionToken();
        if (isApi && !isAuthEndpoint && token) {
            const baseHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
            const headers = new Headers(baseHeaders);
            if (!headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${token}`);
            }
            return originalFetch(input, { ...init, headers });
        }
        return originalFetch(input, init);
    } as typeof window.fetch;
}
