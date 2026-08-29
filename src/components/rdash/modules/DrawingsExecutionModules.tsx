"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { Pencil, Camera, Plus, CheckCircle2, AlertTriangle, FileImage, Upload, Trash2, X, Wrench, MapPin, Building, Hammer, Package, IndianRupee, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { cancelQueuedWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import { toast } from "sonner";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { FilePreview } from "../FilePreview";
import { attachedFileById, attachedFilesForIds, assetPreview } from "@/lib/rdash/file-attachments";
import { ManagedFilePicker } from "@/components/rdash/ManagedFilePicker";
export function DrawingsModule() {
    const db = useRDashStore((s) => s.db);
    const addDrawing = useRDashStore((s) => s.addDrawing);
    const updateDrawing = useRDashStore((s) => s.updateDrawing);
    const removeDrawing = useRDashStore((s) => s.removeDrawing);
    const approveDrawing = useRDashStore((s) => s.approveDrawing);
    const uploadDrawingVersion = useRDashStore((s) => s.uploadDrawingVersion);
    const linkBOQItemToDrawing = useRDashStore((s) => s.linkBOQItemToDrawing);
    const [filter, setFilter] = React.useState<string>("all");
    const [uploadOpen, setUploadOpen] = React.useState(false);
    const [versionUploadFor, setVersionUploadFor] = React.useState<string | null>(null);
    const [retroUploadFor, setRetroUploadFor] = React.useState<string | null>(null);
    const retroFileInputRef = React.useRef<HTMLInputElement>(null);
    const drawings = db.drawings;
    const draft = drawings.filter((d) => d.status === "draft");
    const approved = drawings.filter((d) => d.status === "approved");
    const superseded = drawings.filter((d) => d.status === "superseded");
    const metrics: Array<{
        label: string;
        value: number;
        tone: "default" | "success" | "warning" | "primary" | "destructive";
        icon: React.ReactNode;
    }> = [
        { label: "Total drawings", value: drawings.length, tone: "default", icon: <Pencil className="h-4 w-4"/> },
        { label: "Approved", value: approved.length, tone: "success", icon: <CheckCircle2 className="h-4 w-4"/> },
        { label: "Draft (in review)", value: draft.length, tone: "warning", icon: <AlertTriangle className="h-4 w-4"/> },
        { label: "Superseded versions", value: superseded.length, tone: "default", icon: <FileImage className="h-4 w-4"/> },
    ];
    const filtered = drawings.filter((d) => {
        if (filter === "all")
            return true;
        return d.status === filter;
    });
    const handleRetroUpload = async (drawingId: string, file: File) => {
        try {
            const drawing = drawings.find((d) => d.id === drawingId);
            if (!drawing) throw new Error("Drawing not found.");
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "drawing_missing_file",
                sourceLabel: "Drawing file",
                targetEntityType: "drawing",
                targetEntityId: drawingId,
                targetLabel: drawing.title,
                purpose: "drawing",
                kind: "drawing",
                role: "drawing",
                visibility: "internal",
                attachmentField: "primary_file_attachment_id",
                attachmentFieldMode: "set",
                files: [{ file, kind: "drawing", role: "drawing", caption: drawing.title, attachmentField: "primary_file_attachment_id", attachmentFieldMode: "set" }],
            });
            updateDrawing(drawingId, { primary_file_attachment_id: queued.attachmentIds[0] });
            toast.success(`File "${file.name}" queued for "${drawing.title}"`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "File could not be queued.");
        }
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Pencil className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Drawings (2D / 3D)</h2>
            <p className="text-xs text-muted-foreground">Versioned architectural drawings · linked to sites &amp; areas · BOQ take-offs</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5"/> Upload drawing
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m, i) => <MetricCard key={i} {...m}/>)}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
            { id: "all", label: "All", count: drawings.length },
            { id: "approved", label: "Approved", count: approved.length },
            { id: "draft", label: "Draft", count: draft.length },
            { id: "superseded", label: "Superseded", count: superseded.length },
        ].map((c) => (<button key={c.id} type="button" onClick={() => setFilter(c.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === c.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {c.label} ({c.count})
          </button>))}
      </div>

      {filtered.length === 0 ? (<EmptyState tone="primary" title="No drawings yet" description="Upload a 2D floor plan, 3D render, or blueprint to get started. Versioned drawings link to sites, areas, and BOQ take-offs." icon={<Pencil className="h-6 w-6"/>} action={<Button type="button" size="sm" onClick={() => setUploadOpen(true)} className="h-8 gap-1.5"><Upload className="h-3.5 w-3.5"/>Upload drawing</Button>}/>) : (<div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((d) => (<div key={d.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all hover:shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {d.kind === "3D" ? <FileImage className="h-6 w-6"/> : <Pencil className="h-6 w-6"/>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground">{d.drawing_no} · v{d.version} · {d.kind}</p>
                  </div>
                </div>
                <StatusBadge label={titleCase(d.status)} className={d.status === "approved" ? "bg-success/10 text-success border-success/20" : d.status === "draft" ? "bg-warning/10 text-warning border-warning/20" : "bg-muted text-muted-foreground border-border"}/>
              </div>
              {attachedFileById(db, d.primary_file_attachment_id) && <FilePreview file={assetPreview(attachedFileById(db, d.primary_file_attachment_id)!.asset)} className="mt-3" controls/>}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Building className="h-3 w-3"/> {d.site_name || "—"}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3"/> {d.area_name || "—"}
                </div>
                {d.work_order_no && (<div className="flex items-center gap-1 text-muted-foreground">
                    <Hammer className="h-3 w-3"/> {d.work_order_no}
                  </div>)}
                <div className="flex items-center gap-1 text-muted-foreground">
                  <FileImage className="h-3 w-3"/> {attachedFileById(db, d.primary_file_attachment_id)?.asset.file_name || "No file"}
                </div>
              </div>
              {d.notes && <p className="mt-2 text-[11px] text-foreground/80">{d.notes}</p>}
              {(d.derived_boq_item_ids?.length ?? 0) > 0 && (<p className="mt-1 text-[10px] font-semibold text-primary">→ Drives {d.derived_boq_item_ids?.length} BOQ item(s)</p>)}
              <OperationalMediaPanel entityType="drawing" entityId={d.id} title="Drawing files & references" compact/>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.status === "draft" && (<Button size="sm" variant="default" className="h-7 text-xs" onClick={() => { approveDrawing(d.id); toast.success(`${d.drawing_no} approved`); }}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Approve
                  </Button>)}
                {!attachedFileById(db, d.primary_file_attachment_id) && (<Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10" onClick={() => { setRetroUploadFor(d.id); setTimeout(() => retroFileInputRef.current?.click(), 0); }}>
                    <Upload className="mr-1 h-3.5 w-3.5"/> Upload file
                  </Button>)}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setVersionUploadFor(d.id)}>
                  <Upload className="mr-1 h-3.5 w-3.5"/> New version
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => { removeDrawing(d.id); toast.success("Drawing removed"); }}>
                  <Trash2 className="mr-1 h-3.5 w-3.5"/> Delete
                </Button>
              </div>
            </div>))}
        </div>)}

      <input ref={retroFileInputRef} type="file" accept={MANAGED_FILE_ACCEPT} className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file && retroUploadFor) {
          await handleRetroUpload(retroUploadFor, file);
        }
        setRetroUploadFor(null);
        e.currentTarget.value = "";
      }}/>

      {uploadOpen && (<DrawingUploadDialog onClose={() => setUploadOpen(false)} onSave={(payload) => {
                try {
                    addDrawing(payload);
                    toast.success(`Drawing "${payload.title}" saved; its file continues in Background Activity`);
                    setUploadOpen(false);
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Drawing could not be saved.");
                }
            }}/>) }

      {versionUploadFor && (<DrawingVersionDialog parent={drawings.find((d) => d.id === versionUploadFor)!} onClose={() => setVersionUploadFor(null)} onSave={(payload) => {
                try {
                    const newId = uploadDrawingVersion(versionUploadFor, payload);
                    if (!newId) throw new Error("Could not create drawing revision.");
                    toast.success("New drawing version saved; its file continues in Background Activity");
                    setVersionUploadFor(null);
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Drawing revision could not be saved.");
                }
            }}/>) }
    </div>);
}
function DrawingUploadDialog({ onClose, onSave }: {
    onClose: () => void;
    onSave: (payload: Partial<import("@/lib/rdash/types").Drawing> & { id: string; title: string; primary_file_attachment_id: string }) => void | Promise<void>;
}) {
    const db = useRDashStore((state) => state.db);
    const [drawingId] = React.useState(() => reserveEntityId("drawing"));
    const [title, setTitle] = React.useState("");
    const [kind, setKind] = React.useState<"2D" | "3D" | "sketch" | "render" | "blueprint">("2D");
    const [siteId, setSiteId] = React.useState("");
    const [areaId, setAreaId] = React.useState("");
    const [workOrderId, setWorkOrderId] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [queuedFile, setQueuedFile] = React.useState<QueuedWorkflowFile | null>(null);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    const areas = db.areas.filter((area) => !siteId || area.site_id === siteId);
    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            if (queuedFile) await cancelQueuedWorkflowFile(queuedFile);
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "drawing_create",
                deferProcessing: true,
                sourceLabel: "New drawing",
                targetEntityType: "drawing",
                targetEntityId: drawingId,
                targetLabel: title.trim() || file.name,
                purpose: "drawing",
                kind: "drawing",
                role: "drawing",
                visibility: "internal",
                attachmentField: "primary_file_attachment_id",
                attachmentFieldMode: "set",
                files: [{ file, kind: "drawing", role: "drawing", caption: title.trim() || file.name, attachmentField: "primary_file_attachment_id", attachmentFieldMode: "set" }],
            });
            registerBatch(queued.batchId);
            setQueuedFile(withLocalPreview(queued.files[0], file));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Drawing file could not be queued.");
        } finally {
            event.currentTarget.value = "";
        }
    };
    const save = async () => {
        if (!queuedFile || !title.trim()) return;
        await onSave({ id: drawingId, title: title.trim(), kind, site_id: siteId || undefined, area_id: areaId || undefined, work_order_id: workOrderId || undefined, primary_file_attachment_id: queuedFile.attachmentId, notes: notes.trim() || undefined, uploaded_by: "Anita Rao" });
        commitBatches();
    };
    return (<Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3"><DialogTitle className="flex items-center gap-2 text-base"><Pencil className="h-4 w-4 text-primary"/> Upload drawing</DialogTitle><DialogDescription className="text-xs">The selected file is queued immediately and continues after this dialog closes.</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 rd-scroll"><div className="grid gap-3">
          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Title</label><Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 text-sm" autoFocus/></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Kind</label><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="2D">2D</option><option value="3D">3D</option><option value="sketch">Sketch</option><option value="render">Render</option><option value="blueprint">Blueprint</option></select></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Site</label><select value={siteId} onChange={(event) => { setSiteId(event.target.value); setAreaId(""); }} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="">— none —</option>{db.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Area</label><select value={areaId} onChange={(event) => setAreaId(event.target.value)} disabled={!siteId} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="">— none —</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Work Order</label><select value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="">— none —</option>{db.workOrders.map((order) => <option key={order.id} value={order.id}>{order.work_order_no} · {order.title}</option>)}</select></div></div>
          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Upload from device</label><ManagedFilePicker label="Choose drawing file" accept={MANAGED_FILE_ACCEPT} fileCount={queuedFile ? 1 : 0} onPick={handleFile} className="mt-1"/>{queuedFile && <FilePreview file={{ fileName: queuedFile.fileName, mimeType: queuedFile.mimeType, url: queuedFile.previewUrl }} className="mt-2" controls/>}</div>
          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="text-sm"/></div>
        </div></div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!title.trim() || !queuedFile} onClick={() => void save()}><Upload className="mr-1 h-3.5 w-3.5"/> Save drawing</Button></DialogFooter>
      </DialogContent>
    </Dialog>);
}

function DrawingVersionDialog({ parent, onClose, onSave }: {
    parent: import("@/lib/rdash/types").Drawing;
    onClose: () => void;
    onSave: (payload: { id: string; primary_file_attachment_id: string; notes?: string }) => void | Promise<void>;
}) {
    const [drawingId] = React.useState(() => reserveEntityId("drawing"));
    const [notes, setNotes] = React.useState("");
    const [queuedFile, setQueuedFile] = React.useState<QueuedWorkflowFile | null>(null);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            if (queuedFile) await cancelQueuedWorkflowFile(queuedFile);
            const queued = await enqueueWorkflowFiles({ sourceFlow: "drawing_revision", deferProcessing: true, sourceLabel: "Drawing revision", targetEntityType: "drawing", targetEntityId: drawingId, targetLabel: `${parent.drawing_no} v${parent.version + 1}`, purpose: "drawing", kind: "drawing", role: "drawing", visibility: "internal", attachmentField: "primary_file_attachment_id", attachmentFieldMode: "set", files: [{ file, kind: "drawing", role: "drawing", caption: "Drawing revision", attachmentField: "primary_file_attachment_id", attachmentFieldMode: "set" }] });
            registerBatch(queued.batchId);
            setQueuedFile(withLocalPreview(queued.files[0], file));
        } catch (error) { toast.error(error instanceof Error ? error.message : "Revision file could not be queued."); }
        finally { event.currentTarget.value = ""; }
    };
    const save = async () => { if (!queuedFile) return; await onSave({ id: drawingId, primary_file_attachment_id: queuedFile.attachmentId, notes: notes.trim() || undefined }); commitBatches(); };
    return (<Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-md gap-0 p-0"><DialogHeader className="border-b border-border px-5 py-3"><DialogTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-primary"/> New version of {parent.drawing_no}</DialogTitle><DialogDescription className="text-xs">The file queues immediately; the current version is superseded only after Save.</DialogDescription></DialogHeader><div className="px-5 py-4"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Upload from device</label><ManagedFilePicker label="Choose drawing file" accept={MANAGED_FILE_ACCEPT} fileCount={queuedFile ? 1 : 0} onPick={handleFile} className="mt-1"/>{queuedFile && <FilePreview file={{ fileName: queuedFile.fileName, mimeType: queuedFile.mimeType, url: queuedFile.previewUrl }} className="mt-2" controls/>}<div className="mt-3"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Revision notes</label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="text-sm"/></div></div><DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!queuedFile} onClick={() => void save()}><Upload className="mr-1 h-3.5 w-3.5"/> Save v{parent.version + 1}</Button></DialogFooter></DialogContent></Dialog>);
}
export function ExecutionLogsModule() {
    const db = useRDashStore((s) => s.db);
    const addExecutionLog = useRDashStore((s) => s.addExecutionLog);
    const removeExecutionLog = useRDashStore((s) => s.removeExecutionLog);
    const confirmMaterialReceipt = useRDashStore((s) => s.confirmMaterialReceipt);
    const verifyExecutionProgress = useRDashStore((s) => s.verifyExecutionProgress);
    const decideVariationRequest = useRDashStore((s) => s.decideVariationRequest);
    const [filter, setFilter] = React.useState<string>("all");
    const [logOpen, setLogOpen] = React.useState(false);
    const [activeJobId, setActiveJobId] = React.useState<string>("");
    // FIX-CONTRACTOR-BATCH1 / F.1: track which execution log is currently
    // open in the "Confirm material receipt" dialog so the user can attach
    // a proof photo before the confirmation is recorded.
    const [confirmLogId, setConfirmLogId] = React.useState<string | null>(null);
    const logs = db.executionLogs;
    const today = new Date().toISOString().slice(0, 10);
    const todaysLogs = logs.filter((l) => l.date === today);
    const pendingMaterialConf = logs.filter((l) => !l.contractor_material_confirmed);
    const extraWorkLogs = logs.filter((l) => l.extra_work_amount && l.extra_work_amount > 0);
    const pendingProgressReview = logs.filter((l) => l.progress_verification_status === "pending_review");
    const metrics: Array<{
        label: string;
        value: number;
        tone: "default" | "success" | "warning" | "primary" | "destructive";
        icon: React.ReactNode;
    }> = [
        { label: "Total logs", value: logs.length, tone: "default", icon: <Camera className="h-4 w-4"/> },
        { label: "Today", value: todaysLogs.length, tone: "primary", icon: <Camera className="h-4 w-4"/> },
        { label: "Progress review", value: pendingProgressReview.length, tone: "warning", icon: <AlertTriangle className="h-4 w-4"/> },
        { label: "Extra-work requests", value: extraWorkLogs.length, tone: "destructive", icon: <IndianRupee className="h-4 w-4"/> },
    ];
    const filtered = logs.filter((l) => {
        if (filter === "all")
            return true;
        if (filter === "today")
            return l.date === today;
        if (filter === "pending_review")
            return l.progress_verification_status === "pending_review";
        if (filter === "extra_work")
            return !!l.extra_work_amount && l.extra_work_amount > 0;
        return true;
    });
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Camera className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Daily Execution Logs</h2>
            <p className="text-xs text-muted-foreground">Per-day site progress · materials used · extra-work · photos · material confirmation</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setLogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5"/> New daily log
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m, i) => <MetricCard key={i} {...m}/>)}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
            { id: "all", label: "All", count: logs.length },
            { id: "today", label: "Today", count: todaysLogs.length },
            { id: "pending_review", label: "Progress review", count: pendingProgressReview.length },
            { id: "extra_work", label: "Extra-work", count: extraWorkLogs.length },
        ].map((c) => (<button key={c.id} type="button" onClick={() => setFilter(c.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-all", filter === c.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {c.label} ({c.count})
          </button>))}
      </div>

      {filtered.length === 0 ? (<EmptyState tone="primary" title="No execution logs yet" description="File a daily log to track progress, materials, photos, and extra work. Execution logs feed work-order P&L and variation tracking." icon={<Camera className="h-6 w-6"/>}/>) : (<div className="grid gap-3">
          {filtered.map((log) => {
                const workOrder = db.workOrders.find((j) => j.id === log.work_order_id);
                const variation = log.extra_work_variation_id ? db.variationRequests.find((row) => row.id === log.extra_work_variation_id) : undefined;
                const photoFiles = attachedFilesForIds(db, log.photo_attachment_ids);
                return (<div key={log.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={log.filed_by || "Staff"} size={36}/>
                    <div>
                      <p className="text-sm font-bold">{log.log_no} · {log.work_order_no}</p>
                      <p className="text-[11px] text-muted-foreground">{log.site_name || workOrder?.site_address || "—"} · {formatDate(log.date)} · filed by {log.filed_by}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge label={`${log.progress_pct}% reported`} className={log.progress_verification_status === "verified" ? "bg-success/10 text-success border-success/20" : log.progress_verification_status === "returned" ? "bg-destructive/10 text-destructive border-destructive/20" : log.progress_verification_status === "pending_review" ? "bg-warning/10 text-warning border-warning/20" : "bg-primary/10 text-primary border-primary/20"}/>
                    <span className="text-[10px] text-muted-foreground">{log.progress_verification_status === "verified" ? "✓ verified" : log.progress_verification_status === "returned" ? "returned for correction" : log.progress_verification_status === "pending_review" ? "awaiting verification" : "no change requested"}</span>
                    {log.progress_delta != null && log.progress_delta > 0 && (<span className="text-[10px] font-semibold text-success">+{log.progress_delta}% today</span>)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Verification</p>
                    <p className={cn("text-xs font-semibold", log.progress_verification_status === "verified" ? "text-success" : log.progress_verification_status === "returned" ? "text-destructive" : log.progress_verification_status === "pending_review" ? "text-warning" : "text-muted-foreground")}>{log.progress_verification_status === "verified" ? "Verified" : log.progress_verification_status === "returned" ? "Returned" : log.progress_verification_status === "pending_review" ? "Pending" : "No change"}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Materials</p>
                    <p className="text-xs font-semibold">{log.materials_used.length} line(s)</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Photos</p>
                    <p className="text-xs font-semibold">{photoFiles.length}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Material conf.</p>
                    <p className={cn("text-xs font-semibold", log.contractor_material_confirmed ? "text-success" : "text-warning")}>{log.contractor_material_confirmed ? "✓ Confirmed" : "Pending"}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Extra work</p>
                    <p className={cn("text-xs font-semibold", log.extra_work_amount ? "text-warning" : "text-muted-foreground")}>{log.extra_work_amount ? formatINRShort(log.extra_work_amount) : "—"}</p>
                    {variation && <p className={cn("mt-0.5 text-[10px]", variation.status === "approved" ? "text-success" : variation.status === "rejected" ? "text-destructive" : "text-warning")}>{variation.status === "approved" ? "Customer approved" : variation.status === "rejected" ? "Customer declined" : "Customer approval required"}</p>}
                  </div>
                </div>
                {photoFiles.length > 0 && (<div className="mt-3 flex gap-2 overflow-x-auto rd-scroll">
                    {photoFiles.map(({ attachment, asset }) => (<div key={attachment.id} className="shrink-0">
                        <FilePreview file={assetPreview(asset)} compact controls className="w-28"/>
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{attachment.caption || asset.file_name}</p>
                      </div>))}
                  </div>)}
                {log.materials_used.length > 0 && (<div className="mt-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Materials used today</p>
                    <div className="flex flex-col gap-1">
                      {log.materials_used.map((m, i) => (<div key={i} className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                          <span className="truncate">{m.description}{m.qty ? ` · ${m.qty} ${m.unit || ""}`.trim() : ""}</span>
                          {m.amount != null && <span className="ml-2 shrink-0 font-mono font-semibold">{formatINRShort(m.amount)}</span>}
                        </div>))}
                    </div>
                  </div>)}
                {(log.completion_notes || log.site_condition || log.extra_work_notes) && (<div className="mt-3 space-y-1 text-[11px]">
                    {log.completion_notes && <p><span className="font-semibold text-foreground">Completed:</span> <span className="text-muted-foreground">{log.completion_notes}</span></p>}
                    {log.site_condition && <p><span className="font-semibold text-foreground">Site condition:</span> <span className="text-muted-foreground">{log.site_condition}</span></p>}
                    {log.extra_work_notes && <p className="text-warning"><span className="font-semibold">Extra work / variation:</span> {log.extra_work_notes}{log.extra_work_amount ? ` · ${formatINR(log.extra_work_amount)} · customer approval required before cost posting` : ""}</p>}
                  </div>)}

                <OperationalMediaPanel entityType="execution_log" entityId={log.id} title="Execution files & finish references" compact/>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {log.progress_verification_status === "pending_review" && (<>
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => { verifyExecutionProgress(log.id, "verified"); toast.success(`Progress verified at ${log.progress_pct}%`); }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Verify progress
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { verifyExecutionProgress(log.id, "returned", "Review required before accepting this reported progress."); toast.info("Progress returned for correction"); }}>
                        <AlertTriangle className="mr-1 h-3.5 w-3.5"/> Return
                      </Button>
                    </>)}
                  {variation?.status === "pending_customer_approval" && (<>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-warning/30 text-warning hover:bg-warning/10" onClick={() => { decideVariationRequest(variation.id, "approved", "Customer approval recorded in execution desk."); toast.success(`${variation.variation_no} approved and posted as variation cost`); }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Record customer approval
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => { decideVariationRequest(variation.id, "rejected", "Customer declined the extra work."); toast.info(`${variation.variation_no} marked declined`); }}>
                        Decline variation
                      </Button>
                    </>)}
                  {!log.contractor_material_confirmed && (<>
                      {/* FIX-CONTRACTOR-BATCH1 / F.1: Photo-first confirm flow. The
                          previous one-click button called confirmMaterialReceipt(log.id)
                          with no photo URL, so contractor_confirmation_attachment_id
                          stayed undefined and the downstream proof gate
                          (contractorPaymentProofStatus) hard-blocked every payment
                          release. The new flow opens a small dialog with a file
                          picker so the user can attach the contractor confirmation
                          photo before marking the log confirmed. A "skip" option is
                          still available (logs a warning) so the business is never
                          hard-deadlocked. */}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmLogId(log.id)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Confirm material receipt
                      </Button>
                    </>)}
                  {log.contractor_material_confirmed && !log.contractor_confirmation_attachment_id && (<span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning"><AlertTriangle className="h-3 w-3"/> Proof missing — payment blocked</span>)}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => { removeExecutionLog(log.id); toast.success("Log removed"); }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5"/> Delete
                  </Button>
                </div>
              </div>);
            })}
        </div>)}

      {logOpen && (<ExecutionLogDialog onClose={() => setLogOpen(false)} onSave={(payload) => {
                addExecutionLog(payload);
                toast.success(`Daily log filed for ${payload.date || "today"}`);
                setLogOpen(false);
            }}/>)}
      {confirmLogId && (<ConfirmMaterialReceiptDialog logId={confirmLogId} onClose={() => setConfirmLogId(null)} onConfirm={async (photoAttachmentId) => {
                try {
                    confirmMaterialReceipt(confirmLogId, photoAttachmentId);
                    if (photoAttachmentId) toast.success("Material receipt confirmed with queued proof photo");
                    else toast.warning("Material receipt confirmed without proof — payment release remains blocked.");
                    setConfirmLogId(null);
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not confirm material receipt");
                }
            }}/>) }
    </div>);
}
function ConfirmMaterialReceiptDialog({ logId, onClose, onConfirm }: {
    logId: string;
    onClose: () => void;
    onConfirm: (photoAttachmentId?: string) => void | Promise<void>;
}) {
    const db = useRDashStore((state) => state.db);
    const log = db.executionLogs.find((entry) => entry.id === logId);
    const [queuedFile, setQueuedFile] = React.useState<QueuedWorkflowFile | null>(null);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    const queueFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            if (queuedFile) await cancelQueuedWorkflowFile(queuedFile);
            const queued = await enqueueWorkflowFiles({ sourceFlow: "contractor_material_receipt", deferProcessing: true, sourceLabel: "Contractor material confirmation", targetEntityType: "execution_log", targetEntityId: logId, targetLabel: log?.log_no || "Execution log", purpose: "execution_evidence", kind: "site_proof", role: "proof", visibility: "internal", attachmentField: "contractor_confirmation_attachment_id", attachmentFieldMode: "set", requiredEvidence: true, files: [{ file, kind: "site_proof", role: "proof", caption: "Contractor material receipt confirmation", attachmentField: "contractor_confirmation_attachment_id", attachmentFieldMode: "set" }] });
            registerBatch(queued.batchId);
            setQueuedFile(withLocalPreview(queued.files[0], file));
        } catch (error) { toast.error(error instanceof Error ? error.message : "Confirmation photo could not be queued."); }
        finally { event.currentTarget.value = ""; }
    };
    const confirm = async () => { await onConfirm(queuedFile?.attachmentId); if (queuedFile) commitBatches(); };
    return (<Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-md gap-0 p-0"><DialogHeader className="border-b border-border px-5 py-3"><DialogTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-primary"/> Confirm material receipt</DialogTitle><DialogDescription className="text-xs">{log ? `${log.log_no} · ${log.work_order_no}` : ""}</DialogDescription></DialogHeader><div className="space-y-3 px-5 py-4"><div className="rounded-md border border-warning/30 bg-warning/[0.06] p-2.5 text-[11px] text-warning">A contractor confirmation photo is required before payment release.</div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Upload from device</label><ManagedFilePicker label="Choose confirmation photo" accept={MANAGED_FILE_ACCEPT} fileCount={queuedFile ? 1 : 0} onPick={queueFile} className="mt-1"/>{queuedFile && <FilePreview file={{ fileName: queuedFile.fileName, mimeType: queuedFile.mimeType, url: queuedFile.previewUrl }} compact controls className="mt-2 w-40"/>}</div></div><DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button variant="ghost" size="sm" onClick={() => void onConfirm()}>Skip photo</Button><Button size="sm" onClick={() => void confirm()} disabled={!queuedFile}><Upload className="mr-1 h-3.5 w-3.5"/> Confirm with proof</Button></DialogFooter></DialogContent></Dialog>);
}

function ExecutionLogDialog({ onClose, onSave }: {
    onClose: () => void;
    onSave: (payload: {
        id: string;
        work_order_id: string;
        date: string;
        progress_pct: number;
        progress_delta?: number;
        materials_used: Array<{ description: string; qty?: number; unit?: string; amount?: number }>;
        extra_work_notes?: string;
        extra_work_amount?: number;
        completion_notes?: string;
        site_condition?: string;
        uploaded_photos: Array<{ file_name: string; attachment_id: string; mime_type?: string; caption?: string; captured_at?: string }>;
        filed_by?: string;
    }) => void | Promise<void>;
}) {
    const db = useRDashStore((state) => state.db);
    const [logId] = React.useState(() => reserveEntityId("execution_log"));
    const [workOrderId, setWorkOrderId] = React.useState("");
    const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [progressPct, setProgressPct] = React.useState("");
    const [progressDelta, setProgressDelta] = React.useState("");
    const [completionNotes, setCompletionNotes] = React.useState("");
    const [siteCondition, setSiteCondition] = React.useState("");
    const [extraWorkNotes, setExtraWorkNotes] = React.useState("");
    const [extraWorkAmount, setExtraWorkAmount] = React.useState("");
    const [materials, setMaterials] = React.useState<Array<{ description: string; qty?: string; unit?: string; amount?: string }>>([{ description: "", qty: "", unit: "", amount: "" }]);
    const [photos, setPhotos] = React.useState<QueuedWorkflowFile[]>([]);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    const workOrder = db.workOrders.find((order) => order.id === workOrderId);
    const queuePhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        if (!workOrderId) { toast.error("Select a Work Order before choosing progress files."); event.currentTarget.value = ""; return; }
        try {
            const queued = await enqueueWorkflowFiles({ sourceFlow: "daily_execution_log", deferProcessing: true, sourceLabel: "Daily execution progress", targetEntityType: "execution_log", targetEntityId: logId, targetLabel: workOrder?.work_order_no || "Execution log", purpose: "execution_evidence", kind: "media", role: "photo", visibility: "internal", attachmentField: "photo_attachment_ids", attachmentFieldMode: "append", files: files.map((file) => ({ file, kind: "media", role: "photo", caption: "Daily execution progress file", attachmentField: "photo_attachment_ids", attachmentFieldMode: "append" })) });
            registerBatch(queued.batchId);
            setPhotos((current) => [...current, ...queued.files.map((item, index) => withLocalPreview(item, files[index]))]);
        } catch (error) { toast.error(error instanceof Error ? error.message : "Progress files could not be queued."); }
        finally { event.currentTarget.value = ""; }
    };
    const removePhoto = async (photo: QueuedWorkflowFile) => { await cancelQueuedWorkflowFile(photo); setPhotos((current) => current.filter((item) => item.uploadItemId !== photo.uploadItemId)); };
    const save = async () => {
        if (!workOrderId) { toast.error("Select a Work Order."); return; }
        await onSave({ id: logId, work_order_id: workOrderId, date, progress_pct: parseInt(progressPct) || workOrder?.progress || 0, progress_delta: progressDelta ? parseInt(progressDelta) : undefined, materials_used: materials.filter((item) => item.description).map((item) => ({ description: item.description, qty: item.qty ? parseFloat(item.qty) : undefined, unit: item.unit, amount: item.amount ? parseFloat(item.amount) : undefined })), extra_work_notes: extraWorkNotes.trim() || undefined, extra_work_amount: extraWorkAmount ? parseFloat(extraWorkAmount) : undefined, completion_notes: completionNotes.trim() || undefined, site_condition: siteCondition.trim() || undefined, uploaded_photos: photos.map((photo) => ({ file_name: photo.fileName, attachment_id: photo.attachmentId, mime_type: photo.mimeType, caption: "Daily execution progress file", captured_at: new Date().toISOString() })), filed_by: "Ravi Kumar" });
        commitBatches();
    };
    return (<Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-2xl gap-0 p-0"><DialogHeader className="border-b border-border px-5 py-3"><DialogTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4 text-primary"/> New daily execution log</DialogTitle><DialogDescription className="text-xs">Files queue immediately; Save closes the dialog while transfer continues.</DialogDescription></DialogHeader><div className="max-h-[65vh] overflow-y-auto px-5 py-4 rd-scroll"><div className="grid gap-3"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Work Order</label><select value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="">Select Work Order…</option>{db.workOrders.map((order) => <option key={order.id} value={order.id}>{order.work_order_no} · {order.title}</option>)}</select></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Date</label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9 text-sm"/></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Overall progress %</label><Input type="number" min="0" max="100" value={progressPct} onChange={(event) => setProgressPct(event.target.value)} className="h-9 text-sm"/></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Progress today</label><Input type="number" min="0" max="100" value={progressDelta} onChange={(event) => setProgressDelta(event.target.value)} className="h-9 text-sm"/></div></div><div><div className="mb-1 flex items-center justify-between"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Materials used</label><Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setMaterials((current) => [...current, { description: "", qty: "", unit: "", amount: "" }])}>Add line</Button></div>{materials.map((item, index) => <div key={index} className="mb-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4"><Input value={item.description} onChange={(event) => setMaterials((current) => current.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry))} placeholder="Description" className="h-8 text-xs"/><Input value={item.qty} onChange={(event) => setMaterials((current) => current.map((entry, i) => i === index ? { ...entry, qty: event.target.value } : entry))} placeholder="Qty" className="h-8 text-xs"/><Input value={item.unit} onChange={(event) => setMaterials((current) => current.map((entry, i) => i === index ? { ...entry, unit: event.target.value } : entry))} placeholder="Unit" className="h-8 text-xs"/><Input value={item.amount} onChange={(event) => setMaterials((current) => current.map((entry, i) => i === index ? { ...entry, amount: event.target.value } : entry))} placeholder="Amount" className="h-8 text-xs"/></div>)}</div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Upload progress files</label><ManagedFilePicker label="Add progress photos" accept={MANAGED_FILE_ACCEPT} multiple fileCount={photos.length} onPick={queuePhotos} className="mt-1"/>{photos.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{photos.map((photo) => <div key={photo.uploadItemId} className="relative"><FilePreview file={{ fileName: photo.fileName, mimeType: photo.mimeType, url: photo.previewUrl }} compact controls className="w-20"/><button type="button" onClick={() => void removePhoto(photo)} className="absolute right-0 top-0 rounded bg-background/80 p-0.5 text-destructive"><X className="h-3 w-3"/></button></div>)}</div>}</div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Completion notes</label><Textarea value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} rows={2}/></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Site condition</label><Textarea value={siteCondition} onChange={(event) => setSiteCondition(event.target.value)} rows={2}/></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]"><Textarea value={extraWorkNotes} onChange={(event) => setExtraWorkNotes(event.target.value)} placeholder="Extra work notes" rows={2}/><Input type="number" value={extraWorkAmount} onChange={(event) => setExtraWorkAmount(event.target.value)} placeholder="Extra amount"/></div></div></div><DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()} disabled={!workOrderId}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/> File log</Button></DialogFooter></DialogContent></Dialog>);
}
