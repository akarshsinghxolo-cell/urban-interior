"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import type { StaffLocationPing } from "@/lib/rdash/staff-location";
const PENDING_KEY = "rdash:pending-staff-location-pings:v1";
const MINIMUM_PING_INTERVAL_MS = 30000;
const MAX_PENDING_POINTS = 100;
const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CAPTURE_FUTURE_SKEW_MS = 2 * 60000;
type PendingPoint = Omit<StaffLocationPing, "id" | "staff_id">;
class LocationPostError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}
function isPendingPoint(value: Partial<PendingPoint>): value is PendingPoint {
    const now = Date.now();
    const capturedAt = value.captured_at ? new Date(value.captured_at).getTime() : Number.NaN;
    return Boolean(Number.isFinite(value.latitude)
        && Number.isFinite(value.longitude)
        && Number.isFinite(value.accuracy_m)
        && value.latitude! >= -90
        && value.latitude! <= 90
        && value.longitude! >= -180
        && value.longitude! <= 180
        && value.accuracy_m! > 0
        && value.accuracy_m! <= 250
        && Number.isFinite(capturedAt)
        && capturedAt >= now - MAX_CAPTURE_AGE_MS
        && capturedAt <= now + MAX_CAPTURE_FUTURE_SKEW_MS
        && (value.source === "browser_foreground" || value.source === "native_background"));
}
function readPendingPoints(): PendingPoint[] {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "[]") as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((point): point is PendingPoint => Boolean(point && typeof point === "object" && isPendingPoint(point as Partial<PendingPoint>))).slice(-MAX_PENDING_POINTS)
            : [];
    }
    catch {
        return [];
    }
}
function writePendingPoints(points: PendingPoint[]) {
    try {
        window.localStorage.setItem(PENDING_KEY, JSON.stringify(points.filter(isPendingPoint).slice(-MAX_PENDING_POINTS)));
    }
    catch {
    }
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
async function postPoint(point: PendingPoint) {
    const response = await fetch("/api/tracking/ping", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(point),
    });
    const payload = (await response.json().catch(() => ({}))) as {
        point?: StaffLocationPing;
        // The demo-mode fallback returns { point: null, ignored: true } when
        // Supabase isn't configured. We must treat this as success so the
        // client stops retrying — otherwise it polls forever and spams the
        // server log with 403s on every geolocation update.
        ignored?: boolean;
        demo?: boolean;
        error?: string;
    };
    if (!response.ok) {
        // 401/403 = auth failure (session expired or not yet logged in).
        // Treat as terminal (not retryable) so we don't spam the server.
        if (response.status === 401 || response.status === 403) {
            throw new LocationPostError(payload.error || "Authentication required.", 422);
        }
        throw new LocationPostError(payload.error || "Location point was not accepted.", response.status);
    }
    // Demo-mode "ignored" response — accept as success, return a synthetic point.
    if (payload.ignored) {
        return {
            id: `demo-${point.captured_at}`,
            staff_id: "demo",
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy_m: point.accuracy_m ?? null,
            captured_at: point.captured_at,
            source: point.source,
            created_at: new Date().toISOString(),
        } as StaffLocationPing;
    }
    if (!payload.point)
        throw new LocationPostError(payload.error || "Location point was not accepted.", response.status);
    return payload.point;
}
export function StaffLocationTracker() {
    const authUser = useRDashStore((state) => state.authUser);
    const staff = useRDashStore((state) => authUser?.staffId ? state.db.master.staff.find((row) => row.id === authUser.staffId) : undefined);
    const upsertStaffLocationPing = useRDashStore((state) => state.upsertStaffLocationPing);
    const lastSentAt = React.useRef(0);
    const flushing = React.useRef(false);
    // Enable GPS tracking for: (a) active staff with a staffId + GPS enabled, OR
    // (b) Owner / Operations Manager (who may do field visits themselves and need their live
    // location on the GPS Tracking map). The backend accepts their pings under a pseudo-staff id.
    const enabled = Boolean(authUser && (
        (authUser.staffId && staff?.status === "active" && staff.gps_tracking_enabled !== false) ||
        authUser.role === "Owner" ||
        authUser.role === "Operations Manager"
    ));
    const send = React.useCallback(async (point: PendingPoint): Promise<"sent" | "invalid" | "retry"> => {
        try {
            const accepted = await postPoint(point);
            upsertStaffLocationPing(accepted);
            return "sent";
        }
        catch (error) {
            return error instanceof LocationPostError && error.status === 422 ? "invalid" : "retry";
        }
    }, [upsertStaffLocationPing]);
    const flushPending = React.useCallback(async () => {
        if (flushing.current || !navigator.onLine)
            return;
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
        }
        finally {
            flushing.current = false;
        }
    }, [send]);
    React.useEffect(() => {
        if (!enabled || typeof navigator === "undefined" || !navigator.geolocation)
            return;
        let disposed = false;
        const capture = async (position: GeolocationPosition) => {
            if (disposed || !Number.isFinite(position.coords.accuracy) || position.coords.accuracy <= 0 || position.coords.accuracy > 250)
                return;
            const now = Date.now();
            if (now - lastSentAt.current < MINIMUM_PING_INTERVAL_MS)
                return;
            lastSentAt.current = now;
            const point = browserPoint(position);
            if (!isPendingPoint(point))
                return;
            if (!navigator.onLine || (await send(point)) === "retry") {
                writePendingPoints([...readPendingPoints(), point]);
            }
        };
        const watchId = navigator.geolocation.watchPosition((position) => { void capture(position); }, () => undefined, { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 });
        navigator.geolocation.getCurrentPosition((position) => { void capture(position); }, () => undefined, { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 });
        const onOnline = () => { void flushPending(); };
        window.addEventListener("online", onOnline);
        void flushPending();
        return () => {
            disposed = true;
            navigator.geolocation.clearWatch(watchId);
            window.removeEventListener("online", onOnline);
        };
    }, [enabled, flushPending, send]);
    return null;
}
