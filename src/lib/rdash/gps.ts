import type { AttendancePolicy, GeoActionSource, Visit } from "./types";
import { indiaDate } from "./date";
export interface GpsCapture {
    latitude: number;
    longitude: number;
    accuracy_m: number;
    captured_at?: string;
    action_source?: GeoActionSource;
}
export interface GpsVerification {
    distance_m: number;
    expected_latitude: number;
    expected_longitude: number;
}
const earthRadiusM = 6371000;
function radians(value: number) {
    return (value * Math.PI) / 180;
}
export function distanceMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
    const deltaLatitude = radians(toLatitude - fromLatitude);
    const deltaLongitude = radians(toLongitude - fromLongitude);
    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(deltaLongitude / 2) ** 2;
    return Math.round(earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
export function assertDeviceGps(capture: GpsCapture, policy: AttendancePolicy) {
    if (!Number.isFinite(capture.latitude) || !Number.isFinite(capture.longitude)) {
        throw new Error("A real device GPS location is required.");
    }
    if (capture.latitude < -90 || capture.latitude > 90 || capture.longitude < -180 || capture.longitude > 180) {
        throw new Error("GPS coordinates are outside the valid latitude/longitude range.");
    }
    if (!Number.isFinite(capture.accuracy_m) || capture.accuracy_m <= 0) {
        throw new Error("GPS accuracy is required before this action can be recorded.");
    }
    if (capture.accuracy_m > policy.max_gps_accuracy_m) {
        throw new Error(`GPS accuracy is ${Math.round(capture.accuracy_m)} m. Move to an open area and capture a reading within ${policy.max_gps_accuracy_m} m accuracy.`);
    }
}
export function verifyVisitGps(capture: GpsCapture, visit: Visit, policy: AttendancePolicy): GpsVerification {
    assertDeviceGps(capture, policy);
    if (visit.planned_latitude == null || visit.planned_longitude == null) {
        throw new Error("This Visit has no verified Site GPS. Add Site coordinates before field check-in or check-out.");
    }
    const distance_m = distanceMeters(capture.latitude, capture.longitude, visit.planned_latitude, visit.planned_longitude);
    if (distance_m > policy.visit_geofence_radius_m) {
        throw new Error(`You are ${distance_m} m from the planned Site. Field check-in/out is allowed only within ${policy.visit_geofence_radius_m} m.`);
    }
    return { distance_m, expected_latitude: visit.planned_latitude, expected_longitude: visit.planned_longitude };
}
export function verifyOfficeGps(capture: GpsCapture, policy: AttendancePolicy): GpsVerification {
    assertDeviceGps(capture, policy);
    if (policy.office_latitude == null || policy.office_longitude == null) {
        throw new Error("Office GPS is not configured. An Owner or Operations Manager must capture the office location before attendance can be recorded.");
    }
    const distance_m = distanceMeters(capture.latitude, capture.longitude, policy.office_latitude, policy.office_longitude);
    if (distance_m > policy.geofence_radius_m) {
        throw new Error(`You are ${distance_m} m from ${policy.office_name || "the office"}. Attendance is allowed only within ${policy.geofence_radius_m} m.`);
    }
    return { distance_m, expected_latitude: policy.office_latitude, expected_longitude: policy.office_longitude };
}
export function verifyVisitExitGps(capture: GpsCapture, visit: Visit, policy: AttendancePolicy): GpsVerification {
    assertDeviceGps(capture, policy);
    if (visit.planned_latitude == null || visit.planned_longitude == null) {
        throw new Error("This Visit has no verified destination GPS for automatic check-out.");
    }
    const distance_m = distanceMeters(capture.latitude, capture.longitude, visit.planned_latitude, visit.planned_longitude);
    const exitRadius = policy.visit_geofence_radius_m + Math.max(0, policy.auto_exit_buffer_m || 0);
    if (distance_m < exitRadius) {
        throw new Error(`Automatic check-out waits until you are outside ${exitRadius} m from the planned location.`);
    }
    return { distance_m, expected_latitude: visit.planned_latitude, expected_longitude: visit.planned_longitude };
}
export function verifyOfficeExitGps(capture: GpsCapture, policy: AttendancePolicy): GpsVerification {
    assertDeviceGps(capture, policy);
    if (policy.office_latitude == null || policy.office_longitude == null) {
        throw new Error("Office GPS is not configured for automatic attendance check-out.");
    }
    const distance_m = distanceMeters(capture.latitude, capture.longitude, policy.office_latitude, policy.office_longitude);
    const exitRadius = policy.geofence_radius_m + Math.max(0, policy.auto_exit_buffer_m || 0);
    if (distance_m < exitRadius) {
        throw new Error(`Automatic attendance check-out waits until you are outside ${exitRadius} m from the office.`);
    }
    return { distance_m, expected_latitude: policy.office_latitude, expected_longitude: policy.office_longitude };
}
export function isInsideGeofence(distance_m: number, radius_m: number) {
    return Number.isFinite(distance_m) && distance_m <= radius_m;
}
export function isOutsideExitGeofence(distance_m: number, radius_m: number, exitBufferM: number) {
    return Number.isFinite(distance_m) && distance_m >= radius_m + Math.max(0, exitBufferM);
}
function indiaDateTimeMs(date: string, time: string) {
    const [hours, minutes] = (time || "09:30").split(":").map(Number);
    const hh = String(Number.isFinite(hours) ? hours : 9).padStart(2, "0");
    const mm = String(Number.isFinite(minutes) ? minutes : 30).padStart(2, "0");
    return new Date(`${date}T${hh}:${mm}:00+05:30`).getTime();
}
export function minutesLate(timestamp: string, standardCheckInTime: string, graceMinutes: number) {
    const recorded = new Date(timestamp);
    if (Number.isNaN(recorded.getTime()))
        return 0;
    const start = indiaDateTimeMs(indiaDate(recorded), standardCheckInTime || "09:30");
    return Math.max(0, Math.round((recorded.getTime() - start) / 60000) - Math.max(0, graceMinutes));
}
export function dateFromIso(value: string) {
    return indiaDate(value);
}
export function isAtOrAfterTime(now: Date, time: string) {
    return now.getTime() >= indiaDateTimeMs(indiaDate(now), time || "11:00");
}
