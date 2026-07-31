"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface MapRoadRoute {
  coordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
  source: "osrm" | "gps_path";
  distance_m?: number;
  duration_s?: number;
  warning?: string;
}

export interface MapRouteSegment {
  id: string;
  coordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
  tone: "fast" | "slow" | "stopped" | "neutral";
  label?: string;
  meta?: string;
}

export interface MapPoint {
  id: string;
  label: string;
  latitude?: number;
  longitude?: number;
  status?:
    | "active"
    | "completed"
    | "scheduled"
    | "warning"
    | "default"
    | "staff"
    | "site"
    | "vendor"
    | "stop";
  meta?: string;
  address?: string;
  routeGroupId?: string;
  radius?: number;
  onClick?: () => void;
}

export interface MapViewProps {
  points: MapPoint[];
  title?: string;
  showRoute?: boolean;
  roadRoute?: MapRoadRoute | null;
  routeSegments?: MapRouteSegment[];
  fallbackCenter?: {
    latitude: number;
    longitude: number;
    label?: string;
  };
  onMapClick?: (coordinates: {
    latitude: number;
    longitude: number;
  }) => void;
  geofenceRadiusM?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function isValidCoordinate(point: {
  latitude?: number;
  longitude?: number;
}) {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude! >= -90
    && point.latitude! <= 90
    && point.longitude! >= -180
    && point.longitude! <= 180;
}

export function openStreetMapPointUrl(point: {
  latitude?: number;
  longitude?: number;
  label?: string;
}) {
  if (!isValidCoordinate(point)) return "";
  return `https://www.google.com/maps?q=${point.latitude},${point.longitude}`;
}

export function openStreetMapSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`;
}

const LeafletMapView = dynamic(
  () =>
    import("./LeafletMapView").then(
      (module) => module.LeafletMapView,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[220px] items-center justify-center rounded-[var(--panel-radius)] border border-border bg-muted/20 text-xs text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

export function MapView({
  points,
  fallbackCenter,
  className,
  emptyTitle,
  emptyDescription,
  routeSegments,
  ...props
}: MapViewProps) {
  const plotted = points.filter(isValidCoordinate);
  const plottedRoutePoints = (routeSegments || [])
    .flatMap((segment) => segment.coordinates)
    .filter(isValidCoordinate);
  const hasFallback =
    fallbackCenter && isValidCoordinate(fallbackCenter);
  if (!plotted.length && !plottedRoutePoints.length && !hasFallback) {
    const firstAddress = points.find(
      (point) => point.address || point.label,
    );
    const href = firstAddress
      ? openStreetMapSearchUrl(
          firstAddress.address || firstAddress.label,
        )
      : "";
    return (
      <div
        className={cn(
          "flex min-h-[220px] flex-col items-center justify-center rounded-[var(--panel-radius)] border border-dashed border-border bg-muted/20 p-4 text-center",
          className,
        )}
      >
        <MapPin className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">
          {emptyTitle || "No GPS point recorded"}
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {emptyDescription
            || "Capture GPS or save coordinates to place records on the map."}
        </p>
        {href && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="mt-3"
          >
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Search address
            </a>
          </Button>
        )}
      </div>
    );
  }
  return (
    <LeafletMapView
      points={points}
      fallbackCenter={fallbackCenter}
      className={className}
      routeSegments={routeSegments}
      {...props}
    />
  );
}

export function MapUnavailableNotice({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-x-3 top-3 z-[1000] rounded-md border border-warning/40 bg-card/95 p-2.5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            Map tiles unavailable
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Markers and route coordinates are still available.
          </p>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
