import type { AuthenticatedUser } from "./auth";
import { getWorkspace } from "./workspace";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getGoogleDriveAccessToken } from "./google-drive";
import { resolveEntityContext } from "../entity-context";
import type { EntityFileAttachment, FileAsset, FileAttachmentEntityType, StorageFolderInstance } from "../types";
import type { FinalizeUploadRequest, FinalizedUploadResult, GoogleFileId, UploadPurpose } from "@/lib/uploads/upload-types";
import { DRIVE_API, destinationSegments, driveFetch, ensureFolderPath, nowIso } from "./direct-upload-storage";
import { bumpWorkspaceRevision, updateAttachmentField, upsertEntityRow, withUploadCommitContext } from "./direct-upload-persistence";

type UploadItemRow = Record<string, unknown>;

function requiredString(value: unknown, label: string): string {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is missing from the pending upload.`);
  return result;
}

async function makeDriveFilePublic(accessToken: string, fileId: string): Promise<void> {
  const existing = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role)`,
  );
  const existingPayload = await existing.json().catch(() => ({})) as {
    permissions?: Array<{ id?: string; type?: string; role?: string }>;
    error?: { message?: string };
  };
  if (!existing.ok) throw new Error(existingPayload.error?.message || "Google Drive could not read file sharing permissions.");
  if (existingPayload.permissions?.some((permission) => permission.type === "anyone" && permission.role === "reader")) return;

  const created = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    },
  );
  if (!created.ok) {
    const payload = await created.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "Google Drive could not make the uploaded file public.");
  }
}

function assertFinalizationIdentity(item: UploadItemRow, input: FinalizeUploadRequest) {
  const serverTargetType = requiredString(item.target_entity_type, "Target entity type") as FileAttachmentEntityType;
  const serverTargetId = requiredString(item.target_entity_id, "Target entity ID");
  const serverPurpose = requiredString(item.upload_purpose, "Upload purpose") as UploadPurpose;
  const storedGoogleFileId = item.google_file_id ? String(item.google_file_id) : undefined;

  if (serverTargetType !== input.targetEntityType || serverTargetId !== input.targetEntityId || serverPurpose !== input.purpose) {
    throw new Error("The pending upload routing changed after the Drive session started. Bind the upload before finalizing it.");
  }
  if (storedGoogleFileId && storedGoogleFileId !== String(input.googleFileId)) {
    throw new Error("The Google Drive file ID does not match the completed pending upload.");
  }
  if (["cancel_requested", "cleanup_pending", "cancelled"].includes(String(item.status || ""))) {
    throw new Error("This upload is being cancelled and cannot be finalized.");
  }
  return { serverTargetType, serverTargetId, serverPurpose };
}

function finalizedResult(item: UploadItemRow, asset: FileAsset, attachment: EntityFileAttachment, verifiedAt: string): FinalizedUploadResult {
  return {
    uploadBatchId: String(item.batch_id) as FinalizedUploadResult["uploadBatchId"],
    uploadItemId: String(item.id) as FinalizedUploadResult["uploadItemId"],
    googleFileId: String(asset.google_file_id || item.google_file_id) as FinalizedUploadResult["googleFileId"],
    fileAssetId: String(item.file_asset_id) as FinalizedUploadResult["fileAssetId"],
    attachmentId: String(item.attachment_id) as FinalizedUploadResult["attachmentId"],
    storageAccountId: String(asset.storage_account_id || item.storage_account_id),
    storageFolderId: asset.storage_folder_instance_id || "",
    webViewLink: asset.web_view_link,
    thumbnailLink: asset.thumbnail_url,
    fileName: asset.file_name,
    mimeType: asset.mime_type || "application/octet-stream",
    sizeBytes: asset.file_size_bytes || Number(item.size_bytes),
    verifiedAt,
    fileAsset: asset,
    attachment,
  };
}

async function markUploadCompleted(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  item: UploadItemRow,
  result: FinalizedUploadResult,
  finalFolderId?: string,
): Promise<void> {
  const timestamp = nowIso();
  const update: Record<string, unknown> = {
    status: "completed",
    google_file_id: result.googleFileId,
    confirmed_bytes: result.sizeBytes,
    progress: 100,
    verified_at: result.verifiedAt || timestamp,
    finalized_at: timestamp,
    updated_at: timestamp,
  };
  if (finalFolderId) update.final_folder_id = finalFolderId;

  const { error: updateError } = await admin.from("uc_upload_items")
    .update(update)
    .eq("id", String(item.id));
  if (updateError) throw new Error(updateError.message);

  const { count, error: countError } = await admin.from("uc_upload_items").select("id", { count: "exact", head: true })
    .eq("batch_id", String(item.batch_id))
    .neq("status", "completed")
    .neq("status", "cancelled");
  if (countError) {
    console.warn("[upload-finalize] Could not count remaining batch items", countError.message);
  } else if (!count) {
    const { error: batchError } = await admin.from("uc_upload_batches")
      .update({ status: "completed", updated_at: timestamp })
      .eq("id", String(item.batch_id));
    if (batchError) console.warn("[upload-finalize] Could not mark batch completed", batchError.message);
  }

  const { error: eventError } = await admin.from("uc_upload_events").insert({
    upload_item_id: String(item.id),
    event_type: "completed",
    detail: {
      googleFileId: result.googleFileId,
      fileAssetId: result.fileAssetId,
      attachmentId: result.attachmentId,
      finalFolderId,
    },
    created_at: timestamp,
  });
  if (eventError) console.warn("[upload-finalize] Could not write completion event", eventError.message);
}

async function registeredResult(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  item: UploadItemRow,
  input: FinalizeUploadRequest,
): Promise<FinalizedUploadResult | null> {
  const [{ data: assetRow, error: assetError }, { data: attachmentRow, error: attachmentError }] = await Promise.all([
    admin.from("entity_master_fileAssets").select("data").eq("id", String(item.file_asset_id)).maybeSingle(),
    admin.from("entity_entityFileAttachments").select("data").eq("id", String(item.attachment_id)).maybeSingle(),
  ]);
  if (assetError) throw new Error(assetError.message);
  if (attachmentError) throw new Error(attachmentError.message);
  if (!assetRow?.data || !attachmentRow?.data) return null;

  const asset = assetRow.data as FileAsset;
  const attachment = attachmentRow.data as EntityFileAttachment;
  if (asset.google_file_id !== String(input.googleFileId)) return null;
  if (attachment.id !== String(item.attachment_id) || attachment.file_asset_id !== asset.id) return null;
  return finalizedResult(item, asset, attachment, String(item.verified_at || item.updated_at || nowIso()));
}

export async function finalizeDirectUpload(user: AuthenticatedUser, input: FinalizeUploadRequest): Promise<FinalizedUploadResult> {
  const admin = getSupabaseAdminClient();
  const { data: rawItem, error } = await admin.from("uc_upload_items").select("*").eq("id", input.uploadItemId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!rawItem) throw new Error("Pending upload was not found on the server.");
  const item = rawItem as UploadItemRow;
  const { serverTargetType, serverTargetId, serverPurpose } = assertFinalizationIdentity(item, input);

  // If workspace persistence succeeded but the final uc_upload_items update did
  // not, recover from the already-registered rows instead of redoing Drive moves
  // and workspace writes. This also keeps completed finalization idempotent.
  const existingResult = await registeredResult(admin, item, input);
  if (existingResult) {
    if (item.status !== "completed") {
      await markUploadCompleted(admin, item, existingResult, item.final_folder_id ? String(item.final_folder_id) : undefined);
    }
    return existingResult;
  }
  if (item.status === "completed") {
    throw new Error("The completed upload is missing its registered FileAsset or attachment.");
  }

  const workspace = await getWorkspace();
  const account = workspace.data.master.storageAccounts.find((row) => row.id === String(item.storage_account_id));
  if (!account) throw new Error("The Drive account used for this upload is no longer connected.");
  const accessToken = await getGoogleDriveAccessToken(account);
  const response = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(input.googleFileId)}?fields=id,name,mimeType,size,webViewLink,thumbnailLink,parents,trashed,appProperties`,
  );
  const file = await response.json().catch(() => ({})) as {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    webViewLink?: string;
    thumbnailLink?: string;
    parents?: string[];
    trashed?: boolean;
    appProperties?: Record<string, string>;
    error?: { message?: string };
  };
  if (!response.ok || !file.id) throw new Error(file.error?.message || "Google Drive could not verify the uploaded file.");
  if (file.trashed) throw new Error("The uploaded Google Drive file is in Trash.");
  if (file.appProperties?.ucUploadItemId !== String(input.uploadItemId)) throw new Error("The Drive file does not match this pending upload.");
  if (file.appProperties?.ucUploadBatchId !== String(item.batch_id)) throw new Error("The Drive file belongs to a different upload batch.");
  if (file.appProperties?.ucFileAssetId !== String(item.file_asset_id)) throw new Error("The Drive file has an unexpected FileAsset identity.");
  if (file.appProperties?.ucAttachmentId !== String(item.attachment_id)) throw new Error("The Drive file has an unexpected attachment identity.");
  if (Number(file.size || 0) !== Number(item.size_bytes || 0)) throw new Error("The Drive file size does not match the selected file.");

  const destinationSegmentsForFile = destinationSegments(workspace.data, serverPurpose, serverTargetType, serverTargetId);
  const destination = await ensureFolderPath(accessToken, account, destinationSegmentsForFile);
  const parents = file.parents || [];
  const stagingFolderId = String(item.staging_folder_id || "");
  if (!parents.includes(destination.id) && stagingFolderId && !parents.includes(stagingFolderId)) {
    throw new Error("The uploaded file is no longer in its expected Drive staging or destination folder.");
  }
  if (!parents.includes(destination.id)) {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
    url.searchParams.set("addParents", destination.id);
    if (parents.length) url.searchParams.set("removeParents", parents.join(","));
    url.searchParams.set("fields", "id,name,mimeType,size,webViewLink,thumbnailLink,parents");
    const moved = await driveFetch(accessToken, url.toString(), { method: "PATCH" });
    const movedFile = await moved.json().catch(() => ({})) as typeof file;
    if (!moved.ok) throw new Error(movedFile.error?.message || "The uploaded file could not be moved to its final Drive folder.");
    Object.assign(file, movedFile);
  }

  await makeDriveFilePublic(accessToken, file.id);

  const timestamp = nowIso();
  let context: ReturnType<typeof resolveEntityContext> | undefined;
  try {
    context = resolveEntityContext(workspace.data, serverTargetType, serverTargetId, "Upload finalization");
  } catch {
    context = undefined;
  }
  const folderInstance: StorageFolderInstance = {
    id: `storage-folder-${account.id}-${destination.id}`,
    storage_account_id: account.id,
    template_id: `canonical-${serverPurpose}`,
    google_folder_id: destination.id,
    folder_path: destinationSegmentsForFile.map((segment) => segment.name).join("/"),
    web_view_link: destination.webViewLink,
    customer_id: context?.customerId,
    site_id: context?.siteId,
    work_order_id: context?.workOrderId,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const asset: FileAsset = {
    id: requiredString(item.file_asset_id, "FileAsset ID"),
    storage_account_id: account.id,
    storage_folder_instance_id: folderInstance.id,
    google_file_id: file.id,
    file_name: file.name || String(item.file_name),
    mime_type: file.mimeType || String(item.mime_type),
    file_size_bytes: Number(file.size || item.size_bytes),
    kind: String(item.kind || "document") as FileAsset["kind"],
    web_view_link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    thumbnail_url: file.thumbnailLink,
    storage_provider: "google_drive",
    storage_mode: "managed",
    sync_status: "uploaded",
    tags: [String(item.upload_purpose || ""), String(item.source_flow || "")].filter(Boolean),
    status: "active",
    customer_id: context?.customerId,
    site_id: context?.siteId,
    created_at: String(item.created_at || timestamp),
    updated_at: timestamp,
  };
  const attachment: EntityFileAttachment = {
    id: requiredString(item.attachment_id, "Attachment ID"),
    file_asset_id: asset.id,
    entity_type: serverTargetType,
    entity_id: serverTargetId,
    role: String(item.role || "document") as EntityFileAttachment["role"],
    caption: item.caption ? String(item.caption) : undefined,
    visibility: String(item.visibility || "internal") as EntityFileAttachment["visibility"],
    customer_shareable: Boolean(item.customer_shareable),
    created_by: user.name,
    created_at: String(item.created_at || timestamp),
    updated_at: timestamp,
  };

  await withUploadCommitContext(async () => {
    await upsertEntityRow("entity_master_storageFolderInstances", folderInstance.id, folderInstance, user);
    await upsertEntityRow("entity_master_fileAssets", asset.id, asset, user);
    await upsertEntityRow("entity_entityFileAttachments", attachment.id, attachment, user);
    await updateAttachmentField(
      user,
      serverTargetType,
      serverTargetId,
      input.attachmentField || (item.attachment_field ? String(item.attachment_field) : undefined),
      input.attachmentFieldMode || (item.attachment_field_mode as "set" | "append" | undefined),
      attachment.id,
    );
    await bumpWorkspaceRevision();
  });

  const result = finalizedResult(item, asset, attachment, timestamp);
  await markUploadCompleted(admin, item, result, destination.id);
  return result;
}

export async function cancelDirectUpload(user: AuthenticatedUser, uploadItemId: string, clientGoogleFileId?: GoogleFileId): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: rawItem, error } = await admin.from("uc_upload_items").select("*").eq("id", uploadItemId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!rawItem) return;
  const item = rawItem as UploadItemRow;
  if (item.status === "completed") throw new Error("Completed uploads cannot be cancelled.");

  const googleFileId = String(item.google_file_id || clientGoogleFileId || "");
  if (googleFileId && item.storage_account_id) {
    const workspace = await getWorkspace();
    const account = workspace.data.master.storageAccounts.find((row) => row.id === String(item.storage_account_id));
    if (!account) throw new Error("The Drive account used for cleanup is no longer connected.");
    const token = await getGoogleDriveAccessToken(account);
    const deleted = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(googleFileId)}`, { method: "DELETE" });
    if (!deleted.ok && deleted.status !== 404) {
      const payload = await deleted.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(payload.error?.message || `Google Drive cleanup failed (${deleted.status}).`);
    }
  }

  const timestamp = nowIso();
  const { error: updateError } = await admin.from("uc_upload_items")
    .update({ status: "cancelled", google_file_id: googleFileId || null, updated_at: timestamp })
    .eq("id", uploadItemId);
  if (updateError) throw new Error(updateError.message);

  await admin.from("uc_upload_events").insert({
    upload_item_id: uploadItemId,
    event_type: "cancelled",
    detail: { by: user.userId, googleFileId: googleFileId || undefined },
    created_at: timestamp,
  });

  const { count } = await admin.from("uc_upload_items").select("id", { count: "exact", head: true })
    .eq("batch_id", String(item.batch_id))
    .neq("status", "completed")
    .neq("status", "cancelled");
  if (!count) {
    await admin.from("uc_upload_batches").update({ status: "cancelled", updated_at: timestamp }).eq("id", String(item.batch_id));
  }
}

export async function retryDirectUpload(uploadItemId: string): Promise<void> {
  const { error } = await getSupabaseAdminClient().from("uc_upload_items").update({
    status: "queued",
    retry_at: null,
    last_error_code: null,
    last_error_message: null,
    updated_at: nowIso(),
  }).eq("id", uploadItemId);
  if (error) throw new Error(error.message);
}

export async function reportDirectUploadProgress(input: {
  uploadItemId: string;
  confirmedBytes: number;
  progress: number;
  status: string;
  googleFileId?: GoogleFileId;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: item, error: readError } = await admin.from("uc_upload_items").select("size_bytes,status").eq("id", input.uploadItemId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) throw new Error("Pending upload was not found on the server.");
  if (["completed", "cancelled"].includes(String(item.status || ""))) return;
  const sizeBytes = Math.max(0, Number(item.size_bytes || 0));
  const confirmedBytes = Math.max(0, Math.min(sizeBytes, Number(input.confirmedBytes || 0)));
  const { error } = await admin.from("uc_upload_items").update({
    confirmed_bytes: confirmedBytes,
    progress: Math.max(0, Math.min(100, Number(input.progress || 0))),
    status: input.status || "uploading",
    google_file_id: input.googleFileId || undefined,
    updated_at: nowIso(),
  }).eq("id", input.uploadItemId);
  if (error) throw new Error(error.message);
}

export async function listPendingDirectUploads() {
  const { data, error } = await getSupabaseAdminClient().from("uc_upload_items").select("*")
    .neq("status", "completed")
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
