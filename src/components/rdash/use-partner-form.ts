"use client";

import * as React from "react";
import { toast } from "sonner";
import { attachedPreview } from "@/lib/rdash/file-attachments";
import { formatCoordinatePair, parseCoordinatePair } from "@/lib/rdash/coordinates";
import { captureDeviceGps, deviceGpsErrorMessage } from "@/lib/rdash/device-gps";
import { addressCity, addressLocality, reverseGeocodeWithNominatim } from "@/lib/rdash/location-search";
import type { RDashDatabase } from "@/lib/rdash/types";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";

type LocationDraft = { address: string; city: string; locality: string };
type Coordinates = { latitude?: number; longitude?: number };

/** One GPS lifecycle for both forms; draft resets and manual coordinates invalidate stale captures. */
export function usePartnerLocation<T extends LocationDraft>(open: boolean, editId: string | undefined, setDraft: React.Dispatch<React.SetStateAction<T>>) {
  const [latitude, setLatitude] = React.useState<number>();
  const [longitude, setLongitude] = React.useState<number>();
  const [coordinates, setCoordinates] = React.useState("");
  const [gpsLoading, setGpsLoading] = React.useState(false);
  const sequenceRef = React.useRef(0);

  React.useEffect(() => () => { sequenceRef.current++; }, [open, editId]);

  const resetLocation = React.useCallback((value: Coordinates, text = formatCoordinatePair(value)) => {
    sequenceRef.current++;
    setGpsLoading(false);
    setLatitude(value.latitude);
    setLongitude(value.longitude);
    setCoordinates(text);
  }, []);

  function updateCoordinates(value: string) {
    sequenceRef.current++;
    setGpsLoading(false);
    setCoordinates(value);
    if (!value.trim()) { setLatitude(undefined); setLongitude(undefined); return; }
    const parsed = parseCoordinatePair(value);
    if (parsed) resetLocation(parsed);
  }

  async function captureGps() {
    if (!open) return;
    const sequence = ++sequenceRef.current;
    const current = () => sequence === sequenceRef.current;
    setGpsLoading(true);
    try {
      const capture = await captureDeviceGps({ mode: "master-location" });
      if (!current()) return;
      setLatitude(capture.latitude);
      setLongitude(capture.longitude);
      setCoordinates(formatCoordinatePair(capture));
      toast.success(`GPS captured · ±${Math.round(capture.accuracy_m)} m`);
      try {
        const result = await reverseGeocodeWithNominatim(capture.latitude, capture.longitude);
        if (!current() || !result?.display_name) return;
        // Read the latest draft, not the values at click time: typing during a lookup must win.
        setDraft((draft) => current() ? {
          ...draft,
          address: draft.address.trim() ? draft.address : result.display_name || draft.address,
          city: draft.city.trim() ? draft.city : addressCity(result.address) || draft.city,
          locality: draft.locality.trim() ? draft.locality : addressLocality(result.address) || draft.locality,
        } : draft);
      } catch (error) {
        if (current()) toast.error(error instanceof Error && error.message ? error.message : "Address autofill failed. Coordinates were kept.");
      }
    } catch (error) {
      if (current()) toast.error(`GPS error: ${deviceGpsErrorMessage(error)}`);
    } finally {
      if (current()) setGpsLoading(false);
    }
  }

  return { latitude, longitude, coordinates, gpsLoading, resetLocation, updateCoordinates, captureGps };
}

type PendingMedia = QueuedWorkflowFile & { url: string; file_name: string; mime_type: string };
export type PartnerMedia = "" | PendingMedia | { attachment_id: string };
export const isPendingMedia = (value: PartnerMedia): value is PendingMedia => Boolean(value && "uploadItemId" in value);

export function partnerMediaFile(value: PartnerMedia, db: RDashDatabase) {
  if (!value) return undefined;
  if ("attachment_id" in value) return attachedPreview(db, value.attachment_id);
  return { fileName: value.file_name, mimeType: value.mime_type, url: value.url };
}

export async function removePartnerMedia(value: PartnerMedia, setter: (value: PartnerMedia) => void) {
  if (isPendingMedia(value)) await cancelQueuedWorkflowFile(value);
  setter("");
}

/** Keeps photo queuing shared while the forms retain their own server-confirmed save actions. */
export function usePartnerMedia(open: boolean, kind: "vendor" | "contractor", id: string, name: string) {
  const { registerBatch, commitBatches } = useUploadDraft(open);
  const [pending, setPending] = React.useState(0);
  const sequenceRef = React.useRef(0);
  React.useEffect(() => {
    const sequence = sequenceRef;
    // A new form owns a new local queue; late results from a closed form are cancelled below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(0);
    return () => { sequence.current++; };
  }, [open, kind, id]);

  async function uploadMedia(event: React.ChangeEvent<HTMLInputElement>, setter: (value: PartnerMedia) => void, attachmentField: string, caption: string) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !id || !open) return;
    const sequence = sequenceRef.current;
    setPending((count) => count + 1);
    try {
      const queued = await enqueueWorkflowFiles({
        sourceFlow: `${kind}_form`,
        sourceLabel: `${kind} form`,
        targetEntityType: kind,
        targetEntityId: id,
        targetLabel: name.trim() || `New ${kind}`,
        purpose: `${kind}_document`,
        deferProcessing: true,
        files: [{ file, ...classifyWorkflowFile(file), caption, attachmentField, attachmentFieldMode: "set" }],
      });
      if (sequence !== sequenceRef.current) {
        await Promise.all(queued.files.map(cancelQueuedWorkflowFile));
        return;
      }
      registerBatch(queued.batchId);
      const preview = withLocalPreview(queued.files[0], file);
      setter({ ...preview, url: preview.previewUrl, file_name: file.name, mime_type: file.type || "application/octet-stream" });
    } catch (error) {
      if (sequence === sequenceRef.current) toast.error(error instanceof Error ? error.message : "Could not queue the file.");
    } finally {
      if (sequence === sequenceRef.current) setPending((count) => count - 1);
    }
  }

  return { uploadMedia, commitBatches, mediaLoading: pending > 0 };
}
