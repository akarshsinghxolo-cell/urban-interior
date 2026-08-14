"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Visit, VisitStatus, VisitProof, Area, Site } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { Ruler, MapPin, Plus, CheckCircle2, Camera, Trash2, X, Building, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { FilePreview } from "../FilePreview";
import { toast } from "sonner";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
interface AreaMeasurement {
    id?: string;
    name: string;
    length: number;
    width: number;
    height: number;
    unit: "ft" | "m";
    notes?: string;
}
interface MeasurementRecord {
    id: string;
    visitId: string;
    site?: Site;
    customerName: string;
    location: string;
    staffName: string;
    date: string;
    status: VisitStatus;
    areas: AreaMeasurement[];
    captureAreas: AreaMeasurement[];
    totalArea: number;
    gps?: {
        lat: number;
        lng: number;
    };
    proofs: string[];
    reportFiled: boolean;
    notes?: string;
}
export function SiteMeasurementModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const fileVisitReport = useRDashStore((s) => s.fileVisitReport);
    const addArea = useRDashStore((s) => s.addArea);
    const updateArea = useRDashStore((s) => s.updateArea);
    const updateWorkRequired = useRDashStore((s) => s.updateWorkRequired);
    const startContractorVisit = useRDashStore((s) => s.startContractorVisit);
    const completeContractorVisit = useRDashStore((s) => s.completeContractorVisit);
    const addMeasurementRevision = useRDashStore((s) => s.addMeasurementRevision);
    const currentUser = useRDashStore((s) => s.currentUser);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [openDialog, setOpenDialog] = React.useState(false);
    const [activeVisitId, setActiveVisitId] = React.useState<string | null>(null);
    const measurementVisits = db.visits.filter((v) => v.visit_type === "measurement");
    const records: MeasurementRecord[] = measurementVisits.map((v) => {
        const customer = db.customers.find((p) => p.id === v.customer_id);
        const site = v.site_id ? db.sites.find((s) => s.id === v.site_id) : undefined;
        const work = v.work_required_id ? db.workRequired.find((row) => row.id === v.work_required_id) : undefined;
        const revisions = db.measurementRevisions.filter((revision) => revision.visit_id === v.id && revision.status === "verified");
        const areas: AreaMeasurement[] = revisions.map((revision) => {
            const area = db.areas.find((row) => row.id === revision.area_id);
            return {
                id: revision.area_id,
                name: area?.name || "Archived area",
                length: revision.length || 0,
                width: revision.width || 0,
                height: revision.height || 0,
                unit: revision.unit,
                notes: revision.notes,
            };
        });
        const captureAreas: AreaMeasurement[] = areas.length > 0
            ? areas
            : db.areas
                .filter((area) => site && area.site_id === site.id && !area.is_archived && Boolean(work?.area_ids.includes(area.id)))
                .map((area) => ({
                    id: area.id,
                    name: area.name,
                    length: area.length || 0,
                    width: area.width || 0,
                    height: area.height || 0,
                    unit: (area.unit as "ft" | "m") || "ft",
                    notes: area.notes,
                }));
        const totalArea = areas.reduce((n, r) => n + (r.length * r.width), 0);
        return {
            id: v.id, visitId: v.id, site, customerName: customer?.name || v.location_name, location: v.location_name,
            staffName: v.staff_name, date: v.scheduled_at, status: v.status, areas, captureAreas, totalArea,
            gps: v.latitude != null && v.longitude != null ? { lat: v.latitude, lng: v.longitude } : undefined,
            proofs: v.proof_attachment_ids, reportFiled: Boolean(v.report_filed), notes: v.notes,
        };
    });
    const completed = records.filter((r) => r.reportFiled && r.areas.length > 0).length;
    const pending = records.filter((r) => !r.reportFiled).length;
    const totalArea = records.reduce((n, r) => n + r.totalArea, 0);
    const openCaptureDialog = (visitId: string) => {
        setActiveVisitId(visitId);
        setOpenDialog(true);
    };
    const openCapture = (visitId: string) => {
        const visit = db.visits.find((row) => row.id === visitId);
        if (!visit) {
            toast.error("Measurement Visit was not found.");
            return;
        }
        if (visit.report_filed) {
            toast.info("This measurement report is already filed. Create a new measurement Visit to capture a correction or revised take-off.");
            return;
        }
        const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
        if (contractorVisit && (visit.status === "scheduled" || visit.status === "en_route")) {
            try {
                startContractorVisit(visit.id);
                toast.success("Contractor visit started. Use Complete & capture when the site measurement is finished.");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Contractor visit could not be started.");
            }
            return;
        }
        if (contractorVisit && visit.status === "checked_in") {
            try {
                completeContractorVisit(visit.id);
                openCaptureDialog(visit.id);
                toast.success("Contractor visit completed. Capture the measured Areas now.");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Contractor visit could not be completed.");
            }
            return;
        }
        if (!contractorVisit && (visit.status !== "report_pending" || !visit.check_out_verified)) {
            toast.info("Complete the assigned field check-in and check-out before capturing measurements.");
            setActiveModule("fieldOperations");
            return;
        }
        if (visit.status !== "report_pending") {
            toast.error("This Visit is not ready for measurement capture.");
            return;
        }
        openCaptureDialog(visitId);
    };
    const captureActionLabel = (visitId: string) => {
        const visit = db.visits.find((row) => row.id === visitId);
        if (!visit)
            return "Visit unavailable";
        if (visit.report_filed)
            return "Filed — new Visit required";
        const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
        if (contractorVisit && (visit.status === "scheduled" || visit.status === "en_route"))
            return "Start contractor visit";
        if (contractorVisit && visit.status === "checked_in")
            return "Complete & capture";
        if (!contractorVisit && visit.status !== "report_pending")
            return "Open Field Visits";
        return "Capture measurement";
    };
    const captureActionHint = (visitId: string) => {
        const visit = db.visits.find((row) => row.id === visitId);
        if (!visit || visit.report_filed)
            return "No measurement captured for this visit yet";
        const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
        if (contractorVisit && (visit.status === "scheduled" || visit.status === "en_route"))
            return "Start the contractor visit before recording field completion";
        if (contractorVisit && visit.status === "checked_in")
            return "Record completion, then capture the measured Areas";
        if (!contractorVisit && visit.status !== "report_pending")
            return "Field check-in and check-out are required before capture";
        return "Visit complete — capture Area dimensions and file the report";
    };
    const captureActionDisabled = (visitId: string) => {
        const visit = db.visits.find((row) => row.id === visitId);
        return !visit || Boolean(visit.report_filed) || ["cancelled", "missed", "completed"].includes(visit.status);
    };
    const handleSave = async (visitId: string, areas: AreaMeasurement[], notes: string, media: Array<QueuedWorkflowFile & { type: "photo" | "video" | "pdf" }>) => {
        const visit = db.visits.find((v) => v.id === visitId);
        if (!visit) {
            toast.error("Measurement Visit was not found.");
            return;
        }
        if (visit.report_filed) {
            toast.error("This measurement report is already filed. Create a new Measurement Visit for a correction instead of creating duplicate evidence.");
            return;
        }
        const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
        if (visit.status !== "report_pending" || (!contractorVisit && !visit.check_out_verified)) {
            toast.error(contractorVisit ? "A contractor Measurement Visit awaiting its report is required before saving measurements." : "A checked-out Measurement Visit awaiting its report is required before saving measurements.");
            return;
        }
        try {
            const proofs = media.map((item) => ({
                type: `measurement_${item.type}`,
                file_name: item.fileName,
                attachment_id: item.attachmentId,
            }));
            const site = visit.site_id ? db.sites.find((entry) => entry.id === visit.site_id) : undefined;
            if (!site)
                throw new Error("Measurement Visit requires a valid Site.");
            const current = currentUser();
            const savedAreas: Array<{
                areaId: string;
                measurement: AreaMeasurement;
            }> = [];
            const existingAreaIds = new Set(db.areas.filter((area) => area.site_id === site.id && !area.is_archived).map((area) => area.id));
            areas.forEach((area) => {
                const payload = { name: area.name, length: area.length, width: area.width, height: area.height, unit: area.unit, notes: area.notes };
                const areaId = existingAreaIds.has(area.id || "") ? area.id! : addArea({ site_id: site.id, area_type: "other", ...payload });
                if (existingAreaIds.has(areaId))
                    updateArea(areaId, payload);
                savedAreas.push({ areaId, measurement: area });
            });
            const savedAreaIds = savedAreas.map((entry) => entry.areaId);
            if (visit.work_required_id) {
                const work = db.workRequired.find((row) => row.id === visit.work_required_id);
                if (!work)
                    throw new Error("The Measurement Visit Work Required no longer exists.");
                updateWorkRequired(work.id, { area_ids: Array.from(new Set([...work.area_ids, ...savedAreaIds])) });
            }
            savedAreas.forEach(({ areaId, measurement }) => {
                addMeasurementRevision({
                    site_id: site.id,
                    area_id: areaId,
                    work_required_id: visit.work_required_id,
                    visit_id: visit.id,
                    length: measurement.length,
                    width: measurement.width,
                    height: measurement.height,
                    unit: measurement.unit,
                    notes: notes || measurement.notes,
                    captured_by: current.name,
                    captured_at: visit.check_out_at || new Date().toISOString(),
                    photo_count: proofs.length,
                    status: "verified",
                });
            });
            fileVisitReport(visitId, notes || `Site measurement captured: ${areas.length} areas, ${areas.reduce((n, r) => n + r.length * r.width, 0)} sq.ft total.`, proofs);
            toast.success(`Measurement saved — ${areas.length} areas, ${savedAreaIds.length} verified measurement revision${savedAreaIds.length === 1 ? "" : "s"}, report filed${proofs.length ? ` with ${proofs.length} Drive proof${proofs.length === 1 ? "" : "s"}` : ""} · ${site.name}`);
            setOpenDialog(false);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Measurement report could not be filed.");
        }
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Ruler className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Site Measurement</h2>
            <p className="text-xs text-muted-foreground">Area-wise measurement capture with GPS proof — feeds BOQ</p>
          </div>
        </div>
        <Button size="sm" onClick={() => openCreateDialog({ kind: "visit", visitType: "measurement" })}>
          <Plus className="mr-1 h-3.5 w-3.5"/> New Measurement
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Measurement visits" value={records.length} tone="primary" icon={<Ruler className="h-4 w-4"/>}/>
        <MetricCard label="Captured" value={completed} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Pending" value={pending} tone="warning" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Total area" value={`${totalArea.toLocaleString("en-IN")} sq.ft`} tone="default" icon={<Ruler className="h-4 w-4"/>}/>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {records.map((r) => (<div key={r.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Avatar name={r.customerName} size={38}/>
                <div>
                  <p className="text-sm font-bold text-foreground">{r.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">{r.location} · {formatDate(r.date)}</p>
                  {r.site && (<p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
                      <Building className="h-3 w-3"/> {r.site.name}
                    </p>)}
                </div>
              </div>
              <StatusBadge label={titleCase(r.status)} className={r.status === "completed" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}/>
            </div>
            {r.areas.length > 0 ? (<div className="mt-3">
                <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Areas</p><p className="text-sm font-bold">{r.areas.length}</p></div>
                  <div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Area</p><p className="text-sm font-bold">{r.totalArea.toLocaleString("en-IN")}</p></div>
                  <div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Proofs</p><p className="text-sm font-bold">{r.proofs.length}</p></div>
                </div>
                <div className="space-y-1">
                  {r.areas.slice(0, 3).map((room, i) => (<div key={room.id || `r-${i}`} className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1 text-xs">
                      <span className="font-medium">{room.name}</span>
                      <span className="font-mono text-muted-foreground">{room.length}×{room.width} {room.unit} = {(room.length * room.width).toFixed(0)} sq.{room.unit}</span>
                    </div>))}
                  {r.areas.length > 3 && <p className="text-[10px] text-muted-foreground">+{r.areas.length - 3} more areas</p>}
                </div>
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => openCapture(r.visitId)} disabled={captureActionDisabled(r.visitId)}>
                  <Ruler className="mr-1.5 h-3.5 w-3.5"/> {captureActionLabel(r.visitId)}
                </Button>
              </div>) : (<div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-4">
                <p className="text-xs text-muted-foreground">{r.reportFiled ? "Filed report has no visit-linked measurement revisions" : captureActionHint(r.visitId)}</p>
                {!r.reportFiled && <Button size="sm" onClick={() => openCapture(r.visitId)} disabled={captureActionDisabled(r.visitId)}>
                  <Ruler className="mr-1.5 h-3.5 w-3.5"/> {captureActionLabel(r.visitId)}
                </Button>}
              </div>)}
            <div className="mt-3 border-t border-border pt-3">
              <OperationalMediaPanel entityType="visit" entityId={r.visitId} title="Measurement visit evidence & references" compact/>
            </div>
          </div>))}
      </div>

      {records.length === 0 && (<EmptyState title="No measurement visits scheduled" description="Schedule a measurement visit from Customer Desk to begin capturing room-wise dimensions." icon={<Ruler className="h-8 w-8"/>}/>)}

      {openDialog && activeVisitId && (<MeasurementDialog visitId={activeVisitId} record={records.find((r) => r.visitId === activeVisitId)!} initialAreas={records.find((r) => r.visitId === activeVisitId)?.captureAreas || []} onClose={() => setOpenDialog(false)} onSave={handleSave}/>)}
    </div>);
}
function MeasurementDialog({ visitId, record, initialAreas, onClose, onSave }: {
    visitId: string;
    record: MeasurementRecord;
    initialAreas: AreaMeasurement[];
    onClose: () => void;
    onSave: (visitId: string, areas: AreaMeasurement[], notes: string, media: Array<QueuedWorkflowFile & { type: "photo" | "video" | "pdf" }>) => Promise<void>;
}) {
    const withIds = (rs: AreaMeasurement[]): Array<AreaMeasurement & {
        id: string;
    }> => rs.map((r, i) => ({ ...r, id: r.id || `room-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}` }));
    const [areas, setAreas] = React.useState<Array<AreaMeasurement & {
        id: string;
    }>>(initialAreas.length
        ? withIds(initialAreas)
        : [{ id: `room-${Date.now()}`, name: "", length: 0, width: 0, height: 0, unit: "ft" }]);
    const [notes, setNotes] = React.useState(record.notes || "");
    const [uploadedMedia, setUploadedMedia] = React.useState<Array<QueuedWorkflowFile & { type: "photo" | "video" | "pdf" }>>([]);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    const [saving, setSaving] = React.useState(false);
    const totalArea = areas.reduce((n, r) => n + (r.length * r.width), 0);
    const existingAreaIds = React.useMemo(() => new Set(initialAreas.map((area) => area.id).filter((id): id is string => Boolean(id))), [initialAreas]);
    const addArea = () => setAreas((r) => [...r, { id: `room-${Date.now()}-${r.length}`, name: "", length: 0, width: 0, height: 0, unit: "ft" }]);
    const discardDraftArea = (id: string) => {
        if (existingAreaIds.has(id)) {
            toast.error("Existing Areas cannot be removed here. Archive them from the Area record and choose a replacement Area when history is linked.");
            return;
        }
        setAreas((rows) => rows.filter((row) => row.id !== id));
    };
    const updateArea = (id: string, patch: Partial<AreaMeasurement>) => setAreas((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ruler className="h-4 w-4 text-primary"/> Site Measurement · {record.customerName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{record.location} · {formatDate(record.date)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 rd-scroll">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Areas ({areas.length})</h4>
            <Button size="sm" variant="outline" onClick={addArea}><Plus className="mr-1 h-3.5 w-3.5"/> Add room</Button>
          </div>
          <div className="space-y-2">
            {areas.map((room, idx) => (<div key={room.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Area {idx + 1}</span>
                  {areas.length > 1 && <button type="button" onClick={() => discardDraftArea(room.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></button>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Area name</label>
                    <Input value={room.name} onChange={(e) => updateArea(room.id, { name: e.target.value })} placeholder="Kitchen, Bedroom…" className="h-8 text-sm"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Length</label>
                    <Input type="number" value={room.length || ""} onChange={(e) => updateArea(room.id, { length: parseFloat(e.target.value) || 0 })} className="h-8 text-sm"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Width</label>
                    <Input type="number" value={room.width || ""} onChange={(e) => updateArea(room.id, { width: parseFloat(e.target.value) || 0 })} className="h-8 text-sm"/>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <select value={room.unit} onChange={(e) => updateArea(room.id, { unit: e.target.value as "ft" | "m" })} className="h-7 rounded-md border border-input bg-card px-2 text-xs">
                    <option value="ft">feet</option><option value="m">metres</option>
                  </select>
                  <span className="text-xs font-mono text-muted-foreground">Area: {(room.length * room.width).toFixed(0)} sq.{room.unit}</span>
                </div>
              </div>))}
          </div>
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">Total measured area</span>
              <span className="font-mono text-lg font-bold text-primary">{totalArea.toLocaleString("en-IN")} sq.ft</span>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Site notes & observations</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Window positions, electrical points, special workRequired…" rows={3} className="text-sm"/>
          </div>
          <div className="mt-3">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Site photos & videos</label>
            <input type="file" accept={MANAGED_FILE_ACCEPT} multiple onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            try {
                const queued = await enqueueWorkflowFiles({
                    sourceFlow: "site_measurement",
                deferProcessing: true,
                    sourceLabel: "Site Measurement",
                    targetEntityType: "visit",
                    targetEntityId: visitId,
                    targetLabel: record.location,
                    purpose: "measurement",
                    kind: "site_proof",
                    role: "measurement",
                    visibility: "internal",
                    files: files.map((file) => ({
                        file,
                        kind: "site_proof" as const,
                        role: "measurement" as const,
                        caption: `Measurement ${classifyWorkflowFile(file).role}`,
                    })),
                });
                registerBatch(queued.batchId);
                setUploadedMedia((current) => [
                    ...current,
                    ...queued.files.map((item, index) => ({
                        ...withLocalPreview(item, files[index]),
                        type: files[index].type.startsWith("video/") ? "video" as const : files[index].type === "application/pdf" || files[index].name.toLowerCase().endsWith(".pdf") ? "pdf" as const : "photo" as const,
                    })),
                ]);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not queue measurement evidence.");
            } finally {
                e.currentTarget.value = "";
            }
        }} className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"/>
            {uploadedMedia.length > 0 && (<div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {uploadedMedia.map((m) => (<div key={m.uploadItemId} className="group relative overflow-hidden rounded-md border border-border bg-muted/30">
                    <FilePreview file={{ fileName: m.fileName, mimeType: m.mimeType, url: m.previewUrl }} compact controls/>
                    <button type="button" onClick={() => void cancelQueuedWorkflowFile(m).then(() => setUploadedMedia((arr) => arr.filter((x) => x.uploadItemId !== m.uploadItemId)))} className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${m.fileName}`}>
                      <X className="h-3 w-3"/>
                    </button>
                    <p className="truncate px-1 py-0.5 text-[10px] text-muted-foreground">{m.fileName}</p>
                  </div>))}
              </div>)}
            <p className="mt-1 text-[10px] text-muted-foreground">Images, videos, and PDFs are optional. Every selected file is queued immediately and continues after this dialog closes; there is no file-count limit.</p>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" onClick={async () => {
            setSaving(true);
            try {
                await onSave(visitId, areas.filter((r) => r.name && r.length && r.width), notes, uploadedMedia);
                commitBatches();
            }
            finally {
                setSaving(false);
            }
        }} disabled={saving || !areas.some((r) => r.name && r.length && r.width)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> {saving ? "Uploading proof…" : "Save & File Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}

