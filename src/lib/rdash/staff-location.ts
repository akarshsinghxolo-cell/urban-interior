import type { ID } from "./types";

export type StaffLocationSource = "browser_foreground";

export interface StaffLocationPing {
  id: ID;
  staff_id: ID;
  client_point_id?: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_kmh: number;
  heading_deg?: number;
  captured_at: string;
  source: StaffLocationSource;
}

export interface StaffRouteBundle {
  id: ID;
  staff_id: ID;
  started_at: string;
  ended_at: string;
  point_count: number;
  distance_m: number;
  points: StaffLocationPing[];
  created_at?: string;
}

export type StaffRouteSpeedBand = "fast" | "slow" | "stopped";

export interface StaffRouteStop {
  id: string;
  staff_id: ID;
  latitude: number;
  longitude: number;
  arrival_at: string;
  departure_at: string;
  duration_minutes: number;
  point_count: number;
}

export interface StaffRouteSegment {
  id: string;
  staff_id: ID;
  from: StaffLocationPing;
  to: StaffLocationPing;
  speed_kmh: number;
  band: StaffRouteSpeedBand;
  distance_m: number;
  duration_seconds: number;
}

export interface StaffRouteSummary {
  point_count: number;
  distance_m: number;
  moving_minutes: number;
  stopped_minutes: number;
  max_speed_kmh: number;
}

export const STAFF_LOCATION_STALE_AFTER_MS = 70 * 60_000;
export const STAFF_ROUTE_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
export const STAFF_ROUTE_FAST_KMH = 15;
export const STAFF_ROUTE_STOPPED_KMH = 0.8;
export const STAFF_ROUTE_STOP_RADIUS_M = 35;
export const STAFF_ROUTE_MIN_STOP_MS = 2 * 60_000;

export function distanceMeters(
  a: Pick<StaffLocationPing, "latitude" | "longitude">,
  b: Pick<StaffLocationPing, "latitude" | "longitude">,
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function speedBand(speedKmh: number): StaffRouteSpeedBand {
  if (speedKmh > STAFF_ROUTE_FAST_KMH) return "fast";
  if (speedKmh <= STAFF_ROUTE_STOPPED_KMH) return "stopped";
  return "slow";
}

export function isValidStaffLocationPing(
  value: Partial<StaffLocationPing>,
): value is StaffLocationPing {
  const capturedAt = value.captured_at
    ? new Date(value.captured_at).getTime()
    : Number.NaN;
  return Boolean(
    value.id
    && value.staff_id
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && Number.isFinite(value.accuracy_m)
    && Number.isFinite(value.speed_kmh)
    && value.latitude! >= -90
    && value.latitude! <= 90
    && value.longitude! >= -180
    && value.longitude! <= 180
    && value.accuracy_m! > 0
    && value.accuracy_m! <= 150
    && value.speed_kmh! >= 0
    && value.speed_kmh! <= 220
    && Number.isFinite(capturedAt)
    && value.source === "browser_foreground"
  );
}

export function isLocationFresh(
  ping: Pick<StaffLocationPing, "captured_at">,
  now = Date.now(),
) {
  const capturedAt = new Date(ping.captured_at).getTime();
  const ageMs = now - capturedAt;
  return Number.isFinite(capturedAt)
    && ageMs >= 0
    && ageMs <= STAFF_LOCATION_STALE_AFTER_MS;
}

export function latestStaffLocations(points: StaffLocationPing[]) {
  const latest = new Map<ID, StaffLocationPing>();
  for (const point of points) {
    if (!isValidStaffLocationPing(point)) continue;
    const existing = latest.get(point.staff_id);
    if (
      !existing
      || new Date(point.captured_at).getTime()
        > new Date(existing.captured_at).getTime()
    ) {
      latest.set(point.staff_id, point);
    }
  }
  return latest;
}

export function mergeStaffLocationPings(
  current: StaffLocationPing[],
  incoming: StaffLocationPing[],
  maxPoints = 6_000,
) {
  const byId = new Map<ID, StaffLocationPing>();
  for (const point of [...current, ...incoming]) {
    if (!isValidStaffLocationPing(point)) continue;
    byId.set(point.id, point);
  }
  return Array.from(byId.values())
    .sort(
      (a, b) =>
        new Date(b.captured_at).getTime()
        - new Date(a.captured_at).getTime(),
    )
    .slice(0, Math.max(1, maxPoints));
}

export function buildStaffRouteSegments(
  points: StaffLocationPing[],
): StaffRouteSegment[] {
  const sorted = [...points]
    .filter(isValidStaffLocationPing)
    .sort(
      (a, b) =>
        new Date(a.captured_at).getTime()
        - new Date(b.captured_at).getTime(),
    );
  const segments: StaffRouteSegment[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1];
    const to = sorted[index];
    if (from.staff_id !== to.staff_id) continue;
    const start = new Date(from.captured_at).getTime();
    const end = new Date(to.captured_at).getTime();
    const durationSeconds = Math.max(0, (end - start) / 1_000);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
    const distance = distanceMeters(from, to);
    const derivedSpeed = (distance / durationSeconds) * 3.6;
    const speed = Number.isFinite(to.speed_kmh)
      ? Math.max(0, to.speed_kmh)
      : Math.max(0, derivedSpeed);
    segments.push({
      id: `${from.id}:${to.id}`,
      staff_id: to.staff_id,
      from,
      to,
      speed_kmh: speed,
      band: speedBand(speed),
      distance_m: distance,
      duration_seconds: durationSeconds,
    });
  }
  return segments;
}

export function detectStaffRouteStops(
  points: StaffLocationPing[],
  radiusM = STAFF_ROUTE_STOP_RADIUS_M,
  minimumDurationMs = STAFF_ROUTE_MIN_STOP_MS,
): StaffRouteStop[] {
  const sorted = [...points]
    .filter(isValidStaffLocationPing)
    .sort(
      (a, b) =>
        new Date(a.captured_at).getTime()
        - new Date(b.captured_at).getTime(),
    );
  const stops: StaffRouteStop[] = [];
  let cluster: StaffLocationPing[] = [];

  const flush = () => {
    if (cluster.length < 2) {
      cluster = [];
      return;
    }
    const first = cluster[0];
    const last = cluster[cluster.length - 1];
    const start = new Date(first.captured_at).getTime();
    const end = new Date(last.captured_at).getTime();
    const durationMs = end - start;
    if (durationMs < minimumDurationMs) {
      cluster = [];
      return;
    }
    const latitude =
      cluster.reduce((total, point) => total + point.latitude, 0)
      / cluster.length;
    const longitude =
      cluster.reduce((total, point) => total + point.longitude, 0)
      / cluster.length;
    stops.push({
      id: `stop-${first.staff_id}-${first.captured_at}`,
      staff_id: first.staff_id,
      latitude,
      longitude,
      arrival_at: first.captured_at,
      departure_at: last.captured_at,
      duration_minutes: Math.max(1, Math.round(durationMs / 60_000)),
      point_count: cluster.length,
    });
    cluster = [];
  };

  for (const point of sorted) {
    if (point.speed_kmh > STAFF_ROUTE_STOPPED_KMH) {
      flush();
      continue;
    }
    if (!cluster.length) {
      cluster = [point];
      continue;
    }
    const center = {
      latitude:
        cluster.reduce((total, item) => total + item.latitude, 0)
        / cluster.length,
      longitude:
        cluster.reduce((total, item) => total + item.longitude, 0)
        / cluster.length,
    };
    if (
      cluster[0].staff_id === point.staff_id
      && distanceMeters(center, point) <= radiusM
    ) {
      cluster.push(point);
    } else {
      flush();
      cluster = [point];
    }
  }
  flush();
  return stops;
}

export function summarizeStaffRoute(
  points: StaffLocationPing[],
): StaffRouteSummary {
  const segments = buildStaffRouteSegments(points);
  let distanceM = 0;
  let movingSeconds = 0;
  let stoppedSeconds = 0;
  let maxSpeedKmh = 0;
  for (const segment of segments) {
    distanceM += segment.distance_m;
    maxSpeedKmh = Math.max(maxSpeedKmh, segment.speed_kmh);
    if (segment.band === "stopped") {
      stoppedSeconds += segment.duration_seconds;
    } else {
      movingSeconds += segment.duration_seconds;
    }
  }
  return {
    point_count: points.filter(isValidStaffLocationPing).length,
    distance_m: Math.round(distanceM),
    moving_minutes: Math.round(movingSeconds / 60),
    stopped_minutes: Math.round(stoppedSeconds / 60),
    max_speed_kmh: Math.round(maxSpeedKmh * 10) / 10,
  };
}
