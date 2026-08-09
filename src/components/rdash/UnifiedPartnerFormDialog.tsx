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
import { attachedPreview } from "@/lib/rdash/file-attachments";
import { reverseGeocodeWithNominatim } from "@/lib/rdash/location-search";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
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
  legacyVendorArticleNames,
  optionalIndianMobileError,
  partnerChangedPatch,
  partnerFormFingerprint,
  vendorNotesWithoutLegacyArticles,
} from "@/lib/rdash/partner-form-consistency";
import { FilePreview } from "./FilePreview";
import { AddWorkCategoryAction, AddWorkSubcategoryAction } from "./WorkTaxonomyQuickAdd";

type PendingMedia = QueuedWorkflowFile & {
  url: string;
  file_name: string;
  mime_type: string;
};
type ExistingMedia = { attachment_id: string };
type MediaValue = "" | PendingMedia | ExistingMedia;
type Payload = Record<string, unknown>;

type Props = {
  type: "vendor";
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
};

const isPending = (value: MediaValue): value is PendingMedia =>
  typeof value === "object" && "uploadItemId" in value;
const isExisting = (value: MediaValue): value is ExistingMedia =>
  typeof value === "object" && "attachment_id" in value;
const attachmentId = (value: MediaValue): string | undefined =>
  isExisting(value) ? value.attachment_id : isPending(value) ? value.attachmentId : undefined;

function mediaFile(value: MediaValue, db: any) {
  if (isExisting(value)) return attachedPreview(db, value.attachment_id);
  if (isPending(value)) {
    return { fileName: value.file_name, mimeType: value.mime_type, url: value.url };
  }
  return undefined;
}

function commonPayload(input: {
  name: string;
  phone: string;
  city: string;
  locality: string;
  address: string;
  latitude?: number;
  longitude?: number;
  referralQuery: string;
  referralSelected: { id?: string; name: string } | null;
}): Payload {
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    locality: input.locality.trim() || undefined,
    address: input.address.trim() || undefined,
    latitude: input.latitude,
    longitude: input.longitude,
    source_partner_id: input.referralSelected?.id,
    source_partner_name:
      input.referralSelected?.name || input.referralQuery.trim() || undefined,
  };
}

export function EntityFormDialog({ open, onClose, onSaved, editId }: Props) {
  const db = useRDashStore((state) => state.db);
  const addVendor = useRDashStore((state) => state.addVendor);
  const updateVendor = useRDashStore((state) => state.updateVendor);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const isEdit = Boolean(editId);
  const formId = `partner-form:vendor:${editId || "new"}`;
  const [reservedId, setReservedId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { registerBatch, commitBatches } = useUploadDraft(open);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [locality, setLocality] = React.useState("");
  const [latitude, setLatitude] = React.useState<number>();
  const [longitude, setLongitude] = React.useState<number>();
  const [coordinates, setCoordinates] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [referralQuery, setReferralQuery] = React.useState("");
  const [referralSelected, setReferralSelected] = React.useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [referralOpen, setReferralOpen] = React.useState(false);

  const [businessCard, setBusinessCard] = React.useState<MediaValue>("");
  const [shopPhoto, setShopPhoto] = React.useState<MediaValue>("");
  const [vendorReliability, setVendorReliability] = React.useState("average");
  const [vendorDelivery, setVendorDelivery] = React.useState("average");
  const [vendorReturn, setVendorReturn] = React.useState("available");
  const [vendorNotes, setVendorNotes] = React.useState("");
  const [vendorArticleIds, setVendorArticleIds] = React.useState<string[]>([]);

  const baselineRef = React.useRef<Payload>({});
  const [baselineKey, setBaselineKey] = React.useState("");
  const disposedRef = React.useRef(false);
  React.useEffect(() => () => {
    disposedRef.current = true;
  }, []);

  const allCategories = db.master.workCategories;
  const allSubcategories = db.master.workSubcategories;
  const allArticles = db.master.articles;
  const articleMap = db.master.subcategoryArticleMap;

  const referralOptions = React.useMemo(() => {
    const query = referralQuery.trim().toLowerCase();
    if (!query) return [];
    const options: Array<{ id?: string; name: string; kind: string }> = [];
    db.customers.forEach((row) => {
      if (row.name.toLowerCase().includes(query))
        options.push({ id: row.id, name: row.name, kind: "Customer" });
    });
    db.master.vendors.forEach((row) => {
      if (row.name.toLowerCase().includes(query))
        options.push({ id: row.id, name: row.name, kind: "Vendor" });
    });
    db.master.contractors.forEach((row) => {
      if (row.name.toLowerCase().includes(query))
        options.push({ id: row.id, name: row.name, kind: "Contractor" });
    });
    db.master.sourcePartners.forEach((row) => {
      if (row.name.toLowerCase().includes(query))
        options.push({ id: row.id, name: row.name, kind: row.type || "Partner" });
    });
    return options.slice(0, 10);
  }, [db, referralQuery]);

  const buildPayload = React.useCallback((): Payload => {
    const common = commonPayload({
      name,
      phone,
      city,
      locality,
      address,
      latitude,
      longitude,
      referralQuery,
      referralSelected,
    });
    return {
      ...common,
      business_card_attachment_id: attachmentId(businessCard),
      shop_attachment_id: attachmentId(shopPhoto),
      reliability_rating: vendorReliability,
      delivery_time_rating: vendorDelivery,
      return_policy: vendorReturn,
      notes: vendorNotes.trim() || undefined,
      article_ids: [...vendorArticleIds],
    };
  }, [
    address,
    businessCard,
    city,
    latitude,
    locality,
    longitude,
    name,
    phone,
    referralQuery,
    referralSelected,
    shopPhoto,
    vendorArticleIds,
    vendorDelivery,
    vendorNotes,
    vendorReliability,
    vendorReturn,
  ]);

  const applyPayload = React.useCallback((payload: Payload) => {
    setName(String(payload.name || ""));
    setPhone(String(payload.phone || ""));
    setAddress(String(payload.address || ""));
    setCity(String(payload.city || ""));
    setLocality(String(payload.locality || ""));
    setLatitude(payload.latitude as number | undefined);
    setLongitude(payload.longitude as number | undefined);
    setCoordinates(formatCoordinatePair(payload as any));
    setReferralQuery(String(payload.source_partner_name || ""));
    setReferralSelected(
      payload.source_partner_id
        ? {
            id: String(payload.source_partner_id),
            name: String(payload.source_partner_name || ""),
          }
        : null,
    );
    setBusinessCard(
      payload.business_card_attachment_id
        ? { attachment_id: String(payload.business_card_attachment_id) }
        : "",
    );
    setShopPhoto(
      payload.shop_attachment_id
        ? { attachment_id: String(payload.shop_attachment_id) }
        : "",
    );
    setVendorReliability(String(payload.reliability_rating || "average"));
    setVendorDelivery(String(payload.delivery_time_rating || "average"));
    setVendorReturn(String(payload.return_policy || "available"));
    setVendorNotes(String(payload.notes || ""));
    setVendorArticleIds((payload.article_ids as string[]) || []);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setReservedId(editId || reserveEntityId("vendor"));
    const record = editId
      ? db.master.vendors.find((row) => row.id === editId)
      : undefined;
    let payload: Payload;
    if (record) {
      const structured = (record as any).article_ids as string[] | undefined;
      const legacy = legacyVendorArticleNames(record.notes)
        .map(
          (articleName) =>
            allArticles.find(
              (article) => article.name.toLowerCase() === articleName.toLowerCase(),
            )?.id,
        )
        .filter((id): id is string => Boolean(id));
      payload = {
        ...record,
        notes: vendorNotesWithoutLegacyArticles(record.notes) || undefined,
        article_ids: structured?.length ? structured : legacy,
      };
    } else {
      payload = {
        name: "",
        phone: "",
        city: "",
        reliability_rating: "average",
        delivery_time_rating: "average",
        return_policy: "available",
        article_ids: [],
      };
    }
    applyPayload(payload);
    baselineRef.current = payload;
    setBaselineKey(partnerFormFingerprint(payload));
    setReferralOpen(false);
    // Database dependencies are intentionally omitted: background sync must not
    // reset an in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const currentPayload = buildPayload();
  const dirty = open && partnerFormFingerprint(currentPayload) !== baselineKey;
  const validationError =
    (!String(currentPayload.name || "").trim() && "Name is required.") ||
    optionalIndianMobileError(String(currentPayload.phone || "")) ||
    coordinateInputError(coordinates);

  async function discard(): Promise<boolean> {
    const pending = [businessCard, shopPhoto].filter(isPending);
    await Promise.all(pending.map((value) => cancelQueuedWorkflowFile(value)));
    applyPayload(baselineRef.current);
    return true;
  }

  async function save(): Promise<boolean> {
    if (saving) return false;
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    const patch = partnerChangedPatch(baselineRef.current, currentPayload);
    if (isEdit && Object.keys(patch).length === 0) return true;
    setSaving(true);
    try {
      let id = editId || reservedId;
      if (isEdit && editId) updateVendor(editId, patch as any);
      else {
        id = addVendor({ ...(currentPayload as any), id: reservedId });
        updateVendor(id, { article_ids: currentPayload.article_ids } as any);
      }
      await awaitServerSync();
      commitBatches();
      baselineRef.current = currentPayload;
      setBaselineKey(partnerFormFingerprint(currentPayload));
      dirtyFormRegistry.markClean(formId);
      toast.success(`Vendor ${isEdit ? "updated" : "created"}`, {
        description:
          "The workspace server confirmed the change. Pending files continue in Background Activity.",
      });
      onSaved?.(id);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The profile could not be saved.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  useDirtyFormRegistration({
    id: formId,
    label: `${isEdit ? "Edit" : "Add"} vendor`,
    dirty,
    save,
    discard,
  });

  function requestClose() {
    dirtyFormRegistry.requestNavigation(onClose, { reason: "close this form" });
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

  async function captureGps() {
    setGpsLoading(true);
    try {
      const capture = await captureDeviceGps({ mode: "master-location" });
      if (disposedRef.current) return;
      const next = {
        latitude: capture.latitude,
        longitude: capture.longitude,
      };
      setLatitude(next.latitude);
      setLongitude(next.longitude);
      setCoordinates(formatCoordinatePair(next));
      setGpsLoading(false);
      toast.success(`GPS captured · ±${Math.round(capture.accuracy_m)} m`);
      void reverseGeocodeWithNominatim(next.latitude, next.longitude).then(
        (result) => {
          if (!result?.display_name || disposedRef.current) return;
          setAddress(result.display_name);
          setCity(
            result.address?.city ||
              result.address?.town ||
              result.address?.village ||
              "",
          );
          setLocality(
            result.address?.suburb || result.address?.neighbourhood || "",
          );
        },
      );
    } catch (error) {
      if (disposedRef.current) return;
      setGpsLoading(false);
      toast.error(`GPS error: ${deviceGpsErrorMessage(error)}`);
    }
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
        sourceFlow: "vendor_form",
        sourceLabel: "vendor form",
        targetEntityType: "vendor",
        targetEntityId: reservedId,
        targetLabel: name.trim() || "New vendor",
        purpose: "vendor_document",
        files: [
          {
            file,
            ...classifyWorkflowFile(file),
            caption,
            attachmentField,
            attachmentFieldMode: "set",
          },
        ],
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
      toast.error(
        error instanceof Error ? error.message : "Could not queue the file.",
      );
    }
  }

  async function removeMedia(value: MediaValue, setter: (value: MediaValue) => void) {
    if (isPending(value)) await cancelQueuedWorkflowFile(value);
    setter("");
  }

  const toggleVendorArticle = (id: string) =>
    setVendorArticleIds((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );

  const articlesForSubcategory = (subcategoryId: string) =>
    articleMap
      .filter((row) => row.work_required_id === subcategoryId)
      .map((row) => allArticles.find((article) => article.id === row.article_id))
      .filter(Boolean);

  const title = `${isEdit ? "Edit" : "Add New"} Vendor`;

  const photoField = (
    label: string,
    value: MediaValue,
    setter: (value: MediaValue) => void,
    field: string,
  ) => (
    <div>
      <label className="text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </label>
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
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create and edit use the same complete profile. Edit mode saves only
            changed fields.
          </DialogDescription>
        </DialogHeader>

        <div className="rd-scroll max-h-[65vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Firm / Enterprise name"
              autoFocus
            />
            <div>
              <Input
                value={phone}
                onChange={(event) =>
                  setPhone(sanitizeIndianMobile(event.target.value))
                }
                placeholder="Contact number"
                inputMode="numeric"
                maxLength={10}
              />
              {optionalIndianMobileError(phone) ? (
                <p className="mt-1 text-[10px] text-destructive">
                  {optionalIndianMobileError(phone)}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex justify-between">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Location & Address
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={captureGps}
                  disabled={gpsLoading}
                >
                  <Navigation className="mr-1 h-3.5 w-3.5" />
                  {gpsLoading ? "Capturing…" : "Capture GPS"}
                </Button>
              </div>
              <Input
                value={coordinates}
                onChange={(event) => updateCoordinates(event.target.value)}
                placeholder="26.739800, 83.371200"
                className="mb-2"
              />
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Address"
                className="mb-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" />
                <Input
                  value={locality}
                  onChange={(event) => setLocality(event.target.value)}
                  placeholder="Locality / Area"
                />
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={referralQuery}
                onChange={(event) => {
                  setReferralQuery(event.target.value);
                  setReferralSelected(null);
                  setReferralOpen(true);
                }}
                onFocus={() => setReferralOpen(true)}
                placeholder="Referred by"
                className="pl-8"
              />
              {referralOpen && referralOptions.length ? (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-popover">
                  {referralOptions.map((option) => (
                    <button
                      key={option.id || option.name}
                      type="button"
                      className="flex w-full justify-between px-3 py-2 text-xs hover:bg-accent"
                      onClick={() => {
                        setReferralSelected({ id: option.id, name: option.name });
                        setReferralQuery(option.name);
                        setReferralOpen(false);
                      }}
                    >
                      <span>{option.name}</span>
                      <span className="text-muted-foreground">{option.kind}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {!referralSelected && referralQuery.trim() ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Will save as an unlinked referrer name.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {photoField(
                "Business card photo",
                businessCard,
                setBusinessCard,
                "business_card_attachment_id",
              )}
              {photoField("Shop photo", shopPhoto, setShopPhoto, "shop_attachment_id")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select value={vendorReliability} onChange={(event) => setVendorReliability(event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                <option value="very_good">Reliability: Very good</option>
                <option value="good">Reliability: Good</option>
                <option value="average">Reliability: Average</option>
                <option value="bad">Reliability: Bad</option>
              </select>
              <select value={vendorDelivery} onChange={(event) => setVendorDelivery(event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                <option value="very_good">Delivery: Very good</option>
                <option value="good">Delivery: Good</option>
                <option value="average">Delivery: Average</option>
                <option value="bad">Delivery: Bad</option>
              </select>
              <select value={vendorReturn} onChange={(event) => setVendorReturn(event.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
                <option value="available">Returns available</option>
                <option value="not_available">No returns</option>
              </select>
            </div>
            <Textarea value={vendorNotes} onChange={(event) => setVendorNotes(event.target.value)} placeholder="Payment terms and notes" />
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold">Articles supplied</p>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Stored as structured article links, separate from Notes.
              </p>
              {allCategories.map((category) => (
                <details key={category.id} className="mb-1 rounded border">
                  <summary className="cursor-pointer px-2 py-1 text-xs">
                    {category.name}
                  </summary>
                  <div className="space-y-2 p-2">
                    {allSubcategories
                      .filter((row) => row.category_id === category.id)
                      .map((subcategory) => {
                        const articles = articlesForSubcategory(subcategory.id);
                        return articles.length ? (
                          <div key={subcategory.id}>
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              {subcategory.name}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {articles.map((article) => (
                                <button
                                  key={article!.id}
                                  type="button"
                                  onClick={() => toggleVendorArticle(article!.id)}
                                  className={cn(
                                    "rounded border px-2 py-1 text-[10px]",
                                    vendorArticleIds.includes(article!.id) &&
                                      "border-primary bg-primary text-primary-foreground",
                                  )}
                                >
                                  {article!.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })}
                    <AddWorkSubcategoryAction categoryId={category.id} />
                  </div>
                </details>
              ))}
              <AddWorkCategoryAction className="mt-2" />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={requestClose}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void save().then((saved) => saved && onClose())}
            disabled={saving || Boolean(validationError) || (isEdit && !dirty)}
            title={validationError || undefined}
          >
            {saving ? (
              "Saving…"
            ) : isEdit ? (
              <>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Save changes
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" /> Create vendor
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}