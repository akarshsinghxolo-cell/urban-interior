"use client";

import type { StaffLocationPing } from "./staff-location";

export const STAFF_ROUTE_SYNC_EVENT = "uc:staff-route-sync-now";
export const STAFF_ROUTE_QUEUE_EVENT = "uc:staff-route-queue-updated";
const STAFF_ROUTE_QUEUE_PREFIX = "uc:staff-route-queue:v2";
const STAFF_ROUTE_LAST_SYNC_PREFIX = "uc:staff-route-last-sync:v2";

function scopedStorageKey(prefix: string, staffId?: string | null) {
  const normalized = String(staffId || "").trim();
  return normalized ? `${prefix}:${encodeURIComponent(normalized)}` : "";
}

export function staffRouteQueueKey(staffId?: string | null) {
  return scopedStorageKey(STAFF_ROUTE_QUEUE_PREFIX, staffId);
}

export function staffRouteLastSyncKey(staffId?: string | null) {
  return scopedStorageKey(STAFF_ROUTE_LAST_SYNC_PREFIX, staffId);
}

export function requestStaffRouteSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STAFF_ROUTE_SYNC_EVENT));
}

export function publishStaffRouteQueueUpdated(staffId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STAFF_ROUTE_QUEUE_EVENT, {
      detail: { staffId: staffId || null },
    }),
  );
}

function readRawQueue(
  staffId?: string | null,
): Array<Record<string, unknown>> {
  if (typeof window === "undefined") return [];
  const key = staffRouteQueueKey(staffId);
  if (!key) return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(key) || "[]",
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

export function readQueuedStaffRoutePointCount(
  staffId?: string | null,
) {
  return readRawQueue(staffId).length;
}

export function readQueuedStaffRoutePoints(
  staffId?: string | null,
): StaffLocationPing[] {
  if (!staffId) return [];
  return readRawQueue(staffId)
    .map((point, index) => ({
      id: `local:${staffId}:${String(point.client_point_id || index)}`,
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
