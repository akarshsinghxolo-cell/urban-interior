"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { Avatar, StatusBadge } from "../primitives";
import { formatDate, relativeDay, titleCase, formatDateTime, indiaBusinessDate, } from "@/lib/rdash/format";
import { Smartphone, MapPin, Camera, CheckCircle2, Square, Play, FileText, Navigation, AlertTriangle, ExternalLink, X, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapView, openStreetMapPointUrl, openStreetMapSearchUrl, type MapPoint, } from "../MapView";
import { visitPrimaryCoordinates, visitToMapPoints } from "../visitMap";
import { compressImage } from "@/lib/rdash/image-compress";
import { uploadCapturedMediaToGoogleDrive } from "@/lib/rdash/google-drive-upload";
import { MANAGED_FILE_ACCEPT, readFileAsDataUrl } from "@/lib/rdash/file-assets";
import { FilePreview } from "../FilePreview";
export function FieldModeModule() {
    const db = useRDashStore((s) => s.db);
    const checkIn = useRDashStore((s) => s.checkInVisit);
    const checkOut = useRDashStore((s) => s.checkOutVisit);
    const markEnRoute = useRDashStore((s) => s.markVisitEnRoute);
    const startContractorVisit = useRDashStore((s) => s.startContractorVisit);
    const completeContractorVisit = useRDashStore((s) => s.completeContractorVisit);
    const recordTrackingPoint = useRDashStore((s) => s.recordVisitTrackingPoint);
    const fileReport = useRDashStore((s) => s.fileVisitReport);
    const openDetail = useRDashStore((s) => s.openDetail);
    const runVisitReconciliation = useRDashStore((s) => s.runVisitReconciliation);
    const currentUser = useRDashStore((s) => s.currentUser);
    const user = currentUser();
    const attendancePolicy = db.master.staff.find((staff) => staff.id === user.staffId)?.attendance_policy;
    React.useEffect(() => {
        if (user.role !== "Owner" && user.role !== "Operations Manager")
            return;
        try {
            runVisitReconciliation();
        }
        catch { }
    }, [runVisitReconciliation, user.role]);
    const today = indiaBusinessDate();
    const isActiveStaff = Boolean(user.staffId && db.master.staff.some((staff) => staff.id === user.staffId && staff.status === "active"));
    const canManageAll = user.role === "Owner" || user.role === "Operations Manager";
    const canOperateVisit = (visit: (typeof db.visits)[number]) => {
        if (canManageAll)
            return true;
        if (visit.assignee_type === "contractor" || visit.contractor_id)
            return isActiveStaff;
        return user.role === "Field Staff" && visit.staff_id === user.staffId;
    };
    const todayVisits = db.visits.filter((v) => canOperateVisit(v) &&
        (indiaBusinessDate(new Date(v.scheduled_at)) === today || relativeDay(v.scheduled_at) === "Yesterday"));
    const sorted = [...todayVisits].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const [reportingVisit, setReportingVisit] = React.useState<string | null>(null);
    const [reportNotes, setReportNotes] = React.useState("");
    const [gpsStatus, setGpsStatus] = React.useState<"idle" | "capturing" | "captured">("idle");
    const [capturingVisitId, setCapturingVisitId] = React.useState<string | null>(null);
    const [photos, setPhotos] = React.useState<{
        name: string;
        url: string;
        mimeType: string;
    }[]>([]);
    const [uploadingReport, setUploadingReport] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const lastTrackingPointAt = React.useRef(0);
    React.useEffect(() => {
        const active = db.visits.find((visit) => visit.assignee_type !== "contractor" && !visit.contractor_id && visit.status === "checked_in" && (canManageAll || visit.staff_id === user.staffId));
        if (!active || !navigator.geolocation)
            return;
        const watchId = navigator.geolocation.watchPosition((position) => {
            const now = Date.now();
            if (now - lastTrackingPointAt.current < 30000)
                return;
            try {
                recordTrackingPoint(active.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: position.coords.accuracy, captured_at: new Date().toISOString() });
                lastTrackingPointAt.current = now;
            }
            catch { }
        }, () => undefined, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
        return () => navigator.geolocation.clearWatch(watchId);
    }, [db.visits, recordTrackingPoint, canManageAll, user.staffId]);
    const visitMapPoints: MapPoint[] = React.useMemo(() => sorted.map((visit, index) => {
        const coordinates = visitPrimaryCoordinates(visit);
        return {
            id: visit.id,
            label: `${index + 1}. ${visit.location_name}`,
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
        };
    }), [sorted, openDetail]);
    const routeMapPoints: MapPoint[] = React.useMemo(() => sorted.flatMap((visit, index) => visitToMapPoints(visit, {
        prefix: `${index + 1}.`,
        onClick: () => openDetail("visit", visit.id),
    })), [sorted, openDetail]);
    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const stored: {
            name: string;
            url: string;
            mimeType: string;
        }[] = [];
        for (const file of files) {
            try {
                const url = file.type.startsWith("image/") ? await compressImage(file, 1600, 0.82) : await readFileAsDataUrl(file);
                stored.push({ name: file.name, url, mimeType: file.type || "application/octet-stream" });
            }
            catch {
                toast.error(`Could not prepare ${file.name}`);
            }
        }
        if (stored.length)
            setPhotos((current) => [...current, ...stored]);
        if (fileInputRef.current)
            fileInputRef.current.value = "";
    };
    const removePhoto = (idx: number) => setPhotos((photos) => photos.filter((_, i) => i !== idx));
    const handleCheckIn = (v: (typeof sorted)[number]) => {
        if (v.planned_latitude == null || v.planned_longitude == null) {
            toast.error("This Visit has no verified Site GPS. Add Site coordinates before check-in.");
            return;
        }
        if (!navigator.geolocation) {
            toast.error("Device GPS is required for field check-in.");
            return;
        }
        setGpsStatus("capturing");
        setCapturingVisitId(v.id);
        navigator.geolocation.getCurrentPosition((position) => {
            try {
                checkIn(v.id, {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy_m: position.coords.accuracy,
                    captured_at: new Date().toISOString(),
                });
                setGpsStatus("captured");
                toast.success("Verified field check-in recorded");
                setTimeout(() => setGpsStatus("idle"), 1500);
            }
            catch (error) {
                toast.error(error instanceof Error
                    ? error.message
                    : "Field check-in could not be verified.");
                setGpsStatus("idle");
            }
            finally {
                setCapturingVisitId(null);
            }
        }, (error) => {
            setGpsStatus("idle");
            setCapturingVisitId(null);
            toast.error(`Device GPS is required for check-in: ${error.message}`);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    const handleCheckOut = (v: (typeof sorted)[number]) => {
        if (!navigator.geolocation) {
            toast.error("Device GPS is required for field check-out.");
            return;
        }
        setGpsStatus("capturing");
        setCapturingVisitId(v.id);
        navigator.geolocation.getCurrentPosition((position) => {
            try {
                checkOut(v.id, {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy_m: position.coords.accuracy,
                    captured_at: new Date().toISOString(),
                });
                toast.success("Verified field check-out recorded — file report within 2h");
                setReportingVisit(v.id);
            }
            catch (error) {
                toast.error(error instanceof Error
                    ? error.message
                    : "Field check-out could not be verified.");
            }
            finally {
                setGpsStatus("idle");
                setCapturingVisitId(null);
            }
        }, (error) => {
            setGpsStatus("idle");
            setCapturingVisitId(null);
            toast.error(`Device GPS is required for check-out: ${error.message}`);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    const handleFileReport = async () => {
        if (!reportingVisit)
            return;
        if (!reportNotes.trim()) {
            toast.error("Enter the visit briefing before filing the report.");
            return;
        }
        setUploadingReport(true);
        try {
            const uploaded = await Promise.all(photos.map(async (photo, index) => {
                const result = await uploadCapturedMediaToGoogleDrive({
                    dataUrl: photo.url,
                    fileName: photo.name || `field-file-${index + 1}`,
                    entityType: "visit",
                    entityId: reportingVisit,
                    kind: "site_proof",
                    role: photo.mimeType.startsWith("video/") ? "video" : photo.mimeType === "application/pdf" ? "document" : "proof",
                    caption: `Field visit ${photo.mimeType.startsWith("video/") ? "video" : photo.mimeType === "application/pdf" ? "document" : "photo"}`,
                });
                return {
                    type: photo.mimeType.startsWith("video/") ? "site_video" : photo.mimeType === "application/pdf" ? "site_document" : "site_photo",
                    file_name: result.name,
                    mime_type: result.mimeType,
                    url: result.webViewLink,
                    file_asset_id: result.id,
                };
            }));
            fileReport(reportingVisit, reportNotes.trim(), uploaded);
            toast.success(uploaded.length ? `Report filed with ${uploaded.length} Google Drive file${uploaded.length > 1 ? "s" : ""}` : "Report filed without photos; photo reminder recorded.");
            setReportingVisit(null);
            setReportNotes("");
            setPhotos([]);
        }
        catch (error) {
            toast.error(error instanceof Error
                ? error.message
                : "Google Drive upload failed. The report has not been filed.");
        }
        finally {
            setUploadingReport(false);
        }
    };
    const activeVisit = db.visits.find((v) => v.id === reportingVisit);
    const pendingReports = db.visits.filter((v) => canOperateVisit(v) && v.status === "report_pending" && !v.report_filed);
    const addVisit = useRDashStore((s) => s.addVisit);
    const [quickCheckInProgress, setQuickCheckInProgress] = React.useState(false);
    /**
     * H1: Quick check-in at current location — when a field staff arrives at a
     * site without a pre-scheduled visit, this finds the nearest site within
     * ~500m of the current GPS, auto-creates a visit, and immediately checks
     * it in with the captured GPS coords. The auto-created visit carries
     * check_in_at + gps coords so it shows up in Visit Proofs right away.
     */
    const handleQuickCheckIn = () => {
        if (!navigator.geolocation) {
            toast.error("Device GPS is required for quick check-in.");
            return;
        }
        if (!user.staffId) {
            toast.error("Quick check-in requires a linked staff profile.");
            return;
        }
        setQuickCheckInProgress(true);
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude, accuracy } = position.coords;
            // Find the nearest site within 500m of the current location.
            const candidates = db.sites
                .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
                .map((s) => {
                    const R = 6371000;
                    const toRad = (d: number) => (d * Math.PI) / 180;
                    const dLat = toRad(s.latitude! - latitude);
                    const dLon = toRad(s.longitude! - longitude);
                    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latitude)) * Math.cos(toRad(s.latitude!)) * Math.sin(dLon / 2) ** 2;
                    return { site: s, distanceM: 2 * R * Math.asin(Math.sqrt(a)) };
                })
                .filter((row) => row.distanceM <= 500)
                .sort((a, b) => a.distanceM - b.distanceM);
            if (candidates.length === 0) {
                toast.error("No site within 500m of your GPS. Schedule a visit first or move closer to a registered site.");
                setQuickCheckInProgress(false);
                return;
            }
            const nearest = candidates[0];
            try {
                const visitId = addVisit({
                    customer_id: nearest.site.customer_id,
                    site_id: nearest.site.id,
                    staff_id: user.staffId,
                    staff_name: user.name,
                    assignee_type: "staff",
                    visit_type: "site_visit",
                    scheduled_at: new Date().toISOString(),
                    scheduled_duration_minutes: 60,
                    notes: `Quick check-in auto-created at ${new Date().toLocaleString("en-IN")} · ${Math.round(nearest.distanceM)}m from registered site.`,
                });
                // Immediately check the new visit in with the captured GPS.
                checkIn(visitId, { latitude, longitude, accuracy_m: accuracy, captured_at: new Date().toISOString() });
                toast.success(`Quick check-in at ${nearest.site.name}`, { description: `Auto-created visit · ${Math.round(nearest.distanceM)}m from registered GPS` });
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Quick check-in failed.");
            }
            finally {
                setQuickCheckInProgress(false);
            }
        }, (error) => {
            toast.error(`GPS required for quick check-in: ${error.message}`);
            setQuickCheckInProgress(false);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    return (<div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5"/>
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Field Mode</h2>
          <p className="text-xs text-muted-foreground">
            Mobile-first view for field staff — check-in, photo capture, report
            filing
          </p>
        </div>
        {/* H1: Quick check-in at current location — auto-creates a visit if the
            staff is within 500m of a registered site. */}
        <Button size="sm" variant="outline" onClick={handleQuickCheckIn} disabled={quickCheckInProgress || !isActiveStaff} className="ml-auto h-8 shrink-0 text-xs" title="Find the nearest site from your GPS and auto-create + check in a visit">
            <MapPin className="mr-1 h-3.5 w-3.5"/> {quickCheckInProgress ? "Locating…" : "Quick check-in"}
        </Button>
      </div>
      <div className="rounded-[var(--panel-radius)] border border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-[11px] text-muted-foreground">
        <p className="font-semibold text-foreground">Automatic geofence active while this app is open</p>
        <p className="mt-0.5">{attendancePolicy ? `It checks in after ${attendancePolicy.auto_entry_dwell_seconds}s inside the registered location and checks out after ${attendancePolicy.auto_exit_dwell_seconds}s beyond the exit boundary for your own staff policy.` : "Your staff-specific automatic geofence policy is unavailable."} If permission, accuracy, or background access fails, use the Manual Check-in / Check-out buttons below.</p>
      </div>
      {pendingReports.length > 0 && (<div className="rounded-[var(--panel-radius)] border border-warning/25 bg-warning/[0.06] p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning"/>
            <p className="text-sm font-semibold text-warning">
              {pendingReports.length} report(s) pending — 2h deadline
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {pendingReports.map((v) => (<div key={v.id} className="flex items-center justify-between rounded-md border border-warning/20 bg-card px-3 py-2">
                <button type="button" onClick={() => setReportingVisit(v.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium">
                    {titleCase(v.visit_type)} · {v.location_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Completed {relativeDay(v.check_out_at || v.scheduled_at)}
                  </p>
                </button>
                <Button size="sm" variant="outline" className="ml-2 h-7 shrink-0 text-xs" onClick={() => setReportingVisit(v.id)}>
                  File now
                </Button>
              </div>))}
          </div>
        </div>)}

      <section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <div>
            <h3 className="text-sm font-semibold">Visit map</h3>
            <p className="text-[10px] text-muted-foreground">
              {routeMapPoints.filter((point) => point.latitude != null && point.longitude != null).length}{" "}
              plotted · tap a marker to open the visit
            </p>
          </div>
        </div>
        <MapView points={routeMapPoints} title="Today's field visit map" showRoute className="h-[260px] min-h-[260px] rounded-none border-0"/>
      </section>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Today's visits ({sorted.length})
        </h3>
        <div className="flex flex-col gap-2.5">
          {sorted.map((v) => {
            const customer = db.customers.find((p) => p.id === v.customer_id);
            const isCheckedIn = v.status === "checked_in";
            const isDone = v.status === "completed";
            const primaryCoordinates = visitPrimaryCoordinates(v);
            const mapHref = primaryCoordinates.latitude != null &&
                primaryCoordinates.longitude != null
                ? openStreetMapPointUrl({
                    latitude: primaryCoordinates.latitude,
                    longitude: primaryCoordinates.longitude,
                    label: v.location_name,
                })
                : openStreetMapSearchUrl(v.location_name);
            return (<div key={v.id} className={cn("rounded-[var(--panel-radius)] border bg-card p-3 shadow-card transition-all", isCheckedIn
                    ? "border-warning/40 ring-1 ring-warning/20"
                    : isDone
                        ? "border-success/30"
                        : "border-border")}>
                <div className="flex items-start gap-3">
                  <Avatar name={customer?.name || v.location_name} size={40}/>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {titleCase(v.visit_type)} ·{" "}
                      {customer?.name || v.location_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.location_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5">
                        <Navigation className="h-2.5 w-2.5"/>
                        {formatDateTime(v.scheduled_at)}
                      </span>
                      {primaryCoordinates.latitude != null && (<span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5"/>
                          {primaryCoordinates.latitude.toFixed(3)},{" "}
                          {primaryCoordinates.longitude?.toFixed(3)}
                        </span>)}
                    </div>
                  </div>
                  <StatusBadge label={titleCase(v.status)} className={isDone
                    ? "bg-success/10 text-success border-success/20"
                    : isCheckedIn
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-primary/10 text-primary border-primary/20"}/>
                </div>
                <div className="mt-2.5">
                  {v.status === "scheduled" && (<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button size="sm" variant="outline" onClick={() => { try {
                    markEnRoute(v.id);
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not mark en route");
                } }}><Navigation className="mr-1.5 h-4 w-4"/> En route</Button>
                      {v.assignee_type === "contractor" || v.contractor_id ? (<Button size="sm" onClick={() => { try {
                        startContractorVisit(v.id);
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not start contractor visit");
                    } }}><Play className="mr-1.5 h-4 w-4"/> Contractor arrived</Button>) : (<Button size="sm" onClick={() => handleCheckIn(v)} disabled={gpsStatus === "capturing"}><Play className="mr-1.5 h-4 w-4"/> Manual check-in</Button>)}
                    </div>)}
                  {v.status === "en_route" && (v.assignee_type === "contractor" || v.contractor_id ? (<Button size="sm" className="w-full" onClick={() => { try {
                    startContractorVisit(v.id);
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not start contractor visit");
                } }}><Play className="mr-1.5 h-4 w-4"/> Contractor arrived</Button>) : (<Button size="sm" className="w-full" onClick={() => handleCheckIn(v)} disabled={gpsStatus === "capturing"}><Play className="mr-1.5 h-4 w-4"/> Manual check-in</Button>))}
                  {isCheckedIn && (v.assignee_type === "contractor" || v.contractor_id ? (<Button size="sm" className="w-full bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => { try {
                    completeContractorVisit(v.id);
                    setReportingVisit(v.id);
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not complete contractor visit");
                } }}><Square className="mr-1.5 h-4 w-4"/> Record contractor completion</Button>) : (<Button size="sm" className="w-full bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => handleCheckOut(v)}><Square className="mr-1.5 h-4 w-4"/> Manual check-out</Button>))}
                  {v.status === "report_pending" && (<Button size="sm" variant="outline" className="w-full border-warning/40 text-warning hover:bg-warning/10" onClick={() => setReportingVisit(v.id)}><Camera className="mr-1.5 h-4 w-4"/> File report</Button>)}
                  {isDone && v.report_filed && (<Button size="sm" variant="outline" className="w-full" onClick={() => openDetail("visit", v.id)}><FileText className="mr-1.5 h-4 w-4"/> View report</Button>)}
                  <Button asChild size="sm" variant="outline" className="mt-1.5 w-full">
                    <a href={mapHref} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4"/> Open map
                    </a>
                  </Button>
                </div>
              </div>);
        })}
        </div>
        {sorted.length === 0 && (<div className="rounded-[var(--panel-radius)] border border-dashed border-border bg-muted/20 py-8 text-center text-sm text-muted-foreground">
            No visits scheduled for today.
          </div>)}
      </div>

      {reportingVisit && activeVisit && (<div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-bold">File report</p>
              <p className="text-[11px] text-muted-foreground">
                {titleCase(activeVisit.visit_type)} ·{" "}
                {activeVisit.location_name}
              </p>
            </div>
            <button type="button" onClick={() => {
                setReportingVisit(null);
                setReportNotes("");
            }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5"/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 rd-scroll">
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
              <p className="text-xs font-semibold text-primary">
                Site briefing
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Describe what you observed, decisions taken, and next steps. Images, videos, and PDFs are optional but recommended; every selected file uploads to Google Drive before the report is filed.
              </p>
            </div>
            <Textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} placeholder="Enter your site briefing here…&#10;&#10;Example: Kitchen carcass installed. Customer confirmed laminate shade. Next: order shutters by Friday." rows={6} className="text-sm" autoFocus/>
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Files ({photos.length} selected)
              </p>
              <input ref={fileInputRef} type="file" accept={MANAGED_FILE_ACCEPT} capture="environment" multiple onChange={handlePhotoSelect} className="hidden"/>
              {photos.length > 0 && (<div className="mb-2 grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (<div key={i} className="group relative overflow-hidden rounded-lg border border-border">
                      <FilePreview file={{ fileName: p.name, mimeType: p.mimeType, url: p.url }} compact controls/>
                      <button type="button" onClick={() => removePhoto(i)} className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <X className="h-3 w-3"/>
                      </button>
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white">
                        {p.name.slice(0, 12)}
                      </span>
                    </div>))}
                </div>)}
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-accent/30">
                <Camera className="h-10 w-10"/>
                <span className="text-xs font-medium">
                  {photos.length > 0
                ? "Add more files"
                : "Add site files"}
                </span>
                <span className="text-[10px]">
                  Images, videos, and PDFs · no file-count limit · uploaded to Google Drive
                </span>
              </button>
            </div>
          </div>
          <div className="border-t border-border bg-card px-4 py-3">
            <Button className="w-full" onClick={handleFileReport} disabled={!reportNotes.trim() || uploadingReport}>
              <CheckCircle2 className="mr-1.5 h-4 w-4"/>{" "}
              {uploadingReport
                ? "Uploading to Google Drive…"
                : photos.length ? "Upload proof & submit report" : "Submit report without photos"}
            </Button>
          </div>
        </div>)}
    </div>);
}
