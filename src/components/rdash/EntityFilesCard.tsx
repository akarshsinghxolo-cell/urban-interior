"use client";

import * as React from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePreview } from "./FilePreview";
import { useRDashStore } from "@/lib/rdash/store";
import { entityFiles, assetPreview } from "@/lib/rdash/file-attachments";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import type { FileAttachmentEntityType, FileAttachmentRole } from "@/lib/rdash/types";
import { classifyWorkflowFile, enqueueWorkflowFiles } from "@/lib/uploads/workflow-upload";
import { uploadPurposeForEntity } from "@/lib/uploads/upload-purpose";
import { resolveAttachmentEntityLabel } from "@/lib/rdash/entity-context";
import type { UploadBatchId } from "@/lib/uploads/upload-types";

export function EntityFilesCard({
  entityType,
  entityId,
  title = "Files",
  manage = false,
  showEmpty = false,
  defaultRole,
  hiddenAttachmentIds = [],
  onDetach,
  registerBatch,
  allowDetach = true,
}: {
  entityType: FileAttachmentEntityType;
  entityId: string;
  title?: string;
  manage?: boolean;
  showEmpty?: boolean;
  defaultRole?: FileAttachmentRole;
  hiddenAttachmentIds?: readonly string[];
  onDetach?: (attachmentId: string) => void;
  registerBatch?: (batchId: UploadBatchId) => void;
  allowDetach?: boolean;
}) {
  const db = useRDashStore((state) => state.db);
  const detachEntityFileAttachment = useRDashStore((state) => state.detachEntityFileAttachment);
  const [queueing, setQueueing] = React.useState(false);
  const hidden = React.useMemo(() => new Set(hiddenAttachmentIds), [hiddenAttachmentIds]);
  const files = entityFiles(db, entityType, entityId).filter(({ attachment, asset }) => asset.status === "active" && !hidden.has(attachment.id));

  if (!manage && !showEmpty && files.length === 0) return null;

  const queueFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!selected.length || queueing) return;
    setQueueing(true);
    try {
      const label = resolveAttachmentEntityLabel(db, entityType, entityId);
      const queued = await enqueueWorkflowFiles({
        sourceFlow: "record_files",
        sourceLabel: `${title} · ${label}`,
        targetEntityType: entityType,
        targetEntityId: entityId,
        targetLabel: label,
        purpose: uploadPurposeForEntity(entityType),
        deferProcessing: Boolean(registerBatch),
        files: selected.map((file) => {
          const classified = classifyWorkflowFile(file);
          return {
            file,
            kind: classified.kind,
            role: defaultRole || classified.role,
          };
        }),
      });
      registerBatch?.(queued.batchId);
      toast.success(`${queued.files.length} file${queued.files.length === 1 ? "" : "s"} queued for ${label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue files");
    } finally {
      setQueueing(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="truncate text-xs font-semibold">{title}{files.length ? ` (${files.length})` : ""}</p>
        </div>
        {manage ? (
          <label className="inline-flex h-7 cursor-pointer items-center rounded-md border border-input bg-background px-2 text-[11px] font-medium hover:bg-accent">
            <Upload className="mr-1 h-3 w-3" />
            {queueing ? "Queueing…" : "Add files"}
            <input type="file" accept={MANAGED_FILE_ACCEPT} multiple className="hidden" disabled={queueing} onChange={(event) => void queueFiles(event)} />
          </label>
        ) : null}
      </div>

      {files.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map(({ attachment, asset }) => (
            <div key={attachment.id} className="min-w-0 rounded-md border border-border bg-background p-1.5">
              <FilePreview file={assetPreview(asset)} compact controls />
              <div className="mt-1 flex items-center gap-1">
                <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={attachment.caption || attachment.role}>
                  {attachment.caption || attachment.role.replaceAll("_", " ")}
                </p>
                {manage && allowDetach ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove from this record"
                    onClick={() => onDetach ? onDetach(attachment.id) : detachEntityFileAttachment(attachment.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No files attached to this record yet.
        </p>
      )}
    </section>
  );
}
