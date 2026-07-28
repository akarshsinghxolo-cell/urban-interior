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
const HEALTH_CACHE_PREFIX = "uc_workspace_health_v1:";
const HEALTH_CACHE_TTL_MS = 5 * 60_000;
const HEALTH_HIDDEN_STALE_MS = 24 * 60 * 60_000;
const WORKSPACE_READ_DEDUPE_TTL_MS = 10_000;

interface StoredHealthResponse {
  body: string;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  expiresAt: number;
  storedAt: number;
}

type BrowserLocks = {
  request(name: string, callback: () => Promise<Response>): Promise<Response>;
};

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function decodeSessionIdentity(token: string | null) {
  if (!token) return "anonymous";
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return `token:${hashIdentity(token)}`;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as Record<string, unknown>;
    const stableIdentity = payload.sub || payload.user_id || payload.email;
    if (typeof stableIdentity === "string" && stableIdentity.trim()) {
      return `user:${hashIdentity(stableIdentity.trim().toLowerCase())}`;
    }
  } catch {
    // Fall back to a token fingerprint only for non-JWT legacy sessions.
  }
  return `token:${hashIdentity(token)}`;
}

function healthStorageKey() {
  return `${HEALTH_CACHE_PREFIX}${decodeSessionIdentity(getSessionToken())}`;
}

function clearStoredHealthResponses() {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(HEALTH_CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in restrictive privacy modes.
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const previous = window.localStorage.getItem(TOKEN_KEY);
    if (previous && decodeSessionIdentity(previous) !== decodeSessionIdentity(token)) {
      clearStoredHealthResponses();
    }
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage may be unavailable in some privacy modes
  }
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    clearStoredHealthResponses();
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
  clearStoredHealthResponses();
  workspaceReadRequests.clear();
}

function responseFromStored(stored: StoredHealthResponse) {
  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: stored.headers,
  });
}

function readStoredHealthResponse(allowStale: boolean) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(healthStorageKey());
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredHealthResponse>;
    if (
      typeof stored.body !== "string" ||
      typeof stored.status !== "number" ||
      typeof stored.statusText !== "string" ||
      !Array.isArray(stored.headers) ||
      typeof stored.expiresAt !== "number" ||
      typeof stored.storedAt !== "number"
    ) {
      window.localStorage.removeItem(healthStorageKey());
      return null;
    }
    const now = Date.now();
    const fresh = stored.expiresAt > now;
    const safelyStale = allowStale && stored.storedAt + HEALTH_HIDDEN_STALE_MS > now;
    if (!fresh && !safelyStale) return null;
    return {
      response: responseFromStored(stored as StoredHealthResponse),
      expiresAt: stored.expiresAt,
      fresh,
    };
  } catch {
    return null;
  }
}

async function persistHealthResponse(response: Response) {
  if (typeof window === "undefined" || !response.ok) return;
  try {
    const storedAt = Date.now();
    const stored: StoredHealthResponse = {
      body: await response.clone().text(),
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      expiresAt: storedAt + HEALTH_CACHE_TTL_MS,
      storedAt,
    };
    window.localStorage.setItem(healthStorageKey(), JSON.stringify(stored));
    healthResponseCache = {
      response: response.clone(),
      expiresAt: stored.expiresAt,
    };
  } catch {
    // The in-memory cache still protects this tab when persistence is blocked.
  }
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
  const rawPath = headers.get("X-UC-Workspace-Path") || window.location.pathname;
  const normalizedPath = String(rawPath || "/workspace")
    .split(/[?#]/, 1)[0]
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "") || "/workspace";
  return normalizedPath;
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

  if (!force) {
    const stored = readStoredHealthResponse(document.visibilityState !== "visible");
    if (stored) {
      if (stored.fresh) {
        healthResponseCache = { response: stored.response.clone(), expiresAt: stored.expiresAt };
      }
      return stored.response;
    }
  }
  if (healthRequest) return (await healthRequest).clone();

  const fetchOrReuse = async () => {
    // Re-check after entering the cross-tab lock because another tab may have
    // completed the same request while this tab was waiting.
    if (!force) {
      const stored = readStoredHealthResponse(document.visibilityState !== "visible");
      if (stored) return stored.response;
    }
    const response = await originalFetch(input, { ...init, headers });
    await persistHealthResponse(response);
    return response;
  };

  const locks = (navigator as unknown as { locks?: BrowserLocks }).locks;
  healthRequest = (locks
    ? locks.request(`uc-workspace-health:${healthStorageKey()}`, fetchOrReuse)
    : fetchOrReuse()
  ).finally(() => {
    healthRequest = null;
  });
  return (await healthRequest).clone();
}

let fetchPatched = false;

/**
 * Adds bearer authentication, durable workspace commit capture, and read
 * single-flight behavior. Health responses are coordinated across components
 * and browser tabs, while duplicate workspace bootstraps share one response.
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
