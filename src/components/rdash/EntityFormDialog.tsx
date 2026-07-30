"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { FilePreview } from "./FilePreview";
import { attachedPreview } from "@/lib/rdash/file-attachments";
import { reverseGeocodeWithNominatim } from "@/lib/rdash/location-search";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { useRDashStore } from "@/lib/rdash/store";
import { sanitizeIndianMobile } from "@/lib/rdash/phone-validation";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MapPin, Camera, X, Plus, Search, Navigation, Image as ImageIcon, Wrench, Pencil, } from "lucide-react";
export type EntityType = "vendor" | "contractor";
type PendingMediaFile = QueuedWorkflowFile & {
    url: string;
    file_name: string;
    mime_type: string;
};
type ExistingMediaFile = {
    attachment_id: string;
};
type MediaFieldValue = string | PendingMediaFile | ExistingMediaFile;
const isPendingMediaFile = (value: MediaFieldValue): value is PendingMediaFile => typeof value === "object" && "uploadItemId" in value;
const isExistingMediaFile = (value: MediaFieldValue): value is ExistingMediaFile => typeof value === "object" && "attachment_id" in value;
const mediaPreview = (value: MediaFieldValue, db: Parameters<typeof attachedPreview>[0]) => {
    if (isExistingMediaFile(value))
        return attachedPreview(db, value.attachment_id);
    return typeof value === "string" ? (value ? { fileName: "Attached file", url: value } : undefined) : { fileName: value.file_name, mimeType: value.mime_type, url: value.url };
};
interface EntityFormDialogProps {
    type: EntityType;
    open: boolean;
    onClose: () => void;
    onSaved?: (id: string) => void;
    editId?: string;
}
export function EntityFormDialog({ type, open, onClose, onSaved, editId }: EntityFormDialogProps) {
    const db = useRDashStore((s) => s.db);
    const addVendor = useRDashStore((s) => s.addVendor);
    const addContractor = useRDashStore((s) => s.addContractor);
    const updateVendor = useRDashStore((s) => s.updateVendor);
    const updateContractor = useRDashStore((s) => s.updateContractor);
    const isEditMode = !!editId;
    const [reservedEntityId, setReservedEntityId] = React.useState("");
    const { registerBatch, commitBatches } = useUploadDraft(open);
    const [saving, setSaving] = React.useState(false);
    const [name, setName] = React.useState("");
    const [phone, setPhone] = React.useState("");
    const [address, setAddress] = React.useState("");
    const [city, setCity] = React.useState("");
    const [locality, setLocality] = React.useState("");
    const [lat, setLat] = React.useState<number | undefined>();
    const [lng, setLng] = React.useState<number | undefined>();
    const [gpsLoading, setGpsLoading] = React.useState(false);
    const [coordinateInput, setCoordinateInput] = React.useState("");
    const [referralQuery, setReferralQuery] = React.useState("");
    const [referralSelected, setReferralSelected] = React.useState<{
        id?: string;
        name: string;
    } | null>(null);
    const [showReferralDropdown, setShowReferralDropdown] = React.useState(false);
    const [businessCardPhoto, setBusinessCardPhoto] = React.useState<MediaFieldValue>("");
    const [shopPhoto, setShopPhoto] = React.useState<MediaFieldValue>("");
    const [vendorReliability, setVendorReliability] = React.useState<"good" | "very_good" | "average" | "bad">("average");
    const [vendorDelivery, setVendorDelivery] = React.useState<"good" | "very_good" | "average" | "bad">("average");
    const [vendorReturnPolicy, setVendorReturnPolicy] = React.useState<"available" | "not_available">("available");
    const [vendorNotes, setVendorNotes] = React.useState("");
    const [contractorPhoto, setContractorPhoto] = React.useState<MediaFieldValue>("");
    const [contractorCardPhoto, setContractorCardPhoto] = React.useState<MediaFieldValue>("");
    const [conReliability, setConReliability] = React.useState<"good" | "average" | "poor">("average");
    const [conPoliteness, setConPoliteness] = React.useState<"very" | "moderate" | "less">("moderate");
    const [conWorkerCount, setConWorkerCount] = React.useState<"1-3" | "4-8" | "9-15" | "16-40">("1-3");
    const [conDeadline, setConDeadline] = React.useState<"strict" | "usual" | "lazy" | "very_lazy">("usual");
    // FIX-CONTRACTOR-BATCH2 / F.6: business / tax / banking / category fields,
    // previously declared-but-never-populated dead fields on the Contractor
    // master type. Now captured in this dialog and persisted via addContractor
    // / updateContractor (the slice passes them through to the master record).
    const [conBusinessGst, setConBusinessGst] = React.useState("");
    const [conPan, setConPan] = React.useState("");
    const [conBankAccount, setConBankAccount] = React.useState("");
    const [conIfsc, setConIfsc] = React.useState("");
    const [conCategories, setConCategories] = React.useState<string[]>([]);
    const [conCapabilities, setConCapabilities] = React.useState<Array<{
        subcategory_id: string;
        subcategory_name?: string;
        labour_rate?: string;
        with_material_rate?: string;
        article_ids?: string[];
    }>>([]);
    const disposedRef = React.useRef(false);
    React.useEffect(() => () => { disposedRef.current = true; }, []);  // STAGE-4-FIX: unmount guard
    const [vendorWorkSubcats, setVendorWorkSubcats] = React.useState<string[]>([]);
    const [vendorArticleIds, setVendorArticleIds] = React.useState<string[]>([]);
    React.useEffect(() => {
        if (!open)
            return;
        setReservedEntityId(editId || reserveEntityId(type));
        if (editId) {
            if (type === "vendor") {
                const v = db.master.vendors.find((x) => x.id === editId);
                if (v) {
                    setName(v.name || "");
                    setPhone(v.phone || "");
                    setCity(v.city || "");
                    setLocality(v.locality || "");
                    setAddress(v.address || "");
                    setLat(v.latitude);
                    setLng(v.longitude);
                    setCoordinateInput(formatCoordinatePair(v));
                    setBusinessCardPhoto(v.business_card_attachment_id ? { attachment_id: v.business_card_attachment_id } : "");
                    setShopPhoto(v.shop_attachment_id ? { attachment_id: v.shop_attachment_id } : "");
                    setVendorReliability(v.reliability_rating || "average");
                    setVendorDelivery(v.delivery_time_rating || "average");
                    setVendorReturnPolicy(v.return_policy || "available");
                    setVendorNotes(v.notes || "");
                    setReferralQuery(v.source_partner_name || "");
                    setReferralSelected(v.source_partner_id ? { id: v.source_partner_id, name: v.source_partner_name || "" } : null);
                    return;
                }
            }
            else if (type === "contractor") {
                const c = db.master.contractors.find((x) => x.id === editId);
                if (c) {
                    setName(c.name || "");
                    setPhone(c.phone || "");
                    setCity(c.city || "");
                    setLocality(c.locality || "");
                    setAddress(c.address || "");
                    setLat(c.latitude);
                    setLng(c.longitude);
                    setCoordinateInput(formatCoordinatePair(c));
                    setContractorPhoto(c.photo_attachment_id ? { attachment_id: c.photo_attachment_id } : "");
                    setContractorCardPhoto(c.business_card_attachment_id ? { attachment_id: c.business_card_attachment_id } : "");
                    setConReliability(c.reliability_rating || "average");
                    setConPoliteness(c.politeness_rating || "moderate");
                    setConWorkerCount(c.worker_count_range || "1-3");
                    setConDeadline(c.deadline_commitment || "usual");
                    // FIX-CONTRACTOR-BATCH2 / F.6: load the business / tax /
                    // banking / category fields so the edit dialog shows the
                    // previously-saved values (the fields were dead before).
                    setConBusinessGst(c.business_gst || "");
                    setConPan(c.pan || "");
                    setConBankAccount(c.bank_account || "");
                    setConIfsc(c.ifsc || "");
                    setConCategories(c.categories || []);
                    setConCapabilities((c.work_capabilities || []).map((wc) => ({
                        subcategory_id: wc.subcategory_id,
                        subcategory_name: wc.subcategory_name,
                        labour_rate: wc.labour_rate ? String(wc.labour_rate) : "",
                        with_material_rate: wc.with_material_rate ? String(wc.with_material_rate) : "",
                    })));
                    setReferralQuery(c.source_partner_name || "");
                    setReferralSelected(c.source_partner_id ? { id: c.source_partner_id, name: c.source_partner_name || "" } : null);
                    return;
                }
            }
        }
        setName("");
        setPhone("");
        setAddress("");
        setCity("");
        setLocality("");
        setLat(undefined);
        setLng(undefined);
        setCoordinateInput("");
        setReferralQuery("");
        setReferralSelected(null);
        setShowReferralDropdown(false);
        setBusinessCardPhoto("");
        setShopPhoto("");
        setVendorReliability("average");
        setVendorDelivery("average");
        setVendorReturnPolicy("available");
        setVendorNotes("");
        setVendorWorkSubcats([]);
        setVendorArticleIds([]);
        setContractorPhoto("");
        setContractorCardPhoto("");
        setConReliability("average");
        setConPoliteness("moderate");
        setConWorkerCount("1-3");
        setConDeadline("usual");
        // FIX-CONTRACTOR-BATCH2 / F.6: reset the new business / tax / banking /
        // category fields when the dialog is opened for a NEW contractor.
        setConBusinessGst("");
        setConPan("");
        setConBankAccount("");
        setConIfsc("");
        setConCategories([]);
        setConCapabilities([]);
    }, [open, type, editId]);  // STAGE-4-FIX: removed db refs (form was resetting on every background mutation)
    const referralOptions = React.useMemo(() => {
        if (!referralQuery.trim())
            return [];
        const q = referralQuery.toLowerCase();
        const results: Array<{
            id?: string;
            name: string;
            type: string;
        }> = [];
        db.customers.forEach((p) => { if (p.name.toLowerCase().includes(q))
            results.push({ id: p.id, name: p.name, type: "Customer" }); });
        db.master.vendors.forEach((v) => { if (v.name.toLowerCase().includes(q))
            results.push({ id: v.id, name: v.name, type: "Vendor" }); });
        db.master.contractors.forEach((c) => { if (c.name.toLowerCase().includes(q))
            results.push({ id: c.id, name: c.name, type: "Contractor" }); });
        db.master.sourcePartners.forEach((s) => { if (s.name.toLowerCase().includes(q))
            results.push({ id: s.id, name: s.name, type: s.type || "Partner" }); });
        return results.slice(0, 10);
    }, [referralQuery, db]);
    const updateCoordinateInput = (value: string) => {
        setCoordinateInput(value);
        if (!value.trim()) {
            setLat(undefined);
            setLng(undefined);
            return;
        }
        const parsed = parseCoordinatePair(value);
        if (parsed) {
            setLat(parsed.latitude);
            setLng(parsed.longitude);
            setCoordinateInput(formatCoordinatePair(parsed));
        }
    };
    const handleCaptureGps = () => {
        if (!navigator.geolocation) {
            toast.error("GPS not available on this device. Enter coordinates manually or paste a Google Maps link.");
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition((pos) => {
        if (disposedRef.current) return;  // STAGE-4-FIX: unmount guard
            setLat(pos.coords.latitude);
            setLng(pos.coords.longitude);
            setCoordinateInput(formatCoordinatePair({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
            setGpsLoading(false);
            toast.success(`GPS captured: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
            reverseGeocodeWithNominatim(pos.coords.latitude, pos.coords.longitude)
                .then((data) => {
                if (data?.display_name) {
                    setAddress(data.display_name);
                    if (data?.address?.city)
                        setCity(data.address.city);
                    else if (data?.address?.town)
                        setCity(data.address.town);
                    else if (data?.address?.village)
                        setCity(data.address.village);
                    if (data?.address?.suburb || data?.address?.neighbourhood)
                        setLocality(data.address.suburb || data.address.neighbourhood);
                    toast.success("Address auto-filled from GPS");
                }
            })
                .catch(() => { });
        }, (err) => {
            setGpsLoading(false);
            const hints = err.code === err.PERMISSION_DENIED
                ? "GPS permission was denied. Enter coordinates manually (e.g. 26.739800, 83.371200) or paste a Google Maps link."
                : err.code === err.POSITION_UNAVAILABLE
                    ? "GPS position unavailable. Enter coordinates manually or paste a Google Maps link."
                    : err.code === err.TIMEOUT
                        ? "GPS timed out. Enter coordinates manually or paste a Google Maps link."
                        : `GPS error: ${err.message}`;
            toast.error(hints);
        }, { enableHighAccuracy: true, timeout: 10000 });
    };
    const handlePhotoUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
        callback: (value: MediaFieldValue) => void,
        attachmentField: string,
        caption: string,
    ) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = "";
        if (!file || !reservedEntityId) return;
        try {
            const classification = classifyWorkflowFile(file);
            const queued = await enqueueWorkflowFiles({
                sourceFlow: `${type}_form`,
                sourceLabel: `${type === "vendor" ? "Vendor" : "Contractor"} form`,
                targetEntityType: type === "vendor" ? "vendor" : "contractor",
                targetEntityId: reservedEntityId,
                targetLabel: name.trim() || `New ${type}`,
                purpose: type === "vendor" ? "vendor_document" : "contractor_document",
                files: [{ file, ...classification, caption, attachmentField, attachmentFieldMode: "set" }],
            });
            registerBatch(queued.batchId);
            const preview = withLocalPreview(queued.files[0], file);
            callback({ ...preview, url: preview.previewUrl, file_name: file.name, mime_type: file.type || "application/octet-stream" });
            toast.success(`${file.name} queued for upload`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not queue the selected file");
        }
    };
    const removePendingMedia = async (value: PendingMediaFile, callback: (value: MediaFieldValue) => void) => {
        await cancelQueuedWorkflowFile(value);
        callback("");
    };
    const allSubcategories = db.master.workSubcategories;
    const allCategories = db.master.workCategories;
    const allArticles = db.master.articles;
    const subcategoryArticleMap = db.master.subcategoryArticleMap;
    const toggleVendorArticle = (articleId: string) => {
        setVendorArticleIds((arr) => arr.includes(articleId) ? arr.filter((x) => x !== articleId) : [...arr, articleId]);
    };
    const toggleContractorCapability = (subId: string) => {
        const sub = allSubcategories.find((s) => s.id === subId);
        if (!sub)
            return;
        setConCapabilities((arr) => {
            if (arr.some((c) => c.subcategory_id === subId)) {
                return arr.filter((c) => c.subcategory_id !== subId);
            }
            return [...arr, { subcategory_id: subId, subcategory_name: sub.name, labour_rate: "", with_material_rate: "" }];
        });
    };
    // FIX-CONTRACTOR-BATCH2 / F.6: toggle a work-category tag for the
    // contractor. Stored as category names (human-readable on the contractor
    // card) rather than IDs — matches the existing specializations[] display
    // pattern and avoids a separate lookup in the list view.
    const toggleContractorCategory = (name: string) => {
        setConCategories((arr) => arr.includes(name) ? arr.filter((x) => x !== name) : [...arr, name]);
    };
    const updateCapability = (subId: string, patch: Partial<typeof conCapabilities[number]>) => {
        setConCapabilities((arr) => arr.map((c) => c.subcategory_id === subId ? { ...c, ...patch } : c));
    };
    const handleSave = async () => {
        if (saving)
            return;
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        const coordinateError = coordinateInputError(coordinateInput);
        if (coordinateError) {
            toast.error(coordinateError);
            return;
        }
        const referralName = referralSelected?.name || referralQuery.trim() || undefined;
        const referralId = referralSelected?.id;
        if (type === "vendor") {
            try {
                const articleNames = vendorArticleIds.map((aid) => allArticles.find((a) => a.id === aid)?.name).filter(Boolean);
                const combinedNotes = [vendorNotes.trim(), articleNames.length > 0 ? `Supplies articles: ${articleNames.join(", ")}` : ""].filter(Boolean).join("\n");
                const payload = {
                    name: name.trim(),
                    phone: phone.trim(),
                    city: city.trim(),
                    locality: locality.trim() || undefined,
                    address: address.trim() || undefined,
                    latitude: lat,
                    longitude: lng,
                    business_card_attachment_id: isExistingMediaFile(businessCardPhoto) ? businessCardPhoto.attachment_id : isPendingMediaFile(businessCardPhoto) ? businessCardPhoto.attachmentId : undefined,
                    shop_attachment_id: isExistingMediaFile(shopPhoto) ? shopPhoto.attachment_id : isPendingMediaFile(shopPhoto) ? shopPhoto.attachmentId : undefined,
                    reliability_rating: vendorReliability,
                    delivery_time_rating: vendorDelivery,
                    return_policy: vendorReturnPolicy,
                    notes: combinedNotes || undefined,
                    source_partner_id: referralId,
                    source_partner_name: referralName,
                };
                setSaving(true);
                const id = isEditMode && editId ? editId : addVendor({ ...payload, id: reservedEntityId });
                if (isEditMode && editId)
                    updateVendor(id, payload);
                toast.success(`Vendor "${name.trim()}" ${isEditMode ? "updated" : "created"}`);
                onSaved?.(id);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Vendor could not be saved.");
                return;
            }
            finally {
                setSaving(false);
            }
        }
        else if (type === "contractor") {
            try {
                const payload = {
                    name: name.trim(),
                    phone: phone.trim(),
                    city: city.trim(),
                    locality: locality.trim() || undefined,
                    address: address.trim() || undefined,
                    latitude: lat,
                    longitude: lng,
                    photo_attachment_id: isExistingMediaFile(contractorPhoto) ? contractorPhoto.attachment_id : isPendingMediaFile(contractorPhoto) ? contractorPhoto.attachmentId : undefined,
                    business_card_attachment_id: isExistingMediaFile(contractorCardPhoto) ? contractorCardPhoto.attachment_id : isPendingMediaFile(contractorCardPhoto) ? contractorCardPhoto.attachmentId : undefined,
                    reliability_rating: conReliability,
                    politeness_rating: conPoliteness,
                    worker_count_range: conWorkerCount,
                    deadline_commitment: conDeadline,
                    source_partner_id: referralId,
                    source_partner_name: referralName,
                    work_capabilities: conCapabilities.map((c) => ({
                        subcategory_id: c.subcategory_id,
                        subcategory_name: c.subcategory_name,
                        labour_rate: c.labour_rate ? parseFloat(c.labour_rate) : undefined,
                        with_material_rate: c.with_material_rate ? parseFloat(c.with_material_rate) : undefined,
                    })),
                    // FIX-CONTRACTOR-BATCH2 / F.6: persist the new business / tax /
                    // banking / category fields. The Contractor type now declares
                    // these as optional and addContractor / updateContractor pass
                    // them through to the master record.
                    business_gst: conBusinessGst.trim() || undefined,
                    pan: conPan.trim() || undefined,
                    bank_account: conBankAccount.trim() || undefined,
                    ifsc: conIfsc.trim() || undefined,
                    categories: conCategories,
                };
                setSaving(true);
                const id = isEditMode && editId ? editId : addContractor({ ...payload, id: reservedEntityId });
                if (isEditMode && editId)
                    updateContractor(id, payload);
                toast.success(`Contractor "${name.trim()}" ${isEditMode ? "updated" : "created"}`);
                onSaved?.(id);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Contractor could not be saved.");
                return;
            }
            finally {
                setSaving(false);
            }
        }
        commitBatches();
        toast.info("Saved. Pending files continue in Background Activity.");
        onClose();
    };
    const titleLabel = isEditMode
        ? (type === "vendor" ? "Edit Vendor" : "Edit Contractor")
        : (type === "vendor" ? "Add New Vendor" : "Add New Contractor");
    const nameLabel = "Firm / Enterprise name";
    return (<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEditMode ? <Pencil className="h-4 w-4 text-primary"/> : <Plus className="h-4 w-4 text-primary"/>} {titleLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEditMode ? "Update the fields below. Changes are saved to the record." : "Fill in the details below. GPS and photos can be captured directly."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4 rd-scroll">
          <div className="grid gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">{nameLabel}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Interiors" className="h-11 text-sm" autoFocus/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Contact number</label>
              <Input value={phone} onChange={(e) => setPhone(sanitizeIndianMobile(e.target.value))} placeholder="9876543210" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} className="h-11 text-sm"/>
              {phone && phone.length > 0 && phone.length !== 10 && <p className="mt-0.5 text-[10px] text-warning">Enter 10 digits ({phone.length}/10)</p>}
              {phone && phone.length === 10 && !/^[6-9]/.test(phone) && <p className="mt-0.5 text-[10px] text-destructive">Must start with 6, 7, 8, or 9</p>}
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Location & Address</label>
                <Button size="sm" variant="outline" className="h-9 text-xs" onClick={handleCaptureGps} disabled={gpsLoading}>
                  <Navigation className={cn("mr-1 h-3.5 w-3.5", gpsLoading && "animate-spin")}/> {gpsLoading ? "Capturing…" : "Capture GPS"}
                </Button>
              </div>
              <Input value={coordinateInput} onChange={(e) => updateCoordinateInput(e.target.value)} placeholder="GPS coordinates: 26.739800, 83.371200" className="mb-1 h-11 text-sm"/>
              {coordinateInputError(coordinateInput) ? <p className="mb-2 text-[10px] text-destructive">{coordinateInputError(coordinateInput)}</p> : <p className="mb-2 text-[10px] text-muted-foreground">Use one coordinate field: latitude, longitude.</p>}
              <div className="grid gap-2">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (auto-filled from GPS or type manually)" className="h-11 text-sm"/>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-11 text-sm"/>
                  <Input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Locality / Area" className="h-11 text-sm"/>
                </div>
              </div>
            </div>
            <div className="relative">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Referred by</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                <Input value={referralQuery} onChange={(e) => { setReferralQuery(e.target.value); setShowReferralDropdown(true); setReferralSelected(null); }} onFocus={() => setShowReferralDropdown(true)} placeholder="Type name to search existing records, or enter new referrer" className="h-11 pl-8 text-sm"/>
              </div>
              {showReferralDropdown && referralOptions.length > 0 && (<div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-popover rd-scroll">
                  {referralOptions.map((opt) => (<button key={opt.id || opt.name} type="button" onClick={() => { setReferralSelected({ id: opt.id, name: opt.name }); setReferralQuery(opt.name); setShowReferralDropdown(false); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-accent/40">
                      <span className="font-medium">{opt.name}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{opt.type}</span>
                    </button>))}
                </div>)}
              {referralSelected && (<p className="mt-1 text-[10px] text-success">✓ Linked to existing record: {referralSelected.name}</p>)}
              {!referralSelected && referralQuery.trim() && (<p className="mt-1 text-[10px] text-muted-foreground">Will save as new referrer: "{referralQuery.trim()}"</p>)}
            </div>
            {type === "vendor" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Business card photo</label>
                    <Input type="file" accept={MANAGED_FILE_ACCEPT} onChange={(e) => void handlePhotoUpload(e, setBusinessCardPhoto, "business_card_attachment_id", "Vendor business card")} className="h-11 text-sm"/>
                    {businessCardPhoto && (<div className="mt-1 relative">
                        
                        <FilePreview file={mediaPreview(businessCardPhoto, db)!} compact controls/>
                        <button type="button" onClick={() => isPendingMediaFile(businessCardPhoto) ? void removePendingMedia(businessCardPhoto, setBusinessCardPhoto) : setBusinessCardPhoto("")} className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive"><X className="h-3 w-3"/></button>
                      </div>)}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Shop photo</label>
                    <Input type="file" accept={MANAGED_FILE_ACCEPT} onChange={(e) => void handlePhotoUpload(e, setShopPhoto, "shop_attachment_id", "Vendor shop file")} className="h-11 text-sm"/>
                    {shopPhoto && (<div className="mt-1 relative">
                        
                        <FilePreview file={mediaPreview(shopPhoto, db)!} compact controls/>
                        <button type="button" onClick={() => isPendingMediaFile(shopPhoto) ? void removePendingMedia(shopPhoto, setShopPhoto) : setShopPhoto("")} className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive"><X className="h-3 w-3"/></button>
                      </div>)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Reliability</label>
                    <select value={vendorReliability} onChange={(e) => setVendorReliability(e.target.value as typeof vendorReliability)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="very_good">Very Good</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="bad">Bad</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Delivery time</label>
                    <select value={vendorDelivery} onChange={(e) => setVendorDelivery(e.target.value as typeof vendorDelivery)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="very_good">Very Good</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="bad">Bad</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Return / replacement</label>
                    <select value={vendorReturnPolicy} onChange={(e) => setVendorReturnPolicy(e.target.value as typeof vendorReturnPolicy)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="available">Available</option>
                      <option value="not_available">Not Available</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</label>
                  <Textarea value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} placeholder="Custom description, payment terms, special conditions…" rows={2} className="text-sm"/>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Articles supplied (from article library, by work category)</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {allCategories.map((cat) => {
                const subs = allSubcategories.filter((s) => s.category_id === cat.id);
                return (<details key={cat.id} className="rounded-md border border-border">
                          <summary className="cursor-pointer px-2.5 py-1 text-xs font-medium hover:bg-accent/40">{cat.name}</summary>
                          <div className="flex flex-col gap-1 p-2">
                            {subs.map((sub) => {
                        const scopedArticles = subcategoryArticleMap.filter((m) => m.work_required_id === sub.id);
                        const articlesForSub = scopedArticles.map((m) => allArticles.find((a) => a.id === m.article_id)).filter(Boolean);
                        if (articlesForSub.length === 0)
                            return null;
                        return (<div key={sub.id} className="mb-1">
                                  <p className="text-[10px] font-semibold text-muted-foreground">{sub.name}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {articlesForSub.map((art) => (<button key={art!.id} type="button" onClick={() => toggleVendorArticle(art!.id)} className={cn("rounded-md border px-1.5 py-0.5 text-[10px] transition-colors", vendorArticleIds.includes(art!.id)
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background text-muted-foreground hover:bg-accent/40")}>
                                        {art!.name}
                                      </button>))}
                                  </div>
                                </div>);
                    })}
                          </div>
                        </details>);
            })}
                  </div>
                  {vendorArticleIds.length > 0 && (<p className="mt-1 text-[10px] text-success">{vendorArticleIds.length} article(s) selected</p>)}
                </div>
              </>)}
            {type === "contractor" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Contractor photo</label>
                    <Input type="file" accept={MANAGED_FILE_ACCEPT} onChange={(e) => void handlePhotoUpload(e, setContractorPhoto, "photo_attachment_id", "Contractor photo file")} className="h-11 text-sm"/>
                    {contractorPhoto && (<div className="mt-1 relative">
                        
                        <FilePreview file={mediaPreview(contractorPhoto, db)!} compact controls/>
                        <button type="button" onClick={() => isPendingMediaFile(contractorPhoto) ? void removePendingMedia(contractorPhoto, setContractorPhoto) : setContractorPhoto("")} className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive"><X className="h-3 w-3"/></button>
                      </div>)}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Business card photo</label>
                    <Input type="file" accept={MANAGED_FILE_ACCEPT} onChange={(e) => void handlePhotoUpload(e, setContractorCardPhoto, "business_card_attachment_id", "Contractor business card")} className="h-11 text-sm"/>
                    {contractorCardPhoto && (<div className="mt-1 relative">
                        
                        <FilePreview file={mediaPreview(contractorCardPhoto, db)!} compact controls/>
                        <button type="button" onClick={() => isPendingMediaFile(contractorCardPhoto) ? void removePendingMedia(contractorCardPhoto, setContractorCardPhoto) : setContractorCardPhoto("")} className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive"><X className="h-3 w-3"/></button>
                      </div>)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Reliability</label>
                    <select value={conReliability} onChange={(e) => setConReliability(e.target.value as typeof conReliability)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="poor">Poor</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Politeness</label>
                    <select value={conPoliteness} onChange={(e) => setConPoliteness(e.target.value as typeof conPoliteness)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="very">Very</option>
                      <option value="moderate">Moderate</option>
                      <option value="less">Less</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Workers</label>
                    <select value={conWorkerCount} onChange={(e) => setConWorkerCount(e.target.value as typeof conWorkerCount)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="1-3">1–3</option>
                      <option value="4-8">4–8</option>
                      <option value="9-15">9–15</option>
                      <option value="16-40">16–40</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Deadline</label>
                    <select value={conDeadline} onChange={(e) => setConDeadline(e.target.value as typeof conDeadline)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                      <option value="strict">Strict</option>
                      <option value="usual">Usual</option>
                      <option value="lazy">Lazy</option>
                      <option value="very_lazy">Very Lazy</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Work capabilities (select subcategories + enter rates)</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {allCategories.map((cat) => {
                const subs = allSubcategories.filter((s) => s.category_id === cat.id);
                return (<details key={cat.id} className="rounded-md border border-border">
                          <summary className="cursor-pointer px-2.5 py-1 text-xs font-medium hover:bg-accent/40">{cat.name} ({subs.length})</summary>
                          <div className="flex flex-wrap gap-1 p-2">
                            {subs.map((sub) => (<button key={sub.id} type="button" onClick={() => toggleContractorCapability(sub.id)} className={cn("rounded-md border px-2 py-0.5 text-[10px] transition-colors", conCapabilities.some((c) => c.subcategory_id === sub.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent/40")}>
                                {sub.name}
                              </button>))}
                          </div>
                        </details>);
            })}
                  </div>
                  {conCapabilities.length > 0 && (<div className="mt-2 space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground">Selected capabilities — enter rates:</p>
                      {conCapabilities.map((cap) => (<div key={cap.subcategory_id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                          <span className="flex-1 truncate text-xs font-medium">{cap.subcategory_name}</span>
                          <Input type="number" value={cap.labour_rate || ""} onChange={(e) => updateCapability(cap.subcategory_id, { labour_rate: e.target.value })} placeholder="Labour ₹" className="h-7 w-24 text-xs"/>
                          <Input type="number" value={cap.with_material_rate || ""} onChange={(e) => updateCapability(cap.subcategory_id, { with_material_rate: e.target.value })} placeholder="With material ₹" className="h-7 w-28 text-xs"/>
                          <button type="button" onClick={() => toggleContractorCapability(cap.subcategory_id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5"/></button>
                        </div>))}
                    </div>)}
                </div>
                {/* FIX-CONTRACTOR-BATCH2 / F.6: Business / tax / banking /
                    work-category fields. Previously declared-but-never-
                    populated dead fields on the Contractor type — now
                    captured here so the master record has the data the
                    finance team needs for GST reconciliation, TDS, bank
                    transfers, and contractor-type filtering. */}
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Business / tax / banking</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Optional — captured for GST reconciliation, TDS and bank transfers.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-muted-foreground">GSTIN</label>
                      <Input value={conBusinessGst} onChange={(e) => setConBusinessGst(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="h-9 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-muted-foreground">PAN</label>
                      <Input value={conPan} onChange={(e) => setConPan(e.target.value.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} className="h-9 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-muted-foreground">Bank account no.</label>
                      <Input value={conBankAccount} onChange={(e) => setConBankAccount(e.target.value)} placeholder="Bank account number" className="h-9 text-sm"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-muted-foreground">IFSC</label>
                      <Input value={conIfsc} onChange={(e) => setConIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} className="h-9 text-sm"/>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Work categories</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Broad trade categories this contractor serves — used for filtering the contractor list and bid-invitation dropdowns.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {allCategories.map((cat) => <button key={cat.id} type="button" onClick={() => toggleContractorCategory(cat.name)} className={cn("rounded-md border px-2 py-1 text-[11px] font-medium transition-colors", conCategories.includes(cat.name) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent/40")}>{cat.name}</button>)}
                  </div>
                  {conCategories.length > 0 && <p className="mt-2 text-[10px] text-success">{conCategories.length} work categor{conCategories.length === 1 ? "y" : "ies"} selected</p>}
                </div>
              </>)}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" className="min-h-[40px]" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" className="min-h-[40px]" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : isEditMode ? <><Pencil className="mr-1 h-3.5 w-3.5"/> Save changes</> : <><Plus className="mr-1 h-3.5 w-3.5"/> Create {type}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
