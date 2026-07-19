"use client";
import * as React from "react";
import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents, } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { MapRoadRoute, MapPoint, MapViewProps } from "./MapView";
import { MapUnavailableNotice, isValidCoordinate, openStreetMapPointUrl } from "./MapView";
import { cn } from "@/lib/utils";
const TILE_PROVIDERS = [
    {
        name: "OpenStreetMap",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors",
    },
    {
        name: "OpenStreetMap France",
        url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap France contributors",
    },
] as const;
type Coordinate = {
    latitude: number;
    longitude: number;
};
function pointPosition(point: Coordinate): LatLngExpression {
    return [point.latitude, point.longitude];
}
function tone(status: MapPoint["status"]) {
    switch (status) {
        case "active": return { color: "#d97706", fillColor: "#f59e0b" };
        case "completed": return { color: "#15803d", fillColor: "#22c55e" };
        case "warning": return { color: "#dc2626", fillColor: "#ef4444" };
        case "scheduled": return { color: "#1d4ed8", fillColor: "#3b82f6" };
        default: return { color: "#475569", fillColor: "#64748b" };
    }
}
function FitMap({ points, fallbackCenter }: {
    points: Coordinate[];
    fallbackCenter?: Coordinate;
}) {
    const map = useMap();
    const key = React.useMemo(() => points.map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`).join("|"), [points]);
    React.useEffect(() => {
        const usable = points.length ? points : fallbackCenter ? [fallbackCenter] : [];
        if (!usable.length)
            return;
        if (usable.length === 1) {
            map.setView(pointPosition(usable[0]), Math.max(map.getZoom(), 16), { animate: false });
        }
        else {
            map.fitBounds(usable.map(pointPosition) as LatLngBoundsExpression, { padding: [28, 28], maxZoom: 16, animate: false });
        }
        requestAnimationFrame(() => map.invalidateSize());
    }, [fallbackCenter, key, map, points]);
    React.useEffect(() => {
        const target = map.getContainer();
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(target);
        return () => observer.disconnect();
    }, [map]);
    return null;
}
function MapPinDrop({ onMapClick }: {
    onMapClick?: MapViewProps["onMapClick"];
}) {
    useMapEvents({
        click(event) {
            onMapClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
        },
    });
    return null;
}
function LeafletRoute({ points, roadRoute }: {
    points: MapPoint[];
    roadRoute?: MapRoadRoute | null;
}) {
    const groups = React.useMemo(() => {
        const map = new Map<string, Coordinate[]>();
        points.filter(isValidCoordinate).forEach((point) => {
            const key = point.routeGroupId || "__all";
            const current = map.get(key) || [];
            current.push({ latitude: point.latitude!, longitude: point.longitude! });
            map.set(key, current);
        });
        return Array.from(map.values()).filter((group) => group.length > 1);
    }, [points]);
    return <>
    {groups.map((group, index) => <Polyline key={`recorded-${index}`} positions={group.map(pointPosition)} pathOptions={{ color: "#2563eb", weight: 2, dashArray: roadRoute?.source === "osrm" ? "5 5" : undefined, opacity: roadRoute?.source === "osrm" ? 0.32 : 0.72 }}/>)}
    {roadRoute?.coordinates?.length ? <Polyline positions={roadRoute.coordinates.map(pointPosition)} pathOptions={{ color: "#1d4ed8", weight: 4, opacity: 0.9 }}/> : null}
  </>;
}
export function LeafletMapView({ points, title = "Map", showRoute = false, roadRoute, fallbackCenter, onMapClick, geofenceRadiusM, className }: MapViewProps) {
    const [providerIndex, setProviderIndex] = React.useState(0);
    const [tileFailures, setTileFailures] = React.useState(0);
    const [retryKey, setRetryKey] = React.useState(0);
    const provider = TILE_PROVIDERS[providerIndex];
    const plotted = React.useMemo(() => points.filter(isValidCoordinate), [points]);
    const displayCoordinates = React.useMemo(() => plotted.length ? plotted.map((point) => ({ latitude: point.latitude!, longitude: point.longitude! })) : fallbackCenter && isValidCoordinate(fallbackCenter) ? [{ latitude: fallbackCenter.latitude, longitude: fallbackCenter.longitude }] : [], [fallbackCenter, plotted]);
    const initialCenter: LatLngExpression = displayCoordinates.length ? pointPosition(displayCoordinates[0]) : [26.7606, 83.3732];
    const tilesUnavailable = tileFailures >= 3 && providerIndex === TILE_PROVIDERS.length - 1;
    React.useEffect(() => {
        if (tileFailures < 3 || providerIndex >= TILE_PROVIDERS.length - 1)
            return;
        setProviderIndex((current) => current + 1);
        setTileFailures(0);
    }, [providerIndex, tileFailures]);
    const retryTiles = () => {
        setTileFailures(0);
        setRetryKey((current) => current + 1);
        if (providerIndex < TILE_PROVIDERS.length - 1)
            setProviderIndex((current) => current + 1);
        else
            setProviderIndex(0);
    };
    return (<div className={cn("relative min-h-[280px] overflow-hidden rounded-[var(--panel-radius)] border border-border bg-muted/20", className)} data-rdash-leaflet-map>
      <MapContainer center={initialCenter} zoom={15} scrollWheelZoom className="h-full min-h-[280px] w-full" aria-label={title}>
        <TileLayer key={`${providerIndex}-${retryKey}`} url={provider.url} attribution={provider.attribution} eventHandlers={{ tileerror: () => setTileFailures((count) => count + 1), load: () => setTileFailures(0) }}/>
        <FitMap points={displayCoordinates} fallbackCenter={fallbackCenter}/>
        <MapPinDrop onMapClick={onMapClick}/>
        {showRoute && <LeafletRoute points={plotted} roadRoute={roadRoute}/>}
        {geofenceRadiusM && displayCoordinates[0] ? <Circle center={pointPosition(displayCoordinates[0])} radius={geofenceRadiusM} pathOptions={{ color: "#2563eb", fillOpacity: 0.05, weight: 1, dashArray: "4 4" }}/> : null}
        {plotted.map((point) => {
            const colors = tone(point.status);
            return <CircleMarker key={point.id} center={pointPosition({ latitude: point.latitude!, longitude: point.longitude! })} radius={9} pathOptions={{ ...colors, weight: 3, fillOpacity: 0.95 }} eventHandlers={{ click: () => point.onClick?.() }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>{point.label}</Tooltip>
            <Popup>
              <div className="min-w-40 space-y-1"><p className="text-sm font-semibold">{point.label}</p>{point.meta ? <p className="text-xs text-slate-600">{point.meta}</p> : null}<p className="font-mono text-[10px] text-slate-500">{point.latitude!.toFixed(6)}, {point.longitude!.toFixed(6)}</p>{point.address ? <p className="text-xs text-slate-600">{point.address}</p> : null}{!point.onClick ? <a className="text-xs font-medium text-blue-700 underline" href={openStreetMapPointUrl(point)} target="_blank" rel="noreferrer">Open in Google Maps</a> : null}</div>
            </Popup>
          </CircleMarker>;
        })}
      </MapContainer>
      {tilesUnavailable ? <MapUnavailableNotice onRetry={retryTiles}/> : null}
      {roadRoute?.warning ? <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded bg-card/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border">{roadRoute.warning}</div> : null}
      <div className="pointer-events-none absolute bottom-2 right-2 z-[1000] rounded bg-card/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border">{provider.name} · {plotted.length} plotted{onMapClick ? " · click map to place pin" : ""}</div>
    </div>);
}
