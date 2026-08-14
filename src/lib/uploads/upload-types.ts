import type {
  EntityFileAttachment,
  FileAttachmentEntityType,
  FileAttachmentRole,
  FileAsset,
  FileAssetKind,
} from "@/lib/rdash/types";

export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UploadBatchId = Brand<string, "UploadBatchId">;
export type UploadItemId = Brand<string, "UploadItemId">;
export type GoogleFileId = Brand<string, "GoogleFileId">;
export type FileAssetId = Brand<string, "FileAssetId">;
export type AttachmentId = Brand<string, "AttachmentId">;

export type UploadPurpose =
  | "site_evidence"
  | "visit_evidence"
  | "measurement"
  | "drawing"
  | "work_required_document"
  | "quotation_document"
  | "accepted_scope_document"
  | "work_order_document"
  | "variation_document"
  | "execution_evidence"
  | "vendor_rfq"
  | "vendor_bid"
  | "purchase_order"
  | "grn_evidence"
  | "inventory_evidence"
  | "stock_movement_evidence"
  | "dispatch_evidence"
  | "vendor_bill"
  | "vendor_payment"
  | "customer_payment"
  | "customer_invoice"
  | "customer_receipt"
  | "customer_document"
  | "vendor_document"
  | "vendor_rate_document"
  | "contractor_document"
  | "contractor_bid"
  | "contractor_bill"
  | "contractor_payment"
  | "contractor_settlement"
  | "task_evidence"
  | "followup_attachment"
  | "commission_document"
  | "blocked_evidence"
  | "thread_attachment"
  | "general_document"
  | "staff_document"
  | "communication_attachment"
  | "import_source"
  | "catalogue"
  | "reference_media"
  | "diagnostic";

export type UploadItemStatus =
  | "queued"
  | "preparing"
  | "starting_session"
  | "uploading"
  | "paused"
  | "uploaded_unverified"
  | "verifying"
  | "finalizing"
  | "completed"
  | "failed_permanent"
  | "cancel_requested"
  | "cleanup_pending"
  | "cancelled";

export type UploadBatchStatus =
  | "open"
  | "uploading"
  | "waiting"
  | "finalizing"
  | "completed"
  | "cancelled"
  | "failed";

export interface UploadBatchRecord {
  id: UploadBatchId;
  workspaceId: string;
  sourceFlow: string;
  sourceLabel: string;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  targetLabel?: string;
  purpose: UploadPurpose;
  status: UploadBatchStatus;
  requiredEvidence: boolean;
  storageAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadItemRecord {
  id: UploadItemId;
  batchId: UploadBatchId;
  workspaceId: string;
  fileAssetId: FileAssetId;
  attachmentId: AttachmentId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  fingerprint: string;
  sourceFlow: string;
  purpose: UploadPurpose;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  desiredTargetEntityType?: FileAttachmentEntityType;
  kind: FileAssetKind;
  role: FileAttachmentRole;
  caption?: string;
  visibility: EntityFileAttachment["visibility"];
  customerShareable: boolean;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
  requiredEvidence: boolean;
  /** Held locally until the owning Save/Confirm action succeeds. */
  deferred?: boolean;
  status: UploadItemStatus;
  confirmedBytes: number;
  progress: number;
  retryCount: number;
  retryAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  sessionUri?: string;
  sessionExpiresAt?: string;
  storageAccountId?: string;
  stagingFolderId?: string;
  finalFolderId?: string;
  googleFileId?: GoogleFileId;
  webViewLink?: string;
  thumbnailLink?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  finalizedAt?: string;
}

export interface UploadBlobRecord {
  uploadItemId: UploadItemId;
  blob: Blob;
  createdAt: string;
}

export interface EnqueueUploadFileOptions {
  kind?: FileAssetKind;
  role?: FileAttachmentRole;
  caption?: string;
  visibility?: EntityFileAttachment["visibility"];
  customerShareable?: boolean;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
}

export interface EnqueueUploadBatchInput {
  workspaceId?: string;
  sourceFlow: string;
  sourceLabel: string;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  targetLabel?: string;
  purpose: UploadPurpose;
  requiredEvidence?: boolean;
  /** Keep file bytes local until a draft Save/Confirm explicitly releases the batch. */
  deferProcessing?: boolean;
  desiredTargetEntityType?: FileAttachmentEntityType;
  kind?: FileAssetKind;
  role?: FileAttachmentRole;
  caption?: string;
  visibility?: EntityFileAttachment["visibility"];
  customerShareable?: boolean;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
  files: File[];
  fileOptions?: EnqueueUploadFileOptions[];
}

export interface FinalizedUploadResult {
  uploadBatchId: UploadBatchId;
  uploadItemId: UploadItemId;
  googleFileId: GoogleFileId;
  fileAssetId: FileAssetId;
  attachmentId: AttachmentId;
  storageAccountId: string;
  storageFolderId: string;
  webViewLink: string;
  thumbnailLink?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  verifiedAt: string;
  fileAsset: FileAsset;
  attachment: EntityFileAttachment;
}

export interface UploadQueueSnapshot {
  ready: boolean;
  online: boolean;
  processing: boolean;
  batches: UploadBatchRecord[];
  items: UploadItemRecord[];
}

export interface InitiateUploadRequest {
  uploadBatchId: UploadBatchId;
  uploadItemId: UploadItemId;
  fileAssetId: FileAssetId;
  attachmentId: AttachmentId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  batchSizeBytes: number;
  preferredStorageAccountId?: string;
  lastModified: number;
  fingerprint: string;
  sourceFlow: string;
  sourceLabel: string;
  purpose: UploadPurpose;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  desiredTargetEntityType?: FileAttachmentEntityType;
  kind: FileAssetKind;
  role: FileAttachmentRole;
  caption?: string;
  visibility: EntityFileAttachment["visibility"];
  customerShareable: boolean;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
  requiredEvidence: boolean;
}

export interface InitiateUploadResponse {
  sessionUri?: string;
  sessionExpiresAt?: string;
  storageAccountId: string;
  stagingFolderId: string;
  confirmedBytes: number;
  completedGoogleFileId?: GoogleFileId;
  webViewLink?: string;
  thumbnailLink?: string;
}

export interface FinalizeUploadRequest {
  uploadItemId: UploadItemId;
  googleFileId: GoogleFileId;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  purpose: UploadPurpose;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
}

export interface BindUploadRequest {
  uploadBatchId: UploadBatchId;
  uploadItemId: UploadItemId;
  targetEntityType: FileAttachmentEntityType;
  targetEntityId: string;
  purpose: UploadPurpose;
  attachmentField?: string;
  attachmentFieldMode?: "set" | "append";
}

export const ACTIVE_UPLOAD_STATUSES = new Set<UploadItemStatus>([
  "preparing",
  "starting_session",
  "uploading",
  "uploaded_unverified",
  "verifying",
  "finalizing",
  "cleanup_pending",
]);

export function makeUploadBatchId(): UploadBatchId {
  return makeUploadId("upload-batch") as UploadBatchId;
}

export function makeUploadItemId(): UploadItemId {
  return makeUploadId("upload-item") as UploadItemId;
}

export function makeFileAssetId(uploadItemId: UploadItemId): FileAssetId {
  return `drivefile-${uploadItemId}` as FileAssetId;
}

export function makeAttachmentId(uploadItemId: UploadItemId): AttachmentId {
  return `attach-${uploadItemId}` as AttachmentId;
}

export function reserveEntityId(entityType: string): string {
  const normalized = entityType.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "entity";
  return makeUploadId(normalized);
}

function makeUploadId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
