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
const MINIMUM_PING_INTERVAL_MS = 2 * 60_000;
const STATIONARY_HEARTBEAT_MS = 10 * 60_000;
const FOREGROUND_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const MINIMUM_MOVEMENT_METERS = 30;
const POST_TIMEOUT_MS = 8_000;
const MAX_PENDING_POINTS = 1_500;
const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_CAPTURE_FUTURE_SKEW_MS = 2 * 60_000;
const SESSION_RENEW_INTERVAL_MS = 30 * 60_000;

const LIVE_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 60_000,
  timeout: 10_000,
};

const WATCH_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 60_000,
  timeout: 15_000,
};

type PendingPoint = Omit<StaffLocationPing, "id" | "staff_id">;

type SentPoint = {
  latitude: number;
  longitude: number;
  sentAt: number;
};

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
    // Keep tracking active even when persistent browser storage is unavailable.
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

function distanceMeters(a: Pick<SentPoint, "latitude" | "longitude">, b: Pick<PendingPoint, "latitude" | "longitude">) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function postPointOnce(point: PendingPoint) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/tracking/ping", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(point),
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LocationPostError("Location upload timed out and will retry later.", 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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
  if (error.code === error.TIMEOUT) return "Location timed out. Tracking will retry while the app is visible.";
  return error.message || "Location tracking failed.";
}

export function StaffLocationTracker() {
  const authUser = useRDashStore((state) => state.authUser);
  const staff = useRDashStore((state) =>
    authUser?.staffId ? state.db.master.staff.find((row) => row.id === authUser.staffId) : undefined,
  );
  const upsertStaffLocationPing = useRDashStore((state) => state.upsertStaffLocationPing);
  const lastAcceptedRef = React.useRef<SentPoint | null>(null);
  const lastCaptureAtRef = React.useRef(0);
  const flushing = React.useRef(false);

  // Foreground browser tracking is opt-in through an active linked Staff profile.
  // Owner/Operations accounts no longer start GPS merely because of their role.
  const enabled = Boolean(
    authUser?.staffId && staff && staff.status === "active" && staff.gps_tracking_enabled !== false,
  );

  const send = React.useCallback(async (point: PendingPoint): Promise<"sent" | "invalid" | "retry"> => {
    try {
      const accepted = await postPoint(point);
      upsertStaffLocationPing(accepted);
      lastAcceptedRef.current = {
        latitude: point.latitude,
        longitude: point.longitude,
        sentAt: Date.now(),
      };
      publishLocationTrackingState({
        status: "active",
        lastCapturedAt: point.captured_at,
        lastSentAt: new Date().toISOString(),
        message: "Foreground tracking is active while this page is visible.",
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
        message: authUser?.staffId
          ? "GPS tracking is disabled for this staff profile."
          : "GPS tracking requires a linked staff profile.",
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
      if (disposed || document.visibilityState !== "visible") return;
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy <= 0 || position.coords.accuracy > 250) {
        if (position.coords.accuracy > 250) {
          publishLocationTrackingState({
            status: "error",
            message: `Location accuracy is too low (±${Math.round(position.coords.accuracy)} m). Waiting for a better signal.`,
          });
        }
        return;
      }

      const now = Date.now();
      lastCaptureAtRef.current = now;
      const point = browserPoint(position);
      if (!isPendingPoint(point)) return;
      const previous = lastAcceptedRef.current;
      if (previous) {
        const elapsed = now - previous.sentAt;
        if (elapsed < MINIMUM_PING_INTERVAL_MS) return;
        if (elapsed < STATIONARY_HEARTBEAT_MS && distanceMeters(previous, point) < MINIMUM_MOVEMENT_METERS) return;
      }

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

    const requestCurrentPosition = () => {
      if (disposed || document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (position) => { void capture(position); },
        onError,
        LIVE_POSITION_OPTIONS,
      );
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => { void capture(position); },
      onError,
      WATCH_POSITION_OPTIONS,
    );
    requestCurrentPosition();

    // A slow heartbeat only recovers stalled browser watches; it does not create
    // an additional ping when watchPosition is already delivering updates.
    const heartbeatTimer = window.setInterval(() => {
      if (Date.now() - lastCaptureAtRef.current >= FOREGROUND_HEARTBEAT_INTERVAL_MS) {
        requestCurrentPosition();
      }
    }, FOREGROUND_HEARTBEAT_INTERVAL_MS);

    const resumeTracking = () => {
      if (document.visibilityState !== "visible") return;
      publishLocationTrackingState({ message: "Foreground tracking is active." });
      requestCurrentPosition();
      void flushPending();
    };
    const onOnline = () => {
      requestCurrentPosition();
      void flushPending();
    };
    const onOffline = () => publishLocationTrackingState({
      status: "queued",
      message: "Offline: captured locations will be queued on this device.",
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeTracking();
      else publishLocationTrackingState({ message: "Foreground tracking pauses while this page is hidden." });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", resumeTracking);
    window.addEventListener("pageshow", resumeTracking);
    document.addEventListener("visibilitychange", onVisibility);
    const renewTimer = window.setInterval(() => { void refreshClientSession(); }, SESSION_RENEW_INTERVAL_MS);
    void refreshClientSession().then(() => flushPending());

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", resumeTracking);
      window.removeEventListener("pageshow", resumeTracking);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeatTimer);
      window.clearInterval(renewTimer);
    };
  }, [authUser?.staffId, enabled, flushPending, send]);

  return null;
}
