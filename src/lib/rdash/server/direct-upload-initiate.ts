import type { AuthenticatedUser } from "./auth";
import { getWorkspace } from "./workspace";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { BindUploadRequest, InitiateUploadRequest, InitiateUploadResponse } from "@/lib/uploads/upload-types";
import {
  DRIVE_UPLOAD_API,
  MAX_UPLOAD_BYTES,
  WORKSPACE_ID,
  driveFetch,
  ensureFolderPath,
  nowIso,
  safeSegment,
  selectUploadAccount,
} from "./direct-upload-storage";

export async function bindDirectUpload(user: AuthenticatedUser, input: BindUploadRequest): Promise<void> {
  if (!input.uploadBatchId || !input.uploadItemId) throw new Error("Upload batch and item identities are required.");
  const admin = getSupabaseAdminClient();
  const timestamp = nowIso();
  const [{ error: batchError }, { error: itemError }] = await Promise.all([
    admin.from("uc_upload_batches").update({
      target_entity_type: input.targetEntityType,
      target_entity_id: input.targetEntityId,
      upload_purpose: input.purpose,
      updated_at: timestamp,
    }).eq("id", input.uploadBatchId),
    admin.from("uc_upload_items").update({
      target_entity_type: input.targetEntityType,
      target_entity_id: input.targetEntityId,
      upload_purpose: input.purpose,
      attachment_field: input.attachmentField,
      attachment_field_mode: input.attachmentFieldMode,
      updated_at: timestamp,
    }).eq("id", input.uploadItemId),
  ]);
  if (batchError) throw new Error(batchError.message);
  if (itemError) throw new Error(itemError.message);
  await admin.from("uc_upload_events").insert({
    upload_item_id: input.uploadItemId,
    event_type: "bound",
    detail: { by: user.userId, targetEntityType: input.targetEntityType, targetEntityId: input.targetEntityId, purpose: input.purpose },
    created_at: timestamp,
  });
}

export async function initiateDirectUpload(user: AuthenticatedUser, input: InitiateUploadRequest): Promise<InitiateUploadResponse> {
  if (!input.uploadBatchId || !input.uploadItemId || !input.fileName || !input.sizeBytes) {
    throw new Error("Upload identity, file name, and file size are required.");
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`);
  }

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("uc_upload_items")
    .select("session_uri,session_expires_at,storage_account_id,staging_folder_id,confirmed_bytes,status")
    .eq("id", input.uploadItemId)
    .maybeSingle();
  if (
    existing?.session_uri &&
    existing.session_expires_at &&
    Date.parse(String(existing.session_expires_at)) > Date.now() &&
    existing.status !== "completed"
  ) {
    return {
      sessionUri: String(existing.session_uri),
      sessionExpiresAt: String(existing.session_expires_at),
      storageAccountId: String(existing.storage_account_id),
      stagingFolderId: String(existing.staging_folder_id),
      confirmedBytes: Number(existing.confirmed_bytes || 0),
    };
  }

  const workspace = await getWorkspace();
  const access = await selectUploadAccount(workspace.data, input.uploadBatchId, input.batchSizeBytes || input.sizeBytes);
  const staging = await ensureFolderPath(access.accessToken, access.account, [
    { name: "_System", key: "root:system" },
    { name: "Staging", key: "system:staging" },
  ]);
  const initiated = await driveFetch(
    access.accessToken,
    `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,thumbnailLink,parents,appProperties`,
    {
      method: "POST",
      headers: {
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

  const timestamp = nowIso();
  const sessionExpiresAt = new Date(Date.now() + 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const { error: batchError } = await admin.from("uc_upload_batches").upsert({
    id: input.uploadBatchId,
    workspace_id: WORKSPACE_ID,
    source_flow: input.sourceFlow,
    source_label: input.sourceLabel,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    target_label: input.targetEntityId,
    upload_purpose: input.purpose,
    status: "uploading",
    storage_account_id: access.account.id,
    required_evidence: input.requiredEvidence,
    created_by_user_id: user.userId,
    created_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "id" });
  if (batchError) throw new Error(batchError.message);

  const { error: itemError } = await admin.from("uc_upload_items").upsert({
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
    status: "uploading",
    session_uri: sessionUri,
    session_expires_at: sessionExpiresAt,
    storage_account_id: access.account.id,
    staging_folder_id: staging.id,
    confirmed_bytes: 0,
    progress: 0,
    retry_count: 0,
    file_asset_id: input.fileAssetId,
    attachment_id: input.attachmentId,
    created_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "id" });
  if (itemError) throw new Error(itemError.message);

  await admin.from("uc_upload_events").insert({
    upload_item_id: input.uploadItemId,
    event_type: "session_started",
    detail: { storageAccountId: access.account.id, stagingFolderId: staging.id },
    created_at: timestamp,
  });

  return {
    sessionUri,
    sessionExpiresAt,
    storageAccountId: access.account.id,
    stagingFolderId: staging.id,
    confirmedBytes: 0,
  };
}
