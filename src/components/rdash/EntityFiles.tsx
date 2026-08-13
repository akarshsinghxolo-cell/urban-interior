"use client";

import * as React from "react";
import { FileText, RefreshCw, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { FileAttachmentEntityType } from "@/lib/rdash/types";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { assetPreview, entityFiles } from "@/lib/rdash/file-attachments";
import {
    classifyWorkflowFile,
    enqueueWorkflowFiles,
    uploadPurposeForEntity,
    withLocalPreview,
} from "@/lib/uploads/workflow-upload";
import { uploadQueueStore } from "@/lib/uploads/upload-store";
import { useUploadQueue } from "@/lib/uploads/use-upload-queue";
import type { UploadItemRecord } from "@/lib/uploads/upload-types";
import { FilePreview } from "./FilePreview";

export function detailKindToFileEntityType(kind?: string | null): FileAttachmentEntityType | null {
    const map: Record<string, FileAttachmentEntityType> = {
        quotation: "quotation",
        workOrder: "workOrder",
        po: "purchase_order",
        grn: "grn",
        dispatch: "dispatch",
        payment: "payment",
        invoice: "invoice",
        task: "task",
        followup: "followup",
        visit: "visit",
        customer: "customer",
        site: "site",
        area: "room",
        workRequired: "workRequired",
        boq: "boq",
        vendorBill: "vendor_bill",
        commission: "commission",
        blocked: "blocked",
        inventory: "inventory",
        vendor: "vendor",
        vendorRate: "vendor_rate",
        contractor: "contractor",
    };
    return kind ? map[kind] || null : null;
}

function uploadStatusLabel(item: UploadItemRecord) {
    switch (item.status) {
        case "queued": return "Queued";
        case "preparing": return "Preparing";
        case "starting_session": return "Starting upload";
        case "uploading": return `Uploading ${item.progress || 0}%`;
        case "paused": return "Paused";
        case "uploaded_unverified": return "Upload complete";
        case "verifying": return "Verifying";
        case "finalizing": return "Finishing";
        case "failed_permanent": return "Upload failed";
        case "cancel_requested": return "Cancelling";
        case "cleanup_pending": return "Removing";
        case "cancelled": return "Cancelled";
        case "completed": return "Complete";
        default: return "Uploading";
    }
}

function isRetryable(item: UploadItemRecord) {
    return item.status === "paused" || item.status === "failed_permanent";
}

export function EntityFiles({ entityType, entityId, entityLabel }: {
    entityType: FileAttachmentEntityType;
    entityId: string;
    entityLabel?: string;
}) {
    const db = useRDashStore((state) => state.db);
    const queue = useUploadQueue();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const previewUrlsRef = React.useRef<Record<string, string>>({});
    const [previewUrls, setPreviewUrls] = React.useState<Record<string, string>>({});
    const [queueing, setQueueing] = React.useState(false);

    const attached = React.useMemo(
        () => entityFiles(db, entityType, entityId).slice().reverse(),
        [db, entityId, entityType],
    );
    const pending = React.useMemo(
        () => queue.items.filter((item) => item.targetEntityType === entityType && item.targetEntityId === entityId),
        [entityId, entityType, queue.items],
    );

    React.useEffect(() => {
        const active = new Set(pending.map((item) => String(item.id)));
        let changed = false;
        const next = { ...previewUrlsRef.current };
        for (const [id, url] of Object.entries(next)) {
            if (active.has(id)) continue;
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
            delete next[id];
            changed = true;
        }
        if (changed) {
            previewUrlsRef.current = next;
            setPreviewUrls(next);
        }
    }, [pending]);

    React.useEffect(() => () => {
        for (const url of Object.values(previewUrlsRef.current)) {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
        previewUrlsRef.current = {};
    }, []);

    const chooseFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = "";
        if (!selected.length) return;
        setQueueing(true);
        try {
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "detail_files",
                sourceLabel: "Record files",
                targetEntityType: entityType,
                targetEntityId: entityId,
                targetLabel: entityLabel,
                purpose: uploadPurposeForEntity(entityType),
                requiredEvidence: false,
                files: selected.map((file) => ({ file, ...classifyWorkflowFile(file) })),
            });
            const additions: Record<string, string> = {};
            queued.files.forEach((item, index) => {
                const source = selected[index];
                if (!source) return;
                const preview = withLocalPreview(item, source);
                additions[String(item.uploadItemId)] = preview.previewUrl;
            });
            previewUrlsRef.current = { ...previewUrlsRef.current, ...additions };
            setPreviewUrls(previewUrlsRef.current);
            toast.success(`${queued.files.length} file${queued.files.length === 1 ? "" : "s"} queued for upload.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Files could not be queued.");
        }
        finally {
            setQueueing(false);
        }
    };

    const retry = async (item: UploadItemRecord) => {
        try {
            await uploadQueueStore.retryItem(item.id);
            toast.success(`Retrying ${item.fileName}`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload could not be retried.");
        }
    };

    const removePending = async (item: UploadItemRecord) => {
        try {
            await uploadQueueStore.cancelItem(item.id);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload could not be removed.");
        }
    };

    return (<div className="p-4">
      <input ref={inputRef} type="file" multiple accept={MANAGED_FILE_ACCEPT} className="hidden" onChange={chooseFiles}/>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Files</p>
          <p className="text-[11px] text-muted-foreground">Photos, documents and videos attached to this record.</p>
        </div>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={queueing}>
          <UploadCloud className="mr-1.5 h-3.5 w-3.5"/>{queueing ? "Adding…" : "Upload"}
        </Button>
      </div>

      {pending.length > 0 && <section className="mb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Uploading</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pending.map((item) => {
              const previewUrl = previewUrls[String(item.id)];
              return <div key={item.id} className="overflow-hidden rounded-lg border border-border bg-card">
                {previewUrl ? <FilePreview file={{ fileName: item.fileName, mimeType: item.mimeType, url: previewUrl }} compact controls={false}/> : <div className="flex h-20 items-center justify-center bg-muted/30"><FileText className="h-6 w-6 text-muted-foreground"/></div>}
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium" title={item.fileName}>{item.fileName}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full bg-primary transition-[width]", item.status === "failed_permanent" && "bg-destructive")} style={{ width: `${Math.max(2, Math.min(100, item.progress || 0))}%` }}/>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className={cn("truncate text-[10px] text-muted-foreground", item.status === "failed_permanent" && "text-destructive")}>{uploadStatusLabel(item)}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {isRetryable(item) && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => retry(item)} title="Retry upload" aria-label={`Retry ${item.fileName}`}><RefreshCw className="h-3.5 w-3.5"/></button>}
                      {!item.status.includes("cancel") && item.status !== "cleanup_pending" && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => removePending(item)} title="Remove upload" aria-label={`Remove ${item.fileName}`}><X className="h-3.5 w-3.5"/></button>}
                    </span>
                  </div>
                  {item.lastErrorMessage && isRetryable(item) ? <p className="mt-1 line-clamp-2 text-[10px] text-destructive">{item.lastErrorMessage}</p> : null}
                </div>
              </div>;
          })}
        </div>
      </section>}

      {attached.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {attached.map(({ attachment, asset }) => <div key={attachment.id} className="min-w-0">
          <FilePreview file={assetPreview(asset)} controls/>
          <p className="mt-1.5 truncate text-[11px] font-medium" title={asset.file_name}>{asset.file_name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{attachment.caption || attachment.role}</p>
        </div>)}
      </div> : pending.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground/70"/>
        <p className="mt-2 text-sm font-medium">No files yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Upload photos, documents or videos for this record.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => inputRef.current?.click()}><UploadCloud className="mr-1.5 h-3.5 w-3.5"/>Add files</Button>
      </div> : null}
    </div>);
}
