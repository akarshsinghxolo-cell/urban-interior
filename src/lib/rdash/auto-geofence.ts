import { distanceMeters, isInsideGeofence, isOutsideExitGeofence, type GpsCapture } from "./gps";
export type GeofenceDwellState = {
    enteredAt?: number;
    exitedAt?: number;
};
export type GeofenceDecision = "enter_ready" | "exit_ready" | "inside_waiting" | "outside_waiting" | "neutral";
export function updateGeofenceDwell(state: GeofenceDwellState, distance_m: number, options: {
    radius_m: number;
    exit_buffer_m: number;
    entry_dwell_seconds: number;
    exit_dwell_seconds: number;
    now_ms: number;
}): {
    state: GeofenceDwellState;
    decision: GeofenceDecision;
} {
    if (isInsideGeofence(distance_m, options.radius_m)) {
        const enteredAt = state.enteredAt ?? options.now_ms;
        const elapsed = options.now_ms - enteredAt;
        return {
            state: { enteredAt },
            decision: elapsed >= Math.max(0, options.entry_dwell_seconds) * 1000 ? "enter_ready" : "inside_waiting",
        };
    }
    if (isOutsideExitGeofence(distance_m, options.radius_m, options.exit_buffer_m)) {
        const exitedAt = state.exitedAt ?? options.now_ms;
        const elapsed = options.now_ms - exitedAt;
        return {
            state: { exitedAt },
            decision: elapsed >= Math.max(0, options.exit_dwell_seconds) * 1000 ? "exit_ready" : "outside_waiting",
        };
    }
    return { state: {}, decision: "neutral" };
}
export function geofenceDistance(capture: Pick<GpsCapture, "latitude" | "longitude">, target?: {
    latitude?: number;
    longitude?: number;
}) {
    if (target?.latitude == null || target?.longitude == null)
        return undefined;
    return distanceMeters(capture.latitude, capture.longitude, target.latitude, target.longitude);
}
