"use client";

import * as React from "react";

export type LocationTrackingState = {
  status: "disabled" | "checking" | "active" | "queued" | "permission_denied" | "auth_required" | "error" | "unsupported";
  mode: "foreground_only" | "native_background";
  permission: PermissionState | "unknown" | "unsupported";
  pendingCount: number;
  lastCapturedAt?: string;
  lastSentAt?: string;
  message: string;
};

const KEY = "rdash:location-tracking-status:v1";
const EVENT = "rdash:location-tracking-status";
const DEFAULT_STATE: LocationTrackingState = {
  status: "checking",
  mode: "foreground_only",
  permission: "unknown",
  pendingCount: 0,
  message: "Checking device location permission…",
};

let memoryState = DEFAULT_STATE;
let cachedStorageValue: string | null | undefined;

/**
 * useSyncExternalStore requires getSnapshot to return the exact same object
 * while the underlying store has not changed. Cache the serialized value so
 * ordinary React snapshot checks do not rebuild a new object on every read.
 */
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
    const parsed = JSON.parse(stored) as Partial<LocationTrackingState> | null;
    memoryState = parsed?.status && parsed?.mode
      ? { ...DEFAULT_STATE, ...parsed }
      : DEFAULT_STATE;
  } catch {
    // Keep the last stable in-memory snapshot when storage is unavailable.
  }
  return memoryState;
}

export function publishLocationTrackingState(patch: Partial<LocationTrackingState>): LocationTrackingState {
  const nextState = { ...readLocationTrackingState(), ...patch };
  const serialized = JSON.stringify(nextState);
  memoryState = nextState;
  cachedStorageValue = serialized;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, serialized);
    } catch {
      // Private browsing may block localStorage; the event still updates the UI.
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: memoryState }));
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
  return React.useSyncExternalStore(subscribe, readLocationTrackingState, () => DEFAULT_STATE);
}
