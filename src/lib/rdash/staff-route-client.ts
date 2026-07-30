"use client";

import type { StaffLocationPing } from "./staff-location";

export const STAFF_ROUTE_SYNC_EVENT = "uc:staff-route-sync-now";
export const STAFF_ROUTE_QUEUE_EVENT = "uc:staff-route-queue-updated";
export const STAFF_ROUTE_QUEUE_KEY = "uc:staff-route-queue:v1";
export const STAFF_ROUTE_LAST_SYNC_KEY = "uc:staff-route-last-sync:v1";

export function requestStaffRouteSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAFF_ROUTE_SYNC_EVENT));
}

export function publishStaffRouteQueueUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAFF_ROUTE_QUEUE_EVENT));
}

function readRawQueue(): Array<Record<string, unknown>> {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STAFF_ROUTE_QUEUE_KEY) || "[]",
    ) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (point): point is Record<string, unknown> =>
            Boolean(point && typeof point === "object"),
        )
      : [];
  } catch {
    return [];
  }
}

export function readQueuedStaffRoutePointCount() {
  return readRawQueue().length;
}

export function readQueuedStaffRoutePoints(
  staffId?: string | null,
): StaffLocationPing[] {
  if (!staffId) return [];
  return readRawQueue()
    .map((point, index) => ({
      id: `local:${String(point.client_point_id || index)}`,
      client_point_id:
        typeof point.client_point_id === "string"
          ? point.client_point_id
          : `local-${index}`,
      staff_id: staffId,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      accuracy_m: Number(point.accuracy_m),
      speed_kmh: Number(point.speed_kmh),
      heading_deg:
        typeof point.heading_deg === "number"
          ? point.heading_deg
          : undefined,
      captured_at: String(point.captured_at || ""),
      source: "browser_foreground" as const,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.latitude)
        && Number.isFinite(point.longitude)
        && Number.isFinite(point.accuracy_m)
        && Number.isFinite(point.speed_kmh)
        && Number.isFinite(new Date(point.captured_at).getTime()),
    );
}
