"use client";

import {
  captureWorkspaceCommit,
  markWorkspaceCommitNetworkFailure,
  markWorkspaceCommitResponse,
} from "@/lib/uploads/workspace-outbox";

/** Client-side session token manager for Urban Castle. */
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
 * Adds bearer authentication to API requests and durably captures workspace
 * commits before they touch the network. A replay request carries
 * X-UC-Outbox-Replay and bypasses capture so it does not create itself again.
 */
export function initAuthFetch(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/logout"];

  window.fetch = (async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const isApi = url.startsWith("/api/") || url.includes("/api/");
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = getSessionToken();
    if (isApi && !isAuthEndpoint && token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const isWorkspaceCommit = url.includes("/api/operations/commit") && (init?.method || "GET").toUpperCase() === "POST";
    const isReplay = headers.get("X-UC-Outbox-Replay") === "1";
    let operationId: string | undefined;
    let body = init?.body;

    if (isWorkspaceCommit && !isReplay) {
      const captured = await captureWorkspaceCommit(body);
      body = captured.body;
      operationId = captured.operationId;
    }

    let responseReceived = false;
    try {
      const response = await originalFetch(input, { ...init, headers, body });
      responseReceived = true;
      if (operationId) {
        await markWorkspaceCommitResponse(operationId, response.clone());
        if (response.status === 409 || response.status === 429 || response.status >= 500) {
          const payload = await response.clone().json().catch(() => ({})) as { error?: string };
          throw new TypeError(payload.error || "Workspace synchronization will retry in the background.");
        }
      }
      return response;
    } catch (error) {
      if (operationId && !responseReceived) await markWorkspaceCommitNetworkFailure(operationId, error);
      throw error;
    }
  }) as typeof window.fetch;
}
