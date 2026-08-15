"use client";

import * as React from "react";
import { Navigation, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { attachedPreview } from "@/lib/rdash/file-attachments";
import { reverseGeocodeWithNominatim } from "@/lib/rdash/location-search";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
import {
  canonicalVendorCapabilities,
  normalizeVendorForWrite,
  vendorDuplicateConflicts,
  vendorProfileValidationError,
  type VendorAvailability,
  type VendorProfileRecord,
  type VendorSupplyCapability,
  type VendorType,
} from "@/lib/rdash/vendor-profile";
import {
  deriveVendorCapabilityTaxonomySelection,
  vendorArticleTaxonomyLabels,
  vendorArticlesForTaxonomy,
} from "@/lib/rdash/vendor-capability-taxonomy";
import { FilePreview } from "./FilePreview";

export type VendorFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
};

type PendingMedia = QueuedWorkflowFile & { url: string; file_name: string; mime_type: string };
type ExistingMedia = { attachment_id: string };
type MediaValue = "" | PendingMedia | ExistingMedia;
type CapabilityDraft = {
  article_id: string;
  variant_ids: string[];
  brand: string;
  availability: VendorAvailability;
  typical_lead_time_days: string;
  moq: string;
  preferred: boolean;
  notes: string;
};
type Draft = {
  name: string;
  legalName: string;
  phone: string;
  whatsapp: string;
  alternatePhone: string;
  email: string;
  gstin: string;
  vendorType: VendorType;
  status: "onboarding" | "active" | "on_hold" | "blacklisted" | "inactive";
  address: string;
  city: string;
  locality: string;
  reliability: "good" | "very_good" | "average" | "bad";
  delivery: "good" | "very_good" | "average" | "bad";
  returnPolicy: "available" | "not_available";
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "", legalName: "", phone: "", whatsapp: "", alternatePhone: "", email: "", gstin: "",
  vendorType: "dealer", status: "onboarding", address: "", city: "", locality: "",
  reliability: "average", delivery: "average", returnPolicy: "available", notes: "",
};
const isPending = (value: MediaValue): value is PendingMedia => typeof value === "object" && value != null && "uploadItemId" in value;
const isExisting = (value: MediaValue): value is ExistingMedia => typeof value === "object" && value != null && "attachment_id" in value;
const attachmentId = (value: MediaValue) => isExisting(value) ? value.attachment_id : isPending(value) ? value.attachmentId : undefined;
const optionalNumber = (value: string) => value.trim() === "" ? undefined : Number(value);

function fingerprint(value: VendorProfileRecord) {
  const { created_at: _createdAt, updated_at: _updatedAt, ...stable } = value;
  return JSON.stringify(stable);
}
function mediaFile(value: MediaValue, db: any) {
  if (isExisting(value)) return attachedPreview(db, value.attachment_id);
  if (isPending(value)) return { fileName: value.file_name, mimeType: value.mime_type, url: value.url };
  return undefined;
}
function draftFromRecord(record: VendorProfileRecord): Draft {
  return {
    name: String(record.name || ""),
    legalName: String(record.legal_name || ""),
    phone: String(record.phone || ""),
    whatsapp: String(record.whatsapp || ""),
    alternatePhone: String(record.alternate_phone || ""),
    email: String(record.email || ""),
    gstin: String(record.gstin || ""),
    vendorType: (record.vendor_type || "dealer") as VendorType,
    status: (record.status || "onboarding") as Draft["status"],
    address: String(record.address || ""),
    city: String(record.city || ""),
    locality: String(record.locality || ""),
    reliability: (record.reliability_rating || "average") as Draft["reliability"],
    delivery: (record.delivery_time_rating || "average") as Draft["delivery"],
    returnPolicy: (record.return_policy || "available") as Draft["returnPolicy"],
    notes: String(record.notes || ""),
  };
}
function capabilityDrafts(rows: VendorSupplyCapability[]): CapabilityDraft[] {
  return rows.map((row) => ({
    article_id: row.article_id,
    variant_ids: row.variant_ids || [],
    brand: row.brand || "",
    availability: row.availability || "unknown",
    typical_lead_time_days: row.typical_lead_time_days == null ? "" : String(row.typical_lead_time_days),
    moq: row.moq == null ? "" : String(row.moq),
    preferred: Boolean(row.preferred),
    notes: row.notes || "",
  }));
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="space-y-1.5 text-xs font-semibold text-foreground"><span>{label}</span>{children}{hint && <span className="block text-[10px] font-normal text-muted-foreground">{hint}</span>}</label>;
}

export function VendorFormDialog({ open, onClose, onSaved, editId }: VendorFormDialogProps) {
  const db = useRDashStore((state) => state.db);
  const mutateMaster = useRDashStore((state) => state.mutateMaster);
  const logAudit = useRDashStore((state) => state.logAudit);
  const currentUser = useRDashStore((state) => state.currentUser);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const [reservedId, setReservedId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [latitude, setLatitude] = React.useState<number>();
  const [longitude, setLongitude] = React.useState<number>();
  const [coordinates, setCoordinates] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [businessCard, setBusinessCard] = React.useState<MediaValue>("");
  const [shopPhoto, setShopPhoto] = React.useState<MediaValue>("");
  const [capabilities, setCapabilities] = React.useState<CapabilityDraft[]>([]);
  const [articleQuery, setArticleQuery] = React.useState("");
  const [taxonomyCategoryIds, setTaxonomyCategoryIds] = React.useState<string[]>([]);
  const [taxonomySubcategoryIds, setTaxonomySubcategoryIds] = React.useState<string[]>([]);
  const [softDuplicateAcknowledged, setSoftDuplicateAcknowledged] = React.useState(false);
  const baselineRef = React.useRef<VendorProfileRecord>({});
  const [baselineMetadata, setBaselineMetadata] = React.useState<Pick<VendorProfileRecord, "source_partner_id" | "source_partner_name" | "created_at">>({});
  const [baselineKey, setBaselineKey] = React.useState("");
  const disposedRef = React.useRef(false);
  const formId = `vendor-form:${editId || "new"}`;
  const { registerBatch, commitBatches } = useUploadDraft(open);

  React.useEffect(() => () => { disposedRef.current = true; }, []);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const currentPayload = React.useMemo((): VendorProfileRecord => normalizeVendorForWrite({
    id: editId || reservedId || undefined,
    name: draft.name,
    legal_name: draft.legalName,
    phone: draft.phone,
    whatsapp: draft.whatsapp,
    alternate_phone: draft.alternatePhone,
    email: draft.email,
    gstin: draft.gstin,
    vendor_type: draft.vendorType,
    status: draft.status,
    address: draft.address,
    city: draft.city,
    locality: draft.locality,
    latitude,
    longitude,
    business_card_attachment_id: attachmentId(businessCard),
    shop_attachment_id: attachmentId(shopPhoto),
    reliability_rating: draft.reliability,
    delivery_time_rating: draft.delivery,
    return_policy: draft.returnPolicy,
    notes: draft.notes,
    source_partner_id: baselineMetadata.source_partner_id,
    source_partner_name: baselineMetadata.source_partner_name,
    supply_capabilities: capabilities.map((row) => ({
      article_id: row.article_id,
      variant_ids: row.variant_ids,
      brand: row.brand,
      availability: row.availability,
      typical_lead_time_days: optionalNumber(row.typical_lead_time_days),
      moq: optionalNumber(row.moq),
      preferred: row.preferred,
      notes: row.notes,
      status: "active",
    })),
    created_at: baselineMetadata.created_at,
  }, db, { id: editId || reservedId || undefined }), [baselineMetadata, businessCard, capabilities, db, draft, editId, latitude, longitude, reservedId, shopPhoto]);

  React.useEffect(() => {
    if (!open) return;
    const id = editId || reserveEntityId("vendor");
    setReservedId(id);
    const record = editId ? db.master.vendors.find((row) => row.id === editId) as VendorProfileRecord | undefined : undefined;
    const normalized = normalizeVendorForWrite(record || { id, name: "", vendor_type: "dealer", status: "onboarding", supply_capabilities: [] }, db, { id });
    setDraft(draftFromRecord(normalized));
    setLatitude(normalized.latitude);
    setLongitude(normalized.longitude);
    setCoordinates(formatCoordinatePair(normalized as any));
    setBusinessCard(normalized.business_card_attachment_id ? { attachment_id: String(normalized.business_card_attachment_id) } : "");
    setShopPhoto(normalized.shop_attachment_id ? { attachment_id: String(normalized.shop_attachment_id) } : "");
    const capabilityRows = canonicalVendorCapabilities(normalized, db);
    const taxonomySelection = deriveVendorCapabilityTaxonomySelection(db.master, capabilityRows.map((row) => row.article_id));
    setCapabilities(capabilityDrafts(capabilityRows));
    setTaxonomyCategoryIds(taxonomySelection.categoryIds);
    setTaxonomySubcategoryIds(taxonomySelection.subcategoryIds);
    setArticleQuery("");
    setSoftDuplicateAcknowledged(false);
    baselineRef.current = normalized;
    setBaselineMetadata({
      source_partner_id: normalized.source_partner_id,
      source_partner_name: normalized.source_partner_name,
      created_at: normalized.created_at,
    });
    setBaselineKey(fingerprint(normalized));
    // Background sync must not reset an in-progress Vendor draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const dirty = open && fingerprint(currentPayload) !== baselineKey;
  const duplicateConflicts = vendorDuplicateConflicts(db, currentPayload, editId);
  const hardDuplicate = duplicateConflicts.find((row) => row.hard);
  const softDuplicate = duplicateConflicts.find((row) => !row.hard);
  const validationError = vendorProfileValidationError(currentPayload)
    || coordinateInputError(coordinates)
    || (hardDuplicate ? `Duplicate Vendor blocked: ${hardDuplicate.name} has ${hardDuplicate.reasons.join(", ")}.` : null)
    || (softDuplicate && !softDuplicateAcknowledged ? `Review possible duplicate ${softDuplicate.name} before saving.` : null);

  async function discard(): Promise<boolean> {
    await Promise.all([businessCard, shopPhoto].filter(isPending).map((value) => cancelQueuedWorkflowFile(value)));
    const baseline = baselineRef.current;
    setDraft(draftFromRecord(baseline));
    setLatitude(baseline.latitude);
    setLongitude(baseline.longitude);
    setCoordinates(formatCoordinatePair(baseline as any));
    setBusinessCard(baseline.business_card_attachment_id ? { attachment_id: String(baseline.business_card_attachment_id) } : "");
    setShopPhoto(baseline.shop_attachment_id ? { attachment_id: String(baseline.shop_attachment_id) } : "");
    const capabilityRows = canonicalVendorCapabilities(baseline, db);
    const taxonomySelection = deriveVendorCapabilityTaxonomySelection(db.master, capabilityRows.map((row) => row.article_id));
    setCapabilities(capabilityDrafts(capabilityRows));
    setTaxonomyCategoryIds(taxonomySelection.categoryIds);
    setTaxonomySubcategoryIds(taxonomySelection.subcategoryIds);
    setArticleQuery("");
    setSoftDuplicateAcknowledged(false);
    return true;
  }

  async function save(): Promise<boolean> {
    if (saving) return false;
    if (validationError) { toast.error(validationError); return false; }
    if (editId && !dirty) return true;
    setSaving(true);
    try {
      const id = editId || reservedId;
      const timestamp = new Date().toISOString();
      const before = editId ? baselineRef.current : undefined;
      const record: VendorProfileRecord = {
        ...currentPayload,
        id,
        created_at: before?.created_at || timestamp,
        updated_at: timestamp,
      };
      mutateMaster((master) => ({
        ...master,
        vendors: editId
          ? master.vendors.map((vendor) => vendor.id === id ? record as any : vendor)
          : [record as any, ...master.vendors],
      }));
      const actor = currentUser();
      logAudit({
        actor: actor.name,
        actor_role: actor.role,
        action: `${editId ? "Updated" : "Created"} Vendor \"${record.name || id}\"`,
        entity_type: "vendor",
        entity_id: id,
        entity_label: record.name || id,
        kind: editId ? "update" : "create",
        source_module: "vendorPerformance",
        before,
        after: record,
      });
      await awaitServerSync();
      commitBatches();
      baselineRef.current = record;
      setBaselineMetadata({
        source_partner_id: record.source_partner_id,
        source_partner_name: record.source_partner_name,
        created_at: record.created_at,
      });
      setBaselineKey(fingerprint(record));
      dirtyFormRegistry.markClean(formId);
      toast.success(`Vendor ${editId ? "updated" : "created"}`, { description: "The single canonical Vendor profile was confirmed by the workspace server." });
      onSaved?.(id);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vendor could not be saved.");
      return false;
    } finally { setSaving(false); }
  }

  useDirtyFormRegistration({ id: formId, label: `${editId ? "Edit" : "Add"} Vendor`, dirty, save, discard });
  function requestClose() { dirtyFormRegistry.requestNavigation(onClose, { reason: "close this Vendor form" }); }
  function updateCoordinates(value: string) {
    setCoordinates(value);
    if (!value.trim()) { setLatitude(undefined); setLongitude(undefined); return; }
    const parsed = parseCoordinatePair(value);
    if (parsed) { setLatitude(parsed.latitude); setLongitude(parsed.longitude); setCoordinates(formatCoordinatePair(parsed)); }
  }
  async function captureGps() {
    setGpsLoading(true);
    try {
      const capture = await captureDeviceGps({ mode: "master-location" });
      if (disposedRef.current) return;
      const next = { latitude: capture.latitude, longitude: capture.longitude };
      setLatitude(next.latitude); setLongitude(next.longitude); setCoordinates(formatCoordinatePair(next));
      toast.success(`GPS captured · ±${Math.round(capture.accuracy_m)} m`);
      void reverseGeocodeWithNominatim(next.latitude, next.longitude).then((result) => {
        if (!result?.display_name || disposedRef.current) return;
        set("address", result.display_name);
        set("city", result.address?.city || result.address?.town || result.address?.village || "");
        set("locality", result.address?.suburb || result.address?.neighbourhood || "");
      });
    } catch (error) { if (!disposedRef.current) toast.error(`GPS error: ${deviceGpsErrorMessage(error)}`); }
    finally { if (!disposedRef.current) setGpsLoading(false); }
  }
  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>, setter: (value: MediaValue) => void, attachmentField: string, caption: string) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !reservedId) return;
    try {
      const queued = await enqueueWorkflowFiles({
        sourceFlow: "vendor_form",
                deferProcessing: true,
        sourceLabel: "Vendor form",
        targetEntityType: "vendor",
        targetEntityId: reservedId,
        targetLabel: draft.name.trim() || "New Vendor",
        purpose: "vendor_document",
        files: [{ file, ...classifyWorkflowFile(file), caption, attachmentField, attachmentFieldMode: "set" }],
      });
      registerBatch(queued.batchId);
      const preview = withLocalPreview(queued.files[0], file);
      setter({ ...preview, url: preview.previewUrl, file_name: file.name, mime_type: file.type || "application/octet-stream" });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not queue the file."); }
  }
  async function removeMedia(value: MediaValue, setter: (value: MediaValue) => void) {
    if (isPending(value)) await cancelQueuedWorkflowFile(value);
    setter("");
  }
  function addCapability(articleId: string) {
    if (capabilities.some((row) => row.article_id === articleId)) return;
    setCapabilities((current) => [...current, { article_id: articleId, variant_ids: [], brand: "", availability: "unknown", typical_lead_time_days: "", moq: "", preferred: false, notes: "" }]);
    setArticleQuery("");
  }
  function updateCapability(index: number, patch: Partial<CapabilityDraft>) {
    setCapabilities((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function toggleTaxonomyCategory(categoryId: string) {
    const removing = taxonomyCategoryIds.includes(categoryId);
    if (removing) {
      const childSubcategoryIds = new Set(
        db.master.workSubcategories.filter((row) => row.category_id === categoryId).map((row) => row.id),
      );
      setTaxonomySubcategoryIds((selected) => selected.filter((id) => !childSubcategoryIds.has(id)));
    }
    setTaxonomyCategoryIds((current) => removing
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
    setArticleQuery("");
  }

  function toggleTaxonomySubcategory(categoryId: string, subcategoryId: string) {
    setTaxonomyCategoryIds((current) => current.includes(categoryId) ? current : [...current, categoryId]);
    setTaxonomySubcategoryIds((current) => current.includes(subcategoryId)
      ? current.filter((id) => id !== subcategoryId)
      : [...current, subcategoryId]);
    setArticleQuery("");
  }

  const filteredArticles = React.useMemo(() => {
    return vendorArticlesForTaxonomy(db.master, {
      selectedCategoryIds: taxonomyCategoryIds,
      selectedSubcategoryIds: taxonomySubcategoryIds,
      excludedArticleIds: capabilities.map((row) => row.article_id),
      query: articleQuery,
      limit: 8,
    });
  }, [articleQuery, capabilities, db.master, taxonomyCategoryIds, taxonomySubcategoryIds]);
  const businessFile = mediaFile(businessCard, db);
  const shopFile = mediaFile(shopPhoto, db);

  return <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{editId ? "Edit Vendor" : "Add Vendor"}</DialogTitle><DialogDescription>One canonical Vendor profile for identity, location, GST and supply capability. PAN, banking, payment/credit terms, warranty, Udyam and bank verification are intentionally excluded.</DialogDescription></DialogHeader><div className="space-y-5">
    <section className="rounded-xl border border-border bg-muted/10 p-4"><h3 className="text-sm font-bold">Identity & contact</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Legal / registered name"><Input value={draft.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field><Field label="Vendor type"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.vendorType} onChange={(e) => set("vendorType", e.target.value as VendorType)}><option value="manufacturer">Manufacturer</option><option value="distributor">Distributor</option><option value="dealer">Dealer</option><option value="retailer">Retailer</option><option value="service_provider">Service provider</option><option value="other">Other</option></select></Field><Field label="Lifecycle"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={(e) => set("status", e.target.value as Draft["status"])}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="blacklisted">Blacklisted</option><option value="inactive">Inactive</option></select></Field><Field label="Mobile"><Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></Field><Field label="WhatsApp"><Input value={draft.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Field><Field label="Alternate mobile"><Input value={draft.alternatePhone} onChange={(e) => set("alternatePhone", e.target.value)} /></Field><Field label="Email"><Input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></Field><Field label="GSTIN"><Input value={draft.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /></Field></div></section>

    <section className="rounded-xl border border-border bg-muted/10 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Location</h3><p className="text-[10px] text-muted-foreground">Fresh master-location GPS also reverse-geocodes full address, city and locality.</p></div><Button type="button" size="sm" variant="outline" disabled={gpsLoading} onClick={() => void captureGps()}><Navigation className="mr-1.5 h-3.5 w-3.5" />{gpsLoading ? "Capturing…" : "Capture GPS"}</Button></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="City"><Input value={draft.city} onChange={(e) => set("city", e.target.value)} /></Field><Field label="Locality"><Input value={draft.locality} onChange={(e) => set("locality", e.target.value)} /></Field><Field label="Coordinates"><Input value={coordinates} onChange={(e) => updateCoordinates(e.target.value)} placeholder="26.8467, 80.9462" /></Field><div className="sm:col-span-3"><Field label="Full address"><Textarea rows={2} value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field></div></div></section>

    <section className="rounded-xl border border-border bg-muted/10 p-4">
      <div>
        <h3 className="text-sm font-bold">Supply capability</h3>
        <p className="text-[10px] text-muted-foreground">Category → Subcategory → Article → optional Variants → brand → availability / lead time / MOQ.</p>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-background p-3">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Supply categories</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Choose broad Categories, then the specific Subcategories this Vendor supplies.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {db.master.workCategories.map((category) => {
            const selected = taxonomyCategoryIds.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTaxonomyCategory(category.id)}
                className={cn("rounded-md border px-2 py-1 text-[11px]", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}
              >
                {category.name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 space-y-1">
          {db.master.workCategories.filter((category) => taxonomyCategoryIds.includes(category.id)).map((category) => {
            const subcategories = db.master.workSubcategories.filter((subcategory) => subcategory.category_id === category.id);
            return (
              <details key={category.id} className="rounded-md border border-border bg-muted/10">
                <summary className="cursor-pointer px-2.5 py-1 text-xs font-medium">Specific {category.name} supply</summary>
                <div className="flex flex-wrap gap-1 p-2">
                  {subcategories.map((subcategory) => {
                    const selected = taxonomySubcategoryIds.includes(subcategory.id);
                    return (
                      <button
                        key={subcategory.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTaxonomySubcategory(category.id, subcategory.id)}
                        className={cn("rounded-md border px-2 py-0.5 text-[10px]", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}
                      >
                        {subcategory.name}
                      </button>
                    );
                  })}
                  {!subcategories.length && <span className="text-[10px] text-muted-foreground">No Subcategories are configured for this Category.</span>}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div className="relative mt-3 w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          value={articleQuery}
          onChange={(event) => setArticleQuery(event.target.value)}
          placeholder={taxonomySubcategoryIds.length ? "Search Article to add" : "Select a Category and Subcategory first"}
          disabled={!taxonomySubcategoryIds.length}
        />
        {filteredArticles.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover p-1 shadow-lg">
            {filteredArticles.map((article) => {
              const taxonomy = vendorArticleTaxonomyLabels(db.master, article.id);
              return (
                <button key={article.id} type="button" onClick={() => addCapability(article.id)} className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted">
                  <span className="min-w-0"><span className="block truncate text-xs font-medium">{article.name}</span><span className="block truncate text-[10px] text-muted-foreground">{taxonomy.categoryName}{taxonomy.subcategoryNames.length ? ` → ${taxonomy.subcategoryNames.join(", ")}` : ""}</span></span>
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
        {taxonomySubcategoryIds.length > 0 && articleQuery.trim() && filteredArticles.length === 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">No unselected Articles linked to the chosen Subcategories match this search.</p>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {capabilities.map((row, index) => {
          const article = db.master.articles.find((item) => item.id === row.article_id);
          const taxonomy = vendorArticleTaxonomyLabels(db.master, row.article_id);
          const variants = db.master.articleVariants.filter((variant) => variant.article_id === row.article_id && variant.enabled !== false);
          return (
            <div key={row.article_id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-bold">{article?.name || row.article_id}</p><p className="text-[10px] text-muted-foreground">{taxonomy.categoryName}{taxonomy.subcategoryNames.length ? ` → ${taxonomy.subcategoryNames.join(", ")}` : ""}</p></div>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setCapabilities((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="Brand"><Input value={row.brand} onChange={(event) => updateCapability(index, { brand: event.target.value })} /></Field>
                <Field label="Availability"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={row.availability} onChange={(event) => updateCapability(index, { availability: event.target.value as VendorAvailability })}><option value="unknown">Unknown</option><option value="in_stock">In stock</option><option value="limited">Limited</option><option value="on_order">On order</option></select></Field>
                <Field label="Typical lead days"><Input type="number" min="0" value={row.typical_lead_time_days} onChange={(event) => updateCapability(index, { typical_lead_time_days: event.target.value })} /></Field>
                <Field label="MOQ"><Input type="number" min="0" value={row.moq} onChange={(event) => updateCapability(index, { moq: event.target.value })} /></Field>
                <label className="flex h-9 items-center gap-2 self-end rounded-md border border-input px-3 text-xs"><input type="checkbox" checked={row.preferred} onChange={(event) => updateCapability(index, { preferred: event.target.checked })} /><Star className={cn("h-3.5 w-3.5", row.preferred && "fill-warning text-warning")} />Preferred</label>
              </div>
              {variants.length > 0 && <div className="mt-3"><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variants supplied</p><div className="flex flex-wrap gap-1.5">{variants.map((variant) => { const active = row.variant_ids.includes(variant.id); return <button key={variant.id} type="button" onClick={() => updateCapability(index, { variant_ids: active ? row.variant_ids.filter((id) => id !== variant.id) : [...row.variant_ids, variant.id] })} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium", active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{variant.name}</button>; })}</div></div>}
              <div className="mt-3"><Field label="Capability notes"><Input value={row.notes} onChange={(event) => updateCapability(index, { notes: event.target.value })} /></Field></div>
            </div>
          );
        })}
        {!capabilities.length && <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">No supplied Articles added.</div>}
      </div>
    </section>

    <section className="rounded-xl border border-border bg-muted/10 p-4"><h3 className="text-sm font-bold">Relationship quality</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Reliability"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.reliability} onChange={(e) => set("reliability", e.target.value as Draft["reliability"])}><option value="very_good">Very good</option><option value="good">Good</option><option value="average">Average</option><option value="bad">Bad</option></select></Field><Field label="Delivery behaviour"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.delivery} onChange={(e) => set("delivery", e.target.value as Draft["delivery"])}><option value="very_good">Very good</option><option value="good">Good</option><option value="average">Average</option><option value="bad">Bad</option></select></Field><Field label="Return policy"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.returnPolicy} onChange={(e) => set("returnPolicy", e.target.value as Draft["returnPolicy"])}><option value="available">Available</option><option value="not_available">Not available</option></select></Field></div><div className="mt-3"><Field label="Notes"><Textarea rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div></section>

    <section className="rounded-xl border border-border bg-muted/10 p-4"><h3 className="text-sm font-bold">Profile media</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-border bg-background p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Business card</p>{businessCard && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void removeMedia(businessCard, setBusinessCard)}><X className="h-3.5 w-3.5" /></Button>}</div>{businessFile ? <div className="mt-2"><FilePreview file={businessFile} compact /></div> : <label className="mt-2 flex cursor-pointer justify-center rounded-md border border-dashed border-border px-3 py-6 text-xs text-muted-foreground"><input type="file" accept={MANAGED_FILE_ACCEPT} className="hidden" onChange={(e) => void uploadMedia(e, setBusinessCard, "business_card_attachment_id", "Vendor business card")} />Upload business card</label>}</div><div className="rounded-lg border border-border bg-background p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Shop / warehouse</p>{shopPhoto && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void removeMedia(shopPhoto, setShopPhoto)}><X className="h-3.5 w-3.5" /></Button>}</div>{shopFile ? <div className="mt-2"><FilePreview file={shopFile} compact /></div> : <label className="mt-2 flex cursor-pointer justify-center rounded-md border border-dashed border-border px-3 py-6 text-xs text-muted-foreground"><input type="file" accept={MANAGED_FILE_ACCEPT} className="hidden" onChange={(e) => void uploadMedia(e, setShopPhoto, "shop_attachment_id", "Vendor shop or warehouse")} />Upload shop / warehouse photo</label>}</div></div></section>

    {duplicateConflicts.length > 0 && <section className={cn("rounded-xl border p-4", hardDuplicate ? "border-destructive/30 bg-destructive/[0.04]" : "border-warning/30 bg-warning/[0.04]")}><h3 className="text-sm font-bold">Duplicate check</h3><div className="mt-2 space-y-1 text-xs text-muted-foreground">{duplicateConflicts.slice(0, 3).map((conflict) => <p key={conflict.id}>• <strong>{conflict.name}</strong>: {conflict.reasons.join(", ")}</p>)}</div>{softDuplicate && !hardDuplicate && <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={softDuplicateAcknowledged} onChange={(e) => setSoftDuplicateAcknowledged(e.target.checked)} />I reviewed this possible duplicate and still want to save this Vendor.</label>}</section>}
  </div><DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={requestClose}>Cancel</Button><Button type="button" disabled={saving || Boolean(validationError) || (Boolean(editId) && !dirty)} onClick={() => void save()}>{saving ? "Saving…" : editId ? "Save Vendor" : "Create Vendor"}</Button></DialogFooter></DialogContent></Dialog>;
}

