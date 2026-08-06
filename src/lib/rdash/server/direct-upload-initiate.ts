import type { AuthenticatedUser } from "./auth";
import { getWorkspace } from "./workspace";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getGoogleDriveAccessToken } from "./google-drive";
import type { FileAttachmentEntityType, RDashDatabase } from "../types";
import type { BindUploadRequest, GoogleFileId, InitiateUploadRequest, InitiateUploadResponse, UploadPurpose } from "@/lib/uploads/upload-types";
import {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  MAX_UPLOAD_BYTES,
  WORKSPACE_ID,
  driveFetch,
  ensureFolderPath,
  nowIso,
  safeSegment,
  selectUploadAccount,
} from "./direct-upload-storage";

function hasId(rows: Array<{ id?: string }>, id: string): boolean {
  return rows.some((row) => String(row.id || "") === id);
}

function uploadTargetExists(db: RDashDatabase, targetEntityType: FileAttachmentEntityType, targetEntityId: string): boolean {
  switch (targetEntityType) {
    case "customer": return hasId(db.customers, targetEntityId);
    case "site": return hasId(db.sites, targetEntityId);
    case "room": return hasId(db.areas, targetEntityId);
    case "workRequired": return hasId(db.workRequired, targetEntityId);
    case "quotation": return hasId(db.quotations, targetEntityId);
    case "quotation_item":
      return db.quotations.some((quotation) =>
        [...(quotation.scope_lines || []), ...(quotation.items || [])].some((item) => item.id === targetEntityId),
      );
    case "workOrder": return hasId(db.workOrders, targetEntityId);
    case "boq": return hasId(db.boqs, targetEntityId);
    case "boq_item": return db.boqs.some((boq) => (boq.items || []).some((item) => item.id === targetEntityId));
    case "purchase_order": return hasId(db.purchaseOrders, targetEntityId);
    case "grn": return hasId(db.grns, targetEntityId);
    case "vendor_bill": return hasId(db.vendorBills, targetEntityId);
    case "dispatch": return hasId(db.dispatches, targetEntityId);
    case "inventory": return hasId(db.inventory, targetEntityId);
    case "drawing": return hasId(db.drawings, targetEntityId);
    case "execution_log": return hasId(db.executionLogs, targetEntityId);
    case "visit": return hasId(db.visits, targetEntityId);
    case "task": return hasId(db.tasks, targetEntityId);
    case "followup": return hasId(db.followups, targetEntityId);
    case "payment": return hasId(db.payments, targetEntityId);
    case "invoice": return hasId(db.invoices, targetEntityId);
    case "vendor": return hasId(db.master.vendors, targetEntityId);
    case "vendor_rate": return hasId(db.master.vendorRates, targetEntityId);
    case "contractor": return hasId(db.master.contractors, targetEntityId);
    case "contractor_bid": return hasId(db.contractorBids, targetEntityId);
    case "contractor_settlement": return hasId(db.contractorSettlements, targetEntityId);
    case "commission": return hasId(db.commissions, targetEntityId);
    case "blocked": return hasId(db.blocked, targetEntityId);
    case "thread_message":
      return (db.threads || []).some((thread) => (thread.messages || []).some((message) => message.id === targetEntityId));
    case "communication": return hasId(db.commSends, targetEntityId);
    case "general": return false;
  }
  const exhaustive: never = targetEntityType;
  return exhaustive;
}

function assertUploadTargetReady(
  db: RDashDatabase,
  targetEntityType: FileAttachmentEntityType,
  targetEntityId: string,
  purpose: UploadPurpose,
) {
  // Diagnostics and import-source retention intentionally use synthetic targets.
  if (purpose === "diagnostic" || purpose === "import_source") return;
  if (targetEntityType === "general" || !uploadTargetExists(db, targetEntityType, targetEntityId)) {
    throw new Error("TARGET_NOT_READY:Save the related record before its Drive upload starts.");
  }
}

export async function bindDirectUpload(_user: AuthenticatedUser, input: BindUploadRequest): Promise<void> {
  if (!input.uploadItemId) throw new Error("Upload item identity is required.");
  const admin = getSupabaseAdminClient();
  const { data: item, error } = await admin.from("uc_upload_items").update({
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    upload_purpose: input.purpose,
    attachment_field: input.attachmentField,
    attachment_field_mode: input.attachmentFieldMode,
    updated_at: nowIso(),
  }).eq("id", input.uploadItemId).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) throw new Error("The upload item could not be bound because it does not exist.");
}

async function findCompletedDriveFile(accessToken: string, uploadItemId: string, sizeBytes: number) {
  const escaped = uploadItemId.replace(/'/g, "\\'");
  const query = `appProperties has { key='ucUploadItemId' and value='${escaped}' } and trashed=false`;
  const response = await driveFetch(
    accessToken,
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,size,webViewLink,thumbnailLink,parents,appProperties,createdTime)&pageSize=100`,
  );
  const payload = await response.json().catch(() => ({})) as {
    files?: Array<{
      id?: string;
      size?: string;
      webViewLink?: string;
      thumbnailLink?: string;
      parents?: string[];
      createdTime?: string;
      appProperties?: Record<string, string>;
    }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "Could not reconcile existing Google Drive uploads.");
  return (payload.files || [])
    .filter((file) => file.id && Number(file.size || -1) === sizeBytes && file.appProperties?.ucUploadItemId === uploadItemId)
    .sort((a, b) => String(a.createdTime || "").localeCompare(String(b.createdTime || "")))[0];
}

function normalizeBrowserOrigin(browserOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(browserOrigin);
  } catch {
    throw new Error("The browser origin is invalid for direct Google Drive uploads.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Direct Google Drive uploads require an HTTP or HTTPS browser origin.");
  }
  return parsed.origin;
}

export async function initiateDirectUpload(
  _user: AuthenticatedUser,
  input: InitiateUploadRequest,
  browserOrigin: string,
): Promise<InitiateUploadResponse> {
  if (!input.uploadBatchId || !input.uploadItemId || !input.fileName) {
    throw new Error("Upload identity and file name are required.");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("Empty files cannot be uploaded.");
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`);
  }
  const sessionOrigin = normalizeBrowserOrigin(browserOrigin);

  const admin = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin.from("uc_upload_items")
    .select("session_uri,session_expires_at,session_origin,storage_account_id,staging_folder_id,confirmed_bytes,status,google_file_id,file_asset_id,attachment_id,target_entity_type,target_entity_id,upload_purpose,created_at,retry_count")
    .eq("id", input.uploadItemId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    if (String(existing.file_asset_id || input.fileAssetId) !== String(input.fileAssetId) || String(existing.attachment_id || input.attachmentId) !== String(input.attachmentId)) {
      throw new Error("The pending upload identity does not match its existing server record.");
    }
    if (
      (existing.target_entity_type && String(existing.target_entity_type) !== input.targetEntityType) ||
      (existing.target_entity_id && String(existing.target_entity_id) !== input.targetEntityId) ||
      (existing.upload_purpose && String(existing.upload_purpose) !== input.purpose)
    ) {
      throw new Error("The pending upload routing changed. Bind it before requesting another Drive session.");
    }
  }

  // Do not create or resume a Drive session for a client-reserved entity ID until
  // the corresponding business row has reached Supabase. The blob stays durable
  // in IndexedDB and the client retries automatically after Save completes.
  const workspace = await getWorkspace();
  assertUploadTargetReady(workspace.data, input.targetEntityType, input.targetEntityId, input.purpose);

  if (existing) {
    if (existing.google_file_id && ["uploaded_unverified", "verifying", "finalizing", "completed"].includes(String(existing.status || ""))) {
      return {
        storageAccountId: String(existing.storage_account_id),
        stagingFolderId: String(existing.staging_folder_id || ""),
        confirmedBytes: input.sizeBytes,
        completedGoogleFileId: String(existing.google_file_id) as GoogleFileId,
      };
    }
    if (
      existing.session_uri &&
      existing.session_expires_at &&
      String(existing.session_origin || "") === sessionOrigin &&
      Date.parse(String(existing.session_expires_at)) > Date.now() &&
      !["completed", "cancelled"].includes(String(existing.status || ""))
    ) {
      const account = workspace.data.master.storageAccounts.find((row) => row.id === String(existing.storage_account_id));
      if (account) {
        const accessToken = await getGoogleDriveAccessToken(account);
        const completed = await findCompletedDriveFile(accessToken, String(input.uploadItemId), input.sizeBytes);
        if (completed?.id) {
          const { error: recoveredError } = await admin.from("uc_upload_items").update({
            status: "uploaded_unverified",
            google_file_id: completed.id,
            confirmed_bytes: input.sizeBytes,
            progress: 100,
            session_uri: null,
            session_expires_at: null,
            session_origin: null,
            updated_at: nowIso(),
          }).eq("id", input.uploadItemId);
          if (recoveredError) throw new Error(recoveredError.message);
          return {
            storageAccountId: String(existing.storage_account_id),
            stagingFolderId: String(existing.staging_folder_id || ""),
            confirmedBytes: input.sizeBytes,
            completedGoogleFileId: completed.id as GoogleFileId,
            webViewLink: completed.webViewLink,
            thumbnailLink: completed.thumbnailLink,
          };
        }
      }
      return {
        sessionUri: String(existing.session_uri),
        sessionExpiresAt: String(existing.session_expires_at),
        storageAccountId: String(existing.storage_account_id),
        stagingFolderId: String(existing.staging_folder_id),
        confirmedBytes: Number(existing.confirmed_bytes || 0),
      };
    }
  }

  const access = await selectUploadAccount(
    workspace.data,
    input.uploadBatchId,
    input.batchSizeBytes || input.sizeBytes,
    input.preferredStorageAccountId,
  );
  const staging = await ensureFolderPath(access.accessToken, access.account, [
    { name: "_System", key: "root:system" },
    { name: "Staging", key: "system:staging" },
  ]);
  const timestamp = nowIso();
  const createdAt = String(existing?.created_at || timestamp);

  const baseItem = {
    id: input.uploadItemId,
    batch_id: input.uploadBatchId,
    workspace_id: WORKSPACE_ID,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    last_modified: input.lastModified,
    fingerprint_sha256: input.fingerprint,
    source_flow: input.sourceFlow,
    upload_purpose: input.purpose,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    desired_target_entity_type: input.desiredTargetEntityType,
    kind: input.kind,
    role: input.role,
    caption: input.caption,
    visibility: input.visibility,
    customer_shareable: input.customerShareable,
    attachment_field: input.attachmentField,
    attachment_field_mode: input.attachmentFieldMode,
    required_evidence: input.requiredEvidence,
    storage_account_id: access.account.id,
    staging_folder_id: staging.id,
    file_asset_id: input.fileAssetId,
    attachment_id: input.attachmentId,
    created_at: createdAt,
    updated_at: timestamp,
  };

  const completed = await findCompletedDriveFile(access.accessToken, String(input.uploadItemId), input.sizeBytes);
  if (completed?.id) {
    const { error: itemError } = await admin.from("uc_upload_items").upsert({
      ...baseItem,
      status: "uploaded_unverified",
      google_file_id: completed.id,
      confirmed_bytes: input.sizeBytes,
      progress: 100,
      session_uri: null,
      session_expires_at: null,
      session_origin: null,
      retry_count: Number(existing?.retry_count || 0),
    }, { onConflict: "id" });
    if (itemError) throw new Error(itemError.message);
    return {
      storageAccountId: access.account.id,
      stagingFolderId: staging.id,
      confirmedBytes: input.sizeBytes,
      completedGoogleFileId: completed.id as GoogleFileId,
      webViewLink: completed.webViewLink,
      thumbnailLink: completed.thumbnailLink,
    };
  }

  const initiated = await driveFetch(
    access.accessToken,
    `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,thumbnailLink,parents,appProperties`,
    {
      method: "POST",
      headers: {
        Origin: sessionOrigin,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType || "application/octet-stream",
        "X-Upload-Content-Length": String(input.sizeBytes),
      },
      body: JSON.stringify({
        name: safeSegment(input.fileName, "Upload"),
        parents: [staging.id],
        appProperties: {
          ucWorkspaceId: WORKSPACE_ID,
          ucUploadBatchId: input.uploadBatchId,
          ucUploadItemId: input.uploadItemId,
          ucFileAssetId: input.fileAssetId,
          ucAttachmentId: input.attachmentId,
          ucPurpose: input.purpose,
          ucTargetEntityType: input.targetEntityType,
          ucTargetEntityId: input.targetEntityId,
          ucFingerprint: input.fingerprint,
        },
      }),
    },
  );
  const sessionUri = initiated.headers.get("location");
  if (!initiated.ok || !sessionUri) {
    const payload = await initiated.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "Google Drive did not create a resumable upload session.");
  }

  const sessionExpiresAt = new Date(Date.now() + 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const { error: itemError } = await admin.from("uc_upload_items").upsert({
    ...baseItem,
    status: "uploading",
    session_uri: sessionUri,
    session_expires_at: sessionExpiresAt,
    session_origin: sessionOrigin,
    confirmed_bytes: 0,
    progress: 0,
    retry_count: Number(existing?.retry_count || 0) + (existing ? 1 : 0),
    google_file_id: null,
  }, { onConflict: "id" });
  if (itemError) throw new Error(itemError.message);

  return {
    sessionUri,
    sessionExpiresAt,
    storageAccountId: access.account.id,
    stagingFolderId: staging.id,
    confirmedBytes: 0,
  };
}
