"use client";

import * as React from "react";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilePreview } from "@/components/rdash/FilePreview";
import { ManagedFilePicker } from "@/components/rdash/ManagedFilePicker";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { useRDashStore } from "@/lib/rdash/store";
import {
  cancelQueuedWorkflowFile,
  classifyWorkflowFile,
  enqueueWorkflowFiles,
  withLocalPreview,
  type QueuedWorkflowFile,
} from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import {
  CustomerAreaDimensionsFields,
  positiveDimension,
  type CustomerAreaDimensionsDraft,
} from "./CustomerAreaDimensionsFields";

type MeasurementAreaDraft = CustomerAreaDimensionsDraft & {
  id: string;
  existingAreaId?: string;
  name: string;
  unit: "ft" | "m";
  notes?: string;
};

const key = () => `measurement-area-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Canonical Customer-owned Measurement editor/save workflow.
 *
 * Site Measurement owns visit orchestration (check-in/out and queue state),
 * while this component owns the shared Area identity/dimensions/upsert rules,
 * Work Required linking, verified revision serialization and report evidence.
 */
export function CustomerMeasurementDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const db = useRDashStore((state) => state.db);
  const addArea = useRDashStore((state) => state.addArea);
  const updateArea = useRDashStore((state) => state.updateArea);
  const updateWorkRequired = useRDashStore((state) => state.updateWorkRequired);
  const addMeasurementRevision = useRDashStore((state) => state.addMeasurementRevision);
  const fileVisitReport = useRDashStore((state) => state.fileVisitReport);
  const currentUser = useRDashStore((state) => state.currentUser);
  const visit = db.visits.find((row) => row.id === visitId);
  const site = visit?.site_id ? db.sites.find((row) => row.id === visit.site_id) : undefined;
  const work = visit?.work_required_id ? db.workRequired.find((row) => row.id === visit.work_required_id) : undefined;
  const customer = visit?.customer_id ? db.customers.find((row) => row.id === visit.customer_id) : undefined;
  const revisions = db.measurementRevisions.filter((row) => row.visit_id === visitId && row.status === "verified");

  const initialAreas = React.useMemo<MeasurementAreaDraft[]>(() => {
    if (!site) return [];
    const source = revisions.length
      ? revisions.map((revision) => {
          const area = db.areas.find((row) => row.id === revision.area_id);
          return {
            area,
            length: revision.length,
            breadth: revision.width,
            height: revision.height,
            unit: revision.unit,
            notes: revision.notes,
          };
        })
      : db.areas
          .filter((area) => area.site_id === site.id && !area.is_archived && (!work || work.area_ids.includes(area.id)))
          .map((area) => ({
            area,
            length: area.length,
            breadth: area.width,
            height: area.height,
            unit: (area.unit as "ft" | "m") || "ft",
            notes: area.notes,
          }));
    return source.map((row) => ({
      id: key(),
      existingAreaId: row.area?.id,
      name: row.area?.name || "",
      length: row.length ? String(row.length) : "",
      breadth: row.breadth ? String(row.breadth) : "",
      height: row.height ? String(row.height) : "",
      unit: row.unit || "ft",
      notes: row.notes,
    }));
  }, [db.areas, revisions, site, work]);

  const [areas, setAreas] = React.useState<MeasurementAreaDraft[]>(() => initialAreas.length ? initialAreas : [{ id: key(), name: "", length: "", breadth: "", height: "", unit: "ft" }]);
  const [notes, setNotes] = React.useState(visit?.notes || "");
  const [uploadedMedia, setUploadedMedia] = React.useState<Array<QueuedWorkflowFile & { type: "photo" | "video" | "pdf" }>>([]);
  const [saving, setSaving] = React.useState(false);
  const { registerBatch, commitBatches } = useUploadDraft(true);

  if (!visit || !site) {
    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-xl border border-border bg-card p-5"><p className="text-sm font-semibold">Measurement Visit is missing its Customer Site.</p><Button className="mt-3" onClick={onClose}>Close</Button></div></div>;
  }

  const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
  const readyToSave = visit.status === "report_pending" && (contractorVisit || Boolean(visit.check_out_verified)) && !visit.report_filed;
  const validAreas = areas.filter((area) => area.name.trim() && positiveDimension(area.length) && positiveDimension(area.breadth));
  const totalArea = validAreas.reduce((sum, area) => sum + (positiveDimension(area.length) || 0) * (positiveDimension(area.breadth) || 0), 0);

  const updateDraft = (id: string, patch: Partial<MeasurementAreaDraft>) => setAreas((current) => current.map((area) => area.id === id ? { ...area, ...patch } : area));
  const removeDraft = (id: string) => setAreas((current) => {
    const target = current.find((area) => area.id === id);
    if (target?.existingAreaId) {
      toast.error("Existing Areas cannot be deleted from a Measurement Visit. Archive/replace the Area from its Customer Site record.");
      return current;
    }
    return current.filter((area) => area.id !== id);
  });

  const save = async () => {
    if (!readyToSave) {
      toast.error(contractorVisit ? "A contractor Measurement Visit awaiting its report is required." : "A checked-out Measurement Visit awaiting its report is required.");
      return;
    }
    if (!validAreas.length) return toast.error("Enter at least one Area with name, length and breadth.");
    if (validAreas.length !== areas.length) return toast.error("Finish or remove every incomplete draft Area before filing the Measurement report.");

    setSaving(true);
    try {
      const existingSiteAreas = db.areas.filter((area) => area.site_id === site.id && !area.is_archived);
      const normalizedNames = new Set<string>();
      const savedAreas: Array<{ areaId: string; draft: MeasurementAreaDraft }> = [];

      for (const draft of validAreas) {
        const normalizedName = draft.name.trim().toLowerCase().replace(/\s+/g, " ");
        if (normalizedNames.has(normalizedName)) throw new Error(`Area “${draft.name.trim()}” appears more than once in this report.`);
        normalizedNames.add(normalizedName);

        const length = positiveDimension(draft.length)!;
        const width = positiveDimension(draft.breadth)!;
        const height = positiveDimension(draft.height);
        let areaId = draft.existingAreaId;
        if (areaId) {
          const existing = existingSiteAreas.find((area) => area.id === areaId);
          if (!existing) throw new Error(`Area “${draft.name}” no longer belongs to this Site.`);
          updateArea(areaId, { name: draft.name.trim(), length, width, height, unit: draft.unit, notes: draft.notes?.trim() || undefined, stage: "measured" });
        } else {
          const duplicate = existingSiteAreas.find((area) => area.name.trim().toLowerCase().replace(/\s+/g, " ") === normalizedName);
          if (duplicate) {
            areaId = duplicate.id;
            updateArea(areaId, { length, width, height, unit: draft.unit, notes: draft.notes?.trim() || undefined, stage: "measured" });
          } else {
            areaId = addArea({ site_id: site.id, name: draft.name.trim(), area_type: "other", length, width, height, unit: draft.unit, notes: draft.notes?.trim() || undefined, stage: "measured" });
          }
        }
        savedAreas.push({ areaId, draft });
      }

      if (work) {
        updateWorkRequired(work.id, { area_ids: Array.from(new Set([...work.area_ids, ...savedAreas.map((entry) => entry.areaId)])) });
      }

      const current = currentUser();
      for (const { areaId, draft } of savedAreas) {
        addMeasurementRevision({
          site_id: site.id,
          area_id: areaId,
          work_required_id: work?.id,
          visit_id: visit.id,
          length: positiveDimension(draft.length),
          width: positiveDimension(draft.breadth),
          height: positiveDimension(draft.height),
          unit: draft.unit,
          notes: notes.trim() || draft.notes?.trim() || undefined,
          captured_by: current.name,
          captured_at: visit.check_out_at || new Date().toISOString(),
          photo_count: uploadedMedia.length,
          status: "verified",
        });
      }

      const proofs = uploadedMedia.map((item) => ({
        type: `measurement_${item.type}`,
        file_name: item.fileName,
        attachment_id: item.attachmentId,
      }));
      fileVisitReport(
        visit.id,
        notes.trim() || `Site measurement captured: ${savedAreas.length} Areas, ${Math.round(totalArea * 100) / 100} sq.ft total.`,
        proofs,
      );
      commitBatches();
      toast.success(`Measurement filed — ${savedAreas.length} Area(s), ${savedAreas.length} verified revision(s)${proofs.length ? `, ${proofs.length} proof file(s)` : ""} · ${site.name}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Measurement report could not be filed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Customer Site measurement" className="max-h-[96vh] w-full max-w-3xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3"><div><h3 className="text-base font-bold">Site Measurement · {customer?.name || visit.location_name}</h3><p className="text-xs text-muted-foreground">{site.name} · same Customer Area records used by Work Required and Site Execution</p></div><button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button></div>

        <div className="rd-scroll max-h-[65vh] space-y-3 overflow-y-auto px-5 py-4">
          {!readyToSave && <p className="rounded-md border border-warning/30 bg-warning/[0.06] p-2 text-xs text-warning">Complete the required field/contractor Visit state before filing this Measurement report.</p>}
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-muted-foreground">Areas ({areas.length})</p><Button size="sm" variant="outline" onClick={() => setAreas((current) => [...current, { id: key(), name: "", length: "", breadth: "", height: "", unit: "ft" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add Area</Button></div>
          <div className="space-y-2">
            {areas.map((area, index) => <section key={area.id} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">Area {index + 1}{area.existingAreaId ? " · existing Customer Area" : " · new"}</span><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeDraft(area.id)} aria-label={`Remove ${area.name || `Area ${index + 1}`}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]"><label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area name<Input value={area.name} onChange={(event) => updateDraft(area.id, { name: event.target.value })} className="h-8 text-xs font-normal" /></label><label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Unit<select value={area.unit} onChange={(event) => updateDraft(area.id, { unit: event.target.value as "ft" | "m" })} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-normal"><option value="ft">feet</option><option value="m">metres</option></select></label></div>
              <div className="mt-2"><CustomerAreaDimensionsFields value={area} onChange={(next) => updateDraft(area.id, next)} /></div>
              <label className="mt-2 grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Area notes<Input value={area.notes || ""} onChange={(event) => updateDraft(area.id, { notes: event.target.value })} className="h-8 text-xs font-normal" /></label>
            </section>)}
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-primary">Total measured plan area</span><span className="font-mono text-lg font-bold text-primary">{Math.round(totalArea * 100) / 100} sq.ft</span></div></div>
          <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">Visit observations<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="text-sm font-normal" /></label>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Measurement evidence</p>
            <ManagedFilePicker label="Add photos, videos or PDFs" accept={MANAGED_FILE_ACCEPT} multiple fileCount={uploadedMedia.length} onPick={async (event) => {
              const files = Array.from(event.target.files || []);
              if (!files.length) return;
              try {
                const queued = await enqueueWorkflowFiles({
                  sourceFlow: "site_measurement",
                  deferProcessing: true,
                  sourceLabel: "Customer Site Measurement",
                  targetEntityType: "visit",
                  targetEntityId: visit.id,
                  targetLabel: site.name,
                  purpose: "measurement",
                  kind: "site_proof",
                  role: "measurement",
                  visibility: "internal",
                  files: files.map((file) => ({ file, kind: "site_proof" as const, role: "measurement" as const, caption: `Measurement ${classifyWorkflowFile(file).role}` })),
                });
                registerBatch(queued.batchId);
                setUploadedMedia((current) => [...current, ...queued.files.map((item, index) => ({
                  ...withLocalPreview(item, files[index]),
                  type: files[index].type.startsWith("video/") ? "video" as const : files[index].type === "application/pdf" || files[index].name.toLowerCase().endsWith(".pdf") ? "pdf" as const : "photo" as const,
                }))]);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not queue measurement evidence.");
              } finally {
                event.currentTarget.value = "";
              }
            }} />
            {uploadedMedia.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{uploadedMedia.map((media) => <div key={media.uploadItemId} className="relative overflow-hidden rounded-md border border-border bg-muted/30"><FilePreview file={{ fileName: media.fileName, mimeType: media.mimeType, url: media.previewUrl }} compact controls /><button type="button" onClick={() => void cancelQueuedWorkflowFile(media).then(() => setUploadedMedia((current) => current.filter((item) => item.uploadItemId !== media.uploadItemId)))} className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-destructive" aria-label={`Remove ${media.fileName}`}><X className="h-3 w-3" /></button></div>)}</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3"><Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button><Button size="sm" onClick={() => void save()} disabled={saving || !readyToSave || !validAreas.length}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{saving ? "Saving…" : "Save & File Report"}</Button></div>
      </div>
    </div>
  );
}
