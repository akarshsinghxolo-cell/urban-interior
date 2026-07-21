"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatDate, relativeDay, titleCase, formatDateTime } from "@/lib/rdash/format";
import { Image as ImageIcon, Camera, FileText, CheckCircle2, AlertTriangle, MapPin, Route, Clock, Navigation, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { FilePreview } from "../FilePreview";
import { attachedFilesForIds, assetPreview } from "@/lib/rdash/file-attachments";
import type { Visit, VisitRoutePoint } from "@/lib/rdash/types";
interface ProofItem {
    id: string;
    visitId: string;
    fileName: string;
    type: string;
    capturedAt: string;
    customerName: string;
    location: string;
    staffName: string;
    visitType: string;
    status: string;
    url?: string;
    mimeType?: string;
    driveFileId?: string;
}
function gradientFor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++)
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1} 60% 70%), hsl(${hue2} 65% 55%))`;
}
export function VisitProofsModule() {
    const db = useRDashStore((s) => s.db);
    const currentUser = useRDashStore((s) => s.currentUser);
    const user = currentUser();
    const canViewAllProofs = user.role === "Owner" || user.role === "Operations Manager";
    const visibleVisits = React.useMemo(() => canViewAllProofs ? db.visits : db.visits.filter((visit) => visit.assignee_type !== "contractor" && !visit.contractor_id && visit.staff_id === user.staffId), [canViewAllProofs, db.visits, user.staffId]);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [filter, setFilter] = React.useState<string>("all");
    const proofs: ProofItem[] = (() => {
        const out: ProofItem[] = [];
        visibleVisits.forEach((v) => {
            const customer = db.customers.find((p) => p.id === v.customer_id);
            attachedFilesForIds(db, v.proof_attachment_ids).forEach(({ attachment, asset }) => {
                out.push({
                    id: attachment.id, visitId: v.id, fileName: asset.file_name, type: attachment.role, capturedAt: attachment.created_at,
                    customerName: customer?.name || v.location_name, location: v.location_name, staffName: v.staff_name,
                    visitType: v.visit_type, status: v.status, url: asset.web_view_link, mimeType: asset.mime_type, driveFileId: asset.google_file_id,
                });
            });
        });
        return out.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    })();
    const filtered = filter === "all" ? proofs : filter === "site_photo" ? proofs.filter((p) => p.type === "site_photo") : proofs.filter((p) => p.type !== "site_photo");
    const visitsWithProofs = visibleVisits.filter((v) => v.proof_attachment_ids.length > 0).length;
    const visitsWithoutProofs = visibleVisits.filter((v) => v.status === "completed" && v.proof_attachment_ids.length === 0).length;
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ImageIcon className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Visit Proofs Gallery</h2>
            <p className="text-xs text-muted-foreground">Photographic evidence from site visits — the proof that closes the action</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total proofs" value={proofs.length} tone="primary" icon={<Camera className="h-4 w-4"/>}/>
        <MetricCard label="Visits with proof" value={visitsWithProofs} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="No optional proof" value={visitsWithoutProofs} tone="warning" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Site photos" value={proofs.filter((p) => p.type === "site_photo").length} tone="default" icon={<MapPin className="h-4 w-4"/>}/>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {["all", "site_photo", "other"].map((f) => (<button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent/50")}>
            {f === "all" ? "All proofs" : f === "site_photo" ? "Site photos" : "Other"}
          </button>))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} proofs</span>
      </div>

      {filtered.length === 0 ? (<EmptyState title="No proofs captured yet" description="Completed visits with proofs will appear here as a gallery." icon={<ImageIcon className="h-8 w-8"/>}/>) : (<div className="rd-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (<article key={p.id} className="group overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft">
              <div className="relative aspect-square w-full" style={p.url || p.driveFileId ? undefined : { background: gradientFor(p.fileName) }}>
                {p.url || p.driveFileId ? (<FilePreview file={{ fileName: p.fileName, mimeType: p.mimeType, googleFileId: p.driveFileId, url: p.url }} className="absolute inset-0 h-full border-0 rounded-none" compact controls={false}/>) : (<div className="absolute inset-0 flex items-center justify-center text-white/90"><Camera className="h-8 w-8 opacity-80"/></div>)}
                <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{titleCase(p.visitType)}</div>
                <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{relativeDay(p.capturedAt)}</div>
              </div>
              <button type="button" onClick={() => openDetail("visit", p.visitId)} className="block w-full p-2.5 text-left hover:bg-accent/30">
                <p className="truncate text-xs font-semibold">{p.customerName}</p>
                <p className="truncate text-[10px] text-muted-foreground">{p.fileName}</p>
                <div className="mt-1 flex items-center gap-1.5"><Avatar name={p.staffName} size={16}/><span className="truncate text-[10px] text-muted-foreground">{p.staffName}</span></div>
              </button>
            </article>))}
        </div>)}
      {visitsWithoutProofs > 0 && (<div className="rounded-[var(--panel-radius)] border border-destructive/25 bg-destructive/[0.05] p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning"/>
            <h3 className="text-sm font-semibold text-warning">{visitsWithoutProofs} completed visit(s) without optional proof</h3>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">Photos are optional. Add Drive evidence only when it is useful for verification, handover, or an exception.</p>
          <div className="flex flex-col gap-1.5">
            {visibleVisits.filter((v) => v.status === "completed" && v.proof_attachment_ids.length === 0).slice(0, 5).map((v) => {
                const customer = db.customers.find((p) => p.id === v.customer_id);
                return (<button key={v.id} type="button" onClick={() => openDetail("visit", v.id)} className="flex items-center justify-between rounded-md border border-warning/20 bg-card px-3 py-2 text-left hover:bg-accent/30">
                  <div>
                    <p className="text-xs font-medium">{titleCase(v.visit_type)} · {customer?.name || v.location_name}</p>
                    <p className="text-[10px] text-muted-foreground">{v.staff_name} · {formatDate(v.scheduled_at)}</p>
                  </div>
                  <StatusBadge label="Optional proof" className="bg-warning/10 text-warning border-warning/20"/>
                </button>);
            })}
          </div>
        </div>)}

      <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <h3 className="text-sm font-bold">Visit files & reference media</h3>
        <p className="mt-1 text-xs text-muted-foreground">Select a visit to attach a reusable Drive file or assign the catalogue, Pinterest board, and reference media that were used on site.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleVisits.filter((visit) => visit.proof_attachment_ids.length > 0 || visit.status === "completed").slice(0, 9).map((visit) => {
            const customer = db.customers.find((entry) => entry.id === visit.customer_id);
            return <OperationalMediaPanel key={visit.id} entityType="visit" entityId={visit.id} title={`${titleCase(visit.visit_type)} · ${customer?.name || visit.location_name}`} compact/>;
        })}
        </div>
      </section>

      {/* H2: GPS track panel — shows the visit's route_points (planned +
          check-in + tracking + check-out) as an ordered list with dwell and
          distance-traveled summary. Lets the operations team verify the field
          staff actually visited the site and stayed for the expected duration. */}
      <VisitGpsTrackPanel visits={visibleVisits} />
    </div>);
}

/**
 * Haversine distance between two lat/lon points, in meters.
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * VisitGpsTrackPanel — for each completed/checked-in visit, render the GPS
 * track (route_points in chronological order) plus a summary: dwell time,
 * distance traveled, planned-vs-actual offset. Collapsible per visit.
 */
function VisitGpsTrackPanel({ visits }: { visits: Visit[] }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    const trackedVisits = visits.filter((v) => v.check_in_at && (v.route_points?.length || 0) > 0);
    if (trackedVisits.length === 0) return null;
    const toggle = (id: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    return (
        <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-bold">GPS tracks</h3>
                <p className="text-xs text-muted-foreground">{trackedVisits.length} visit{trackedVisits.length === 1 ? "" : "s"} with GPS data · click to expand the route</p>
            </div>
            <div className="divide-y divide-border">
                {trackedVisits.slice(0, 20).map((v) => {
                    const isOpen = expanded.has(v.id);
                    const customer = db.customers.find((c) => c.id === v.customer_id);
                    const points: VisitRoutePoint[] = [...(v.route_points || [])].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
                    // Distance traveled = sum of haversine between consecutive tracking + check-in/out points.
                    let distance = 0;
                    for (let i = 1; i < points.length; i++) {
                        const prev = points[i - 1];
                        const cur = points[i];
                        if (prev.latitude != null && prev.longitude != null && cur.latitude != null && cur.longitude != null) {
                            distance += haversineMeters(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
                        }
                    }
                    const dwellMin = v.dwell_minutes ?? (v.check_in_at && v.check_out_at
                        ? Math.max(0, Math.round((new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 60000))
                        : 0);
                    return (
                        <div key={v.id}>
                            <button type="button" onClick={() => toggle(v.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/30">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Route className="h-3.5 w-3.5"/></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold">{customer?.name || v.location_name}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">{v.staff_name || v.contractor_name || "—"} · {points.length} GPS points · {Math.round(distance)} m · {dwellMin} min dwell</p>
                                </div>
                                <span className="shrink-0 text-[10px] text-muted-foreground">{relativeDay(v.check_in_at || v.scheduled_at)}</span>
                            </button>
                            {isOpen && (
                                <div className="border-t border-border bg-muted/20 px-4 py-3">
                                    <ol className="relative ml-3 space-y-1.5 border-l border-border pl-3">
                                        {points.map((p, idx) => (
                                            <li key={p.id || idx} className="text-[11px]">
                                                <span className="font-semibold text-foreground">{p.kind}</span>
                                                <span className="ml-2 text-muted-foreground">{p.captured_at ? formatDateTime(p.captured_at) : "—"}</span>
                                                <span className="ml-2 text-muted-foreground">· {p.latitude?.toFixed(5)}, {p.longitude?.toFixed(5)}</span>
                                                {p.accuracy_m ? <span className="ml-2 text-muted-foreground">· ±{Math.round(p.accuracy_m)}m</span> : null}
                                                {p.note ? <span className="ml-2 text-muted-foreground">· {p.note}</span> : null}
                                            </li>
                                        ))}
                                    </ol>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3"/> Dwell: <strong className="text-foreground">{dwellMin} min</strong></span>
                                        <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3"/> Distance: <strong className="text-foreground">{Math.round(distance)} m</strong></span>
                                        <button type="button" onClick={() => openDetail("visit", v.id)} className="ml-auto text-primary hover:underline">Open visit detail →</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
