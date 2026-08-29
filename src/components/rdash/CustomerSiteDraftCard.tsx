"use client";

import * as React from "react";
import { Archive, ChevronDown, ChevronUp, MapPin, Navigation, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapView } from "@/components/rdash/MapView";
import { FilePreview } from "./FilePreview";
import { cn } from "@/lib/utils";
import type { RDashDatabase, Site } from "@/lib/rdash/types";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { reverseGeocodeWithNominatim, searchAddressWithNominatim } from "@/lib/rdash/location-search";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { assetPreview, entityFiles } from "@/lib/rdash/file-attachments";
import {
  cancelQueuedWorkflowFile,
  classifyWorkflowFile,
  enqueueWorkflowFiles,
  withLocalPreview,
} from "@/lib/uploads/workflow-upload";
import { ManagedFilePicker } from "@/components/rdash/ManagedFilePicker";
import type { UploadBatchId } from "@/lib/uploads/upload-types";
import {
  SITE_TYPES,
  type PendingSiteFile,
  type SiteDraft,
} from "./customer-sites-form-model";

export function CustomerSiteDraftCard({
  db,
  draft,
  index,
  registerBatch,
  onChange,
  onToggleEnabled,
  onRemoveNew,
  onDetachExisting,
}: {
  db: RDashDatabase;
  draft: SiteDraft;
  index: number;
  registerBatch: (batchId: UploadBatchId) => UploadBatchId;
  onChange: (patch: Partial<SiteDraft>) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRemoveNew: () => void;
  onDetachExisting: (attachmentId: string) => void;
}) {
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const [locationSearch, setLocationSearch] = React.useState(draft.address);
  const [searchingLocation, setSearchingLocation] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: Record<string, string>;
  }>>([]);

  const existingFiles = React.useMemo(
    () => draft.existing ? entityFiles(db, "site", draft.id) : [],
    [db, draft.existing, draft.id],
  );

  const applyCoordinates = (latitude: number, longitude: number) => onChange({
    latitude,
    longitude,
    coordinateInput: formatCoordinatePair({ latitude, longitude }),
    mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
  });

  const updateCoordinates = (value: string) => {
    const parsed = parseCoordinatePair(value);
    if (!parsed) {
      onChange({ coordinateInput: value, latitude: undefined, longitude: undefined, mapUrl: "" });
      return;
    }
    onChange({
      coordinateInput: value,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      mapUrl: `https://www.google.com/maps?q=${parsed.latitude},${parsed.longitude}`,
    });
  };

  const captureGps = () => {
    if (!navigator.geolocation) return toast.error("GPS is not available on this device");
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      applyCoordinates(latitude, longitude);
      setGpsLoading(false);
      reverseGeocodeWithNominatim(latitude, longitude).then((data) => {
        const address = data?.address || {};
        onChange({
          address: data?.display_name || draft.address,
          city: address.city || address.town || address.village || draft.city,
          locality: address.suburb || address.neighbourhood || draft.locality,
        });
        if (data?.display_name) setLocationSearch(data.display_name);
      }).catch(() => undefined);
    }, (error) => {
      setGpsLoading(false);
      toast.error(`GPS error: ${error.message}`);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };

  const searchAddress = async () => {
    if (locationSearch.trim().length < 3) return toast.error("Enter at least 3 characters to search for a location");
    try {
      setSearchingLocation(true);
      const rows = await searchAddressWithNominatim(locationSearch.trim());
      setSearchResults(Array.isArray(rows) ? rows : []);
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
    onChange({
      address: result.display_name,
      city: address.city || address.town || address.village || draft.city,
      locality: address.suburb || address.neighbourhood || draft.locality,
    });
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
      deferProcessing: true,
        sourceLabel: draft.existing ? "Edit Customer Site" : "Add Customer Site",
        targetEntityType: "site",
        targetEntityId: draft.id,
        targetLabel: draft.name.trim() || `Site ${index + 1}`,
        purpose: "site_evidence",
        files: files.map((file) => {
          const classified = classifyWorkflowFile(file);
          return {
            file,
            ...classified,
            caption: "Site file",
            ...(classified.role === "photo" ? { attachmentField: "photo_attachment_ids", attachmentFieldMode: "append" as const } : {}),
          };
        }),
      });
      registerBatch(queued.batchId);
      const pendingPhotos = queued.files.map((item, fileIndex) => {
        const preview = withLocalPreview(item, files[fileIndex]);
        return {
          ...preview,
          id: item.uploadItemId,
          file_name: item.fileName,
          mime_type: item.mimeType,
          url: preview.previewUrl,
        };
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

  return (
    <div className={cn(
      "rounded-lg border p-3",
      draft.enabled ? "border-border bg-card" : "border-dashed border-muted-foreground/30 bg-muted/20",
      draft.archiveRequested && "border-warning/50 bg-warning/5",
    )}>
      <div className="flex items-center gap-2">
        {!draft.existing && (
          <input type="checkbox" checked={draft.enabled} onChange={(event) => onToggleEnabled(event.target.checked)} aria-label={`Include Site ${index + 1}`} />
        )}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onChange({ expanded: !draft.expanded })} aria-expanded={draft.expanded}>
          <MapPin className="h-4 w-4 text-primary" />
          <span className="truncate text-sm font-semibold">{draft.name.trim() || (draft.existing ? "Unnamed Site" : `New Site ${index + 1}`)}</span>
          <span className="text-[10px] text-muted-foreground">
            {draft.archiveRequested ? "Will archive" : draft.existing ? "Existing" : draft.enabled ? "Will create" : "Not included"}
          </span>
          {draft.expanded ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
        </button>
        {draft.existing && !draft.archiveRequested && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-warning" onClick={() => {
            if (draft.pendingPhotos.length) return toast.error("Remove queued files before archiving this Site");
            onChange({ archiveRequested: true, expanded: true });
          }}>
            <Archive className="mr-1 h-3.5 w-3.5" />Archive
          </Button>
        )}
        {!draft.existing && (
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemoveNew} aria-label="Remove new Site">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {draft.expanded && draft.enabled && draft.archiveRequested && (
        <div className="mt-3 space-y-3 border-t border-warning/30 pt-3">
          <p className="text-xs text-warning">Archiving hides this Site from active workflows while preserving its history.</p>
          <Field label="Archive reason *" htmlFor={`site-archive-reason-${draft.id}`}>
            <Textarea id={`site-archive-reason-${draft.id}`} value={draft.archiveReason} onChange={(event) => onChange({ archiveReason: event.target.value })} rows={3} placeholder="Why is this Site being archived?" />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.archiveCancelled} onChange={(event) => onChange({ archiveCancelled: event.target.checked })} />
            Mark the Site stage as cancelled
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ archiveRequested: false, archiveReason: "", archiveCancelled: false })}>
            Keep Site active
          </Button>
        </div>
      )}

      {draft.expanded && draft.enabled && !draft.archiveRequested && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site name *" htmlFor={`site-name-${draft.id}`}>
              <Input id={`site-name-${draft.id}`} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Das Residence — 3BHK Apartment" />
            </Field>
            <Field label="Property type" htmlFor={`site-type-${draft.id}`}>
              <select id={`site-type-${draft.id}`} value={draft.siteType} onChange={(event) => onChange({ siteType: event.target.value as Site["site_type"] })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                {SITE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Site location</span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={captureGps} disabled={gpsLoading}>
                <Navigation className={cn("mr-1 h-3.5 w-3.5", gpsLoading && "animate-spin")} />{gpsLoading ? "Capturing…" : "Capture GPS"}
              </Button>
            </div>
            <div className="space-y-2">
              <Input id={`site-coordinates-${draft.id}`} value={draft.coordinateInput} onChange={(event) => updateCoordinates(event.target.value)} placeholder="GPS coordinates: 26.739800, 83.371200" aria-invalid={Boolean(coordinateInputError(draft.coordinateInput))} />
              <p className={cn("text-[10px]", coordinateInputError(draft.coordinateInput) ? "text-destructive" : "text-muted-foreground")}>
                {coordinateInputError(draft.coordinateInput) || "Capture GPS, search an address, paste coordinates, or click the map."}
              </p>
              <div className="flex gap-2">
                <Input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void searchAddress(); }
                }} placeholder="Search address or landmark" />
                <Button type="button" size="sm" variant="outline" onClick={() => void searchAddress()} disabled={searchingLocation}>
                  <Search className="mr-1 h-3.5 w-3.5" />{searchingLocation ? "Searching…" : "Search"}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-card">
                  {searchResults.map((result) => (
                    <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => selectLocation(result)} className="block w-full border-b border-border px-2 py-1.5 text-left text-[11px] hover:bg-accent/40 last:border-0">
                      {result.display_name}
                    </button>
                  ))}
                </div>
              )}
              <MapView
                title="Site pin placement"
                points={draft.latitude != null && draft.longitude != null ? [{ id: draft.id, label: draft.name || "Site pin", latitude: draft.latitude, longitude: draft.longitude, status: "scheduled" }] : []}
                fallbackCenter={{ latitude: 26.7606, longitude: 83.3732, label: "Map centre" }}
                onMapClick={({ latitude, longitude }) => applyCoordinates(latitude, longitude)}
                className="h-48 min-h-[12rem]"
              />
              <Input value={draft.address} onChange={(event) => onChange({ address: event.target.value })} placeholder="Full Site address" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={draft.locality} onChange={(event) => onChange({ locality: event.target.value })} placeholder="Locality / area" />
                <Input value={draft.city} onChange={(event) => onChange({ city: event.target.value })} placeholder="City" />
              </div>
              <Input value={draft.mapUrl} onChange={(event) => onChange({ mapUrl: event.target.value })} placeholder="Google Maps link (optional)" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground" htmlFor={`site-files-${draft.id}`}>Site photos and files</label>
            <ManagedFilePicker label="Add photos or files" accept={MANAGED_FILE_ACCEPT} multiple fileCount={existingFiles.length + draft.pendingPhotos.length} onPick={addPhotos} className="mt-1" />
            {(existingFiles.length > 0 || draft.pendingPhotos.length > 0) && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {existingFiles.map(({ attachment, asset }) => (
                  <div key={attachment.id} className="group relative">
                    <FilePreview file={assetPreview(asset)} compact controls />
                    <button type="button" onClick={() => onDetachExisting(attachment.id)} className="absolute right-0 top-0 rounded-full bg-background/90 p-0.5 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Detach existing Site file"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                {draft.pendingPhotos.map((photo) => (
                  <div key={photo.id} className="group relative">
                    <FilePreview file={{ fileName: photo.file_name, mimeType: photo.mime_type, url: photo.url }} compact controls />
                    <button type="button" onClick={() => void removePending(photo)} className="absolute right-0 top-0 rounded-full bg-background/90 p-0.5 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${photo.file_name}`}><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Field label="Site notes" htmlFor={`site-notes-${draft.id}`}>
            <Textarea id={`site-notes-${draft.id}`} value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} rows={3} placeholder="Access notes, site constraints, landmark, contact-at-site, or project context" />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label htmlFor={htmlFor} className="block text-[10px] font-semibold uppercase text-muted-foreground">{label}</label>{children}</div>;
}
