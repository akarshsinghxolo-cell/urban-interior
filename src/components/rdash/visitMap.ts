import type { Visit, VisitRoutePoint } from "@/lib/rdash/types";
import { titleCase } from "@/lib/rdash/format";
import type { MapPoint } from "./MapView";
function routeKindLabel(kind: VisitRoutePoint["kind"]) {
    switch (kind) {
        case "planned":
            return "Planned site";
        case "en_route":
            return "En route";
        case "check_in":
            return "Check-in";
        case "check_out":
            return "Check-out";
        default:
            return "Tracked";
    }
}
function routeStatus(kind: VisitRoutePoint["kind"], visit: Visit): MapPoint["status"] {
    if (kind === "planned")
        return "scheduled";
    if (visit.status === "report_pending")
        return "warning";
    if (kind === "check_out" || visit.status === "completed")
        return "completed";
    if (kind === "check_in" || kind === "en_route" || kind === "tracking")
        return "active";
    return "default";
}
export function visitPrimaryCoordinates(visit: Visit) {
    const latestRoutePoint = [...(visit.route_points || [])].reverse().find((point) => point.kind !== "planned");
    return {
        latitude: visit.latitude ?? latestRoutePoint?.latitude ?? visit.planned_latitude,
        longitude: visit.longitude ?? latestRoutePoint?.longitude ?? visit.planned_longitude,
    };
}
export function visitToMapPoints(visit: Visit, options: {
    prefix?: string;
    includeActualRoute?: boolean;
    onClick?: () => void;
} = {}): MapPoint[] {
    const prefix = options.prefix ? `${options.prefix} ` : "";
    const points: MapPoint[] = [];
    const routeGroupId = visit.id;
    const routePoints = visit.route_points || [];
    const plannedFromRoute = routePoints.find((point) => point.kind === "planned");
    const plannedLatitude = visit.planned_latitude ?? plannedFromRoute?.latitude;
    const plannedLongitude = visit.planned_longitude ?? plannedFromRoute?.longitude;
    if (plannedLatitude != null && plannedLongitude != null) {
        points.push({
            id: `${visit.id}-planned`,
            label: `${prefix}Site`,
            latitude: plannedLatitude,
            longitude: plannedLongitude,
            address: visit.location_name,
            meta: `Planned · ${visit.location_name}`,
            status: "scheduled",
            routeGroupId,
            onClick: options.onClick,
        });
    }
    if (options.includeActualRoute !== false) {
        routePoints.filter((point) => point.kind !== "planned").forEach((point) => {
            points.push({
                id: point.id,
                label: `${prefix}${routeKindLabel(point.kind)}`,
                latitude: point.latitude,
                longitude: point.longitude,
                address: visit.location_name,
                meta: `${routeKindLabel(point.kind)} · ${titleCase(visit.status)}`,
                status: routeStatus(point.kind, visit),
                routeGroupId,
                onClick: options.onClick,
            });
        });
    }
    const hasActualRoute = points.some((point) => point.id !== `${visit.id}-planned`);
    if (!hasActualRoute && visit.latitude != null && visit.longitude != null) {
        points.push({
            id: `${visit.id}-actual`,
            label: `${prefix}${visit.status === "completed" ? "Actual" : visit.status === "report_pending" ? "Report pending" : "Current"}`,
            latitude: visit.latitude,
            longitude: visit.longitude,
            address: visit.location_name,
            meta: `${titleCase(visit.status)} · latest GPS`,
            status: visit.status === "completed" ? "completed" : visit.status === "report_pending" ? "warning" : "active",
            routeGroupId,
            onClick: options.onClick,
        });
    }
    return points;
}
