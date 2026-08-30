"use client";

import * as React from "react";

type LocationTrackingState = {
  status:
    | "disabled"
    | "checking"
    | "active"
    | "queued"
    | "permission_denied"
    | "auth_required"
    | "error"
    | "unsupported";
  mode: "frontend_bundle";
  permission: PermissionState | "unknown" | "unsupported";
  pendingCount: number;
  lastCapturedAt?: string;
  lastSentAt?: string;
  message: string;
};

const KEY = "uc:location-tracking-status:v2";
const EVENT = "uc:location-tracking-status";
const DEFAULT_STATE: LocationTrackingState = {
  status: "checking",
  mode: "frontend_bundle",
  permission: "unknown",
  pendingCount: 0,
  message:
    "Starting frontend route capture. Bundles sync hourly or manually.",
};

let memoryState = DEFAULT_STATE;
let cachedStorageValue: string | null | undefined;

export function readLocationTrackingState(): LocationTrackingState {
  if (typeof window === "undefined") return memoryState;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === cachedStorageValue) return memoryState;
    cachedStorageValue = stored;
    if (!stored) {
      memoryState = DEFAULT_STATE;
      return memoryState;
    }
    const parsed = JSON.parse(
      stored,
    ) as Partial<LocationTrackingState> | null;
    memoryState = parsed?.status
      ? { ...DEFAULT_STATE, ...parsed, mode: "frontend_bundle" }
      : DEFAULT_STATE;
  } catch {
    // Keep the latest stable in-memory state when storage is unavailable.
  }
  return memoryState;
}

export function publishLocationTrackingState(
  patch: Partial<LocationTrackingState>,
): LocationTrackingState {
  const nextState = {
    ...readLocationTrackingState(),
    ...patch,
    mode: "frontend_bundle" as const,
  };
  const serialized = JSON.stringify(nextState);
  memoryState = nextState;
  cachedStorageValue = serialized;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, serialized);
    } catch {
      // The event still updates the current page when storage is blocked.
    }
    window.dispatchEvent(
      new CustomEvent(EVENT, { detail: memoryState }),
    );
  }
  return memoryState;
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => listener();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocationTrackingState() {
  return React.useSyncExternalStore(
    subscribe,
    readLocationTrackingState,
    () => DEFAULT_STATE,
  );
}
