"use client";

import {
  captureWorkspaceCommit,
  markWorkspaceCommitNetworkFailure,
  markWorkspaceCommitResponse,
  rememberWorkspaceResponse,
} from "@/lib/uploads/workspace-outbox";
import { workspaceReadState } from "@/lib/rdash/workspace-read-state";

/** Client-side session token manager for Urban Castle. */
const TOKEN_KEY = "uc_session_token";
const HEALTH_CACHE_TTL_MS = 5 * 60_000;
const WORKSPACE_READ_DEDUPE_TTL_MS = 2_500;

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

let nativeFetch: typeof window.fetch | null = null;
let refreshPromise: Promise<boolean> | null = null;
let healthResponseCache: { response: Response; expiresAt: number } | null = null;
let healthRequest: Promise<Response> | null = null;
const workspaceReadRequests = new Map<string, { promise: Promise<Response>; expiresAt: number }>();

function invalidateReadCaches() {
  healthResponseCache = null;
  workspaceReadRequests.clear();
}

/** Renew the short-lived browser session without prompting for credentials. */
export function refreshClientSession(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (refreshPromise) return refreshPromise;
  const request = nativeFetch || window.fetch.bind(window);
  const token = getSessionToken();
  refreshPromise = request("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({})) as { token?: string };
    if (!payload.token) return false;
    setSessionToken(payload.token);
    return true;
  }).catch(() => false).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function deferredWorkspaceCommitResponse(operationId: string): Response {
  return new Response(JSON.stringify({
    status: "processing",
    operationId,
    retryAfterSeconds: 10,
  }), {
    status: 202,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "10",
      "X-UC-Outbox-Deferred": "1",
    },
  });
}

function workspaceReadKey(headers: Headers) {
  return [
    headers.get("X-UC-Workspace-Path") || `${window.location.pathname}${window.location.search}`,
    headers.get("X-UC-Workspace-Module") || "",
  ].join("|");
}

async function singleFlightWorkspaceRead(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Headers,
) {
  const key = workspaceReadKey(headers);
  const now = Date.now();
  const existing = workspaceReadRequests.get(key);
  if (existing && existing.expiresAt > now) return (await existing.promise).clone();

  const promise = originalFetch(input, { ...init, headers });
  workspaceReadRequests.set(key, { promise, expiresAt: Number.POSITIVE_INFINITY });
  void promise.then(() => {
    const current = workspaceReadRequests.get(key);
    if (!current || current.promise !== promise) return;
    current.expiresAt = Date.now() + WORKSPACE_READ_DEDUPE_TTL_MS;
    window.setTimeout(() => {
      const latest = workspaceReadRequests.get(key);
      if (latest?.promise === promise && latest.expiresAt <= Date.now()) workspaceReadRequests.delete(key);
    }, WORKSPACE_READ_DEDUPE_TTL_MS + 50);
  }).catch(() => {
    if (workspaceReadRequests.get(key)?.promise === promise) workspaceReadRequests.delete(key);
  });
  return (await promise).clone();
}

async function sharedHealthRead(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  headers: Headers,
) {
  const force = init?.cache === "reload" || headers.get("X-UC-Health-Refresh") === "1";
  const now = Date.now();
  if (!force && healthResponseCache && healthResponseCache.expiresAt > now) {
    return healthResponseCache.response.clone();
  }
  if (healthRequest) return (await healthRequest).clone();

  healthRequest = originalFetch(input, { ...init, headers }).then((response) => {
    if (response.ok) {
      healthResponseCache = {
        response: response.clone(),
        expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
      };
    }
    return response;
  }).finally(() => {
    healthRequest = null;
  });
  return (await healthRequest).clone();
}

let fetchPatched = false;

/**
 * Adds bearer authentication, durable workspace commit capture, and read
 * single-flight behavior. Multiple mounted dashboard widgets now share one
 * health request, and duplicate workspace bootstraps share one network response.
 */
export function initAuthFetch(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  nativeFetch = originalFetch;
  const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/logout"];

  window.fetch = (async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const pathname = (() => {
      try {
        return new URL(url, window.location.origin).pathname;
      } catch {
        return url.split("?")[0];
      }
    })();
    const isApi = pathname.startsWith("/api/");
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => pathname === endpoint);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = getSessionToken();
    if (isApi && !isAuthEndpoint && token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const isWorkspaceCommit = pathname === "/api/operations/commit" && method === "POST";
    const isWorkspaceRead = pathname === "/api/workspace" && method === "GET";
    const isWorkspaceHealthRead = pathname === "/api/health/summary" && method === "GET";
    if ((isWorkspaceRead || isWorkspaceHealthRead) && !headers.has("X-UC-Workspace-Path")) {
      headers.set("X-UC-Workspace-Path", `${window.location.pathname}${window.location.search}`);
    }
    const deferReadState = headers.get("X-UC-Read-State-Deferred") === "1";
    const isReplay = headers.get("X-UC-Outbox-Replay") === "1";
    let operationId: string | undefined;
    let deferredResponse: Response | undefined;
    let body = init?.body;

    if (isWorkspaceCommit && !isReplay) {
      try {
        const captured = await captureWorkspaceCommit(body);
        body = captured.body;
        operationId = captured.operationId;
        if (captured.defer && operationId) deferredResponse = deferredWorkspaceCommitResponse(operationId);
      } catch (error) {
        console.error("[WorkspaceOutbox] Could not durably capture this commit; continuing with the online save.", error);
      }
    }
    if (deferredResponse) return deferredResponse;

    let responseReceived = false;
    try {
      let response: Response;
      if (isWorkspaceRead) {
        response = await singleFlightWorkspaceRead(originalFetch, input, { ...init, body }, headers);
      } else if (isWorkspaceHealthRead) {
        response = await sharedHealthRead(originalFetch, input, { ...init, body }, headers);
      } else {
        response = await originalFetch(input, { ...init, headers, body });
      }
      responseReceived = true;

      if (isWorkspaceRead) {
        if (response.ok && !deferReadState) workspaceReadState.recordResponse(response);
        try {
          await rememberWorkspaceResponse(response.clone());
        } catch (error) {
          console.error("[WorkspaceOutbox] Could not cache the accepted workspace baseline.", error);
        }
      }

      if (operationId) {
        try {
          response = await markWorkspaceCommitResponse(operationId, response);
        } catch (error) {
          console.error("[WorkspaceOutbox] Could not update the local commit status.", error);
        }
        if (response.ok) invalidateReadCaches();
        if (response.status === 409 || response.status === 429 || response.status >= 500) {
          const payload = await response.clone().json().catch(() => ({})) as { error?: string };
          throw new TypeError(payload.error || "Workspace synchronization will retry in the background.");
        }
      }
      return response;
    } catch (error) {
      if (operationId && !responseReceived) {
        try {
          await markWorkspaceCommitNetworkFailure(operationId, error);
        } catch (outboxError) {
          console.error("[WorkspaceOutbox] Could not record the network failure.", outboxError);
        }
      }
      throw error;
    }
  }) as typeof window.fetch;
}
