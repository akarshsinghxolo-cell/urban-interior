"use client";

import { uploadQueueStore } from "./upload-store";
import type {
  AttachmentId,
  EnqueueUploadBatchInput,
  EnqueueUploadFileOptions,
  FileAssetId,
  UploadBatchId,
  UploadItemId,
  UploadItemRecord,
} from "./upload-types";
import type { FileAssetKind, FileAttachmentRole } from "@/lib/rdash/types";
export { uploadPurposeForEntity } from "./upload-purpose";

export interface WorkflowUploadFile extends EnqueueUploadFileOptions {
  file: File;
}

export interface QueuedWorkflowFile {
  batchId: UploadBatchId;
  uploadItemId: UploadItemId;
  attachmentId: AttachmentId;
  fileAssetId: FileAssetId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string;
}

export interface QueuedWorkflowBatch {
  batchId: UploadBatchId;
  files: QueuedWorkflowFile[];
  attachmentIds: AttachmentId[];
}

type QueueWorkflowInput = Omit<EnqueueUploadBatchInput, "files" | "fileOptions"> & {
  files: Array<File | WorkflowUploadFile>;
};

function normalizeFile(value: File | WorkflowUploadFile): WorkflowUploadFile {
  return value instanceof File ? { file: value } : value;
}

export function classifyWorkflowFile(file: File): { kind: FileAssetKind; role: FileAttachmentRole } {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/")) return { kind: "media", role: "video" };
  if (file.type.startsWith("image/")) return { kind: "media", role: "photo" };
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return { kind: "document", role: "document" };
  return { kind: "document", role: "document" };
}

export async function enqueueWorkflowFiles(input: QueueWorkflowInput): Promise<QueuedWorkflowBatch> {
  const normalized = input.files.map(normalizeFile);
  const batchId = await uploadQueueStore.enqueueBatch({
    ...input,
    files: normalized.map((entry) => entry.file),
    fileOptions: normalized.map(({ file: _file, ...options }) => options),
  });
  const items = uploadQueueStore.getSnapshot().items
    .filter((item) => item.batchId === batchId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!items.length) throw new Error("The selected files were not added to the upload queue.");
  return {
    batchId,
    files: items.map((item) => queuedFile(item)),
    attachmentIds: items.map((item) => item.attachmentId),
  };
}

function queuedFile(item: UploadItemRecord): QueuedWorkflowFile {
  return {
    batchId: item.batchId,
    uploadItemId: item.id,
    attachmentId: item.attachmentId,
    fileAssetId: item.fileAssetId,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    previewUrl: "",
  };
}

export function withLocalPreview(queued: QueuedWorkflowFile, file: File): QueuedWorkflowFile {
  return { ...queued, previewUrl: URL.createObjectURL(file) };
}

export function revokeWorkflowPreview(file: Pick<QueuedWorkflowFile, "previewUrl">): void {
  if (file.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl);
}

export async function cancelQueuedWorkflowFile(file: Pick<QueuedWorkflowFile, "uploadItemId" | "previewUrl">): Promise<void> {
  revokeWorkflowPreview(file);
  await uploadQueueStore.cancelItem(file.uploadItemId);
}

export async function cancelQueuedWorkflowBatch(batchId: UploadBatchId): Promise<void> {
  await uploadQueueStore.cancelBatch(batchId);
}
