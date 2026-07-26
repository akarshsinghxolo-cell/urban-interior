"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { refreshClientSession } from "@/lib/rdash/client-auth";
import {
  publishLocationTrackingState,
  readLocationTrackingState,
} from "@/lib/rdash/location-tracking-status";
import type { StaffLocationPing } from "@/lib/rdash/staff-location";

const PENDING_KEY = "rdash:pending-staff-location-pings:v2";
const LEGACY_PENDING_KEY = "rdash:pending-staff-location-pings:v1";
const MINIMUM_PING_INTERVAL_MS = 30_000;
const MAX_PENDING_POINTS = 5_760; // 48 hours at one point every 30 seconds.
const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_CAPTURE_FUTURE_SKEW_MS = 2 * 60_000;
const SESSION_RENEW_INTERVAL_MS = 30 * 60_000;

type PendingPoint = Omit<StaffLocationPing, "id" | "staff_id">;

class LocationPostError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isPendingPoint(value: Partial<PendingPoint>): value is PendingPoint {
  const now = Date.now();
  const capturedAt = value.captured_at ? new Date(value.captured_at).getTime() : Number.NaN;
  return Boolean(
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Number.isFinite(value.accuracy_m) &&
    value.latitude! >= -90 &&
    value.latitude! <= 90 &&
    value.longitude! >= -180 &&
    value.longitude! <= 180 &&
    value.accuracy_m! > 0 &&
    value.accuracy_m! <= 250 &&
    Number.isFinite(capturedAt) &&
    capturedAt >= now - MAX_CAPTURE_AGE_MS &&
    capturedAt <= now + MAX_CAPTURE_FUTURE_SKEW_MS &&
    (value.source === "browser_foreground" || value.source === "native_background")
  );
}

function readPendingPoints(): PendingPoint[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY) || window.localStorage.getItem(LEGACY_PENDING_KEY) || "[]";
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((point): point is PendingPoint => Boolean(point && typeof point === "object" && isPendingPoint(point as Partial<PendingPoint>)))
          .slice(-MAX_PENDING_POINTS)
      : [];
  } catch {
    return [];
  }
}

function writePendingPoints(points: PendingPoint[]) {
  const valid = points.filter(isPendingPoint).slice(-MAX_PENDING_POINTS);
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(valid));
    window.localStorage.removeItem(LEGACY_PENDING_KEY);
  } catch {
    // Keep tracking active even if this browser blocks persistent storage.
  }
  publishLocationTrackingState({ pendingCount: valid.length });
}

function enqueue(point: PendingPoint) {
  writePendingPoints([...readPendingPoints(), point]);
  publishLocationTrackingState({
    status: "queued",
    lastCapturedAt: point.captured_at,
    message: navigator.onLine
      ? "Location is queued and will retry automatically."
      : "Offline: location is queued and will send when connectivity returns.",
  });
}

function browserPoint(position: GeolocationPosition): PendingPoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    captured_at: new Date(position.timestamp || Date.now()).toISOString(),
    source: "browser_foreground",
  };
}

async function postPointOnce(point: PendingPoint) {
  const response = await fetch("/api/tracking/ping", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(point),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    point?: StaffLocationPing;
    ignored?: boolean;
    error?: string;
  };
  if (!response.ok) throw new LocationPostError(payload.error || "Location point was not accepted.", response.status);
  if (payload.ignored) {
    return {
      id: `demo-${point.captured_at}`,
      staff_id: "demo",
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy_m: point.accuracy_m,
      captured_at: point.captured_at,
      source: point.source,
      created_at: new Date().toISOString(),
    } as StaffLocationPing;
  }
  if (!payload.point) throw new LocationPostError(payload.error || "Location point was not accepted.", response.status);
  return payload.point;
}

async function postPoint(point: PendingPoint) {
  try {
    return await postPointOnce(point);
  } catch (error) {
    if (error instanceof LocationPostError && error.status === 401 && await refreshClientSession()) {
      return postPointOnce(point);
    }
    throw error;
  }
}

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Location permission is blocked. Allow precise location in browser/site settings.";
  if (error.code === error.POSITION_UNAVAILABLE) return "This device cannot determine a location. Check GPS and network settings.";
  if (error.code === error.TIMEOUT) return "Location timed out. Tracking will keep retrying while the app is open.";
  return error.message || "Location tracking failed.";
}

export function StaffLocationTracker() {
  const authUser = useRDashStore((state) => state.authUser);
  const staff = useRDashStore((state) =>
    authUser?.staffId ? state.db.master.staff.find((row) => row.id === authUser.staffId) : undefined,
  );
  const upsertStaffLocationPing = useRDashStore((state) => state.upsertStaffLocationPing);
  const lastSentAt = React.useRef(0);
  const flushing = React.useRef(false);

  const enabled = Boolean(authUser && (
    (authUser.staffId && (!staff || (staff.status === "active" && staff.gps_tracking_enabled !== false))) ||
    authUser.role === "Owner" ||
    authUser.role === "Operations Manager"
  ));

  const send = React.useCallback(async (point: PendingPoint): Promise<"sent" | "invalid" | "retry"> => {
    try {
      const accepted = await postPoint(point);
      upsertStaffLocationPing(accepted);
      publishLocationTrackingState({
        status: "active",
        lastCapturedAt: point.captured_at,
        lastSentAt: new Date().toISOString(),
        message: document.visibilityState === "visible"
          ? "Foreground tracking is active."
          : "Foreground-only tracking pauses when the browser or device suspends this page.",
      });
      return "sent";
    } catch (error) {
      if (error instanceof LocationPostError && error.status === 422) {
        publishLocationTrackingState({ status: "error", message: error.message });
        return "invalid";
      }
      if (error instanceof LocationPostError && (error.status === 401 || error.status === 403)) {
        publishLocationTrackingState({
          status: "auth_required",
          message: error.status === 401
            ? "Your session needs sign-in before queued locations can be sent."
            : error.message,
        });
      } else {
        publishLocationTrackingState({
          status: "queued",
          message: error instanceof Error ? error.message : "Location will retry automatically.",
        });
      }
      return "retry";
    }
  }, [upsertStaffLocationPing]);

  const flushPending = React.useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      const pending = readPendingPoints();
      const remaining: PendingPoint[] = [];
      for (let index = 0; index < pending.length; index += 1) {
        const result = await send(pending[index]);
        if (result === "retry") {
          remaining.push(...pending.slice(index));
          break;
        }
      }
      writePendingPoints(remaining);
    } finally {
      flushing.current = false;
    }
  }, [send]);

  React.useEffect(() => {
    if (!enabled) {
      publishLocationTrackingState({
        status: "disabled",
        pendingCount: readPendingPoints().length,
        message: "GPS tracking is disabled for this account.",
      });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      publishLocationTrackingState({
        status: "unsupported",
        permission: "unsupported",
        message: "This browser does not provide device geolocation.",
      });
      return;
    }

    let disposed = false;
    publishLocationTrackingState({
      status: "checking",
      mode: "foreground_only",
      pendingCount: readPendingPoints().length,
      message: "Checking device location permission…",
    });

    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (disposed) return;
        publishLocationTrackingState({ permission: permission.state });
        permission.onchange = () => publishLocationTrackingState({ permission: permission.state });
      }).catch(() => publishLocationTrackingState({ permission: "unknown" }));
    }

    const capture = async (position: GeolocationPosition) => {
      if (disposed || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy <= 0 || position.coords.accuracy > 250) {
        if (!disposed && position.coords.accuracy > 250) {
          publishLocationTrackingState({
            status: "error",
            message: `Location accuracy is too low (±${Math.round(position.coords.accuracy)} m). Waiting for a better signal.`,
          });
        }
        return;
      }
      const now = Date.now();
      if (now - lastSentAt.current < MINIMUM_PING_INTERVAL_MS) return;
      lastSentAt.current = now;
      const point = browserPoint(position);
      if (!isPendingPoint(point)) return;
      publishLocationTrackingState({ lastCapturedAt: point.captured_at });
      if (!navigator.onLine || (await send(point)) === "retry") enqueue(point);
      else await flushPending();
    };

    const onError = (error: GeolocationPositionError) => {
      const denied = error.code === error.PERMISSION_DENIED;
      publishLocationTrackingState({
        status: denied ? "permission_denied" : "error",
        permission: denied ? "denied" : readLocationTrackingState().permission,
        message: geolocationMessage(error),
      });
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => { void capture(position); },
      onError,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
    );
    navigator.geolocation.getCurrentPosition(
      (position) => { void capture(position); },
      onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );

    const onOnline = () => { void flushPending(); };
    const onOffline = () => publishLocationTrackingState({
      status: "queued",
      message: "Offline: captured locations will be queued on this device.",
    });
    const onVisibility = () => publishLocationTrackingState({
      message: document.visibilityState === "visible"
        ? "Foreground tracking is active."
        : "Foreground only: tracking may pause while this page is hidden or the phone is locked.",
    });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    const renewTimer = window.setInterval(() => { void refreshClientSession(); }, SESSION_RENEW_INTERVAL_MS);
    void refreshClientSession().then(() => flushPending());

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(renewTimer);
    };
  }, [enabled, flushPending, send]);

  return null;
}
