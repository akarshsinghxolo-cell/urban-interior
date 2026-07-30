"use client";

import * as React from "react";
import { Building2, Camera, ChevronDown, ChevronUp, MapPin, Navigation, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapView } from "@/components/rdash/MapView";
import { FilePreview } from "./FilePreview";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Customer, CustomerSegment, RDashDatabase, Site } from "@/lib/rdash/types";
import type { CustomerSiteSaveDraft } from "@/lib/rdash/customer-sites-save";
import { findCustomerIdentityMatches } from "@/lib/rdash/customer-identity";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { reverseGeocodeWithNominatim, searchAddressWithNominatim } from "@/lib/rdash/location-search";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { assetPreview, entityFiles } from "@/lib/rdash/file-attachments";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId, type UploadBatchId } from "@/lib/uploads/upload-types";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";

type PendingSiteFile = QueuedWorkflowFile & {
  id: string;
  file_name: string;
  mime_type?: string;
  url: string;
};

type SiteDraft = {
  id: string;
  existing: boolean;
  enabled: boolean;
  expanded: boolean;
  name: string;
  buildingName: string;
  siteType: Site["site_type"];
  stage: Site["stage"];
  address: string;
  locality: string;
  city: string;
  latitude?: number;
  longitude?: number;
  mapUrl: string;
  notes: string;
  photoAttachmentIds: string[];
  pendingPhotos: PendingSiteFile[];
};

type CustomerDraft = {
  name: string;
  phone: string;
  whatsapp: string;
  alternatePhone: string;
  email: string;
  status: Customer["status"];
  notes: string;
  interestCategoryIds: string[];
  interestSubcategoryIds: string[];
  segments: CustomerSegment[];
  referralQuery: string;
  referralSelected: { id?: string; name: string } | null;
};

const SITE_TYPES: Array<{ value: Site["site_type"]; label: string }> = [
  { value: "apartment", label: "Apartment" },
  { value: "office", label: "Office" },
  { value: "villa", label: "Villa" },
  { value: "shop", label: "Shop" },
  { value: "showroom", label: "Showroom" },
  { value: "other", label: "Other" },
];

const CUSTOMER_SEGMENTS: Array<[CustomerSegment, string]> = [
  ["walk_in", "Walk-in"],
  ["service_customer", "Service customer"],
  ["product_buyer", "Product buyer"],
  ["repeat_customer", "Repeat customer"],
  ["trade_customer", "Trade customer"],
];

function emptyCustomerDraft(): CustomerDraft {
  return {
    name: "",
    phone: "",
    whatsapp: "",
    alternatePhone: "",
    email: "",
    status: "active",
    notes: "",
    interestCategoryIds: [],
    interestSubcategoryIds: [],
    segments: ["service_customer"],
    referralQuery: "",
    referralSelected: null,
  };
}

function draftForCustomer(customer: Customer): CustomerDraft {
  return {
    name: customer.name || "",
    phone: customer.phone || "",
    whatsapp: customer.whatsapp || customer.phone || "",
    alternatePhone: customer.alternate_phone || "",
    email: customer.email || "",
    status: customer.status || "active",
    notes: customer.notes || "",
    interestCategoryIds: customer.interest_category_ids || [],
    interestSubcategoryIds: customer.interest_work_subcategory_ids || [],
    segments: customer.customer_segments?.length ? customer.customer_segments : ["service_customer"],
    referralQuery: customer.source_partner_name || "",
    referralSelected: customer.source_partner_id
      ? { id: customer.source_partner_id, name: customer.source_partner_name || "" }
      : null,
  };
}

function newSiteDraft(enabled = true): SiteDraft {
  return {
    id: reserveEntityId("site"),
    existing: false,
    enabled,
    expanded: true,
    name: "",
    buildingName: "",
    siteType: "apartment",
    stage: "enquiry",
    address: "",
    locality: "",
    city: "",
    latitude: undefined,
    longitude: undefined,
    mapUrl: "",
    notes: "",
    photoAttachmentIds: [],
    pendingPhotos: [],
  };
}

function draftForSite(site: Site): SiteDraft {
  return {
    id: site.id,
    existing: true,
    enabled: true,
    expanded: false,
    name: site.name || "",
    buildingName: site.building_name || "",
    siteType: site.site_type || "other",
    stage: site.stage || "enquiry",
    address: site.address || "",
    locality: site.locality || "",
    city: site.city || "",
    latitude: site.latitude,
    longitude: site.longitude,
    mapUrl: site.map_url || "",
    notes: site.notes || "",
    photoAttachmentIds: site.photo_attachment_ids || [],
    pendingPhotos: [],
  };
}

function fingerprint(customer: CustomerDraft, sites: SiteDraft[], detachAttachmentIds: string[]): string {
  return JSON.stringify({
    customer: {
      ...customer,
      referralSelected: customer.referralSelected,
    },
    sites: sites.map(({ pendingPhotos, ...site }) => ({
      ...site,
      pendingPhotoIds: pendingPhotos.map((photo) => photo.attachmentId),
    })),
    detachAttachmentIds: [...detachAttachmentIds].sort(),
  });
}

function validIndianPhone(value: string): boolean {
  return !value || (/^[6-9]\d{9}$/.test(value));
}

function customerPayload(draft: CustomerDraft): Partial<Customer> {
  const referralName = draft.referralSelected?.name || draft.referralQuery.trim() || undefined;
  return {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    whatsapp: draft.whatsapp.trim() || draft.phone.trim(),
    alternate_phone: draft.alternatePhone.trim() || undefined,
    email: draft.email.trim() || undefined,
    status: draft.status,
    customer_segments: draft.segments,
    interest_category_ids: draft.interestCategoryIds,
    interest_work_subcategory_ids: draft.interestSubcategoryIds,
    source_partner_id: draft.referralSelected?.id,
    source_partner_name: referralName,
    notes: draft.notes.trim() || undefined,
  };
}

function sitePayload(draft: SiteDraft): CustomerSiteSaveDraft {
  return {
    id: draft.id,
    name: draft.name.trim(),
    building_name: draft.buildingName.trim() || undefined,
    site_type: draft.siteType,
    stage: draft.stage,
    address: draft.address.trim() || undefined,
    locality: draft.locality.trim() || undefined,
    city: draft.city.trim() || undefined,
    latitude: draft.latitude,
    longitude: draft.longitude,
    map_url: draft.mapUrl.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    photo_attachment_ids: [...new Set([
      ...draft.photoAttachmentIds,
      ...draft.pendingPhotos.map((photo) => photo.attachmentId),
    ])],
  };
}

export function CustomerSitesDialog({
  open,
  onClose,
  editId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editId?: string;
  onSaved?: (customerId: string) => void;
}) {
  const db = useRDashStore((state) => state.db);
  const saveCustomerWithSites = useRDashStore((state) => state.saveCustomerWithSites);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const isEdit = Boolean(editId);
  const [saving, setSaving] = React.useState(false);
  const [customer, setCustomer] = React.useState<CustomerDraft>(() => emptyCustomerDraft());
  const [sites, setSites] = React.useState<SiteDraft[]>(() => [newSiteDraft(true)]);
  const [detachAttachmentIds, setDetachAttachmentIds] = React.useState<string[]>([]);
  const [baseline, setBaseline] = React.useState("");
  const [showReferralDropdown, setShowReferralDropdown] = React.useState(false);
  const { registerBatch, commitBatches } = useUploadDraft(open);
  const formId = `customer-sites:${editId || "new"}`;
  const initializedKeyRef = React.useRef<string | null>(null);

  const initialise = React.useCallback(() => {
    const existing = editId ? db.customers.find((row) => row.id === editId) : undefined;
    const nextCustomer = existing ? draftForCustomer(existing) : emptyCustomerDraft();
    const existingSites = existing
      ? db.sites.filter((site) => site.customer_id === existing.id && !site.is_archived).map(draftForSite)
      : [newSiteDraft(true)];
    const nextSites = existingSites.length ? existingSites : [newSiteDraft(false)];
    setCustomer(nextCustomer);
    setSites(nextSites);
    setDetachAttachmentIds([]);
    setShowReferralDropdown(false);
    setBaseline(fingerprint(nextCustomer, nextSites, []));
    dirtyFormRegistry.markClean(formId);
  }, [db.customers, db.sites, editId, formId]);

  React.useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
      return;
    }
    const key = editId || "new";
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;
    initialise();
  }, [editId, initialise, open]);

  const currentFingerprint = React.useMemo(
    () => fingerprint(customer, sites, detachAttachmentIds),
    [customer, sites, detachAttachmentIds],
  );
  const dirty = open && currentFingerprint !== baseline;

  const updateSite = React.useCallback((siteId: string, patch: Partial<SiteDraft>) => {
    setSites((current) => current.map((site) => site.id === siteId ? { ...site, ...patch } : site));
  }, []);

  const removeNewSite = React.useCallback(async (siteId: string) => {
    const site = sites.find((row) => row.id === siteId);
    if (!site || site.existing) return;
    await Promise.all(site.pendingPhotos.map((photo) => cancelQueuedWorkflowFile(photo)));
    setSites((current) => current.filter((row) => row.id !== siteId));
  }, [sites]);

  const referralOptions = React.useMemo(() => {
    const query = customer.referralQuery.trim().toLowerCase();
    if (!query) return [];
    const rows: Array<{ id?: string; name: string; type: string }> = [];
    db.customers.forEach((row) => { if (row.name.toLowerCase().includes(query) && row.id !== editId) rows.push({ id: row.id, name: row.name, type: "Customer" }); });
    db.master.vendors.forEach((row) => { if (row.name.toLowerCase().includes(query)) rows.push({ id: row.id, name: row.name, type: "Vendor" }); });
    db.master.contractors.forEach((row) => { if (row.name.toLowerCase().includes(query)) rows.push({ id: row.id, name: row.name, type: "Contractor" }); });
    db.master.sourcePartners.forEach((row) => { if (row.name.toLowerCase().includes(query)) rows.push({ id: row.id, name: row.name, type: row.type || "Partner" }); });
    return rows.slice(0, 10);
  }, [customer.referralQuery, db.customers, db.master.contractors, db.master.sourcePartners, db.master.vendors, editId]);

  const duplicateMatches = React.useMemo(() => findCustomerIdentityMatches(db.customers, {
    phone: customer.phone,
    whatsapp: customer.whatsapp || customer.phone,
    alternate_phone: customer.alternatePhone,
    email: customer.email,
  }, { excludeCustomerId: editId }), [customer.alternatePhone, customer.email, customer.phone, customer.whatsapp, db.customers, editId]);

  const validate = React.useCallback((): boolean => {
    if (!customer.name.trim()) {
      toast.error("Customer name is required");
      return false;
    }
    if (![customer.phone, customer.whatsapp, customer.alternatePhone].every(validIndianPhone)) {
      toast.error("Every entered mobile number must contain 10 digits and start with 6, 7, 8, or 9");
      return false;
    }
    if (duplicateMatches.length) {
      toast.error(`Existing customer found: ${duplicateMatches.map((match) => match.customer.name).join(", ")}`);
      return false;
    }
    for (const site of sites.filter((row) => row.enabled)) {
      if (!site.name.trim()) {
        setSites((current) => current.map((row) => row.id === site.id ? { ...row, expanded: true } : row));
        toast.error("Enter a Site name or switch off/remove that new Site");
        return false;
      }
      const coordinateError = coordinateInputError(formatCoordinatePair(site));
      if (coordinateError) {
        toast.error(`${site.name || "Site"}: ${coordinateError}`);
        return false;
      }
    }
    return true;
  }, [customer, duplicateMatches, sites]);

  const persist = React.useCallback(async (): Promise<boolean> => {
    if (saving || !dirty) return !dirty;
    if (!validate()) return false;
    try {
      setSaving(true);
      const result = saveCustomerWithSites({
        customerId: editId,
        customer: customerPayload(customer),
        sites: sites.filter((site) => site.enabled).map(sitePayload),
        detachAttachmentIds,
      });
      await awaitServerSync();
      commitBatches();
      const nextBaseline = fingerprint(customer, sites, detachAttachmentIds);
      setBaseline(nextBaseline);
      dirtyFormRegistry.markClean(formId);
      toast.success(result.changed
        ? `Customer \"${customer.name.trim()}\" and Site changes saved`
        : "No customer or Site changes to save");
      onSaved?.(result.customerId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Customer and Sites could not be saved");
      return false;
    } finally {
      setSaving(false);
    }
  }, [awaitServerSync, commitBatches, customer, detachAttachmentIds, dirty, editId, formId, onSaved, saveCustomerWithSites, saving, sites, validate]);

  useDirtyFormRegistration({
    id: formId,
    label: isEdit ? "Edit Customer and Sites" : "Add Customer and Sites",
    dirty,
    save: persist,
    discard: () => {
      initialise();
      return true;
    },
  });

  const requestClose = React.useCallback(() => {
    dirtyFormRegistry.requestNavigation(onClose, {
      reason: isEdit ? "close the Customer and Sites editor" : "close the new Customer and Sites form",
    });
  }, [isEdit, onClose]);

  const saveAndClose = async () => {
    const saved = await persist();
    if (saved) onClose();
  };

  const toggleSegment = (segment: CustomerSegment) => {
    setCustomer((current) => {
      const next = current.segments.includes(segment)
        ? current.segments.filter((value) => value !== segment)
        : [...current.segments, segment];
      return { ...current, segments: next.length ? next : ["service_customer"] };
    });
  };

  const toggleInterestCategory = (id: string) => setCustomer((current) => ({
    ...current,
    interestCategoryIds: current.interestCategoryIds.includes(id)
      ? current.interestCategoryIds.filter((value) => value !== id)
      : [...current.interestCategoryIds, id],
  }));

  const toggleInterestSubcategory = (id: string) => setCustomer((current) => ({
    ...current,
    interestSubcategoryIds: current.interestSubcategoryIds.includes(id)
      ? current.interestSubcategoryIds.filter((value) => value !== id)
      : [...current.interestSubcategoryIds, id],
  }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-h-[94vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdit ? <Pencil className="h-4 w-4 text-primary" /> : <UserPlus className="h-4 w-4 text-primary" />}
            {isEdit ? "Edit Customer and Sites" : "Add New Customer and Sites"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Customer identity and every property are saved through one atomic workflow. Existing Sites can be edited and additional Sites can be added without losing GPS, maps, notes, or photos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4 rd-scroll">
          <section className="space-y-3">
            <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Customer details</h3></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer name *"><Input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Mr. Das" autoFocus /></Field>
              <Field label="Contact number"><PhoneInput value={customer.phone} onChange={(phone) => setCustomer((current) => ({ ...current, phone }))} placeholder="9876543210" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="WhatsApp number"><PhoneInput value={customer.whatsapp} onChange={(whatsapp) => setCustomer((current) => ({ ...current, whatsapp }))} placeholder="Defaults to contact" /></Field>
              <Field label="Alternate number"><PhoneInput value={customer.alternatePhone} onChange={(alternatePhone) => setCustomer((current) => ({ ...current, alternatePhone }))} placeholder="Optional" /></Field>
              <Field label="Email"><Input type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></Field>
            </div>
            {duplicateMatches.length > 0 && <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">Existing customer contact found: {duplicateMatches.map((match) => match.customer.name).join(", ")}</div>}
            <div className="relative">
              <Field label="Recommended by">
                <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" value={customer.referralQuery} onChange={(event) => { setCustomer((current) => ({ ...current, referralQuery: event.target.value, referralSelected: null })); setShowReferralDropdown(true); }} onFocus={() => setShowReferralDropdown(true)} placeholder="Search existing records or enter a referrer name" /></div>
              </Field>
              {showReferralDropdown && referralOptions.length > 0 && <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-popover">{referralOptions.map((option) => <button key={`${option.type}-${option.id || option.name}`} type="button" onClick={() => { setCustomer((current) => ({ ...current, referralQuery: option.name, referralSelected: { id: option.id, name: option.name } })); setShowReferralDropdown(false); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-accent/40"><span>{option.name}</span><span className="text-muted-foreground">{option.type}</span></button>)}</div>}
              {customer.referralSelected ? <p className="mt-1 text-[10px] text-success">Linked to existing record: {customer.referralSelected.name}</p> : customer.referralQuery.trim() ? <p className="mt-1 text-[10px] text-muted-foreground">Will save as an unlinked referrer name: “{customer.referralQuery.trim()}”</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Field label="Account condition"><select value={customer.status} onChange={(event) => setCustomer((current) => ({ ...current, status: event.target.value as Customer["status"] }))} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option></select></Field>
              <Field label="Customer notes"><Input value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} placeholder="Preferences, communication notes, or customer-level instructions" /></Field>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Customer roles</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{CUSTOMER_SEGMENTS.map(([segment, label]) => <button key={segment} type="button" onClick={() => toggleSegment(segment)} className={cn("min-h-9 rounded-md border px-2.5 py-1.5 text-[11px]", customer.segments.includes(segment) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}>{label}</button>)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Work categories interested in</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Broad customer interest only. Final Work Required remains under Site → Area.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{db.master.workCategories.map((category) => <button key={category.id} type="button" onClick={() => toggleInterestCategory(category.id)} className={cn("rounded-md border px-2 py-1 text-[11px]", customer.interestCategoryIds.includes(category.id) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}>{category.name}</button>)}</div>
              <div className="mt-2 space-y-1">{db.master.workCategories.filter((category) => customer.interestCategoryIds.includes(category.id)).map((category) => <details key={category.id} className="rounded-md border border-border bg-background"><summary className="cursor-pointer px-2.5 py-1 text-xs font-medium">Specific {category.name} work</summary><div className="flex flex-wrap gap-1 p-2">{db.master.workSubcategories.filter((subcategory) => subcategory.category_id === category.id).map((subcategory) => <button key={subcategory.id} type="button" onClick={() => toggleInterestSubcategory(subcategory.id)} className={cn("rounded-md border px-2 py-0.5 text-[10px]", customer.interestSubcategoryIds.includes(subcategory.id) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}>{subcategory.name}</button>)}</div></details>)}</div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-semibold">Sites</h3><p className="text-[11px] text-muted-foreground">Edit existing properties or add another Site. All enabled Site changes save with the customer.</p></div></div><Button type="button" size="sm" variant="outline" onClick={() => setSites((current) => [...current, newSiteDraft(true)])}><Plus className="mr-1 h-3.5 w-3.5" />Add Site</Button></div>
            {sites.map((site, index) => <SiteDraftCard key={site.id} db={db} draft={site} index={index} registerBatch={registerBatch} onChange={(patch) => updateSite(site.id, patch)} onRemoveNew={() => void removeNewSite(site.id)} onDetachExisting={(attachmentId) => { setDetachAttachmentIds((current) => [...new Set([...current, attachmentId])]); updateSite(site.id, { photoAttachmentIds: site.photoAttachmentIds.filter((id) => id !== attachmentId) }); }} />)}
          </section>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={requestClose}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
          <Button size="sm" onClick={() => void saveAndClose()} disabled={!dirty || saving || !customer.name.trim()}>{saving ? "Saving and confirming…" : isEdit ? <><Pencil className="mr-1 h-3.5 w-3.5" />Save changes</> : <><Plus className="mr-1 h-3.5 w-3.5" />Create customer</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SiteDraftCard({ db, draft, index, registerBatch, onChange, onRemoveNew, onDetachExisting }: {
  db: RDashDatabase;
  draft: SiteDraft;
  index: number;
  registerBatch: (batchId: UploadBatchId) => UploadBatchId;
  onChange: (patch: Partial<SiteDraft>) => void;
  onRemoveNew: () => void;
  onDetachExisting: (attachmentId: string) => void;
}) {
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [coordinateInput, setCoordinateInput] = React.useState(() => formatCoordinatePair(draft));
  const [locationSearch, setLocationSearch] = React.useState(draft.address);
  const [searchingLocation, setSearchingLocation] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<Array<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }>>([]);
  const existingFiles = React.useMemo(() => draft.existing
    ? entityFiles(db, "site", draft.id).filter(({ attachment }) => draft.photoAttachmentIds.includes(attachment.id))
    : [], [db, draft.existing, draft.id, draft.photoAttachmentIds]);

  React.useEffect(() => setCoordinateInput(formatCoordinatePair(draft)), [draft.latitude, draft.longitude]);

  const applyCoordinates = (latitude: number, longitude: number) => {
    onChange({ latitude, longitude, mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}` });
    setCoordinateInput(formatCoordinatePair({ latitude, longitude }));
  };

  const updateCoordinates = (value: string) => {
    setCoordinateInput(value);
    if (!value.trim()) {
      onChange({ latitude: undefined, longitude: undefined, mapUrl: "" });
      return;
    }
    const parsed = parseCoordinatePair(value);
    if (parsed) applyCoordinates(parsed.latitude, parsed.longitude);
  };

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error("GPS is not available on this device");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition((position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      applyCoordinates(latitude, longitude);
      setGpsLoading(false);
      reverseGeocodeWithNominatim(latitude, longitude).then((data) => {
        const address = data?.address || {};
        onChange({
          address: data?.display_name || draft.address,
          city: address.city || address.town || address.village || draft.city,
          locality: address.suburb || address.neighbourhood || draft.locality,
        });
      }).catch(() => undefined);
    }, (error) => {
      setGpsLoading(false);
      toast.error(`GPS error: ${error.message}`);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };

  const searchAddress = async () => {
    if (locationSearch.trim().length < 3) {
      toast.error("Enter at least 3 characters to search for a location");
      return;
    }
    try {
      setSearchingLocation(true);
      const results = await searchAddressWithNominatim(locationSearch.trim());
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Location search failed");
    } finally {
      setSearchingLocation(false);
    }
  };

  const selectLocation = (result: { display_name: string; lat: string; lon: string; address?: Record<string, string> }) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    applyCoordinates(latitude, longitude);
    const address = result.address || {};
    onChange({ address: result.display_name, city: address.city || address.town || address.village || draft.city, locality: address.suburb || address.neighbourhood || draft.locality });
    setLocationSearch(result.display_name);
    setSearchResults([]);
  };

  const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;
    try {
      const queued = await enqueueWorkflowFiles({
        sourceFlow: "customer_sites_form",
        sourceLabel: draft.existing ? "Edit Customer Site" : "Add Customer Site",
        targetEntityType: "site",
        targetEntityId: draft.id,
        targetLabel: draft.name.trim() || `Site ${index + 1}`,
        purpose: "site_evidence",
        attachmentField: "photo_attachment_ids",
        attachmentFieldMode: "append",
        files: files.map((file) => ({ file, ...classifyWorkflowFile(file), caption: "Site file" })),
      });
      registerBatch(queued.batchId);
      const pendingPhotos = queued.files.map((item, fileIndex) => {
        const preview = withLocalPreview(item, files[fileIndex]);
        return { ...preview, id: item.uploadItemId, file_name: item.fileName, mime_type: item.mimeType, url: preview.previewUrl };
      });
      onChange({ pendingPhotos: [...draft.pendingPhotos, ...pendingPhotos] });
      toast.success(`${pendingPhotos.length} Site file${pendingPhotos.length === 1 ? "" : "s"} queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue Site files");
    }
  };

  const removePending = async (photo: PendingSiteFile) => {
    await cancelQueuedWorkflowFile(photo);
    onChange({ pendingPhotos: draft.pendingPhotos.filter((item) => item.id !== photo.id) });
  };

  return <div className={cn("rounded-lg border p-3", draft.enabled ? "border-border bg-card" : "border-dashed border-muted-foreground/30 bg-muted/20")}>
    <div className="flex items-center gap-2">
      {!draft.existing && <input type="checkbox" checked={draft.enabled} onChange={(event) => onChange({ enabled: event.target.checked, expanded: event.target.checked || draft.expanded })} aria-label={`Create Site ${index + 1}`} />}
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onChange({ expanded: !draft.expanded })}><MapPin className="h-4 w-4 text-primary" /><span className="truncate text-sm font-semibold">{draft.name.trim() || (draft.existing ? "Unnamed Site" : `New Site ${index + 1}`)}</span><span className="text-[10px] text-muted-foreground">{draft.existing ? "Existing" : draft.enabled ? "Will create" : "Not included"}</span>{draft.expanded ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}</button>
      {!draft.existing && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemoveNew} aria-label="Remove new Site"><Trash2 className="h-4 w-4" /></Button>}
    </div>
    {draft.expanded && draft.enabled && <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Site name *"><Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Das Residence — 3BHK Apartment" /></Field><Field label="Property type"><select value={draft.siteType} onChange={(event) => onChange({ siteType: event.target.value as Site["site_type"] })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">{SITE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field></div>
      <Field label="Building / project name"><Input value={draft.buildingName} onChange={(event) => onChange({ buildingName: event.target.value })} placeholder="Building, tower, or project name" /></Field>
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase text-muted-foreground">Site location</span><Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={captureGps} disabled={gpsLoading}><Navigation className={cn("mr-1 h-3.5 w-3.5", gpsLoading && "animate-spin")} />{gpsLoading ? "Capturing…" : "Capture GPS"}</Button></div>
        <div className="space-y-2"><div><Input value={coordinateInput} onChange={(event) => updateCoordinates(event.target.value)} placeholder="GPS coordinates: 26.739800, 83.371200" /><p className={cn("mt-1 text-[10px]", coordinateInputError(coordinateInput) ? "text-destructive" : "text-muted-foreground")}>{coordinateInputError(coordinateInput) || "Capture GPS, search an address, paste coordinates, or click the map."}</p></div><div className="flex gap-2"><Input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchAddress(); } }} placeholder="Search address or landmark" /><Button type="button" size="sm" variant="outline" onClick={() => void searchAddress()} disabled={searchingLocation}><Search className="mr-1 h-3.5 w-3.5" />{searchingLocation ? "Searching…" : "Search"}</Button></div>{searchResults.length > 0 && <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-card">{searchResults.map((result) => <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => selectLocation(result)} className="block w-full border-b border-border px-2 py-1.5 text-left text-[11px] hover:bg-accent/40 last:border-0">{result.display_name}</button>)}</div>}<MapView title="Site pin placement" points={draft.latitude != null && draft.longitude != null ? [{ id: draft.id, label: draft.name || "Site pin", latitude: draft.latitude, longitude: draft.longitude, status: "scheduled" }] : []} fallbackCenter={{ latitude: 26.7606, longitude: 83.3732, label: "Map centre" }} onMapClick={({ latitude, longitude }) => applyCoordinates(latitude, longitude)} className="h-48 min-h-[12rem]" /><Input value={draft.address} onChange={(event) => onChange({ address: event.target.value })} placeholder="Full Site address" /><div className="grid gap-2 sm:grid-cols-2"><Input value={draft.locality} onChange={(event) => onChange({ locality: event.target.value })} placeholder="Locality / area" /><Input value={draft.city} onChange={(event) => onChange({ city: event.target.value })} placeholder="City" /></div><Input value={draft.mapUrl} onChange={(event) => onChange({ mapUrl: event.target.value })} placeholder="Google Maps link (optional)" /></div>
      </div>
      <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Site photos and files</label><Input type="file" accept={MANAGED_FILE_ACCEPT} multiple onChange={addPhotos} className="mt-1 h-9 text-sm" />{(existingFiles.length > 0 || draft.pendingPhotos.length > 0) && <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">{existingFiles.map(({ attachment, asset }) => <div key={attachment.id} className="group relative"><FilePreview file={assetPreview(asset)} compact controls /><button type="button" onClick={() => onDetachExisting(attachment.id)} className="absolute right-0 top-0 rounded-full bg-background/90 p-0.5 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Detach existing Site file"><X className="h-3 w-3" /></button></div>)}{draft.pendingPhotos.map((photo) => <div key={photo.id} className="group relative"><FilePreview file={{ fileName: photo.file_name, mimeType: photo.mime_type, url: photo.url }} compact controls /><button type="button" onClick={() => void removePending(photo)} className="absolute right-0 top-0 rounded-full bg-background/90 p-0.5 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${photo.file_name}`}><X className="h-3 w-3" /></button></div>)}</div>}</div>
      <Field label="Site notes"><Textarea value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} rows={3} placeholder="Access notes, site constraints, landmark, contact-at-site, or project context" /></Field>
    </div>}
  </div>;
}

function PhoneInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div><Input value={value} onChange={(event) => onChange(sanitizeIndianMobile(event.target.value))} placeholder={placeholder} type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} />{value && !validIndianPhone(value) && <p className="mt-1 text-[10px] text-destructive">Enter 10 digits starting with 6, 7, 8, or 9</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>{children}</label>;
}
