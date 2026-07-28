import type { AuthenticatedUser } from "./auth";
import {
  STAFF_LOCATION_STALE_AFTER_MS,
  isValidStaffLocationPing,
  type StaffLocationPing,
  type StaffLocationSource,
} from "../staff-location";
import { getSupabaseAdminClient } from "../../supabase/server";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_POINTS = 8_000;
const MAX_CAPTURE_FUTURE_SKEW_MS = STAFF_LOCATION_STALE_AFTER_MS;

function assertStaffDevice(user: AuthenticatedUser) {
  if (user.staffId) return user.staffId;
  if (user.role === "Owner" || user.role === "Operations Manager") {
    return `owner-device:${user.userId}`;
  }
  throw new Error("FORBIDDEN:This account is not linked to a staff device.");
}

function canReadAll(user: AuthenticatedUser) {
  return user.role === "Owner" || user.role === "Operations Manager";
}

function numberInput(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`INVALID:${field} is required.`);
  }
  return value;
}

function normalizeCapturedAt(value: unknown) {
  const now = Date.now();
  if (value == null || value === "") return new Date(now).toISOString();
  if (typeof value !== "string") throw new Error("INVALID:A valid GPS capture timestamp is required.");
  const capturedAt = new Date(value).getTime();
  if (!Number.isFinite(capturedAt)) throw new Error("INVALID:A valid GPS capture timestamp is required.");
  if (capturedAt > now + MAX_CAPTURE_FUTURE_SKEW_MS) throw new Error("INVALID:GPS capture time is too far in the future.");
  if (capturedAt < now - RETENTION_MS) throw new Error("INVALID:GPS capture is outside the retention window.");
  return new Date(capturedAt).toISOString();
}

type StaffLocationInput = {
  latitude: unknown;
  longitude: unknown;
  accuracy_m: unknown;
  captured_at?: unknown;
  source?: StaffLocationSource;
};

type StaffLocationRow = {
  id: string;
  staffId: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
  source: StaffLocationSource;
};

function pointFromRow(row: StaffLocationRow): StaffLocationPing {
  return {
    id: row.id,
    staff_id: row.staffId,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy_m: row.accuracyM,
    captured_at: row.capturedAt,
    source: row.source === "native_background" ? "native_background" : "browser_foreground",
    created_at: row.capturedAt,
  };
}

export async function listStaffLocationPings(user: AuthenticatedUser) {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  let query = getSupabaseAdminClient()
    .from("StaffLocationPing")
    .select("id,staffId,latitude,longitude,accuracyM,capturedAt,source")
    .gte("capturedAt", cutoff)
    .order("capturedAt", { ascending: false })
    .limit(MAX_POINTS);

  if (!canReadAll(user)) query = query.eq("staffId", assertStaffDevice(user));

  const { data, error } = await query;
  if (error) throw new Error(`Could not load staff location pings: ${error.message}`);
  return ((data || []) as unknown as StaffLocationRow[]).map(pointFromRow).reverse();
}

export async function cleanupExpiredStaffLocationPings() {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const { error, count } = await getSupabaseAdminClient()
    .from("StaffLocationPing")
    .delete({ count: "exact" })
    .lt("capturedAt", cutoff);
  if (error) throw new Error(`Could not clean up expired staff location pings: ${error.message}`);
  return count || 0;
}

async function assertActiveTrackedStaff(staffId: string) {
  const { data: staff, error } = await getSupabaseAdminClient()
    .from("StaffProfile")
    .select("status,gpsTrackingEnabled")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify the GPS device owner: ${error.message}`);
  if (!staff || staff.status !== "active" || staff.gpsTrackingEnabled === false) {
    throw new Error("FORBIDDEN:This staff device is inactive or GPS tracking is disabled.");
  }
}

export async function recordStaffLocationPingForStaff(staffId: string, input: StaffLocationInput) {
  await assertActiveTrackedStaff(staffId);
  const latitude = numberInput(input.latitude, "Latitude");
  const longitude = numberInput(input.longitude, "Longitude");
  const accuracyM = numberInput(input.accuracy_m, "GPS accuracy");
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("INVALID:GPS coordinates are outside valid latitude/longitude range.");
  }

  const point: StaffLocationPing = {
    id: `staff-location-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    staff_id: staffId,
    latitude,
    longitude,
    accuracy_m: accuracyM,
    captured_at: normalizeCapturedAt(input.captured_at),
    source: input.source === "native_background" ? "native_background" : "browser_foreground",
  };
  if (!isValidStaffLocationPing(point)) throw new Error("INVALID:A valid device GPS point is required.");
  if (point.accuracy_m > 250) throw new Error("INVALID:GPS accuracy is too low to record a staff location.");

  const { error } = await getSupabaseAdminClient().from("StaffLocationPing").insert({
    id: point.id,
    staffId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyM: point.accuracy_m,
    capturedAt: point.captured_at,
    source: point.source,
    dataJson: JSON.stringify(point),
  } as any);
  if (error) throw new Error(`Could not record GPS ping: ${error.message}`);
  return point;
}

export async function recordStaffLocationPing(user: AuthenticatedUser, input: StaffLocationInput) {
  return recordStaffLocationPingForStaff(assertStaffDevice(user), input);
}
