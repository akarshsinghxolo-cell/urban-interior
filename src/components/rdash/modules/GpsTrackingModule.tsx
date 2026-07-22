"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { SavedViewsBar } from "../SavedViewsBar";
import { formatDateTime, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import type { Visit } from "@/lib/rdash/types";
import { isLocationFresh, latestStaffLocations, type StaffLocationPing } from "@/lib/rdash/staff-location";
import { MapPin, Navigation, Clock, Route, Map as MapIcon, CheckCircle2, AlertTriangle, Square, Gauge, ListOrdered, Copy, Timer, TrendingUp, Layers, Radio, RefreshCw, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapView, type MapRoadRoute, type MapPoint } from "../MapView";
import { gpsPathRoute, requestRoadRoute } from "@/lib/rdash/road-route";
import { visitToMapPoints } from "../visitMap";
type GpsView = "map" | "route" | "stops" | "speed" | "points";
const VIEWS: {
    key: GpsView;
    label: string;
}[] = [
    { key: "map", label: "Map" },
    { key: "route", label: "Route" },
    { key: "stops", label: "Stops" },
    { key: "speed", label: "Speed" },
    { key: "points", label: "Points" },
];
function computeDwell(v: Visit): number | null {
    if (v.dwell_minutes != null)
        return v.dwell_minutes;
    if (!v.check_in_at)
        return null;
    const end = v.check_out_at ? new Date(v.check_out_at).getTime() : Date.now();
    const start = new Date(v.check_in_at).getTime();
    if (isNaN(start) || isNaN(end) || end < start)
        return null;
    return Math.max(0, Math.round((end - start) / 60000));
}
function formatDuration(minutes: number | null | undefined): string {
    if (minutes == null)
        return "—";
    if (minutes < 1)
        return "0m";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0)
        return `${m}m`;
    return `${h}h ${m}m`;
}
interface StopCluster {
    key: string;
    lat: number;
    lng: number;
    name: string;
    visits: Visit[];
    totalDwell: number;
    hasInProgress: boolean;
}
function clusterVisits(visits: Visit[]): StopCluster[] {
    const clusters: StopCluster[] = [];
    const PROX = 0.005;
    for (const v of visits) {
        if (v.latitude == null || v.longitude == null)
            continue;
        const match = clusters.find((c) => Math.abs(c.lat - v.latitude!) < PROX && Math.abs(c.lng - v.longitude!) < PROX);
        if (match) {
            match.visits.push(v);
            const n = match.visits.length;
            match.lat = (match.lat * (n - 1) + v.latitude!) / n;
            match.lng = (match.lng * (n - 1) + v.longitude!) / n;
        }
        else {
            clusters.push({
                key: `cluster-${v.id}`,
                lat: v.latitude!,
                lng: v.longitude!,
                name: v.location_name,
                visits: [v],
                totalDwell: 0,
                hasInProgress: false,
            });
        }
    }
    for (const c of clusters) {
        const counts = new Map<string, number>();
        for (const v of c.visits) {
            counts.set(v.location_name, (counts.get(v.location_name) || 0) + 1);
            const dwell = computeDwell(v);
            if (dwell != null)
                c.totalDwell += dwell;
            if (v.dwell_minutes == null && v.status === "checked_in")
                c.hasInProgress = true;
        }
        let best = c.name;
        let bestN = 0;
        for (const [name, n] of counts) {
            if (n > bestN) {
                best = name;
                bestN = n;
            }
        }
        c.name = best;
        c.visits.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    }
    return clusters.sort((a, b) => b.visits.length - a.visits.length);
}
function formatSpan(startIso: string, endIso: string): string {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    if (isNaN(s) || isNaN(e) || e < s)
        return "—";
    const min = Math.round((e - s) / 60000);
    return formatDuration(min);
}
function actualGpsCoordinates(visit: Visit) {
    const latestActualRoutePoint = [...(visit.route_points || [])].reverse().find((point) => point.kind !== "planned");
    return {
        latitude: visit.latitude ?? latestActualRoutePoint?.latitude,
        longitude: visit.longitude ?? latestActualRoutePoint?.longitude,
    };
}
function displayCoordinates(visit: Visit) {
    const actual = actualGpsCoordinates(visit);
    if (actual.latitude != null && actual.longitude != null) {
        return { ...actual, source: "GPS" };
    }
    return {
        latitude: visit.planned_latitude,
        longitude: visit.planned_longitude,
        source: "Planned site",
    };
}
function coordinateSummary(visit: Visit) {
    const coordinates = displayCoordinates(visit);
    if (coordinates.latitude == null || coordinates.longitude == null)
        return "No coordinates";
    return `${coordinates.source} ${coordinates.latitude.toFixed(3)}, ${coordinates.longitude.toFixed(3)}`;
}
function useRoadRoute(points: Array<{
    latitude: number;
    longitude: number;
}>) {
    const [route, setRoute] = React.useState<MapRoadRoute | null>(null);
    React.useEffect(() => {
        const fallback = gpsPathRoute(points);
        setRoute(fallback);
        if (points.length < 2)
            return;
        const controller = new AbortController();
        requestRoadRoute(points, controller.signal).then((result) => {
            if (result)
                setRoute(result);
        }).catch(() => undefined);
        return () => controller.abort();
    }, [JSON.stringify(points)]);
    return route;
}
export function GpsTrackingModule({ viewFilter }: {
    viewFilter?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const staffLocationPings = useRDashStore((s) => s.staffLocationPings);
    const replaceStaffLocationPings = useRDashStore((s) => s.replaceStaffLocationPings);
    const currentUser = useRDashStore((s) => s.currentUser);
    const user = currentUser();
    const canViewAllTracking = user.role === "Owner" || user.role === "Operations Manager";
    const accessibleVisits = React.useMemo(() => canViewAllTracking ? db.visits : db.visits.filter((visit) => visit.assignee_type !== "contractor" && !visit.contractor_id && visit.staff_id === user.staffId), [canViewAllTracking, db.visits, user.staffId]);
    const accessibleLocationPings = React.useMemo(() => canViewAllTracking ? staffLocationPings : staffLocationPings.filter((point) => point.staff_id === user.staffId), [canViewAllTracking, staffLocationPings, user.staffId]);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [selectedStaff, setSelectedStaff] = React.useState<string>("all");
    const [mapCity, setMapCity] = React.useState<string>("all");
    const [showRoute, setShowRoute] = React.useState(true);
    const [locationFeedStatus, setLocationFeedStatus] = React.useState<"loading" | "ready" | "error">("loading");
    const refreshStaffLocations = React.useCallback(async () => {
        try {
            const response = await fetch("/api/tracking/locations", { credentials: "same-origin", cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as {
                points?: StaffLocationPing[];
                error?: string;
            };
            if (!response.ok || !Array.isArray(payload.points))
                throw new Error(payload.error || "Location feed unavailable");
            replaceStaffLocationPings(payload.points);
            setLocationFeedStatus("ready");
        }
        catch {
            setLocationFeedStatus("error");
        }
    }, [replaceStaffLocationPings]);
    React.useEffect(() => {
        void refreshStaffLocations();
        const interval = window.setInterval(() => { void refreshStaffLocations(); }, 20000);
        const onVisibility = () => { if (document.visibilityState === "visible")
            void refreshStaffLocations(); };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [refreshStaffLocations]);
    const initialView: GpsView = (VIEWS.some((v) => v.key === viewFilter) ? viewFilter : "map") as GpsView;
    const [view, setView] = React.useState<GpsView>(initialView);
    // STAGE-4-FIX: sync view from prop changes (saved-view navigation)
    React.useEffect(() => { if (VIEWS.some((v) => v.key === viewFilter)) setView(viewFilter as GpsView); }, [viewFilter]);
    const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);
    const gpsPresets = React.useMemo(() => VIEWS.map((v) => ({ id: v.key, label: v.label, filter: { view: v.key } })), []);
    const handleViewChange = (v: GpsView) => {
        setView(v);
        setActiveSavedViewId(null);
    };
    const handleApplySavedView = (sv: SavedView) => {
        const viewKey = (sv.presetId || sv.extra?.view) as GpsView;
        if (viewKey && VIEWS.some((v) => v.key === viewKey)) {
            setView(viewKey);
        }
        if (sv.extra?.staff) {
            setSelectedStaff(sv.extra.staff);
        }
        setActiveSavedViewId(sv.id);
    };
    const currentPresetId = view;
    const visitsWithMapLocation = React.useMemo(() => accessibleVisits.filter((v) => (v.route_points || []).some((point) => point.kind !== "planned") || (v.latitude != null && v.longitude != null)), [accessibleVisits]);
    const latestLocationByStaff = React.useMemo(() => latestStaffLocations(accessibleLocationPings), [accessibleLocationPings]);
    const liveStaffLocationCount = React.useMemo(() => Array.from(latestLocationByStaff.values()).filter((point) => isLocationFresh(point)).length, [latestLocationByStaff]);
    const selectedLocationHistory = React.useMemo(() => accessibleLocationPings
        .filter((point) => selectedStaff === "all" || point.staff_id === selectedStaff)
        .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()), [accessibleLocationPings, selectedStaff]);
    const staffList = React.useMemo(() => {
        const m = new Map<string, {
            id: string;
            name: string;
            role: string;
            visitCount: number;
            activeCount: number;
            location?: StaffLocationPing;
        }>();
        accessibleVisits.forEach((v) => {
            const e = m.get(v.staff_id) || { id: v.staff_id, name: v.staff_name, role: "", visitCount: 0, activeCount: 0 };
            e.visitCount++;
            if (v.status === "checked_in" || v.status === "en_route")
                e.activeCount++;
            m.set(v.staff_id, e);
        });
        db.master.staff
            .filter((staff) => canViewAllTracking || staff.id === user.staffId)
            .forEach((staff) => {
            const e = m.get(staff.id) || { id: staff.id, name: staff.name, role: staff.role, visitCount: 0, activeCount: 0 };
            e.location = latestLocationByStaff.get(staff.id);
            m.set(staff.id, e);
        });
        return Array.from(m.values())
            .filter((entry) => Boolean(entry.id))
            .sort((a, b) => Number(isLocationFresh(b.location || { captured_at: "" })) - Number(isLocationFresh(a.location || { captured_at: "" })) || b.activeCount - a.activeCount || a.name.localeCompare(b.name));
    }, [accessibleVisits, canViewAllTracking, db.master.staff, latestLocationByStaff, user.staffId]);
    const filteredVisits = selectedStaff === "all" ? visitsWithMapLocation : visitsWithMapLocation.filter((v) => v.staff_id === selectedStaff);
    const cityForVisit = React.useCallback((visit: Visit) => db.sites.find((site) => site.id === visit.site_id)?.city || "Unspecified", [db.sites]);
    const mapCities = React.useMemo(() => Array.from(new Set(accessibleVisits.map(cityForVisit))).filter(Boolean).sort(), [accessibleVisits, cityForVisit]);
    React.useEffect(() => { if (mapCity === "all" && mapCities.length > 1)
        setMapCity(mapCities[0]); }, [mapCities, mapCity]);
    const mapScopeVisits = React.useMemo(() => (mapCity === "all" ? accessibleVisits : accessibleVisits.filter((visit) => cityForVisit(visit) === mapCity)).filter((visit) => selectedStaff === "all" || visit.staff_id === selectedStaff), [accessibleVisits, cityForVisit, mapCity, selectedStaff]);
    const mapScopeStaffLocations = React.useMemo(() => Array.from(latestLocationByStaff.values()).filter((point) => selectedStaff === "all" || point.staff_id === selectedStaff), [latestLocationByStaff, selectedStaff]);
    const activeNow = accessibleVisits.filter((v) => v.status === "checked_in" || v.status === "en_route").length;
    const completedToday = accessibleVisits.filter((v) => v.status === "completed" && relativeDay(v.check_out_at || v.scheduled_at) === "Today").length;
    const totalDwell = accessibleVisits.reduce((n, v) => n + (computeDwell(v) || 0), 0);
    const orderedVisits: Visit[] = React.useMemo(() => [...filteredVisits].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), [filteredVisits]);
    const orderedVisitIndex = React.useMemo(() => {
        const m = new Map<string, number>();
        orderedVisits.forEach((v, i) => m.set(v.id, i + 1));
        return m;
    }, [orderedVisits]);
    const chronologicalVisits = orderedVisits;
    const stopVisits = React.useMemo(() => filteredVisits.filter((v) => v.status === "checked_in" || v.status === "completed" || v.status === "en_route"), [filteredVisits]);
    const stopClusters = React.useMemo(() => clusterVisits(stopVisits), [stopVisits]);
    const dwellRows = React.useMemo(() => filteredVisits.map((v) => ({
        visit: v,
        num: orderedVisitIndex.get(v.id) || 0,
        dwell: computeDwell(v),
    })), [filteredVisits, orderedVisitIndex]);
    const dwellTotal = dwellRows.reduce((n, r) => n + (r.dwell || 0), 0);
    const dwellCount = dwellRows.filter((r) => r.dwell != null).length;
    const dwellAvg = dwellCount > 0 ? Math.round(dwellTotal / dwellCount) : 0;
    const longestStop = dwellRows.reduce<{
        visit: Visit | null;
        dwell: number;
    }>((acc, r) => ((r.dwell || 0) > acc.dwell ? { visit: r.visit, dwell: r.dwell || 0 } : acc), { visit: null, dwell: 0 });
    const totalVisits = accessibleVisits.length;
    const gpsPointsCount = accessibleVisits.filter((visit) => {
        const coordinates = actualGpsCoordinates(visit);
        return coordinates.latitude != null && coordinates.longitude != null;
    }).length;
    const routeSpan = React.useMemo(() => {
        if (chronologicalVisits.length < 2)
            return null;
        return {
            start: chronologicalVisits[0].scheduled_at,
            end: chronologicalVisits[chronologicalVisits.length - 1].scheduled_at,
        };
    }, [chronologicalVisits]);
    const mapPoints: MapPoint[] = React.useMemo(() => mapScopeVisits.map((visit) => {
        const coordinates = displayCoordinates(visit);
        return ({
            id: visit.id,
            label: `${orderedVisitIndex.get(visit.id) || ""}. ${visit.location_name}`.trim(),
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            address: visit.location_name,
            meta: `${visit.staff_name} · ${titleCase(visit.status)}`,
            status: visit.status === "checked_in" || visit.status === "en_route"
                ? "active"
                : visit.status === "report_pending"
                    ? "warning"
                    : visit.status === "completed"
                        ? "completed"
                        : "scheduled",
            onClick: () => openDetail("visit", visit.id),
        });
    }), [mapScopeVisits, orderedVisitIndex, openDetail]);
    const routeMapPoints: MapPoint[] = React.useMemo(() => mapScopeVisits.flatMap((visit) => visitToMapPoints(visit, {
        prefix: `${orderedVisitIndex.get(visit.id) || ""}.`,
        onClick: () => openDetail("visit", visit.id),
    })), [mapScopeVisits, orderedVisitIndex, openDetail]);
    const liveStaffMapPoints: MapPoint[] = React.useMemo(() => mapScopeStaffLocations.map((point) => {
        const staff = db.master.staff.find((row) => row.id === point.staff_id);
        const live = isLocationFresh(point);
        // H3: Find the staff's active visit (checked_in) so clicking a staff pin
        // can deep-link to Visit Proofs. We resolve it at click-time to avoid
        // stale closures when the underlying visits array changes.
        return {
            id: `staff-location-${point.staff_id}`,
            label: staff?.name || point.staff_id,
            latitude: point.latitude,
            longitude: point.longitude,
            meta: `${live ? "Live device" : "Last device signal"} · ${formatDateTime(point.captured_at)} · ±${Math.round(point.accuracy_m)} m`,
            status: live ? "active" : "warning",
            onClick: () => {
                const activeVisit = db.visits.find((v) => v.staff_id === point.staff_id && v.status === "checked_in");
                if (activeVisit) {
                    toast.info(`Active visit: ${activeVisit.location_name}`, {
                        description: "Opening Visit Proofs…",
                        duration: 2500,
                        action: { label: "Open", onClick: () => openDetail("visit", activeVisit.id) },
                    });
                    openDetail("visit", activeVisit.id);
                }
                else {
                    toast.info(`${staff?.name || point.staff_id} has no active visit`, { duration: 2000 });
                }
            },
        };
    }), [db.master.staff, db.visits, mapScopeStaffLocations, openDetail]);
    const routeCoordinates = React.useMemo(() => mapScopeVisits.map(actualGpsCoordinates).filter((point): point is {
        latitude: number;
        longitude: number;
    } => point.latitude != null && point.longitude != null), [mapScopeVisits]);
    const roadRoute = useRoadRoute(routeCoordinates);
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapIcon className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">GPS Tracking</h2>
            <p className="text-xs text-muted-foreground">Signed-in staff devices send location automatically, even between Visits. Browser tracking runs while the app remains open; a native mobile tracker is required for background or closed-app coverage. {locationFeedStatus === "error" ? "The location feed could not refresh." : "Live means a signal from the last 2 minutes."}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="all">All staff</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ""} ({s.visitCount})</option>)}
          </select>
          <select value={mapCity} onChange={(e) => setMapCity(e.target.value)} className="h-9 max-w-40 rounded-md border border-input bg-card px-2 text-sm" title="Map area">
            <option value="all">All locations</option>
            {mapCities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          {view === "map" && (<Button size="sm" variant="outline" onClick={() => setShowRoute((s) => !s)}>
              <Route className="mr-1 h-3.5 w-3.5"/> {showRoute ? "Hide route" : "Show route"}
            </Button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Live staff devices" value={liveStaffLocationCount} tone="primary" icon={<Radio className="h-4 w-4"/>}/>
        <MetricCard label="Active visits" value={activeNow} tone="warning" icon={<Navigation className="h-4 w-4"/>}/>
        <MetricCard label="Completed today" value={completedToday} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Total dwell (hrs)" value={Math.round((totalDwell / 60) * 10) / 10} tone="default" icon={<Clock className="h-4 w-4"/>}/>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="GPS view">
        {VIEWS.map((v) => {
            const active = v.key === view;
            return (<button key={v.key} type="button" role="tab" aria-selected={active} onClick={() => handleViewChange(v.key)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95", active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-sm")}>
              {v.label}
            </button>);
        })}
      </div>
      <SavedViewsBar workspaceKey="gps-tracking" presets={gpsPresets} currentPresetId={currentPresetId} currentSearch="" currentExtra={{ view, staff: selectedStaff }} onApply={handleApplySavedView} activeSavedViewId={activeSavedViewId}/>
      {view === "map" && (<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
              <h3 className="text-sm font-semibold">Live staff map</h3>
              <span className="text-[11px] text-muted-foreground">{mapScopeStaffLocations.length} staff signals · {mapScopeVisits.length} visits · {showRoute ? "visit route on" : "visit route off"}</span>
            </div>
            {mapCities.length > 1 && mapCity === "all" && <div className="border-b border-warning/20 bg-warning/[0.06] px-4 py-2 text-[11px] text-warning">Multiple cities are selected. Choose one city to keep the operational map focused.</div>}
            <MapView points={[...liveStaffMapPoints, ...routeMapPoints]} title="Live staff map" showRoute={showRoute} roadRoute={roadRoute} emptyTitle="No staff location yet" emptyDescription="Each staff member must sign in on their own phone and allow location. Their first device signal will appear here automatically." className="aspect-[4/3] min-h-[320px] rounded-none border-0"/>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[10px] text-muted-foreground"><span><b className="text-primary">Live</b> = device signal in the last 2 min</span><span><b>Amber</b> = last known device signal</span><span><b>Planned</b> = site location</span>{roadRoute?.distance_m ? <span>{(roadRoute.distance_m / 1000).toFixed(1)} km{roadRoute.duration_s ? ` · ~${Math.round(roadRoute.duration_s / 60)} min` : ""}</span> : null}</div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Staff devices</h3><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { void refreshStaffLocations(); }}><RefreshCw className="mr-1 h-3 w-3"/>Refresh</Button></div>
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rd-scroll">
                {staffList.map((s) => (<button key={s.id} type="button" onClick={() => setSelectedStaff(s.id)} className={cn("flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors", selectedStaff === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40")}>
                    <Avatar name={s.name} size={30}/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.location ? `${isLocationFresh(s.location) ? "Live now" : `Last seen ${formatDateTime(s.location.captured_at)}`}` : "Waiting for device signal"} · {s.activeCount} active visit{s.activeCount === 1 ? "" : "s"}</p>
                    </div>
                    {s.location && <span className={cn("h-2 w-2 rounded-full", isLocationFresh(s.location) ? "animate-pulse bg-success" : "bg-warning")}/>}
                  </button>))}
              </div>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
              <h3 className="mb-2 text-sm font-semibold">Active visits</h3>
              {accessibleVisits.filter((v) => v.status === "checked_in" || v.status === "en_route").length === 0 ? (<p className="py-3 text-center text-xs text-muted-foreground">No active visits right now.</p>) : (<div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto rd-scroll">
                  {accessibleVisits.filter((v) => v.status === "checked_in" || v.status === "en_route").map((v) => (<div key={v.id} className="rounded-md border border-warning/20 bg-warning/[0.06] p-2">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-semibold">{titleCase(v.visit_type)} · {v.location_name}</p>
                        <StatusBadge label={titleCase(v.status)} className="bg-warning/10 text-warning border-warning/20"/>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{v.staff_name} · {coordinateSummary(v)}</p>
                      {v.status === "checked_in" && (<Button size="sm" variant="outline" className="mt-1.5 h-7 w-full text-xs" onClick={() => { setActiveModule("fieldMode"); toast.info("Field check-out requires live device GPS in Field Mode."); }}>
                          <Square className="mr-1 h-3 w-3"/> Open Field Mode
                        </Button>)}
                    </div>))}
                </div>)}
            </div>
          </div>
        </div>)}
      {view === "route" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Route className="h-4 w-4 text-primary"/> Route timeline</h3>
              <span className="text-[11px] text-muted-foreground">{chronologicalVisits.length} stops · {selectedStaff === "all" ? "All assignees" : staffList.find((s) => s.id === selectedStaff)?.name}</span>
            </div>
            {routeSpan && (<div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <Clock className="h-3 w-3 text-muted-foreground" aria-hidden/>
                <span className="text-muted-foreground">Total route duration:</span>
                <span className="font-semibold text-foreground">{formatDuration(Math.round((new Date(routeSpan.end).getTime() - new Date(routeSpan.start).getTime()) / 60000))}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-muted-foreground">{formatDateTime(routeSpan.start).split(",")[0]} → {formatDateTime(routeSpan.end).split(",")[0]}</span>
              </div>)}
          </div>
          {chronologicalVisits.length === 0 ? (<EmptyState title="No GPS visits" description="No visits with GPS data for the selected assignee." icon={<Route className="h-8 w-8"/>}/>) : (<div className="max-h-[28rem] overflow-y-auto rd-scroll">
              <ol className="relative">
                <span className="pointer-events-none absolute bottom-3 left-[22px] top-3 w-px bg-gradient-to-b from-border via-border to-transparent" aria-hidden/>
                {chronologicalVisits.map((v, i) => {
                    const isActive = v.status === "checked_in" || v.status === "en_route";
                    const isDone = v.status === "completed";
                    const dotColor = isActive ? "bg-warning" : isDone ? "bg-success" : "bg-primary";
                    const nodeRing = isActive ? "border-warning/40 bg-warning/10" : isDone ? "border-success/40 bg-success/10" : "border-primary/40 bg-primary/10";
                    return (<li key={v.id} className="relative flex items-stretch gap-3 px-4 py-2.5">
                      <div className="relative z-10 flex w-9 shrink-0 flex-col items-center">
                        <span className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-card text-xs font-bold text-foreground shadow-sm", nodeRing)}>
                          {i + 1}
                          <span className={cn("absolute -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-card", dotColor)} aria-hidden/>
                        </span>
                      </div>
                      <button type="button" onClick={() => openDetail("visit", v.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/30">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">{titleCase(v.visit_type)} · {v.location_name}</p>
                          <StatusBadge label={titleCase(v.status)} className={isDone ? "bg-success/10 text-success border-success/20" : isActive ? "bg-warning/10 text-warning border-warning/20" : "bg-primary/10 text-primary border-primary/20"}/>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{v.staff_name} · {formatDateTime(v.scheduled_at)}</p>
                        {(v.check_in_at || v.check_out_at) && (<p className="text-[10px] text-muted-foreground/80">
                            {v.check_in_at && <span>in {formatDateTime(v.check_in_at)}</span>}
                            {v.check_in_at && v.check_out_at && <span> → </span>}
                            {v.check_out_at && <span>out {formatDateTime(v.check_out_at)}</span>}
                            {v.dwell_minutes != null && <span> · dwell {formatDuration(v.dwell_minutes)}</span>}
                          </p>)}
                      </button>
                    </li>);
                })}
              </ol>
            </div>)}
        </div>)}
      {view === "stops" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-primary"/> Stops</h3>
              <span className="text-[11px] text-muted-foreground">{stopClusters.length} clusters · {stopVisits.length} visits</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
              <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden/>
              <span className="text-muted-foreground">Total dwell:</span>
              <span className="font-semibold text-foreground">{formatDuration(stopClusters.reduce((n, c) => n + c.totalDwell, 0))}</span>
            </div>
          </div>
          {stopClusters.length === 0 ? (<EmptyState title="No stops yet" description="Visits will appear here once staff check in or complete." icon={<MapPin className="h-8 w-8"/>}/>) : (<div className="grid max-h-[28rem] gap-3 overflow-y-auto rd-scroll p-3 sm:grid-cols-2">
              {stopClusters.map((c) => (<div key={c.key} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <MapPin className="h-4 w-4"/>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.visits.length} visit{c.visits.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Dwell</p>
                      <p className="font-mono text-sm font-bold text-foreground">
                        {c.hasInProgress ? `${formatDuration(c.totalDwell)} · in progress` : formatDuration(c.totalDwell)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-border pt-2">
                    {c.visits.map((v) => {
                        const num = orderedVisitIndex.get(v.id) || 0;
                        return (<button key={v.id} type="button" onClick={() => openDetail("visit", v.id)} className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-accent/30">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{num}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium text-foreground">{titleCase(v.visit_type)}</span>
                            <span className="text-muted-foreground"> · {v.staff_name}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDateTime(v.scheduled_at).split(",")[0]}</span>
                        </button>);
                    })}
                  </div>
                </div>))}
            </div>)}
        </div>)}
      {view === "speed" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary"/> Visit duration</h3>
              <span className="text-[11px] text-muted-foreground">{filteredVisits.length} visits</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <Timer className="h-3 w-3 text-muted-foreground" aria-hidden/>
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold text-foreground">{formatDuration(dwellTotal)}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <span className="text-muted-foreground">Avg:</span>
                <span className="font-semibold text-foreground">{formatDuration(dwellAvg)}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <TrendingUp className="h-3 w-3 text-muted-foreground" aria-hidden/>
                <span className="text-muted-foreground">Longest:</span>
                <span className="font-semibold text-foreground">{longestStop.visit ? `${formatDuration(longestStop.dwell)}` : "—"}</span>
              </div>
            </div>
          </div>
          {filteredVisits.length === 0 ? (<EmptyState title="No duration data" description="No visits with GPS data for the selected assignee." icon={<Gauge className="h-8 w-8"/>}/>) : (<div className="max-h-[28rem] overflow-x-auto rd-scroll">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Visit #</th>
                    <th className="px-3 py-2 text-left font-semibold">Staff</th>
                    <th className="px-3 py-2 text-left font-semibold">Scheduled</th>
                    <th className="px-3 py-2 text-left font-semibold">Check-in</th>
                    <th className="px-3 py-2 text-left font-semibold">Check-out</th>
                    <th className="px-3 py-2 text-right font-semibold">Dwell (min)</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dwellRows.map(({ visit: v, num, dwell }) => (<tr key={v.id} className="transition-colors hover:bg-accent/20">
                      <td className="px-3 py-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{num || "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={v.staff_name} size={22}/>
                          <span className="truncate text-xs">{v.staff_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(v.scheduled_at)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{v.check_in_at ? formatDateTime(v.check_in_at) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{v.check_out_at ? formatDateTime(v.check_out_at) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-mono text-xs font-semibold">{dwell != null ? dwell : "—"}</span>
                        {v.dwell_minutes == null && v.status === "checked_in" && (<span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-warning align-middle" aria-label="in progress"/>)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge label={titleCase(v.status)} className={v.status === "completed" ? "bg-success/10 text-success border-success/20" : v.status === "checked_in" ? "bg-warning/10 text-warning border-warning/20" : "bg-primary/10 text-primary border-primary/20"}/>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </div>)}
      {view === "points" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><ListOrdered className="h-4 w-4 text-primary"/> Device location signals</h3>
              <span className="text-[11px] text-muted-foreground">{selectedLocationHistory.length} retained points</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <Radio className="h-3 w-3 text-success" aria-hidden/>
                <span className="text-muted-foreground">Live devices:</span>
                <span className="font-semibold text-foreground">{liveStaffLocationCount}</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { void refreshStaffLocations(); }}><RefreshCw className="mr-1 h-3 w-3"/>Refresh</Button>
            </div>
          </div>
          {selectedLocationHistory.length === 0 ? (<EmptyState title="No device signals yet" description="Each staff member must sign in on their own phone and allow location. The tracker will then send points automatically." icon={<Radio className="h-8 w-8"/>}/>) : (<div className="max-h-[28rem] overflow-x-auto rd-scroll">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Staff</th>
                    <th className="px-3 py-2 text-left font-semibold">Captured</th>
                    <th className="px-3 py-2 text-left font-semibold">Latitude</th>
                    <th className="px-3 py-2 text-left font-semibold">Longitude</th>
                    <th className="px-3 py-2 text-left font-semibold">Accuracy</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Copy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedLocationHistory.map((point) => {
                    const staff = db.master.staff.find((row) => row.id === point.staff_id);
                    const live = isLocationFresh(point);
                    return (<tr key={point.id} className="transition-colors hover:bg-accent/20">
                        <td className="px-3 py-2"><div className="flex items-center gap-1.5"><Avatar name={staff?.name || point.staff_id} size={22}/><span className="truncate text-xs">{staff?.name || point.staff_id}</span></div></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(point.captured_at)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{point.latitude.toFixed(5)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{point.longitude.toFixed(5)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">±{Math.round(point.accuracy_m)} m</td>
                        <td className="px-3 py-2"><StatusBadge label={live ? "Live" : "Last known"} className={live ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}/></td>
                        <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={async () => { const text = `${point.latitude}, ${point.longitude}`; try {
                        await navigator.clipboard.writeText(text);
                        toast.success(`Copied ${text}`);
                    }
                    catch {
                        toast.error("Clipboard unavailable — copy manually");
                    } }} aria-label={`Copy coordinates for ${staff?.name || point.staff_id}`}><Copy className="h-3 w-3"/> Copy</Button></td>
                      </tr>);
                })}
                </tbody>
              </table>
            </div>)}
        </div>)}
    </div>);
}
