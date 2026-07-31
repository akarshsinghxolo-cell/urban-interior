import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "./auth";
import {
  STAFF_ROUTE_RETENTION_MS,
  distanceMeters,
  isValidStaffLocationPing,
  type StaffLocationPing,
  type StaffRouteBundle,
} from "../staff-location";
import { getSupabaseAdminClient } from "../../supabase/server";

const MAX_BUNDLES = 2_000;
const MAX_POINTS_PER_BUNDLE = 6_000;
const MAX_CAPTURE_FUTURE_SKEW_MS = 2 * 60_000;
const INDIA_OFFSET = "+05:30";

type RoutePointInput = {
  client_point_id?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  accuracy_m?: unknown;
  speed_kmh?: unknown;
  heading_deg?: unknown;
  captured_at?: unknown;
  source?: unknown;
};

type RouteBundleInput = {
  bundleId?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  points?: unknown;
};

type StaffRouteBundleRow = {
  id: string;
  staffId: string;
  startedAt: string;
  endedAt: string;
  pointCount: number;
  distanceM: number;
  dataJson: string;
  createdAt?: string;
};

function canReadAll(user: AuthenticatedUser) {
  return user.role === "Owner" || user.role === "Operations Manager";
}

function assertStaffDevice(user: AuthenticatedUser) {
  if (user.staffId) return user.staffId;
  throw new Error(
    "FORBIDDEN:GPS route capture requires a linked active Staff profile.",
  );
}

function numberInput(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`INVALID:${field} is required.`);
  }
  return value;
}

function normalizeCapturedAt(value: unknown) {
  const now = Date.now();
  if (typeof value !== "string") {
    throw new Error(
      "INVALID:A valid route-point timestamp is required.",
    );
  }
  const capturedAt = new Date(value).getTime();
  if (!Number.isFinite(capturedAt)) {
    throw new Error(
      "INVALID:A valid route-point timestamp is required.",
    );
  }
  if (capturedAt > now + MAX_CAPTURE_FUTURE_SKEW_MS) {
    throw new Error(
      "INVALID:A route point is too far in the future.",
    );
  }
  if (capturedAt < now - STAFF_ROUTE_RETENTION_MS) {
    throw new Error(
      "INVALID:A route point is outside the 14-day retention window.",
    );
  }
  return new Date(capturedAt).toISOString();
}

function normalizeClientPointId(value: unknown, index: number) {
  const candidate =
    typeof value === "string" ? value.trim() : "";
  if (/^[A-Za-z0-9:_-]{8,160}$/.test(candidate)) {
    return candidate;
  }
  return `client-point-${index}`;
}

function normalizePoint(
  value: RoutePointInput,
  staffId: string,
  bundleId: string,
  index: number,
): StaffLocationPing {
  const latitude = numberInput(value.latitude, "Latitude");
  const longitude = numberInput(value.longitude, "Longitude");
  const accuracyM = numberInput(
    value.accuracy_m,
    "GPS accuracy",
  );
  const speedKmh = numberInput(value.speed_kmh, "GPS speed");
  const clientPointId = normalizeClientPointId(
    value.client_point_id,
    index,
  );
  if (
    latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new Error(
      "INVALID:GPS coordinates are outside valid latitude/longitude range.",
    );
  }
  if (accuracyM <= 0 || accuracyM > 150) {
    throw new Error(
      "INVALID:GPS accuracy must be between 0 and 150 metres.",
    );
  }
  if (speedKmh < 0 || speedKmh > 220) {
    throw new Error(
      "INVALID:GPS speed is outside the accepted range.",
    );
  }
  const heading =
    typeof value.heading_deg === "number"
    && Number.isFinite(value.heading_deg)
      ? Math.max(0, Math.min(360, value.heading_deg))
      : undefined;
  const point: StaffLocationPing = {
    id: `${bundleId}:${clientPointId}`,
    staff_id: staffId,
    client_point_id: clientPointId,
    latitude,
    longitude,
    accuracy_m: accuracyM,
    speed_kmh: Math.round(speedKmh * 10) / 10,
    heading_deg: heading,
    captured_at: normalizeCapturedAt(value.captured_at),
    source: "browser_foreground",
  };
  if (!isValidStaffLocationPing(point)) {
    throw new Error("INVALID:A valid browser route point is required.");
  }
  return point;
}

function routeDistance(points: StaffLocationPing[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return Math.round(total);
}

function bundleIdFor(
  staffId: string,
  inputId: unknown,
  points: StaffLocationPing[],
) {
  const supplied =
    typeof inputId === "string" ? inputId.trim() : "";
  const identity = [
    staffId,
    supplied,
    points[0]?.client_point_id,
    points[0]?.captured_at,
    points.at(-1)?.client_point_id,
    points.at(-1)?.captured_at,
    points.length,
  ].join("|");
  const digest = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 32);
  return `staff-route-${digest}`;
}

function dateRange(
  dateValue?: string | null,
  startValue?: string | null,
  endValue?: string | null,
) {
  if (startValue || endValue) {
    const start = startValue
      ? new Date(startValue)
      : new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const end = endValue ? new Date(endValue) : new Date();
    if (
      !Number.isFinite(start.getTime())
      || !Number.isFinite(end.getTime())
      || end <= start
    ) {
      throw new Error("INVALID:A valid route date range is required.");
    }
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }
  const date =
    dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? dateValue
      : new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        });
  const start = new Date(`${date}T00:00:00${INDIA_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function bundleFromRow(row: StaffRouteBundleRow): StaffRouteBundle | null {
  try {
    const parsed = JSON.parse(row.dataJson) as StaffRouteBundle;
    if (!parsed || !Array.isArray(parsed.points)) return null;
    return {
      ...parsed,
      id: row.id,
      staff_id: row.staffId,
      started_at: row.startedAt,
      ended_at: row.endedAt,
      point_count: row.pointCount,
      distance_m: row.distanceM,
      created_at: row.createdAt,
      points: parsed.points.filter(isValidStaffLocationPing),
    };
  } catch {
    return null;
  }
}

async function assertActiveTrackedStaff(staffId: string) {
  const { data: staff, error } = await getSupabaseAdminClient()
    .from("StaffProfile")
    .select("status,gpsTrackingEnabled")
    .eq("id", staffId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Could not verify the GPS device owner: ${error.message}`,
    );
  }
  if (
    !staff
    || staff.status !== "active"
    || staff.gpsTrackingEnabled === false
  ) {
    throw new Error(
      "FORBIDDEN:This Staff profile is inactive or GPS tracking is disabled.",
    );
  }
}

export async function recordStaffRouteBundle(
  user: AuthenticatedUser,
  input: RouteBundleInput,
) {
  const staffId = assertStaffDevice(user);
  await assertActiveTrackedStaff(staffId);
  if (!Array.isArray(input.points) || !input.points.length) {
    throw new Error(
      "INVALID:At least one route point is required.",
    );
  }
  if (input.points.length > MAX_POINTS_PER_BUNDLE) {
    throw new Error(
      `INVALID:A route bundle cannot exceed ${MAX_POINTS_PER_BUNDLE} points.`,
    );
  }

  const provisionalId = `route-${Date.now().toString(36)}`;
  const points = (input.points as RoutePointInput[])
    .map((point, index) =>
      normalizePoint(point, staffId, provisionalId, index),
    )
    .sort(
      (a, b) =>
        new Date(a.captured_at).getTime()
        - new Date(b.captured_at).getTime(),
    );
  const unique = Array.from(
    new Map(
      points.map((point) => [
        point.client_point_id || point.captured_at,
        point,
      ]),
    ).values(),
  );
  const bundleId = bundleIdFor(
    staffId,
    input.bundleId,
    unique,
  );
  const normalizedPoints = unique.map((point) => ({
    ...point,
    id: `${bundleId}:${point.client_point_id}`,
  }));
  const startedAt = normalizedPoints[0].captured_at;
  const endedAt = normalizedPoints.at(-1)!.captured_at;
  const spanMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (spanMs < 0 || spanMs > STAFF_ROUTE_RETENTION_MS) {
    throw new Error(
      "INVALID:A route bundle cannot span beyond the 14-day retention window.",
    );
  }

  const bundle: StaffRouteBundle = {
    id: bundleId,
    staff_id: staffId,
    started_at: startedAt,
    ended_at: endedAt,
    point_count: normalizedPoints.length,
    distance_m: routeDistance(normalizedPoints),
    points: normalizedPoints,
    created_at: new Date().toISOString(),
  };
  const { error } = await getSupabaseAdminClient()
    .from("StaffRouteBundle")
    .upsert(
      {
        id: bundle.id,
        staffId,
        startedAt: bundle.started_at,
        endedAt: bundle.ended_at,
        pointCount: bundle.point_count,
        distanceM: bundle.distance_m,
        dataJson: JSON.stringify(bundle),
        createdAt: bundle.created_at,
      } as any,
      { onConflict: "id" },
    );
  if (error) {
    throw new Error(
      `Could not record the staff route bundle: ${error.message}`,
    );
  }
  return bundle;
}

export async function listStaffRouteBundles(
  user: AuthenticatedUser,
  options: {
    staffId?: string | null;
    date?: string | null;
    start?: string | null;
    end?: string | null;
  } = {},
) {
  const range = dateRange(
    options.date,
    options.start,
    options.end,
  );
  const requestedStaffId = canReadAll(user)
    ? options.staffId || null
    : assertStaffDevice(user);

  let query = getSupabaseAdminClient()
    .from("StaffRouteBundle")
    .select(
      "id,staffId,startedAt,endedAt,pointCount,distanceM,dataJson,createdAt",
    )
    .lt("startedAt", range.end)
    .gte("endedAt", range.start)
    .order("startedAt", { ascending: true })
    .limit(MAX_BUNDLES);

  if (requestedStaffId) {
    query = query.eq("staffId", requestedStaffId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Could not load staff route bundles: ${error.message}`,
    );
  }
  return ((data || []) as unknown as StaffRouteBundleRow[])
    .map(bundleFromRow)
    .filter(
      (bundle): bundle is StaffRouteBundle => Boolean(bundle),
    );
}

export async function listStaffRoutePoints(
  user: AuthenticatedUser,
  options: {
    staffId?: string | null;
    date?: string | null;
    start?: string | null;
    end?: string | null;
  } = {},
) {
  const range = dateRange(
    options.date,
    options.start,
    options.end,
  );
  const bundles = await listStaffRouteBundles(user, options);
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const points = bundles
    .flatMap((bundle) => bundle.points)
    .filter((point) => {
      const capturedAt = new Date(point.captured_at).getTime();
      return capturedAt >= startMs && capturedAt < endMs;
    })
    .sort(
      (a, b) =>
        new Date(a.captured_at).getTime()
        - new Date(b.captured_at).getTime(),
    );
  return { bundles, points };
}

export async function cleanupExpiredStaffRouteBundles() {
  const cutoff = new Date(
    Date.now() - STAFF_ROUTE_RETENTION_MS,
  ).toISOString();
  const { error, count } = await getSupabaseAdminClient()
    .from("StaffRouteBundle")
    .delete({ count: "exact" })
    .lt("endedAt", cutoff);
  if (error) {
    throw new Error(
      `Could not clean up expired staff route bundles: ${error.message}`,
    );
  }
  return count || 0;
}
