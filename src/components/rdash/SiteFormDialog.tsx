"use client";
import * as React from "react";
import { Building2, MapPin, Navigation, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import type { Site } from "@/lib/rdash/types";
import { compressImage } from "@/lib/rdash/image-compress";
import { asManagedFileAsset, MANAGED_FILE_ACCEPT, readFileAsDataUrl, uploadManagedFile } from "@/lib/rdash/file-assets";
import { assetPreview, entityFiles } from "@/lib/rdash/file-attachments";
import { FilePreview } from "./FilePreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { coordinateInputError, formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { reverseGeocodeWithNominatim, searchAddressWithNominatim } from "@/lib/rdash/location-search";
import { MapView } from "@/components/rdash/MapView";
const SITE_TYPES: Array<{
    value: Site["site_type"];
    label: string;
}> = [
    { value: "apartment", label: "Apartment" },
    { value: "office", label: "Office" },
    { value: "villa", label: "Villa" },
    { value: "shop", label: "Shop" },
    { value: "showroom", label: "Showroom" },
    { value: "other", label: "Other" },
];
type PendingSiteFile = {
    id: string;
    file_name: string;
    mime_type?: string;
    url: string;
    caption?: string;
};
type SiteDraft = {
    customerId: string;
    name: string;
    buildingName: string;
    siteType: Site["site_type"];
    address: string;
    locality: string;
    city: string;
    latitude?: number;
    longitude?: number;
    mapUrl: string;
    notes: string;
};
const emptyDraft = (customerId = ""): SiteDraft => ({
    customerId,
    name: "",
    buildingName: "",
    siteType: "apartment",
    address: "",
    locality: "",
    city: "",
    latitude: undefined,
    longitude: undefined,
    mapUrl: "",
    notes: "",
});
export function SiteFormDialog({ open, onClose, customerId, siteId, onSaved, }: {
    open: boolean;
    onClose: () => void;
    customerId?: string;
    siteId?: string;
    onSaved?: (siteId: string) => void;
}) {
    const db = useRDashStore((state) => state.db);
    const addSite = useRDashStore((state) => state.addSite);
    const updateSite = useRDashStore((state) => state.updateSite);
    const createFileAssetAndAttach = useRDashStore((state) => state.createFileAssetAndAttach);
    const [saving, setSaving] = React.useState(false);
    const [draft, setDraft] = React.useState<SiteDraft>(() => emptyDraft(customerId));
    const [pendingPhotos, setPendingPhotos] = React.useState<PendingSiteFile[]>([]);
    const existingFiles = React.useMemo(() => siteId ? entityFiles(db, "site", siteId) : [], [db, siteId]);
    const [gpsLoading, setGpsLoading] = React.useState(false);
    const [coordinateInput, setCoordinateInput] = React.useState("");
    const [locationSearch, setLocationSearch] = React.useState("");
    const [searchResults, setSearchResults] = React.useState<Array<{
        display_name: string;
        lat: string;
        lon: string;
        address?: Record<string, string>;
    }>>([]);
    const [searchingLocation, setSearchingLocation] = React.useState(false);
    const isEdit = Boolean(siteId);
    const lockedCustomer = Boolean(customerId);
    React.useEffect(() => {
        if (!open)
            return;
        const existing = siteId ? db.sites.find((site) => site.id === siteId) : undefined;
        if (existing) {
            setDraft({
                customerId: existing.customer_id,
                name: existing.name,
                buildingName: existing.building_name || "",
                siteType: existing.site_type,
                address: existing.address || "",
                locality: existing.locality || "",
                city: existing.city || "",
                latitude: existing.latitude,
                longitude: existing.longitude,
                mapUrl: existing.map_url || "",
                notes: existing.notes || "",
            });
        }
        else {
            setDraft(emptyDraft(customerId));
        }
        setGpsLoading(false);
        setCoordinateInput(existing ? formatCoordinatePair(existing) : "");
        setLocationSearch(existing?.address || "");
        setSearchResults([]);
        setPendingPhotos([]);
    }, [open, siteId, customerId, db.sites]);
    const set = <K extends keyof SiteDraft>(key: K, value: SiteDraft[K]) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };
    const applyCoordinates = (latitude: number, longitude: number) => {
        setDraft((current) => ({ ...current, latitude, longitude, mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}` }));
        setCoordinateInput(formatCoordinatePair({ latitude, longitude }));
    };
    const updateCoordinateInput = (value: string) => {
        setCoordinateInput(value);
        if (!value.trim()) {
            setDraft((current) => ({ ...current, latitude: undefined, longitude: undefined, mapUrl: "" }));
            return;
        }
        const parsed = parseCoordinatePair(value);
        if (parsed)
            applyCoordinates(parsed.latitude, parsed.longitude);
    };
    const searchAddress = async () => {
        const query = locationSearch.trim();
        if (query.length < 3) {
            toast.error("Enter at least 3 characters to search for a location");
            return;
        }
        setSearchingLocation(true);
        try {
            const results = await searchAddressWithNominatim(query);
            setSearchResults(Array.isArray(results) ? results : []);
            if (!results.length)
                toast.info("No location found. You can place the pin directly on the map.");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Location search failed");
        }
        finally {
            setSearchingLocation(false);
        }
    };
    const selectLocation = (result: {
        display_name: string;
        lat: string;
        lon: string;
        address?: Record<string, string>;
    }) => {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
            return;
        applyCoordinates(latitude, longitude);
        const address = result.address || {};
        setDraft((current) => ({ ...current, address: result.display_name || current.address, city: address.city || address.town || address.village || current.city, locality: address.suburb || address.neighbourhood || current.locality }));
        setLocationSearch(result.display_name);
        setSearchResults([]);
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
            toast.success("Site GPS captured");
            reverseGeocodeWithNominatim(latitude, longitude)
                .then((data) => {
                const location = data?.address || {};
                setDraft((current) => ({
                    ...current,
                    address: data?.display_name || current.address,
                    city: location.city || location.town || location.village || current.city,
                    locality: location.suburb || location.neighbourhood || current.locality,
                }));
            })
                .catch(() => undefined);
        }, (error) => {
            setGpsLoading(false);
            toast.error(`GPS error: ${error.message}`);
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    };
    const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        const photos: PendingSiteFile[] = [];
        for (const file of files) {
            try {
                const url = file.type.startsWith("image/") ? await compressImage(file) : await readFileAsDataUrl(file);
                photos.push({ id: `site-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file_name: file.name, mime_type: file.type || "application/octet-stream", url });
            }
            catch {
                toast.error(`Could not process ${file.name}`);
            }
        }
        if (photos.length)
            setPendingPhotos((current) => [...current, ...photos]);
    };
    const save = async () => {
        if (saving)
            return;
        if (!draft.customerId) {
            toast.error("Select a customer for this Site");
            return;
        }
        if (!draft.name.trim()) {
            toast.error("Site name is required");
            return;
        }
        const coordinateError = coordinateInputError(coordinateInput);
        if (coordinateError) {
            toast.error(coordinateError);
            return;
        }
        const payload: Partial<Site> = {
            customer_id: draft.customerId,
            name: draft.name.trim(),
            building_name: draft.buildingName.trim() || undefined,
            site_type: draft.siteType,
            address: draft.address.trim() || undefined,
            locality: draft.locality.trim() || undefined,
            city: draft.city.trim() || undefined,
            latitude: draft.latitude,
            longitude: draft.longitude,
            map_url: draft.mapUrl.trim() || undefined,
            notes: draft.notes.trim() || undefined,
        };
        try {
            setSaving(true);
            const id = siteId || addSite(payload);
            if (siteId)
                updateSite(siteId, payload);
            // FIX-E2E-001: Await the server commit before starting uploads.
            if (pendingPhotos.length) {
                await useRDashStore.getState().awaitServerSync();
            }
            const uploadedAttachmentIds = await Promise.all(pendingPhotos.map(async (photo) => {
                const role = photo.mime_type?.startsWith("video/") ? "video" as const : photo.mime_type === "application/pdf" ? "document" as const : "photo" as const;
                const file = await uploadManagedFile({ dataUrl: photo.url, fileName: photo.file_name, entityType: "site", entityId: id, kind: "media", role, caption: photo.caption || "Site file", visibility: "internal" });
                return createFileAssetAndAttach(asManagedFileAsset(file, { kind: "media" }), { entity_type: "site", entity_id: id, role, caption: photo.caption || "Site file", visibility: "internal", customer_shareable: false });
            }));
            if (uploadedAttachmentIds.length) {
                const existing = db.sites.find((site) => site.id === id)?.photo_attachment_ids || [];
                updateSite(id, { photo_attachment_ids: [...new Set([...existing, ...uploadedAttachmentIds])] });
            }
            toast.success(`Site "${payload.name}" ${siteId ? "updated" : "added"}`);
            onSaved?.(id);
            onClose();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Site could not be saved. Google Drive upload was not completed.");
        }
        finally {
            setSaving(false);
        }
    };
    return (<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdit ? <Pencil className="h-4 w-4 text-primary"/> : <Building2 className="h-4 w-4 text-primary"/>}
            {isEdit ? "Edit Site" : "Add Site"}
          </DialogTitle>
          <DialogDescription className="text-xs">Site address, GPS, property information and photos belong here—not on the Customer record.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-5 py-4 rd-scroll">
          {!lockedCustomer && (<Field label="Customer">
              <select value={draft.customerId} onChange={(event) => set("customerId", event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">Select customer</option>
                {db.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </Field>)}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site name *"><Input value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Das Residence — 3BHK Apartment" autoFocus/></Field>
            <Field label="Property type">
              <select value={draft.siteType} onChange={(event) => set("siteType", event.target.value as Site["site_type"])} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                {SITE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Building / project name"><Input value={draft.buildingName} onChange={(event) => set("buildingName", event.target.value)} placeholder="Legio Apartment, Tower B / Das Office Complex"/></Field>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase text-muted-foreground">Site location</span><Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={captureGps} disabled={gpsLoading}><Navigation className={cn("mr-1 h-3.5 w-3.5", gpsLoading && "animate-spin")}/>{gpsLoading ? "Capturing…" : "Capture GPS"}</Button></div>
            <div className="grid gap-2">
              <div><Input value={coordinateInput} onChange={(event) => updateCoordinateInput(event.target.value)} placeholder="GPS coordinates: 26.739800, 83.371200"/><p className={cn("mt-1 text-[10px]", coordinateInputError(coordinateInput) ? "text-destructive" : "text-muted-foreground")}>{coordinateInputError(coordinateInput) || "One coordinate field. You may capture GPS, search a place, or click the map to place the pin."}</p></div>
              <div className="flex gap-2"><Input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") {
        event.preventDefault();
        void searchAddress();
    } }} placeholder="Search address or landmark"/><Button type="button" size="sm" variant="outline" onClick={() => void searchAddress()} disabled={searchingLocation}><Search className="mr-1 h-3.5 w-3.5"/>{searchingLocation ? "Searching…" : "Search"}</Button></div>
              {searchResults.length > 0 && <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-card">{searchResults.map((result) => <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => selectLocation(result)} className="block w-full border-b border-border px-2 py-1.5 text-left text-[11px] hover:bg-accent/40 last:border-0">{result.display_name}</button>)}</div>}
              <MapView title="Site pin placement" points={draft.latitude != null && draft.longitude != null ? [{ id: "site-pin", label: "Site pin", latitude: draft.latitude, longitude: draft.longitude, status: "scheduled" }] : []} fallbackCenter={{ latitude: 26.7606, longitude: 83.3732, label: "Map centre" }} onMapClick={({ latitude, longitude }) => applyCoordinates(latitude, longitude)} className="h-48 min-h-[12rem]"/>
              <Input value={draft.address} onChange={(event) => set("address", event.target.value)} placeholder="Full Site address"/>
              <div className="grid gap-2 sm:grid-cols-2"><Input value={draft.locality} onChange={(event) => set("locality", event.target.value)} placeholder="Locality / area"/><Input value={draft.city} onChange={(event) => set("city", event.target.value)} placeholder="City"/></div>
              <Input value={draft.mapUrl} onChange={(event) => set("mapUrl", event.target.value)} placeholder="Google Maps link (optional)"/>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Site photos</label>
            <Input type="file" accept={MANAGED_FILE_ACCEPT} multiple onChange={addPhotos} className="mt-1 h-9 text-sm"/>
            {(existingFiles.length > 0 || pendingPhotos.length > 0) && <div className="mt-2 grid grid-cols-4 gap-2">
              {existingFiles.map(({ attachment, asset }) => <div key={attachment.id}><FilePreview file={assetPreview(asset)} compact controls/></div>)}
              {pendingPhotos.map((photo) => <div key={photo.id} className="group relative"><FilePreview file={{ fileName: photo.file_name, mimeType: photo.mime_type, url: photo.url }} compact controls/><button type="button" onClick={() => setPendingPhotos((items) => items.filter((item) => item.id !== photo.id))} className="absolute right-0 top-0 rounded-full bg-background/80 p-0.5 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${photo.file_name}`}><X className="h-3 w-3"/></button></div>)}
            </div>}
          </div>
          <Field label="Site notes"><Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} rows={3} placeholder="Access notes, site constraints, landmark, contact-at-site or project context…"/></Field>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{isEdit ? <><Pencil className="mr-1 h-3.5 w-3.5"/>Save Site</> : <><Plus className="mr-1 h-3.5 w-3.5"/>Add Site</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>);
}
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    return <label className="block space-y-1"><span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>{children}</label>;
}
