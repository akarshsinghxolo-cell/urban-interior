import { distanceMeters } from "./gps";
import type { CoordinatePair } from "./coordinates";
export type RoadRoute = {
    coordinates: CoordinatePair[];
    distance_m: number;
    duration_s: number;
    source: "osrm" | "gps_path";
    warning?: string;
};
function compactPoints(points: CoordinatePair[], maximum = 24) {
    if (points.length <= maximum)
        return points;
    const sampled: CoordinatePair[] = [];
    for (let index = 0; index < maximum; index += 1) {
        sampled.push(points[Math.round((index * (points.length - 1)) / (maximum - 1))]);
    }
    return sampled;
}
export function gpsPathRoute(points: CoordinatePair[]): RoadRoute | null {
    const usable = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    if (usable.length < 2)
        return null;
    const distance_m = usable
        .slice(1)
        .reduce((sum, point, index) => sum +
        distanceMeters(usable[index].latitude, usable[index].longitude, point.latitude, point.longitude), 0);
    return {
        coordinates: usable,
        distance_m: Math.round(distance_m),
        duration_s: 0,
        source: "gps_path",
        warning: "Road routing unavailable; showing the recorded GPS path.",
    };
}
export async function requestRoadRoute(points: CoordinatePair[], signal?: AbortSignal): Promise<RoadRoute | null> {
    const compact = compactPoints(points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)));
    if (compact.length < 2)
        return null;
    const path = compact
        .map((point) => `${point.longitude},${point.latitude}`)
        .join(";");
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`, { signal });
    if (!response.ok)
        throw new Error("Road route service is unavailable.");
    const payload = (await response.json()) as {
        code?: string;
        routes?: Array<{
            distance: number;
            duration: number;
            geometry?: {
                coordinates?: [
                    number,
                    number
                ][];
            };
        }>;
    };
    const route = payload.routes?.[0];
    if (payload.code !== "Ok" || !route?.geometry?.coordinates?.length)
        throw new Error("No road route was returned.");
    return {
        coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({
            latitude,
            longitude,
        })),
        distance_m: Math.round(route.distance),
        duration_s: Math.round(route.duration),
        source: "osrm",
    };
}
