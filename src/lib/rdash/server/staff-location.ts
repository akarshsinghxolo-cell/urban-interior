import type { AuthenticatedUser } from "./auth";
import { STAFF_LOCATION_STALE_AFTER_MS, isValidStaffLocationPing, mergeStaffLocationPings, type StaffLocationPing, type StaffLocationSource } from "../staff-location";
import { getSupabaseAdminClient } from "../../supabase/server";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_POINTS = 8000;
const MAX_CAPTURE_FUTURE_SKEW_MS = STAFF_LOCATION_STALE_AFTER_MS;

function assertStaffDevice(user: AuthenticatedUser) {
  if (user.staffId) return user.staffId;
  // Owner / Operations Manager may record GPS pings for themselves (e.g. during field visits)
  // using a pseudo-staff id derived from their user id, so their live location appears on the
  // GPS Tracking map even without a dedicated staff profile. NOTE: the StaffLocationPing
  // table has a FK on staffId → StaffProfile(id), so a StaffProfile row MUST exist for this
  // pseudo-id before pings are recorded. The bootstrap-owner script creates one for the
  // owner's staff_id; for ad-hoc pseudo-devices the row must be provisioned separately.
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
function prune(points: StaffLocationPing[]) {
  const now = Date.now();
  const cutoff = now - RETENTION_MS;
  return mergeStaffLocationPings([], points.filter((point) => {
    const capturedAt = new Date(point.captured_at).getTime();
    return Number.isFinite(capturedAt) && capturedAt >= cutoff && capturedAt <= now + MAX_CAPTURE_FUTURE_SKEW_MS;
  }), MAX_POINTS);
}
function decode(value: string): StaffLocationPing | null {
  try {
    const row = JSON.parse(value) as StaffLocationPing;
    return isValidStaffLocationPing(row) ? row : null;
  } catch {
    return null;
  }
}
async function allPoints() {
  const { data, error } = await getSupabaseAdminClient()
    .from("StaffLocationPing")
    .select("dataJson")
    .order("capturedAt", { ascending: true });
  if (error) throw new Error(`Could not load staff location pings: ${error.message}`);
  return prune((data || []).map((row) => decode(row.dataJson)).filter(Boolean) as StaffLocationPing[]);
}

export async function listStaffLocationPings(user: AuthenticatedUser) {
  const points = await allPoints();
  if (canReadAll(user)) return points;
  const staffId = assertStaffDevice(user);
  return points.filter((point) => point.staff_id === staffId);
}

export async function recordStaffLocationPing(user: AuthenticatedUser, input: {
  latitude: unknown;
  longitude: unknown;
  accuracy_m: unknown;
  captured_at?: unknown;
  source?: StaffLocationSource;
}) {
  const staffId = assertStaffDevice(user);
  const admin = getSupabaseAdminClient();
  // Real staff ids (including the bootstrap owner's "staff-owner" id and any
  // "owner-device:<userId>" pseudo-id) MUST have a matching active StaffProfile
  // row — both for the active-status check AND to satisfy the StaffLocationPing
  // FK constraint (staffId → StaffProfile.id). The bootstrap-owner script
  // provisions the owner's StaffProfile row; ad-hoc pseudo-devices must be
  // provisioned separately before pings are accepted.
  if (!staffId.startsWith("owner-device:")) {
    const { data: staff } = await admin.from("StaffProfile").select("status").eq("id", staffId).maybeSingle();
    if (!staff || staff.status !== "active") throw new Error("FORBIDDEN:Inactive staff cannot record GPS pings.");
  } else {
    // Pseudo-device ids (owner-device:<userId>) still need a StaffProfile row to
    // satisfy the FK; verify it exists and is active.
    const { data: staff } = await admin.from("StaffProfile").select("status").eq("id", staffId).maybeSingle();
    if (!staff || staff.status !== "active") throw new Error("FORBIDDEN:This device is not registered for GPS tracking.");
  }
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
  const { error: upsertError } = await admin.from("StaffLocationPing").upsert({
    id: point.id,
    staffId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyM: point.accuracy_m,
    capturedAt: point.captured_at,
    source: point.source,
    dataJson: JSON.stringify(point),
  } as any, { onConflict: "id" });
  if (upsertError) throw new Error(`Could not record GPS ping: ${upsertError.message}`);
  const retained = prune(await allPoints());
  const retainedIds = [...new Set(retained.map((row) => row.id))];
  if (retainedIds.length) {
    await admin.from("StaffLocationPing").delete().not("id", "in", `(${retainedIds.join(",")})`);
  } else {
    await admin.from("StaffLocationPing").delete().gt("id", "");
  }
  return point;
}
