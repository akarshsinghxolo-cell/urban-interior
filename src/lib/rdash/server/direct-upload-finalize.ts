import type { AuthenticatedUser } from "./auth";
import { getWorkspace } from "./workspace";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getGoogleDriveAccessToken } from "./google-drive";
import { resolveEntityContext } from "../entity-context";
import type { EntityFileAttachment, FileAsset, StorageFolderInstance } from "../types";
import type { FinalizeUploadRequest, FinalizedUploadResult } from "@/lib/uploads/upload-types";
import { DRIVE_API, destinationSegments, driveFetch, ensureFolderPath, nowIso } from "./direct-upload-storage";
import { bumpWorkspaceRevision, updateAttachmentField, upsertEntityRow } from "./direct-upload-persistence";

type UploadItemRow = Record<string, unknown>;

export async function finalizeDirectUpload(user: AuthenticatedUser, input: FinalizeUploadRequest): Promise<FinalizedUploadResult> {
  const admin = getSupabaseAdminClient();
  const { data: rawItem, error } = await admin.from("uc_upload_items").select("*").eq("id", input.uploadItemId).maybeSingle();
  if (error || !rawItem) throw new Error("Pending upload was not found on the server.");
  const item = rawItem as UploadItemRow;

  if (item.status === "completed") {
    const [{ data: assetRow }, { data: attachmentRow }] = await Promise.all([
      admin.from("entity_master_fileAssets").select("data").eq("id", String(item.file_asset_id)).maybeSingle(),
      admin.from("entity_entityFileAttachments").select("data").eq("id", String(item.attachment_id)).maybeSingle(),
    ]);
    if (assetRow?.data && attachmentRow?.data) {
      const asset = assetRow.data as FileAsset;
      const attachment = attachmentRow.data as EntityFileAttachment;
      return {
        uploadBatchId: String(item.batch_id) as FinalizedUploadResult["uploadBatchId"],
        uploadItemId: String(item.id) as FinalizedUploadResult["uploadItemId"],
        googleFileId: String(item.google_file_id) as FinalizedUploadResult["googleFileId"],
        fileAssetId: String(item.file_asset_id) as FinalizedUploadResult["fileAssetId"],
        attachmentId: String(item.attachment_id) as FinalizedUploadResult["attachmentId"],
        storageAccountId: String(item.storage_account_id),
        storageFolderId: asset.storage_folder_instance_id || "",
        webViewLink: asset.web_view_link,
        thumbnailLink: asset.thumbnail_url,
        fileName: asset.file_name,
        mimeType: asset.mime_type || "application/octet-stream",
        sizeBytes: asset.file_size_bytes || Number(item.size_bytes),
        verifiedAt: String(item.verified_at || item.updated_at),
        fileAsset: asset,
        attachment,
      };
    }
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
  if (Number(file.size || 0) !== Number(item.size_bytes || 0)) throw new Error("The Drive file size does not match the selected file.");

  const destinationSegmentsForFile = destinationSegments(workspace.data, input.purpose, input.targetEntityType, input.targetEntityId);
  const destination = await ensureFolderPath(accessToken, account, destinationSegmentsForFile);
  const parents = file.parents || [];
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

  const timestamp = nowIso();
  let context: ReturnType<typeof resolveEntityContext> | undefined;
  try {
    context = resolveEntityContext(workspace.data, input.targetEntityType, input.targetEntityId, "Upload finalization");
  } catch {
    context = undefined;
  }
  const folderInstance: StorageFolderInstance = {
    id: `storage-folder-${account.id}-${destination.id}`,
    storage_account_id: account.id,
    template_id: `canonical-${input.purpose}`,
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
    id: String(item.file_asset_id),
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
    id: String(item.attachment_id),
    file_asset_id: asset.id,
    entity_type: input.targetEntityType,
    entity_id: input.targetEntityId,
    role: String(item.role || "document") as EntityFileAttachment["role"],
    caption: item.caption ? String(item.caption) : undefined,
    visibility: String(item.visibility || "internal") as EntityFileAttachment["visibility"],
    customer_shareable: Boolean(item.customer_shareable),
    created_by: user.name,
    created_at: String(item.created_at || timestamp),
    updated_at: timestamp,
  };

  await Promise.all([
    upsertEntityRow("entity_master_storageFolderInstances", folderInstance.id, folderInstance, user),
    upsertEntityRow("entity_master_fileAssets", asset.id, asset, user),
    upsertEntityRow("entity_entityFileAttachments", attachment.id, attachment, user),
  ]);
  await updateAttachmentField(
    user,
    input.targetEntityType,
    input.targetEntityId,
    input.attachmentField || (item.attachment_field ? String(item.attachment_field) : undefined),
    input.attachmentFieldMode || (item.attachment_field_mode as "set" | "append" | undefined),
    attachment.id,
  );

  const { error: updateError } = await admin.from("uc_upload_items").update({
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    upload_purpose: input.purpose,
    status: "completed",
    google_file_id: file.id,
    final_folder_id: destination.id,
    confirmed_bytes: Number(file.size || item.size_bytes),
    progress: 100,
    verified_at: timestamp,
    finalized_at: timestamp,
    updated_at: timestamp,
  }).eq("id", String(item.id));
  if (updateError) throw new Error(updateError.message);

  const { count } = await admin.from("uc_upload_items").select("id", { count: "exact", head: true })
    .eq("batch_id", String(item.batch_id))
    .neq("status", "completed")
    .neq("status", "cancelled");
  if (!count) {
    await admin.from("uc_upload_batches").update({ status: "completed", updated_at: timestamp }).eq("id", String(item.batch_id));
  }
  await admin.from("uc_upload_events").insert({
    upload_item_id: String(item.id),
    event_type: "completed",
    detail: { googleFileId: file.id, fileAssetId: asset.id, attachmentId: attachment.id, finalFolderId: destination.id },
    created_at: timestamp,
  });
  await bumpWorkspaceRevision();

  return {
    uploadBatchId: String(item.batch_id) as FinalizedUploadResult["uploadBatchId"],
    uploadItemId: String(item.id) as FinalizedUploadResult["uploadItemId"],
    googleFileId: file.id as FinalizedUploadResult["googleFileId"],
    fileAssetId: asset.id as FinalizedUploadResult["fileAssetId"],
    attachmentId: attachment.id as FinalizedUploadResult["attachmentId"],
    storageAccountId: account.id,
    storageFolderId: folderInstance.id,
    webViewLink: asset.web_view_link,
    thumbnailLink: asset.thumbnail_url,
    fileName: asset.file_name,
    mimeType: asset.mime_type || "application/octet-stream",
    sizeBytes: asset.file_size_bytes || 0,
    verifiedAt: timestamp,
    fileAsset: asset,
    attachment,
  };
}

export async function cancelDirectUpload(user: AuthenticatedUser, uploadItemId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: rawItem } = await admin.from("uc_upload_items").select("*").eq("id", uploadItemId).maybeSingle();
  if (!rawItem) return;
  const item = rawItem as UploadItemRow;
  if (item.status !== "completed" && item.google_file_id && item.storage_account_id) {
    const workspace = await getWorkspace();
    const account = workspace.data.master.storageAccounts.find((row) => row.id === String(item.storage_account_id));
    if (account) {
      const token = await getGoogleDriveAccessToken(account);
      await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(String(item.google_file_id))}`, { method: "DELETE" }).catch(() => undefined);
    }
  }
  const timestamp = nowIso();
  await admin.from("uc_upload_items").update({ status: "cancelled", updated_at: timestamp }).eq("id", uploadItemId);
  await admin.from("uc_upload_events").insert({
    upload_item_id: uploadItemId,
    event_type: "cancelled",
    detail: { by: user.userId },
    created_at: timestamp,
  });
}

export async function retryDirectUpload(uploadItemId: string): Promise<void> {
  await getSupabaseAdminClient().from("uc_upload_items").update({
    status: "queued",
    retry_at: null,
    last_error_code: null,
    last_error_message: null,
    updated_at: nowIso(),
  }).eq("id", uploadItemId);
}

export async function reportDirectUploadProgress(input: {
  uploadItemId: string;
  confirmedBytes: number;
  progress: number;
  status: string;
}): Promise<void> {
  await getSupabaseAdminClient().from("uc_upload_items").update({
    confirmed_bytes: Math.max(0, Number(input.confirmedBytes || 0)),
    progress: Math.max(0, Math.min(100, Number(input.progress || 0))),
    status: input.status || "uploading",
    updated_at: nowIso(),
  }).eq("id", input.uploadItemId);
}

export async function listPendingDirectUploads() {
  const { data, error } = await getSupabaseAdminClient().from("uc_upload_items").select("*")
    .neq("status", "completed")
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
