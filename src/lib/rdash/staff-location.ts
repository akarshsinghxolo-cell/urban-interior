import type { ID } from "./types";
export type StaffLocationSource = "browser_foreground" | "native_background";
export interface StaffLocationPing {
    id: ID;
    staff_id: ID;
    latitude: number;
    longitude: number;
    accuracy_m: number;
    captured_at: string;
    source: StaffLocationSource;
}
export const STAFF_LOCATION_STALE_AFTER_MS = 2 * 60000;
export function isValidStaffLocationPing(value: Partial<StaffLocationPing>): value is StaffLocationPing {
    const capturedAt = value.captured_at ? new Date(value.captured_at).getTime() : Number.NaN;
    return Boolean(value.id
        && value.staff_id
        && Number.isFinite(value.latitude)
        && Number.isFinite(value.longitude)
        && Number.isFinite(value.accuracy_m)
        && value.latitude! >= -90
        && value.latitude! <= 90
        && value.longitude! >= -180
        && value.longitude! <= 180
        && value.accuracy_m! > 0
        && Number.isFinite(capturedAt)
        && (value.source === "browser_foreground" || value.source === "native_background"));
}
export function isLocationFresh(ping: Pick<StaffLocationPing, "captured_at">, now = Date.now()) {
    const capturedAt = new Date(ping.captured_at).getTime();
    const ageMs = now - capturedAt;
    return Number.isFinite(capturedAt) && ageMs >= 0 && ageMs <= STAFF_LOCATION_STALE_AFTER_MS;
}
export function latestStaffLocations(points: StaffLocationPing[]) {
    const latest = new Map<ID, StaffLocationPing>();
    for (const point of points) {
        if (!isValidStaffLocationPing(point))
            continue;
        const existing = latest.get(point.staff_id);
        if (!existing || new Date(point.captured_at).getTime() > new Date(existing.captured_at).getTime()) {
            latest.set(point.staff_id, point);
        }
    }
    return latest;
}
export function mergeStaffLocationPings(current: StaffLocationPing[], incoming: StaffLocationPing[], maxPoints = 2000) {
    const byId = new Map<ID, StaffLocationPing>();
    for (const point of [...current, ...incoming]) {
        if (!isValidStaffLocationPing(point))
            continue;
        byId.set(point.id, point);
    }
    return Array.from(byId.values())
        .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
        .slice(0, Math.max(1, maxPoints));
}
