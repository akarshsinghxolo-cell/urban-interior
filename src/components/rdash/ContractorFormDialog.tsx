"use client";

import * as React from "react";
import { CheckCircle2, Navigation, Pencil, Plus, Search, X } from "lucide-react";
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
import { attachedPreview } from "@/lib/rdash/file-attachments";
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
  normalizeContractorForWrite,
  verifiedContractorBankProof,
  type ContractorCapability,
  type ContractorLifecycleStatus,
  type ContractorProfileRecord,
} from "@/lib/rdash/contractor-profile";
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
  labour_rate: string;
  with_material_rate: string;
  article_ids: string[];
  article_rates: Record<string, { labour_rate: string; with_material_rate: string }>;
};

type Draft = {
  name: string;
  legalName: string;
  phone: string;
  whatsapp: string;
  alternatePhone: string;
  email: string;
  address: string;
  city: string;
  locality: string;
  status: ContractorLifecycleStatus;
  reliability: string;
  politeness: string;
  workerRange: string;
  deadline: string;
  gstin: string;
  pan: string;
  bankAccount: string;
  ifsc: string;
  supervisorName: string;
  supervisorPhone: string;
  availableWorkers: string;
  concurrentSiteLimit: string;
  earliestMobilisationDate: string;
  serviceRadiusKm: string;
  labourRegistrationNo: string;
  insuranceExpiry: string;
  pfNo: string;
  esiNo: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  legalName: "",
  phone: "",
  whatsapp: "",
  alternatePhone: "",
  email: "",
  address: "",
  city: "",
  locality: "",
  status: "onboarding",
  reliability: "average",
  politeness: "moderate",
  workerRange: "1-3",
  deadline: "usual",
  gstin: "",
  pan: "",
  bankAccount: "",
  ifsc: "",
  supervisorName: "",
  supervisorPhone: "",
  availableWorkers: "",
  concurrentSiteLimit: "",
  earliestMobilisationDate: "",
  serviceRadiusKm: "",
  labourRegistrationNo: "",
  insuranceExpiry: "",
  pfNo: "",
  esiNo: "",
  notes: "",
};

const isPending = (value: MediaValue): value is PendingMedia =>
  typeof value === "object" && "uploadItemId" in value;
const isExisting = (value: MediaValue): value is ExistingMedia =>
  typeof value === "object" && "attachment_id" in value;
const attachmentId = (value: MediaValue): string | undefined =>
  isExisting(value) ? value.attachment_id : isPending(value) ? value.attachmentId : undefined;
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
    whatsapp: String(record.whatsapp || ""),
    alternatePhone: String(record.alternate_phone || ""),
    email: String(record.email || ""),
    address: String(record.address || ""),
    city: String(record.city || ""),
    locality: String(record.locality || ""),
    status,
    reliability: String(record.reliability_rating || "average"),
    politeness: String(record.politeness_rating || "moderate"),
    workerRange: String(record.worker_count_range || "1-3"),
    deadline: String(record.deadline_commitment || "usual"),
    gstin: String(record.business_gst || ""),
    pan: String(record.pan || ""),
    bankAccount: String(record.bank_account || ""),
    ifsc: String(record.ifsc || ""),
    supervisorName: String(record.supervisor_name || ""),
    supervisorPhone: String(record.supervisor_phone || ""),
    availableWorkers: record.available_workers == null ? "" : String(record.available_workers),
    concurrentSiteLimit: record.concurrent_site_limit == null ? "" : String(record.concurrent_site_limit),
    earliestMobilisationDate: String(record.earliest_mobilisation_date || ""),
    serviceRadiusKm: record.service_radius_km == null ? "" : String(record.service_radius_km),
    labourRegistrationNo: String(record.labour_registration_no || ""),
    insuranceExpiry: String(record.insurance_expiry || ""),
    pfNo: String(record.pf_no || ""),
    esiNo: String(record.esi_no || ""),
    notes: String(record.notes || ""),
  };
}

function capabilitiesToDraft(capabilities: ContractorCapability[]): CapabilityDraft[] {
  return capabilities.map((row) => ({
    subcategory_id: row.subcategory_id,
    subcategory_name: row.subcategory_name,
    labour_rate: row.labour_rate == null ? "" : String(row.labour_rate),
    with_material_rate: row.with_material_rate == null ? "" : String(row.with_material_rate),
    article_ids: row.article_ids || [],
    article_rates: Object.fromEntries((row.article_rates || []).map((rate) => [
      rate.article_id,
      {
        labour_rate: rate.labour_rate == null ? "" : String(rate.labour_rate),
        with_material_rate: rate.with_material_rate == null ? "" : String(rate.with_material_rate),
      },
    ])),
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
  const allArticles = db.master.articles;
  const articleMap = db.master.subcategoryArticleMap;

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
      whatsapp: draft.whatsapp,
      alternate_phone: draft.alternatePhone,
      email: draft.email,
      address: draft.address,
      city: draft.city,
      locality: draft.locality,
      latitude,
      longitude,
      source_partner_id: sourcePartner?.id,
      source_partner_name: sourcePartner?.name,
      photo_attachment_id: attachmentId(contractorPhoto),
      business_card_attachment_id: attachmentId(businessCard),
      reliability_rating: draft.reliability,
      politeness_rating: draft.politeness,
      worker_count_range: draft.workerRange,
      deadline_commitment: draft.deadline,
      business_gst: draft.gstin,
      pan: draft.pan,
      bank_account: draft.bankAccount,
      ifsc: draft.ifsc,
      status: draft.status,
      work_capabilities: capabilities.map((row) => ({
        subcategory_id: row.subcategory_id,
        subcategory_name: row.subcategory_name,
        labour_rate: row.labour_rate ? Number(row.labour_rate) : undefined,
        with_material_rate: row.with_material_rate ? Number(row.with_material_rate) : undefined,
        article_ids: [...row.article_ids],
        article_rates: row.article_ids.flatMap((articleId) => {
          const rate = row.article_rates[articleId];
          if (!rate || (!rate.labour_rate && !rate.with_material_rate)) return [];
          return [{
            article_id: articleId,
            article_name: allArticles.find((article) => article.id === articleId)?.name,
            labour_rate: rate.labour_rate ? Number(rate.labour_rate) : undefined,
            with_material_rate: rate.with_material_rate ? Number(rate.with_material_rate) : undefined,
          }];
        }),
      })),
      supervisor_name: draft.supervisorName,
      supervisor_phone: draft.supervisorPhone,
      available_workers: optionalNumber(draft.availableWorkers),
      concurrent_site_limit: optionalNumber(draft.concurrentSiteLimit),
      earliest_mobilisation_date: draft.earliestMobilisationDate,
      service_radius_km: optionalNumber(draft.serviceRadiusKm),
      labour_registration_no: draft.labourRegistrationNo,
      insurance_expiry: draft.insuranceExpiry,
      pf_no: draft.pfNo,
      esi_no: draft.esiNo,
      notes: draft.notes,
      // Preserve documents added from Governance while the canonical profile
      // helper synchronizes form-entered PAN, bank, labour, insurance, PF and
      // ESI details into unverified document-register rows.
      compliance_documents: baselineComplianceDocuments,
    };
    return normalizeContractorForWrite(raw, db, { id: raw.id });
  }, [
    allArticles,
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
    referralQuery,
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
    setCapabilities(capabilitiesToDraft(normalized.work_capabilities || []));
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
    setCapabilities(capabilitiesToDraft(baseline.work_capabilities || []));
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
            labour_rate: "",
            with_material_rate: "",
            article_ids: [],
            article_rates: {},
          }],
    );
    setDuplicateAcknowledged(false);
  };

  const updateCapability = (subcategoryId: string, patch: Partial<CapabilityDraft>) =>
    setCapabilities((values) =>
      values.map((value) => value.subcategory_id === subcategoryId ? { ...value, ...patch } : value),
    );

  const toggleCapabilityArticle = (subcategoryId: string, articleId: string) =>
    setCapabilities((values) => values.map((value) => {
      if (value.subcategory_id !== subcategoryId) return value;
      const selected = value.article_ids.includes(articleId);
      if (!selected) return { ...value, article_ids: [...value.article_ids, articleId] };
      const nextRates = { ...value.article_rates };
      delete nextRates[articleId];
      return {
        ...value,
        article_ids: value.article_ids.filter((id) => id !== articleId),
        article_rates: nextRates,
      };
    }));

  const updateCapabilityArticleRate = (
    subcategoryId: string,
    articleId: string,
    field: "labour_rate" | "with_material_rate",
    value: string,
  ) => setCapabilities((values) => values.map((capability) =>
    capability.subcategory_id === subcategoryId
      ? {
          ...capability,
          article_rates: {
            ...capability.article_rates,
            [articleId]: {
              labour_rate: capability.article_rates[articleId]?.labour_rate || "",
              with_material_rate: capability.article_rates[articleId]?.with_material_rate || "",
              [field]: value,
            },
          },
        }
      : capability,
  ));

  const articlesForSubcategory = (subcategoryId: string) =>
    articleMap
      .filter((row) => row.work_required_id === subcategoryId)
      .map((row) => allArticles.find((article) => article.id === row.article_id))
      .filter(Boolean);

  const bankVerified = verifiedContractorBankProof(
    (editId ? db.master.contractors.find((row) => row.id === editId) : undefined) as ContractorProfileRecord || {},
  );

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
      <DialogContent className="max-h-[94vh] max-w-4xl gap-0 p-0">
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
                <Input value={draft.whatsapp} onChange={(event) => set("whatsapp", sanitizeIndianMobile(event.target.value))} placeholder="WhatsApp" inputMode="numeric" />
                <Input value={draft.alternatePhone} onChange={(event) => set("alternatePhone", sanitizeIndianMobile(event.target.value))} placeholder="Alternate phone" inputMode="numeric" />
                <Input value={draft.email} onChange={(event) => set("email", event.target.value)} placeholder="Email" type="email" />
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
              {allCategories.map((category) => (
                <details key={category.id} className="mb-1 rounded border">
                  <summary className="cursor-pointer px-2 py-1 text-xs">{category.name}</summary>
                  <div className="flex flex-wrap gap-1 p-2">
                    {allSubcategories.filter((row) => row.category_id === category.id).map((subcategory) => (
                      <button
                        key={subcategory.id}
                        type="button"
                        aria-pressed={capabilities.some((row) => row.subcategory_id === subcategory.id)}
                        onClick={() => toggleCapability(subcategory.id)}
                        className={cn(
                          "rounded border px-2 py-1 text-[10px]",
                          capabilities.some((row) => row.subcategory_id === subcategory.id) && "border-primary bg-primary text-primary-foreground",
                        )}
                      >{subcategory.name}</button>
                    ))}
                    <div className="w-full">
                      <AddWorkSubcategoryAction categoryId={category.id} />
                    </div>
                  </div>
                </details>
              ))}
              <AddWorkCategoryAction className="mt-2" />
              <div className="mt-2 space-y-2">
                {capabilities.map((capability) => {
                  const articles = articlesForSubcategory(capability.subcategory_id);
                  return (
                    <div key={capability.subcategory_id} className="rounded border p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{capability.subcategory_name}</span>
                        <button type="button" aria-label={`Remove ${capability.subcategory_name}`} onClick={() => toggleCapability(capability.subcategory_id)} className="shrink-0 text-destructive"><X className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                          Default labour rate
                          <Input type="number" min={0} value={capability.labour_rate} onChange={(event) => updateCapability(capability.subcategory_id, { labour_rate: event.target.value })} placeholder="₹ 0" className="h-8 text-xs" />
                        </label>
                        <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                          Default with material
                          <Input type="number" min={0} value={capability.with_material_rate} onChange={(event) => updateCapability(capability.subcategory_id, { with_material_rate: event.target.value })} placeholder="₹ 0" className="h-8 text-xs" />
                        </label>
                      </div>
                      {articles.length ? (
                        <div className="mt-2 overflow-hidden rounded-md border">
                          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-1.5 bg-muted/50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>Material</span><span>Labour ₹</span><span>With material ₹</span>
                          </div>
                          {articles.map((article) => {
                            const selected = capability.article_ids.includes(article!.id);
                            const rate = capability.article_rates[article!.id];
                            return (
                              <div key={article!.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-1.5 border-t px-2 py-1.5 first:border-t-0">
                                <label className="flex min-w-0 items-center gap-1.5 text-[10px]">
                                  <input type="checkbox" checked={selected} onChange={() => toggleCapabilityArticle(capability.subcategory_id, article!.id)} className="h-3.5 w-3.5 shrink-0 accent-primary" />
                                  <span className="truncate" title={article!.name}>{article!.name}</span>
                                </label>
                                <Input type="number" min={0} disabled={!selected} value={rate?.labour_rate || ""} onChange={(event) => updateCapabilityArticleRate(capability.subcategory_id, article!.id, "labour_rate", event.target.value)} placeholder="Default" aria-label={`${article!.name} labour rate`} className="h-7 px-1.5 text-[10px]" />
                                <Input type="number" min={0} disabled={!selected} value={rate?.with_material_rate || ""} onChange={(event) => updateCapabilityArticleRate(capability.subcategory_id, article!.id, "with_material_rate", event.target.value)} placeholder="Default" aria-label={`${article!.name} with material rate`} className="h-7 px-1.5 text-[10px]" />
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tax and banking (optional)</p>
                {bankVerified && <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success"><CheckCircle2 className="h-3 w-3" />Bank proof verified</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={draft.gstin} onChange={(event) => { set("gstin", event.target.value.toUpperCase()); setDuplicateAcknowledged(false); }} placeholder="GSTIN" maxLength={15} />
                <Input value={draft.pan} onChange={(event) => { set("pan", event.target.value.toUpperCase()); setDuplicateAcknowledged(false); }} placeholder="PAN" maxLength={10} />
                <Input value={draft.bankAccount} onChange={(event) => { set("bankAccount", event.target.value.replace(/\D/g, "")); setDuplicateAcknowledged(false); }} placeholder="Bank account number" inputMode="numeric" />
                <Input value={draft.ifsc} onChange={(event) => set("ifsc", event.target.value.toUpperCase())} placeholder="IFSC" maxLength={11} />
              </div>
              <p className="text-[10px] text-muted-foreground">These details are optional reference information.</p>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Capacity and optional records</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Input value={draft.supervisorName} onChange={(event) => set("supervisorName", event.target.value)} placeholder="Supervisor / foreman name" />
                <Input value={draft.supervisorPhone} onChange={(event) => set("supervisorPhone", sanitizeIndianMobile(event.target.value))} placeholder="Supervisor phone" inputMode="numeric" />
                <Input type="number" min={0} value={draft.availableWorkers} onChange={(event) => set("availableWorkers", event.target.value)} placeholder="Workers currently available" />
                <Input type="number" min={0} value={draft.concurrentSiteLimit} onChange={(event) => set("concurrentSiteLimit", event.target.value)} placeholder="Concurrent site limit" />
                <Input type="date" value={draft.earliestMobilisationDate} onChange={(event) => set("earliestMobilisationDate", event.target.value)} title="Earliest mobilisation date" />
                <Input type="number" min={0} value={draft.serviceRadiusKm} onChange={(event) => set("serviceRadiusKm", event.target.value)} placeholder="Service radius (km)" />
                <Input value={draft.labourRegistrationNo} onChange={(event) => set("labourRegistrationNo", event.target.value)} placeholder="Labour registration number (optional)" />
                <Input type="date" value={draft.insuranceExpiry} onChange={(event) => set("insuranceExpiry", event.target.value)} title="Insurance expiry (optional)" />
                <Input value={draft.pfNo} onChange={(event) => set("pfNo", event.target.value)} placeholder="PF number" />
                <Input value={draft.esiNo} onChange={(event) => set("esiNo", event.target.value)} placeholder="ESI number" />
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
