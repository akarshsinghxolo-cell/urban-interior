"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { refreshClientSession } from "@/lib/rdash/client-auth";
import {
  publishLocationTrackingState,
  readLocationTrackingState,
} from "@/lib/rdash/location-tracking-status";
import {
  distanceMeters,
  type StaffLocationPing,
} from "@/lib/rdash/staff-location";
import {
  STAFF_ROUTE_QUEUE_EVENT,
  STAFF_ROUTE_SYNC_EVENT,
  publishStaffRouteQueueUpdated,
  staffRouteLastSyncKey,
  staffRouteQueueKey,
} from "@/lib/rdash/staff-route-client";

const HOURLY_SYNC_MS = 60 * 60_000;
const SYNC_CHECK_MS = 60_000;
const MOVING_CAPTURE_INTERVAL_MS = 30_000;
const SLOW_CAPTURE_INTERVAL_MS = 60_000;
const STATIONARY_CAPTURE_INTERVAL_MS = 2 * 60_000;
const POSITION_HEARTBEAT_MS = 2 * 60_000;
const MINIMUM_MOVEMENT_METERS = 10;
const MAX_ACCEPTED_ACCURACY_M = 150;
const MAX_REASONABLE_SPEED_KMH = 220;
const MAX_QUEUE_POINTS = 6_000;
const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const POST_TIMEOUT_MS = 15_000;

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 20_000,
};

type QueuedRoutePoint = Omit<StaffLocationPing, "id" | "staff_id"> & {
  client_point_id: string;
};

type PreviousCapture = Pick<
  QueuedRoutePoint,
  "latitude" | "longitude" | "accuracy_m" | "captured_at" | "speed_kmh"
>;

const memoryQueueByStaff = new Map<string, QueuedRoutePoint[]>();

class RouteSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isQueuedRoutePoint(
  value: Partial<QueuedRoutePoint>,
): value is QueuedRoutePoint {
  const capturedAt = value.captured_at
    ? new Date(value.captured_at).getTime()
    : Number.NaN;
  const now = Date.now();
  return Boolean(
    value.client_point_id
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && Number.isFinite(value.accuracy_m)
    && Number.isFinite(value.speed_kmh)
    && value.latitude! >= -90
    && value.latitude! <= 90
    && value.longitude! >= -180
    && value.longitude! <= 180
    && value.accuracy_m! > 0
    && value.accuracy_m! <= MAX_ACCEPTED_ACCURACY_M
    && value.speed_kmh! >= 0
    && value.speed_kmh! <= MAX_REASONABLE_SPEED_KMH
    && Number.isFinite(capturedAt)
    && capturedAt >= now - MAX_CAPTURE_AGE_MS
    && capturedAt <= now + 2 * 60_000
    && value.source === "browser_foreground"
  );
}

function readQueue(staffId: string): QueuedRoutePoint[] {
  if (!staffId) return [];
  const key = staffRouteQueueKey(staffId);
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(key) || "[]",
    ) as unknown;
    if (Array.isArray(parsed)) {
      const valid = parsed
        .filter(
          (point): point is QueuedRoutePoint =>
            Boolean(
              point
              && typeof point === "object"
              && isQueuedRoutePoint(point as Partial<QueuedRoutePoint>),
            ),
        )
        .slice(-MAX_QUEUE_POINTS);
      memoryQueueByStaff.set(staffId, valid);
      return valid;
    }
  } catch {
    // Fall back to the current page's in-memory queue.
  }
  return memoryQueueByStaff.get(staffId) || [];
}

function writeQueue(staffId: string, points: QueuedRoutePoint[]) {
  if (!staffId) return;
  const valid = points.filter(isQueuedRoutePoint).slice(-MAX_QUEUE_POINTS);
  memoryQueueByStaff.set(staffId, valid);
  try {
    window.localStorage.setItem(
      staffRouteQueueKey(staffId),
      JSON.stringify(valid),
    );
  } catch {
    // The in-memory queue keeps the current page safe when storage is blocked.
  }
  publishStaffRouteQueueUpdated(staffId);
  publishLocationTrackingState({ pendingCount: valid.length });
}

function writeLastSyncAt(staffId: string, value: number) {
  if (!staffId) return;
  try {
    window.localStorage.setItem(
      staffRouteLastSyncKey(staffId),
      String(value),
    );
  } catch {
    // Best effort only.
  }
}

function derivedSpeedKmh(
  previous: PreviousCapture | null,
  point: Pick<
    QueuedRoutePoint,
    "latitude" | "longitude" | "accuracy_m" | "captured_at"
  >,
) {
  if (!previous) return 0;
  const elapsedSeconds =
    (new Date(point.captured_at).getTime()
      - new Date(previous.captured_at).getTime())
    / 1_000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  const moved = distanceMeters(previous, point);
  const noiseFloor = Math.max(
    MINIMUM_MOVEMENT_METERS,
    Math.min(previous.accuracy_m, point.accuracy_m) * 0.5,
  );
  if (moved <= noiseFloor) return 0;
  return (moved / elapsedSeconds) * 3.6;
}

function queuedPoint(
  position: GeolocationPosition,
  previous: PreviousCapture | null,
): QueuedRoutePoint {
  const capturedAt = new Date(
    position.timestamp || Date.now(),
  ).toISOString();
  const reportedMps = position.coords.speed;
  const fallbackSpeed = derivedSpeedKmh(previous, {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    captured_at: capturedAt,
  });
  const reportedSpeed =
    typeof reportedMps === "number" && Number.isFinite(reportedMps)
      ? Math.max(0, reportedMps * 3.6)
      : 0;
  const speedKmh = Math.max(reportedSpeed, fallbackSpeed);
  const heading =
    typeof position.coords.heading === "number"
    && Number.isFinite(position.coords.heading)
      ? Math.max(0, Math.min(360, position.coords.heading))
      : undefined;
  return {
    client_point_id: `route-point-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    speed_kmh: Math.round(speedKmh * 10) / 10,
    heading_deg: heading,
    captured_at: capturedAt,
    source: "browser_foreground",
  };
}

function shouldCapture(
  point: QueuedRoutePoint,
  previous: PreviousCapture | null,
) {
  if (!previous) return true;
  const elapsed =
    new Date(point.captured_at).getTime()
    - new Date(previous.captured_at).getTime();
  const moved = distanceMeters(previous, point);
  if (point.speed_kmh <= 0.8) {
    return elapsed >= STATIONARY_CAPTURE_INTERVAL_MS;
  }
  if (point.speed_kmh <= 15) {
    return elapsed >= SLOW_CAPTURE_INTERVAL_MS
      && (moved >= MINIMUM_MOVEMENT_METERS || elapsed >= SLOW_CAPTURE_INTERVAL_MS);
  }
  return elapsed >= MOVING_CAPTURE_INTERVAL_MS
    && (moved >= MINIMUM_MOVEMENT_METERS || elapsed >= MOVING_CAPTURE_INTERVAL_MS);
}

function geolocationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission is blocked. Allow precise location in browser settings.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "This device cannot determine a reliable GPS position.";
  }
  if (error.code === error.TIMEOUT) {
    return "Location timed out. Frontend route capture will retry.";
  }
  return error.message || "Location capture failed.";
}

export function StaffLocationTracker() {
  const authUser = useRDashStore((state) => state.authUser);
  const staff = useRDashStore((state) =>
    authUser?.staffId
      ? state.db.master.staff.find((row) => row.id === authUser.staffId)
      : undefined,
  );
  const upsertStaffLocationPing = useRDashStore(
    (state) => state.upsertStaffLocationPing,
  );
  const staffId = authUser?.staffId || "";
  const previousCaptureRef = React.useRef<PreviousCapture | null>(null);
  const syncingRef = React.useRef(false);

  const enabled = Boolean(
    staffId
    && staff
    && staff.status === "active"
    && staff.gps_tracking_enabled !== false,
  );

  const syncQueue = React.useCallback(
    async (reason: "hourly" | "manual") => {
      if (syncingRef.current || !enabled || !staffId) return;
      const points = readQueue(staffId);
      if (!points.length) {
        publishLocationTrackingState({
          status: "active",
          pendingCount: 0,
          message: "Route capture is active. No unsynced points.",
        });
        return;
      }
      if (!navigator.onLine) {
        publishLocationTrackingState({
          status: "queued",
          pendingCount: points.length,
          message: "Offline: route points remain safely queued on this device.",
        });
        return;
      }

      syncingRef.current = true;
      publishLocationTrackingState({
        status: "queued",
        pendingCount: points.length,
        message:
          reason === "manual"
            ? `Sending ${points.length} route points now…`
            : `Sending the hourly route bundle (${points.length} points)…`,
      });

      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        POST_TIMEOUT_MS,
      );
      try {
        await refreshClientSession();
        const first = points[0];
        const last = points[points.length - 1];
        const bundleId = `route-bundle-${first.client_point_id}-${last.client_point_id}`;
        const response = await fetch("/api/tracking/routes", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bundleId,
            startedAt: first.captured_at,
            endedAt: last.captured_at,
            points,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          points?: StaffLocationPing[];
          ignored?: boolean;
          error?: string;
        };
        if (!response.ok) {
          throw new RouteSyncError(
            payload.error || "Route bundle was not accepted.",
            response.status,
          );
        }
        if (payload.ignored) {
          publishLocationTrackingState({
            status: "queued",
            pendingCount: readQueue(staffId).length,
            message:
              "Server persistence is unavailable. The route remains queued on this device.",
          });
          return;
        }

        const uploadedIds = new Set(
          points.map((point) => point.client_point_id),
        );
        writeQueue(
          staffId,
          readQueue(staffId).filter(
            (point) => !uploadedIds.has(point.client_point_id),
          ),
        );
        for (const point of payload.points || []) {
          upsertStaffLocationPing(point);
        }
        const now = Date.now();
        writeLastSyncAt(staffId, now);
        publishLocationTrackingState({
          status: "active",
          pendingCount: readQueue(staffId).length,
          lastSentAt: new Date(now).toISOString(),
          message: `Route bundle synced successfully (${points.length} points).`,
        });
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "Route bundle upload timed out. It remains queued."
            : error instanceof Error
              ? error.message
              : "Route bundle upload failed. It remains queued.";
        publishLocationTrackingState({
          status:
            error instanceof RouteSyncError
              && (error.status === 401 || error.status === 403)
              ? "auth_required"
              : "queued",
          pendingCount: readQueue(staffId).length,
          message,
        });
      } finally {
        window.clearTimeout(timeout);
        syncingRef.current = false;
      }
    },
    [enabled, staffId, upsertStaffLocationPing],
  );

  const syncIfDue = React.useCallback(() => {
    if (!staffId) return;
    const queue = readQueue(staffId);
    if (!queue.length) return;
    const oldest = new Date(queue[0].captured_at).getTime();
    if (Date.now() - oldest >= HOURLY_SYNC_MS) {
      void syncQueue("hourly");
    }
  }, [staffId, syncQueue]);

  React.useEffect(() => {
    previousCaptureRef.current = null;
    if (staffId) {
      const queue = readQueue(staffId);
      previousCaptureRef.current = queue.at(-1) || null;
    }

    if (!enabled) {
      publishLocationTrackingState({
        status: "disabled",
        mode: "frontend_bundle",
        pendingCount: staffId ? readQueue(staffId).length : 0,
        message: staffId
          ? "GPS route capture is disabled for this staff profile."
          : "GPS route capture requires a linked active Staff profile.",
      });
      return;
    }

    try {
      window.localStorage.removeItem("rdash:pending-staff-location-pings:v1");
      window.localStorage.removeItem("rdash:pending-staff-location-pings:v2");
      window.localStorage.removeItem("rdash:location-tracking-status:v1");
      window.localStorage.removeItem("uc:staff-route-queue:v1");
      window.localStorage.removeItem("uc:staff-route-last-sync:v1");
    } catch {
      // Retired browser keys are ignored and removed best-effort.
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      publishLocationTrackingState({
        status: "unsupported",
        mode: "frontend_bundle",
        permission: "unsupported",
        message: "This browser does not provide device geolocation.",
      });
      return;
    }

    let disposed = false;
    publishLocationTrackingState({
      status: "checking",
      mode: "frontend_bundle",
      pendingCount: readQueue(staffId).length,
      message:
        "Starting frontend route capture. Bundles sync hourly or manually.",
    });

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (disposed) return;
          publishLocationTrackingState({ permission: permission.state });
          permission.onchange = () =>
            publishLocationTrackingState({ permission: permission.state });
        })
        .catch(() =>
          publishLocationTrackingState({ permission: "unknown" }),
        );
    }

    const capture = (position: GeolocationPosition) => {
      if (disposed || document.visibilityState !== "visible") return;
      if (
        !Number.isFinite(position.coords.accuracy)
        || position.coords.accuracy <= 0
        || position.coords.accuracy > MAX_ACCEPTED_ACCURACY_M
      ) {
        publishLocationTrackingState({
          status: "error",
          message: `GPS accuracy is too low (±${Math.round(
            position.coords.accuracy || 0,
          )} m). Waiting for a better point.`,
        });
        return;
      }

      const point = queuedPoint(position, previousCaptureRef.current);
      if (
        !isQueuedRoutePoint(point)
        || point.speed_kmh > MAX_REASONABLE_SPEED_KMH
        || !shouldCapture(point, previousCaptureRef.current)
      ) {
        return;
      }

      previousCaptureRef.current = point;
      writeQueue(staffId, [...readQueue(staffId), point]);
      publishLocationTrackingState({
        status: "active",
        mode: "frontend_bundle",
        pendingCount: readQueue(staffId).length,
        lastCapturedAt: point.captured_at,
        message:
          "Route capture is active in this browser. Data stays on-device until the hourly or manual sync.",
      });
      syncIfDue();
    };

    const onError = (error: GeolocationPositionError) => {
      const denied = error.code === error.PERMISSION_DENIED;
      publishLocationTrackingState({
        status: denied ? "permission_denied" : "error",
        permission: denied
          ? "denied"
          : readLocationTrackingState().permission,
        message: geolocationMessage(error),
      });
    };

    const requestCurrentPosition = () => {
      if (disposed || document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        capture,
        onError,
        POSITION_OPTIONS,
      );
    };

    const watchId = navigator.geolocation.watchPosition(
      capture,
      onError,
      POSITION_OPTIONS,
    );
    requestCurrentPosition();

    const syncTimer = window.setInterval(syncIfDue, SYNC_CHECK_MS);
    const positionHeartbeat = window.setInterval(
      requestCurrentPosition,
      POSITION_HEARTBEAT_MS,
    );
    const onManualSync = () => {
      void syncQueue("manual");
    };
    const onOnline = () => syncIfDue();
    const onQueueUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ staffId?: string | null }>).detail;
      if (!detail?.staffId || detail.staffId === staffId) syncIfDue();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        requestCurrentPosition();
        syncIfDue();
      }
    };

    window.addEventListener(STAFF_ROUTE_SYNC_EVENT, onManualSync);
    window.addEventListener("online", onOnline);
    window.addEventListener(STAFF_ROUTE_QUEUE_EVENT, onQueueUpdated);
    document.addEventListener("visibilitychange", onVisibility);
    void refreshClientSession().then(syncIfDue);

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(syncTimer);
      window.clearInterval(positionHeartbeat);
      window.removeEventListener(STAFF_ROUTE_SYNC_EVENT, onManualSync);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(STAFF_ROUTE_QUEUE_EVENT, onQueueUpdated);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, staffId, syncIfDue, syncQueue]);

  return null;
}
