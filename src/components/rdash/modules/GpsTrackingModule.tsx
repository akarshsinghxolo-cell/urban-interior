"use client";

import * as React from "react";
import {
  Building2, CloudDownload, Gauge, Map as MapIcon, MapPin,
  Navigation, Radio, RefreshCw, Route, Store, Timer, UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
import {
  buildStaffRouteSegments, detectStaffRouteStops, isLocationFresh,
  latestStaffLocations, summarizeStaffRoute, type StaffLocationPing,
  type StaffRouteBundle,
} from "@/lib/rdash/staff-location";
import {
  STAFF_ROUTE_QUEUE_EVENT, readQueuedStaffRoutePointCount,
  readQueuedStaffRoutePoints, requestStaffRouteSync,
} from "@/lib/rdash/staff-route-client";
import { useLocationTrackingState } from "@/lib/rdash/location-tracking-status";
import { MapView, type MapPoint, type MapRouteSegment } from "../MapView";
import { EmptyState, MetricCard, StatusBadge } from "../primitives";
import { formatDateTime, indiaBusinessDate, titleCase } from "@/lib/rdash/format";
import { toast } from "sonner";

type LayerKey = "staff" | "route" | "stops" | "sites" | "vendors" | "visits";
const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  staff: true, route: true, stops: true, sites: true, vendors: true, visits: false,
};

function formatDistance(value: number) {
  return value < 1_000 ? `${Math.round(value)} m` : `${(value / 1_000).toFixed(1)} km`;
}
function formatDuration(value: number) {
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}
function layerClass(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

export function GpsTrackingModule({ moduleId }: { moduleId: string; viewFilter?: string }) {
  const db = useRDashStore((state) => state.db);
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const storedPoints = useRDashStore((state) => state.staffLocationPings);
  const replacePoints = useRDashStore((state) => state.replaceStaffLocationPings);
  const currentUser = useRDashStore((state) => state.currentUser);
  const openDetail = useRDashStore((state) => state.openDetail);
  const user = currentUser();
  const tracking = useLocationTrackingState();
  const canViewAll = user.role === "Owner" || user.role === "Operations Manager";
  const staff = React.useMemo(
    () => db.master.staff
      .filter((row) => row.status === "active" && (canViewAll || row.id === user.staffId))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [canViewAll, db.master.staff, user.staffId],
  );

  const [staffId, setStaffId] = React.useState(canViewAll ? "all" : user.staffId || "");
  const [date, setDate] = React.useState(indiaBusinessDate());
  const [layers, setLayers] = React.useState(DEFAULT_LAYERS);
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [bundleCount, setBundleCount] = React.useState(0);
  const [loadedAt, setLoadedAt] = React.useState<string | null>(null);
  const [localPoints, setLocalPoints] = React.useState<StaffLocationPing[]>(
    () => readQueuedStaffRoutePoints(user.staffId),
  );

  React.useEffect(() => {
    if (!canViewAll && user.staffId) setStaffId(user.staffId);
  }, [canViewAll, user.staffId]);

  React.useEffect(() => {
    const refresh = () => setLocalPoints(readQueuedStaffRoutePoints(user.staffId));
    refresh();
    window.addEventListener(STAFF_ROUTE_QUEUE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STAFF_ROUTE_QUEUE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user.staffId]);

  const fetchRoutes = React.useCallback(async (notify = false) => {
    setStatus("loading");
    try {
      const params = new URLSearchParams({ date });
      if (staffId && staffId !== "all") params.set("staffId", staffId);
      const response = await fetch(`/api/tracking/routes?${params}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        points?: StaffLocationPing[]; bundles?: StaffRouteBundle[]; error?: string;
      };
      if (!response.ok || !Array.isArray(payload.points)) {
        throw new Error(payload.error || "Route bundle feed is unavailable.");
      }
      replacePoints(payload.points);
      setBundleCount(payload.bundles?.length || 0);
      setLoadedAt(new Date().toISOString());
      setStatus("ready");
      if (notify) toast.success("Route bundles fetched", {
        description: `${payload.bundles?.length || 0} bundles · ${payload.points.length} points`,
      });
    } catch (error) {
      setStatus("error");
      if (notify) toast.error(error instanceof Error ? error.message : "Could not fetch route bundles.");
    }
  }, [date, replacePoints, staffId]);

  React.useEffect(() => {
    if (activeModuleId === moduleId) void fetchRoutes(false);
  }, [activeModuleId, fetchRoutes, moduleId]);

  const points = React.useMemo(() => {
    const map = new Map<string, StaffLocationPing>();
    for (const point of [...storedPoints, ...localPoints]) {
      if (staffId !== "all" && point.staff_id !== staffId) continue;
      if (indiaBusinessDate(new Date(point.captured_at)) !== date) continue;
      map.set(point.client_point_id || point.id, point);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    );
  }, [date, localPoints, staffId, storedPoints]);

  const byStaff = React.useMemo(() => {
    const map = new Map<string, StaffLocationPing[]>();
    for (const point of points) map.set(point.staff_id, [...(map.get(point.staff_id) || []), point]);
    return map;
  }, [points]);

  const segments = React.useMemo<MapRouteSegment[]>(() =>
    Array.from(byStaff.entries()).flatMap(([id, rows]) => {
      const person = db.master.staff.find((item) => item.id === id);
      return buildStaffRouteSegments(rows).map((segment) => ({
        id: segment.id,
        coordinates: [
          { latitude: segment.from.latitude, longitude: segment.from.longitude },
          { latitude: segment.to.latitude, longitude: segment.to.longitude },
        ],
        tone: segment.band,
        label: `${person?.name || id} · ${segment.speed_kmh.toFixed(1)} km/h`,
        meta: `${formatDateTime(segment.from.captured_at)} → ${formatDateTime(segment.to.captured_at)} · ${formatDistance(segment.distance_m)}`,
      }));
    }), [byStaff, db.master.staff]);
  const stops = React.useMemo(
    () => Array.from(byStaff.values()).flatMap((rows) => detectStaffRouteStops(rows)), [byStaff],
  );
  const summary = React.useMemo(() => summarizeStaffRoute(points), [points]);
  const latest = React.useMemo(() => latestStaffLocations(points), [points]);

  const mapPoints = React.useMemo<MapPoint[]>(() => {
    const result: MapPoint[] = [];
    if (layers.staff) {
      for (const point of latest.values()) {
        const person = db.master.staff.find((row) => row.id === point.staff_id);
        result.push({
          id: `staff-${point.staff_id}`, label: person?.name || point.staff_id,
          latitude: point.latitude, longitude: point.longitude, status: "staff", radius: 10,
          meta: `${isLocationFresh(point) ? "Latest point" : "Older synced point"} · ${formatDateTime(point.captured_at)} · ${point.speed_kmh.toFixed(1)} km/h · ±${Math.round(point.accuracy_m)} m`,
        });
      }
    }
    if (layers.stops) {
      for (const stop of stops) {
        const person = db.master.staff.find((row) => row.id === stop.staff_id);
        result.push({
          id: stop.id, label: `${person?.name || stop.staff_id} stopped`,
          latitude: stop.latitude, longitude: stop.longitude, status: "stop", radius: 7,
          meta: `Stayed ${formatDuration(stop.duration_minutes)} · Arrival ${formatDateTime(stop.arrival_at)} · Departure ${formatDateTime(stop.departure_at)}`,
        });
      }
    }
    if (layers.sites) {
      for (const site of db.sites.filter((row) => !row.is_archived)) {
        const customer = db.customers.find((row) => row.id === site.customer_id);
        result.push({
          id: `site-${site.id}`, label: site.name, latitude: site.latitude, longitude: site.longitude,
          address: [site.address, site.locality, site.city].filter(Boolean).join(", "), status: "site",
          meta: `${customer?.name || "Customer"} · ${titleCase(site.stage)} · Site`,
          onClick: () => openDetail("site" as never, site.id),
        });
      }
    }
    if (layers.vendors) {
      for (const vendor of db.master.vendors) {
        const row = vendor as typeof vendor & {
          latitude?: number; longitude?: number; address?: string; locality?: string;
          city?: string; category?: string; phone?: string;
        };
        result.push({
          id: `vendor-${row.id}`, label: row.name, latitude: row.latitude, longitude: row.longitude,
          address: [row.address, row.locality, row.city].filter(Boolean).join(", "), status: "vendor",
          meta: `${row.category || "Vendor"}${row.phone ? ` · ${row.phone}` : ""}`,
          onClick: () => openDetail("vendor" as never, row.id),
        });
      }
    }
    if (layers.visits) {
      for (const visit of db.visits) {
        if (staffId !== "all" && visit.staff_id !== staffId) continue;
        if (indiaBusinessDate(new Date(visit.scheduled_at)) !== date) continue;
        result.push({
          id: `visit-${visit.id}`, label: visit.location_name,
          latitude: visit.latitude ?? visit.planned_latitude,
          longitude: visit.longitude ?? visit.planned_longitude,
          status: visit.status === "completed" ? "completed" : visit.status === "checked_in" ? "active" : "scheduled",
          meta: `${visit.staff_name} · ${titleCase(visit.status)} · Visit`,
          onClick: () => openDetail("visit", visit.id),
        });
      }
    }
    return result;
  }, [date, db.customers, db.master.staff, db.master.vendors, db.sites, db.visits, latest, layers, openDetail, staffId, stops]);

  const missingSites = db.sites.filter((row) => !row.is_archived && (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude))).length;
  const missingVendors = db.master.vendors.filter((vendor) => {
    const row = vendor as typeof vendor & { latitude?: number; longitude?: number };
    return !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude);
  }).length;
  const selectedName = staffId === "all" ? "All staff" : staff.find((row) => row.id === staffId)?.name || staffId;

  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapIcon className="h-5 w-5" /></span>
        <div><h2 className="text-lg font-bold tracking-tight">Staff Route & Field Map</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">The browser captures the path locally and sends one bundle after an hour or on manual sync. Green is above 15 km/h, yellow is up to 15 km/h, and red marks stops.</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          {canViewAll && <option value="all">All staff</option>}
          {staff.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.role}</option>)}
        </select>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm" />
        <Button size="sm" variant="outline" disabled={status === "loading"} onClick={() => void fetchRoutes(true)}>
          <CloudDownload className={cn("mr-1 h-3.5 w-3.5", status === "loading" && "animate-spin")} />Fetch latest
        </Button>
        {user.staffId && <Button size="sm" onClick={() => {
          requestStaffRouteSync();
          toast.info("Manual route sync requested", { description: "This browser is bundling and uploading all unsynced route points." });
        }}><UploadCloud className="mr-1 h-3.5 w-3.5" />Sync this device</Button>}
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCard label="Route points" value={summary.point_count} tone="primary" icon={<Radio className="h-4 w-4" />} />
      <MetricCard label="Distance" value={formatDistance(summary.distance_m)} tone="success" icon={<Route className="h-4 w-4" />} />
      <MetricCard label="Moving" value={formatDuration(summary.moving_minutes)} tone="primary" icon={<Navigation className="h-4 w-4" />} />
      <MetricCard label="Stopped" value={formatDuration(summary.stopped_minutes)} tone="warning" icon={<Timer className="h-4 w-4" />} />
      <MetricCard label="Max speed" value={`${summary.max_speed_kmh} km/h`} icon={<Gauge className="h-4 w-4" />} />
      <MetricCard label="Bundles" value={bundleCount} icon={<CloudDownload className="h-4 w-4" />} />
    </section>

    <section className={cn("rounded-[var(--panel-radius)] border p-3 shadow-card",
      tracking.status === "active" ? "border-success/30 bg-success/[0.04]" :
      ["permission_denied", "auth_required", "error"].includes(tracking.status) ? "border-destructive/30 bg-destructive/[0.04]" : "border-border bg-card") }>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">This browser · frontend hourly bundles</p><p className="text-[11px] text-muted-foreground">{tracking.message}</p></div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><StatusBadge label={tracking.status.replaceAll("_", " ")} className="border-border bg-muted text-muted-foreground" /><span>{tracking.pendingCount || readQueuedStaffRoutePointCount()} queued</span>{tracking.lastSentAt && <span>Last sync {formatDateTime(tracking.lastSentAt)}</span>}</div></div>
    </section>

    <section className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["staff", "Staff", Radio], ["route", "Route", Route], ["stops", "Stops", Timer],
          ["sites", "Sites", Building2], ["vendors", "Vendors", Store], ["visits", "Visits", MapPin],
        ] as Array<[LayerKey, string, React.ComponentType<{ className?: string }>]>).map(([key, label, Icon]) =>
          <button key={key} type="button" className={layerClass(layers[key])} onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}><Icon className="mr-1 inline h-3.5 w-3.5" />{label}</button>)}
        <div className="ml-auto flex gap-3 text-[10px] text-muted-foreground"><span>🟩 &gt;15 km/h</span><span>🟨 ≤15 km/h</span><span>🟥 stopped</span></div>
      </div>
      <div className="mt-3"><MapView title={`${selectedName} field map`} points={mapPoints} showRoute={layers.route} routeSegments={layers.route ? segments : []} className="min-h-[560px]" emptyTitle="No mapped route or field records" emptyDescription="Fetch a route bundle or add coordinates to Sites and Vendors." /></div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground"><span>Missing coordinates: {missingSites} sites · {missingVendors} vendors</span><span>{loadedAt ? `Fetched ${formatDateTime(loadedAt)}` : "Not fetched yet"}</span></div>
    </section>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Detected stops</h3><p className="text-[11px] text-muted-foreground">Within 35 metres for at least two minutes.</p></div><StatusBadge label={`${stops.length} stops`} className="border-destructive/20 bg-destructive/10 text-destructive" /></div>
        <div className="mt-3 space-y-2">{stops.length ? stops.slice().sort((a, b) => b.duration_minutes - a.duration_minutes).map((stop) => {
          const person = db.master.staff.find((row) => row.id === stop.staff_id);
          return <div key={stop.id} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold">{person?.name || stop.staff_id}</p><p className="text-[11px] text-muted-foreground">{formatDateTime(stop.arrival_at)} → {formatDateTime(stop.departure_at)}</p></div><StatusBadge label={formatDuration(stop.duration_minutes)} className="border-destructive/20 bg-destructive/10 text-destructive" /></div><p className="mt-2 font-mono text-[10px] text-muted-foreground">{stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)} · {stop.point_count} points</p></div>;
        }) : <EmptyState icon={<Timer className="h-6 w-6" />} title="No qualifying stops" description="Stops appear after at least two minutes of stationary route data." />}</div>
      </section>
      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Recent route points</h3><p className="text-[11px] text-muted-foreground">Latest captured points for {selectedName}.</p></div><StatusBadge label={`${points.length} points`} className="border-primary/20 bg-primary/10 text-primary" /></div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">{points.length ? points.slice().reverse().slice(0, 100).map((point) => {
          const person = db.master.staff.find((row) => row.id === point.staff_id);
          const band = point.speed_kmh > 15 ? "Fast" : point.speed_kmh <= 0.8 ? "Stopped" : "Slow";
          return <div key={point.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-xs font-semibold">{person?.name || point.staff_id} · {formatDateTime(point.captured_at)}</p><p className="font-mono text-[10px] text-muted-foreground">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)} · ±{Math.round(point.accuracy_m)} m</p></div><StatusBadge label={`${band} · ${point.speed_kmh.toFixed(1)} km/h`} className={point.speed_kmh > 15 ? "border-success/20 bg-success/10 text-success" : point.speed_kmh <= 0.8 ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-warning/20 bg-warning/10 text-warning"} /></div>;
        }) : <EmptyState icon={<Route className="h-6 w-6" />} title="No route points" description="Use Fetch latest after an hourly or manual device sync." />}</div>
      </section>
    </div>

    {status === "error" && <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3"><div><p className="text-sm font-semibold">Route bundle feed unavailable</p><p className="text-xs text-muted-foreground">Map layers remain usable. Retry after checking the connection.</p></div><Button size="sm" variant="outline" onClick={() => void fetchRoutes(true)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button></div>}
  </div>;
}
