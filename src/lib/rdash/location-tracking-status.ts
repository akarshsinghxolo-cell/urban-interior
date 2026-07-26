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

export function readLocationTrackingState(): LocationTrackingState {
  if (typeof window === "undefined") return memoryState;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "null") as Partial<LocationTrackingState> | null;
    if (parsed?.status && parsed?.mode) memoryState = { ...DEFAULT_STATE, ...parsed };
  } catch {
    // Keep the last in-memory state when storage is unavailable.
  }
  return memoryState;
}

export function publishLocationTrackingState(patch: Partial<LocationTrackingState>): LocationTrackingState {
  memoryState = { ...readLocationTrackingState(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(memoryState));
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
