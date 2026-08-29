"use client";

import * as React from "react";
import { Navigation, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { attachedPreview, confirmedAttachmentId } from "@/lib/rdash/file-attachments";
import { reverseGeocodeWithNominatim } from "@/lib/rdash/location-search";
import {
  coordinateInputError,
  formatCoordinatePair,
  parseCoordinatePair,
} from "@/lib/rdash/coordinates";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import {
  cancelQueuedWorkflowFile,
  classifyWorkflowFile,
  enqueueWorkflowFiles,
  withLocalPreview,
  type QueuedWorkflowFile,
} from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import {
  canonicalContractorCapabilities,
  contractorDuplicateConflicts,
  contractorFormProjection,
  contractorProfileValidationError,
  contractorWorkTypeAverages,
  normalizeContractorForWrite,
  type ContractorCapability,
  type ContractorLifecycleStatus,
  type ContractorProfileRecord,
} from "@/lib/rdash/contractor-profile";
import { createWorkTypeId, workTypesForSubcategory } from "@/lib/rdash/work-types";
import type { WorkSubcategory } from "@/lib/rdash/types";
import { FilePreview } from "./FilePreview";
import { AddWorkCategoryAction, AddWorkSubcategoryAction } from "./WorkTaxonomyQuickAdd";

export type ContractorFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
};

type PendingMedia = QueuedWorkflowFile & {
  url: string;
  file_name: string;
  mime_type: string;
};
type ExistingMedia = { attachment_id: string };
type MediaValue = "" | PendingMedia | ExistingMedia;
type CapabilityDraft = {
  subcategory_id: string;
  subcategory_name?: string;
  work_type_rates: Array<{
    work_type_id: string;
    work_type_name: string;
    unit_id: string;
    material_rate: string;
    labour_rate: string;
    notes: string;
    custom?: boolean;
  }>;
};

type Draft = {
  name: string;
  legalName: string;
  phone: string;
  address: string;
  city: string;
  locality: string;
  status: ContractorLifecycleStatus;
  reliability: string;
  politeness: string;
  workerRange: string;
  deadline: string;
  availableWorkers: string;
  serviceRadiusKm: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  legalName: "",
  phone: "",
  address: "",
  city: "",
  locality: "",
  status: "onboarding",
  reliability: "average",
  politeness: "moderate",
  workerRange: "1-3",
  deadline: "usual",
  availableWorkers: "",
  serviceRadiusKm: "",
  notes: "",
};

const isPending = (value: MediaValue): value is PendingMedia =>
  typeof value === "object" && "uploadItemId" in value;
const isExisting = (value: MediaValue): value is ExistingMedia =>
  typeof value === "object" && "attachment_id" in value;
const optionalNumber = (value: string): number | undefined =>
  value.trim() ? Number(value) : undefined;

function mediaFile(value: MediaValue, db: any) {
  if (isExisting(value)) return attachedPreview(db, value.attachment_id);
  if (isPending(value)) {
    return { fileName: value.file_name, mimeType: value.mime_type, url: value.url };
  }
  return undefined;
}

function draftFromRecord(record: ContractorProfileRecord): Draft {
  const status = ["onboarding", "active", "on_hold", "blacklisted", "inactive"].includes(String(record.status))
    ? (record.status as ContractorLifecycleStatus)
    : "onboarding";
  return {
    name: String(record.name || ""),
    legalName: String(record.legal_name || ""),
    phone: String(record.phone || ""),
    address: String(record.address || ""),
    city: String(record.city || ""),
    locality: String(record.locality || ""),
    status,
    reliability: String(record.reliability_rating || "average"),
    politeness: String(record.politeness_rating || "moderate"),
    workerRange: String(record.worker_count_range || "1-3"),
    deadline: String(record.deadline_commitment || "usual"),
    availableWorkers: record.available_workers == null ? "" : String(record.available_workers),
    serviceRadiusKm: record.service_radius_km == null ? "" : String(record.service_radius_km),
    notes: String(record.notes || ""),
  };
}

function capabilitiesToDraft(capabilities: ContractorCapability[], subcategories: WorkSubcategory[]): CapabilityDraft[] {
  return capabilities.map((row) => ({
    subcategory_id: row.subcategory_id,
    subcategory_name: row.subcategory_name,
    work_type_rates: (() => {
      const subcategory = subcategories.find((item) => item.id === row.subcategory_id);
      const stored = new Map((row.work_type_rates || []).map((rate) => [rate.work_type_id, rate]));
      const catalog = (subcategory ? workTypesForSubcategory(subcategory) : []).map((workType) => {
        const rate = stored.get(workType.id);
        stored.delete(workType.id);
        return {
          work_type_id: workType.id,
          work_type_name: workType.name,
          unit_id: rate?.unit_id || workType.unit_id || subcategory?.unit_id || "pcs",
          material_rate: rate?.material_rate == null ? "" : String(rate.material_rate),
          labour_rate: rate?.labour_rate == null ? "" : String(rate.labour_rate),
          notes: rate?.notes || "",
        };
      });
      return [...catalog, ...Array.from(stored.values()).map((rate) => ({
        work_type_id: rate.work_type_id,
        work_type_name: rate.work_type_name || "",
        unit_id: rate.unit_id || subcategory?.unit_id || "pcs",
        material_rate: rate.material_rate == null ? "" : String(rate.material_rate),
        labour_rate: rate.labour_rate == null ? "" : String(rate.labour_rate),
        notes: rate.notes || "",
        custom: true,
      }))];
    })(),
  }));
}

export function ContractorFormDialog({ open, onClose, onSaved, editId }: ContractorFormDialogProps) {
  const db = useRDashStore((state) => state.db);
  const addContractor = useRDashStore((state) => state.addContractor);
  const updateContractor = useRDashStore((state) => state.updateContractor);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const isEdit = Boolean(editId);
  const formId = `contractor-form:${editId || "new"}`;
  const [reservedId, setReservedId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { registerBatch, commitBatches } = useUploadDraft(open);

  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [latitude, setLatitude] = React.useState<number>();
  const [longitude, setLongitude] = React.useState<number>();
  const [coordinates, setCoordinates] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [referralQuery, setReferralQuery] = React.useState("");
  const [referralId, setReferralId] = React.useState<string>();
  const [referralOpen, setReferralOpen] = React.useState(false);
  const [baselineStatus, setBaselineStatus] = React.useState<string | undefined>();
  const [baselineComplianceDocuments, setBaselineComplianceDocuments] = React.useState<ContractorProfileRecord["compliance_documents"]>();
  const [contractorPhoto, setContractorPhoto] = React.useState<MediaValue>("");
  const [businessCard, setBusinessCard] = React.useState<MediaValue>("");
  const [capabilities, setCapabilities] = React.useState<CapabilityDraft[]>([]);
  const [activeCapabilityCategoryId, setActiveCapabilityCategoryId] = React.useState<string | null>(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = React.useState(false);
  const [baselineKey, setBaselineKey] = React.useState("");
  const baselineRef = React.useRef<ContractorProfileRecord>({});
  const baselineCoordinateRef = React.useRef("");
  const disposedRef = React.useRef(false);

  React.useEffect(() => () => {
    disposedRef.current = true;
  }, []);

  const allCategories = db.master.workCategories;
  const allSubcategories = db.master.workSubcategories;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const referralOptions = React.useMemo(() => {
    const query = referralQuery.trim().toLowerCase();
    if (!query) return [];
    return db.master.sourcePartners
      .filter((row) => row.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [db.master.sourcePartners, referralQuery]);

  const buildPayload = React.useCallback((): ContractorProfileRecord => {
    const sourcePartner = referralId
      ? db.master.sourcePartners.find((row) => row.id === referralId)
      : undefined;
    const raw: ContractorProfileRecord = {
      id: editId || reservedId || undefined,
      name: draft.name,
      legal_name: draft.legalName,
      phone: draft.phone,
      address: draft.address,
      city: draft.city,
      locality: draft.locality,
      latitude,
      longitude,
      source_partner_id: sourcePartner?.id,
      source_partner_name: sourcePartner?.name,
      photo_attachment_id: confirmedAttachmentId(contractorPhoto),
      business_card_attachment_id: confirmedAttachmentId(businessCard),
      reliability_rating: draft.reliability,
      politeness_rating: draft.politeness,
      worker_count_range: draft.workerRange,
      deadline_commitment: draft.deadline,
      status: draft.status,
      work_capabilities: capabilities.map((row) => ({
        subcategory_id: row.subcategory_id,
        subcategory_name: row.subcategory_name,
        work_type_rates: row.work_type_rates.flatMap((rate) => {
          const name = rate.work_type_name.trim();
          const material = rate.material_rate.trim();
          const labour = rate.labour_rate.trim();
          if (!name || (!material && !labour)) return [];
          return [{
            work_type_id: rate.custom ? createWorkTypeId(row.subcategory_id, name) : rate.work_type_id,
            work_type_name: name,
            unit_id: rate.unit_id,
            material_rate: material ? Number(material) : undefined,
            labour_rate: labour ? Number(labour) : undefined,
            notes: rate.notes.trim() || undefined,
          }];
        }),
      })),
      available_workers: optionalNumber(draft.availableWorkers),
      service_radius_km: optionalNumber(draft.serviceRadiusKm),
      notes: draft.notes,
      compliance_documents: baselineComplianceDocuments,
    };
    return normalizeContractorForWrite(raw, db, { id: raw.id });
  }, [
    baselineComplianceDocuments,
    businessCard,
    capabilities,
    contractorPhoto,
    db,
    draft,
    editId,
    latitude,
    longitude,
    referralId,
    reservedId,
  ]);

  const fingerprint = React.useCallback(
    (payload: ContractorProfileRecord, coordinateValue: string) =>
      JSON.stringify({ profile: contractorFormProjection(payload), coordinates: coordinateValue.trim() }),
    [],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- Opening the dialog intentionally hydrates a resettable draft snapshot from the selected Contractor. */
  React.useEffect(() => {
    if (!open) return;
    const id = editId || reserveEntityId("contractor");
    setReservedId(id);
    const record = (editId
      ? db.master.contractors.find((row) => row.id === editId)
      : undefined) as ContractorProfileRecord | undefined;
    const profile: ContractorProfileRecord = record || {
      id,
      name: "",
      phone: "",
      city: "",
      status: "onboarding",
      reliability_rating: "average",
      politeness_rating: "moderate",
      worker_count_range: "1-3",
      deadline_commitment: "usual",
      work_capabilities: [],
    };
    const normalized = normalizeContractorForWrite(
      {
        ...profile,
        work_capabilities: canonicalContractorCapabilities(profile, db),
      },
      db,
      { id },
    );
    const nextCoordinates = formatCoordinatePair(normalized as any);
    setDraft(draftFromRecord(normalized));
    setLatitude(normalized.latitude as number | undefined);
    setLongitude(normalized.longitude as number | undefined);
    setCoordinates(nextCoordinates);
    setCapabilities(capabilitiesToDraft(normalized.work_capabilities || [], allSubcategories));
    setActiveCapabilityCategoryId(null);
    setContractorPhoto(
      normalized.photo_attachment_id
        ? { attachment_id: String(normalized.photo_attachment_id) }
        : "",
    );
    setBusinessCard(
      normalized.business_card_attachment_id
        ? { attachment_id: String(normalized.business_card_attachment_id) }
        : "",
    );
    setReferralId(normalized.source_partner_id as string | undefined);
    setReferralQuery(normalized.source_partner_id ? String(normalized.source_partner_name || "") : "");
    setBaselineStatus(String(normalized.status || "onboarding"));
    setBaselineComplianceDocuments(normalized.compliance_documents);
    setReferralOpen(false);
    setDuplicateAcknowledged(false);
    baselineRef.current = normalized;
    baselineCoordinateRef.current = nextCoordinates;
    setBaselineKey(fingerprint(normalized, nextCoordinates));
    // Database dependencies are intentionally omitted so background sync does not reset an in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  let currentPayload: ContractorProfileRecord;
  let normalizationError: string | null = null;
  try {
    currentPayload = buildPayload();
  } catch (error) {
    currentPayload = { name: draft.name, status: draft.status, work_capabilities: [] };
    normalizationError = error instanceof Error ? error.message : "Contractor data is invalid.";
  }

  const dirty = open && fingerprint(currentPayload, coordinates) !== baselineKey;
  const referralError = referralQuery.trim() && !referralId
    ? "Choose an existing Source Partner from the referral search results."
    : null;
  const formatError = contractorProfileValidationError(currentPayload, {
    isCreate: !isEdit,
    activating: isEdit && baselineStatus !== "active" && currentPayload.status === "active",
  });
  const coordinateError = coordinateInputError(coordinates);
  const duplicateConflicts = contractorDuplicateConflicts(db, currentPayload, editId);
  const hardDuplicate = duplicateConflicts.find((row) => row.hard);
  const softDuplicate = duplicateConflicts.find((row) => !row.hard);
  const validationError =
    normalizationError ||
    referralError ||
    coordinateError ||
    formatError ||
    (hardDuplicate
      ? `Duplicate contractor blocked: ${hardDuplicate.name} has ${hardDuplicate.reasons.join(", ")}.`
      : null) ||
    (softDuplicate && !duplicateAcknowledged
      ? `Review possible duplicate ${softDuplicate.name} before saving.`
      : null);

  async function discard(): Promise<boolean> {
    const pending = [contractorPhoto, businessCard].filter(isPending);
    await Promise.all(pending.map((value) => cancelQueuedWorkflowFile(value)));
    const baseline = baselineRef.current;
    setDraft(draftFromRecord(baseline));
    setLatitude(baseline.latitude as number | undefined);
    setLongitude(baseline.longitude as number | undefined);
    setCoordinates(baselineCoordinateRef.current);
    setCapabilities(capabilitiesToDraft(baseline.work_capabilities || [], allSubcategories));
    setReferralId(baseline.source_partner_id as string | undefined);
    setReferralQuery(String(baseline.source_partner_name || ""));
    setContractorPhoto(baseline.photo_attachment_id ? { attachment_id: String(baseline.photo_attachment_id) } : "");
    setBusinessCard(baseline.business_card_attachment_id ? { attachment_id: String(baseline.business_card_attachment_id) } : "");
    return true;
  }

  async function save(): Promise<boolean> {
    if (saving) return false;
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    if (isEdit && !dirty) return true;
    setSaving(true);
    try {
      let id = editId || reservedId;
      if (isEdit && editId) updateContractor(editId, currentPayload as never);
      else id = addContractor({ ...(currentPayload as any), id: reservedId });
      await awaitServerSync();
      commitBatches();
      baselineRef.current = currentPayload;
      baselineCoordinateRef.current = coordinates;
      setBaselineComplianceDocuments(currentPayload.compliance_documents);
      setBaselineKey(fingerprint(currentPayload, coordinates));
      dirtyFormRegistry.markClean(formId);
      toast.success(`Contractor ${isEdit ? "updated" : "created"}`, {
        description: "The complete contractor profile was confirmed by the workspace server.",
      });
      onSaved?.(id);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The contractor profile could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useDirtyFormRegistration({
    id: formId,
    label: `${isEdit ? "Edit" : "Add"} contractor`,
    dirty,
    save,
    discard,
  });

  function requestClose() {
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close this contractor form" });
  }

  function updateCoordinates(value: string) {
    setCoordinates(value);
    if (!value.trim()) {
      setLatitude(undefined);
      setLongitude(undefined);
      return;
    }
    const parsed = parseCoordinatePair(value);
    if (parsed) {
      setLatitude(parsed.latitude);
      setLongitude(parsed.longitude);
      setCoordinates(formatCoordinatePair(parsed));
    }
  }

  function captureGps() {
    if (!navigator.geolocation) return toast.error("GPS is unavailable.");
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (disposedRef.current) return;
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLatitude(next.latitude);
        setLongitude(next.longitude);
        setCoordinates(formatCoordinatePair(next));
        setGpsLoading(false);
        void reverseGeocodeWithNominatim(next.latitude, next.longitude).then((result) => {
          if (!result?.display_name || disposedRef.current) return;
          set("address", result.display_name);
          set("city", result.address?.city || result.address?.town || result.address?.village || "");
          set("locality", result.address?.suburb || result.address?.neighbourhood || "");
        });
      },
      (error) => {
        setGpsLoading(false);
        toast.error(`GPS error: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function uploadMedia(
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (value: MediaValue) => void,
    attachmentField: string,
    caption: string,
  ) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !reservedId) return;
    try {
      const queued = await enqueueWorkflowFiles({
        sourceFlow: "contractor_form",
                deferProcessing: true,
        sourceLabel: "contractor form",
        targetEntityType: "contractor",
        targetEntityId: reservedId,
        targetLabel: draft.name.trim() || "New contractor",
        purpose: "contractor_document",
        files: [{
          file,
          ...classifyWorkflowFile(file),
          caption,
          attachmentField,
          attachmentFieldMode: "set",
        }],
      });
      registerBatch(queued.batchId);
      const preview = withLocalPreview(queued.files[0], file);
      setter({
        ...preview,
        url: preview.previewUrl,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the file.");
    }
  }

  async function removeMedia(value: MediaValue, setter: (value: MediaValue) => void) {
    if (isPending(value)) await cancelQueuedWorkflowFile(value);
    setter("");
  }

  const toggleCapability = (subcategoryId: string) => {
    const row = allSubcategories.find((item) => item.id === subcategoryId);
    if (!row) return;
    setCapabilities((values) =>
      values.some((value) => value.subcategory_id === subcategoryId)
        ? values.filter((value) => value.subcategory_id !== subcategoryId)
        : [...values, {
            subcategory_id: row.id,
            subcategory_name: row.name,
            work_type_rates: workTypesForSubcategory(row).map((workType) => ({
              work_type_id: workType.id,
              work_type_name: workType.name,
              unit_id: workType.unit_id || row.unit_id || "pcs",
              material_rate: "",
              labour_rate: "",
              notes: "",
            })),
          }],
    );
    setDuplicateAcknowledged(false);
  };

  const updateCapabilityWorkTypeRate = (
    subcategoryId: string,
    workTypeId: string,
    patch: Partial<CapabilityDraft["work_type_rates"][number]>,
  ) => setCapabilities((values) => values.map((capability) =>
    capability.subcategory_id === subcategoryId
      ? {
          ...capability,
          work_type_rates: capability.work_type_rates.map((rate) => rate.work_type_id === workTypeId ? { ...rate, ...patch } : rate),
        }
      : capability,
  ));

  const addCapabilityWorkType = (subcategoryId: string) => setCapabilities((values) => values.map((capability) => {
    if (capability.subcategory_id !== subcategoryId) return capability;
    const subcategory = allSubcategories.find((row) => row.id === subcategoryId);
    return {
      ...capability,
      work_type_rates: [...capability.work_type_rates, {
        work_type_id: `wt-${subcategoryId}-draft-${crypto.randomUUID()}`,
        work_type_name: "",
        unit_id: subcategory?.unit_id || "pcs",
        material_rate: "",
        labour_rate: "",
        notes: "",
        custom: true,
      }],
    };
  }));

  const removeCapabilityWorkType = (subcategoryId: string, workTypeId: string) => setCapabilities((values) => values.map((capability) =>
    capability.subcategory_id === subcategoryId
      ? { ...capability, work_type_rates: capability.work_type_rates.filter((rate) => rate.work_type_id !== workTypeId) }
      : capability,
  ));

  const photoField = (
    label: string,
    value: MediaValue,
    setter: (value: MediaValue) => void,
    field: string,
  ) => (
    <div>
      <label className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</label>
      <Input
        type="file"
        accept={MANAGED_FILE_ACCEPT}
        onChange={(event) => void uploadMedia(event, setter, field, label)}
        className="h-11 text-sm"
      />
      {value && mediaFile(value, db) ? (
        <div className="relative mt-1">
          <FilePreview file={mediaFile(value, db)!} compact controls />
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => void removeMedia(value, setter)}
            className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !value && requestClose()}>
      <DialogContent className="max-h-[94vh] gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isEdit ? "Edit Contractor" : "Add New Contractor"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Identity, contact, location, capabilities, rates, capacity, banking and compliance readiness are maintained in one profile.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => { event.preventDefault(); void save().then((saved) => saved && onClose()); }}>
          <div className="rd-scroll max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Identity and lifecycle</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={draft.name} onChange={(event) => { set("name", event.target.value); setDuplicateAcknowledged(false); }} placeholder="Contractor / firm name" autoFocus={!isEdit} />
                <Input value={draft.legalName} onChange={(event) => { set("legalName", event.target.value); setDuplicateAcknowledged(false); }} placeholder="Legal / registered name" />
                <Input value={draft.phone} onChange={(event) => { set("phone", sanitizeIndianMobile(event.target.value)); setDuplicateAcknowledged(false); }} placeholder="Primary mobile" inputMode="numeric" />
                <select value={draft.status} onChange={(event) => set("status", event.target.value as ContractorLifecycleStatus)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="blacklisted">Blacklisted</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Location</p>
                <Button type="button" size="sm" variant="outline" onClick={captureGps} disabled={gpsLoading}>
                  <Navigation className="mr-1 h-3.5 w-3.5" />{gpsLoading ? "Capturing…" : "Capture GPS"}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={coordinates} onChange={(event) => updateCoordinates(event.target.value)} placeholder="26.739800, 83.371200" className="sm:col-span-2" />
                <Input value={draft.address} onChange={(event) => set("address", event.target.value)} placeholder="Address" className="sm:col-span-2" />
                <Input value={draft.city} onChange={(event) => { set("city", event.target.value); setDuplicateAcknowledged(false); }} placeholder="City" />
                <Input value={draft.locality} onChange={(event) => set("locality", event.target.value)} placeholder="Locality / Area" />
              </div>
            </section>

            <section className="relative space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Referral</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={referralQuery}
                  onChange={(event) => { setReferralQuery(event.target.value); setReferralId(undefined); setReferralOpen(true); }}
                  onFocus={() => setReferralOpen(true)}
                  placeholder="Search Source Partners"
                  className="pl-8"
                />
                {referralOpen && referralOptions.length ? (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-popover" role="listbox">
                    {referralOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={option.id === referralId}
                        className="flex w-full justify-between px-3 py-2 text-xs hover:bg-accent"
                        onClick={() => { setReferralId(option.id); setReferralQuery(option.name); setReferralOpen(false); }}
                      >
                        <span>{option.name}</span><span className="text-muted-foreground">{option.type || "Source Partner"}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {referralError ? <p className="text-[10px] text-destructive">{referralError}</p> : <p className="text-[10px] text-muted-foreground">Only existing Source Partner records can be linked.</p>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              {photoField("Contractor photo", contractorPhoto, setContractorPhoto, "photo_attachment_id")}
              {photoField("Business card photo", businessCard, setBusinessCard, "business_card_attachment_id")}
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Work quality and crew</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <select value={draft.reliability} onChange={(event) => set("reliability", event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                  <option value="good">Reliability: Good</option><option value="average">Reliability: Average</option><option value="poor">Reliability: Poor</option>
                </select>
                <select value={draft.politeness} onChange={(event) => set("politeness", event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                  <option value="very">Politeness: Very</option><option value="moderate">Politeness: Moderate</option><option value="less">Politeness: Less</option>
                </select>
                <select value={draft.workerRange} onChange={(event) => set("workerRange", event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                  <option value="1-3">Workers: 1–3</option><option value="4-8">Workers: 4–8</option><option value="9-15">Workers: 9–15</option><option value="16-40">Workers: 16–40</option>
                </select>
                <select value={draft.deadline} onChange={(event) => set("deadline", event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                  <option value="strict">Deadline: Strict</option><option value="usual">Deadline: Usual</option><option value="lazy">Deadline: Lazy</option><option value="very_lazy">Deadline: Very lazy</option>
                </select>
              </div>
            </section>

            <section className="rounded-lg border p-3">
              <p className="text-xs font-semibold">Work capabilities and canonical rates</p>
              <p className="mb-2 text-[10px] text-muted-foreground">Categories are derived automatically from selected subcategories. Governance and Contractor Rates are synchronized from these rows.</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Work capability categories">
                {allCategories.map((category) => {
                  const active = activeCapabilityCategoryId === category.id;
                  return (
                    <React.Fragment key={category.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setActiveCapabilityCategoryId((current) => current === category.id ? null : category.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        {category.name}
                      </button>
                      {active ? (
                        <div className="basis-full rounded-lg border border-border bg-muted/20 p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">{category.name}</p>
                            <span className="text-[10px] text-muted-foreground">Select subcategories</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {allSubcategories.filter((row) => row.category_id === category.id).map((subcategory) => (
                              <button
                                key={subcategory.id}
                                type="button"
                                aria-pressed={capabilities.some((row) => row.subcategory_id === subcategory.id)}
                                onClick={() => toggleCapability(subcategory.id)}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                                  capabilities.some((row) => row.subcategory_id === subcategory.id)
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                )}
                              >{subcategory.name}</button>
                            ))}
                          </div>
                          <div className="mt-2"><AddWorkSubcategoryAction categoryId={category.id} /></div>
                        </div>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
              {!activeCapabilityCategoryId ? <p className="mt-2 text-[10px] text-muted-foreground">Choose a category to select or edit its work subcategories.</p> : null}
              <AddWorkCategoryAction className="mt-2" />
              <div className="mt-2 space-y-2">
                {capabilities.map((capability) => {
                  return (
                    <div key={capability.subcategory_id} className="rounded border p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{capability.subcategory_name}</span>
                        <button type="button" aria-label={`Remove ${capability.subcategory_name}`} onClick={() => toggleCapability(capability.subcategory_id)} className="shrink-0 text-destructive"><X className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 rounded-md border">
                        {capability.work_type_rates.map((rate) => {
                          const average = contractorWorkTypeAverages(db.master.contractorRates, capability.subcategory_id, rate.work_type_id, editId);
                          const total = (Number(rate.material_rate) || 0) + (Number(rate.labour_rate) || 0);
                          return (
                          <div key={rate.work_type_id} className="relative grid min-w-0 grid-cols-1 gap-2 border-t p-2 pr-9 first:border-t-0 sm:grid-cols-2 lg:grid-cols-3">
                            <label className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Work type</span>
                              {rate.custom ? <Input value={rate.work_type_name} onChange={(event) => updateCapabilityWorkTypeRate(capability.subcategory_id, rate.work_type_id, { work_type_name: event.target.value })} placeholder="Work type" className="h-8 min-w-0 text-[10px]" /> : <span className="block h-8 truncate rounded-md border border-input bg-muted/30 px-2 py-2 text-[10px] font-medium" title={rate.work_type_name}>{rate.work_type_name}</span>}
                            </label>
                            <label className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Execution unit</span>
                              <select value={rate.unit_id} onChange={(event) => updateCapabilityWorkTypeRate(capability.subcategory_id, rate.work_type_id, { unit_id: event.target.value })} className="h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-[10px]">
                                {db.master.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol} · {unit.name}</option>)}
                              </select>
                            </label>
                            <label className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Material rate</span>
                              <Input
                                type="number"
                                min={0}
                                value={rate.material_rate}
                                onChange={(event) => updateCapabilityWorkTypeRate(capability.subcategory_id, rate.work_type_id, { material_rate: event.target.value })}
                                placeholder="₹ 0"
                                aria-label={`${rate.work_type_name} material rate`}
                                className="h-8 min-w-0 px-2 text-[10px]"
                              />
                            </label>
                            <label className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Labour rate</span>
                              <Input type="number" min={0} value={rate.labour_rate} onChange={(event) => updateCapabilityWorkTypeRate(capability.subcategory_id, rate.work_type_id, { labour_rate: event.target.value })} placeholder="₹ 0" aria-label={`${rate.work_type_name} labour rate`} className="h-8 min-w-0 px-2 text-[10px]" />
                            </label>
                            <div className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Total rate</span>
                              <span className="block h-8 rounded-md bg-muted px-2 py-2 text-[10px] font-semibold">₹ {total}</span>
                            </div>
                            <label className="min-w-0 space-y-1">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
                              <Input value={rate.notes} onChange={(event) => updateCapabilityWorkTypeRate(capability.subcategory_id, rate.work_type_id, { notes: event.target.value })} placeholder="Notes" className="h-8 min-w-0 px-2 text-[10px]" />
                            </label>
                            {average.contractor_count ? <p className="text-[9px] text-muted-foreground sm:col-span-2 lg:col-span-3">Other contractors avg: material ₹{Math.round(average.material_rate || 0)} · labour ₹{Math.round(average.labour_rate || 0)} · total ₹{Math.round(average.total_rate || 0)} ({average.contractor_count})</p> : null}
                            <button type="button" aria-label={`Remove ${rate.work_type_name || "work type"}`} onClick={() => removeCapabilityWorkType(capability.subcategory_id, rate.work_type_id)} className="absolute right-2 top-2 text-destructive"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        );})}
                        <button type="button" onClick={() => addCapabilityWorkType(capability.subcategory_id)} className="m-2 inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-[10px] font-semibold text-primary"><Plus className="h-3 w-3" />Add work type</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Capacity</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="number" min={0} value={draft.availableWorkers} onChange={(event) => set("availableWorkers", event.target.value)} placeholder="Workers currently available" />
                <Input type="number" min={0} value={draft.serviceRadiusKm} onChange={(event) => set("serviceRadiusKm", event.target.value)} placeholder="Service radius (km)" />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Internal notes</p>
              <Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} rows={3} placeholder="Relationship notes, conditions, escalation or operating instructions" />
            </section>

            {hardDuplicate ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <strong>Duplicate blocked:</strong> {hardDuplicate.name} has {hardDuplicate.reasons.join(", ")}.
              </div>
            ) : softDuplicate ? (
              <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                <input type="checkbox" checked={duplicateAcknowledged} onChange={(event) => setDuplicateAcknowledged(event.target.checked)} className="mt-0.5" />
                <span><strong>Possible duplicate:</strong> {softDuplicate.name} has {softDuplicate.reasons.join(", ")}. I checked the existing record and still want to save this contractor.</span>
              </label>
            ) : null}

            {validationError && !hardDuplicate && !softDuplicate ? (
              <p className="text-xs text-destructive">{validationError}</p>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" onClick={requestClose}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
            <Button type="submit" disabled={saving || Boolean(validationError) || (isEdit && !dirty)} title={validationError || undefined}>
              {saving ? "Saving…" : isEdit ? <><Pencil className="mr-1 h-3.5 w-3.5" />Save contractor</> : <><Plus className="mr-1 h-3.5 w-3.5" />Create contractor</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
