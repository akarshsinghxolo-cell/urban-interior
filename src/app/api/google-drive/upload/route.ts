import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { uploadManagedFileAsset } from "@/lib/rdash/server/google-drive";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { FileAsset, FileAttachmentEntityType, FileAttachmentRole, FileAssetKind, EntityFileAttachment } from "@/lib/rdash/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileName = formData.get("fileName") as string | null;
    const entityType = formData.get("entityType") as FileAttachmentEntityType | null;
    const entityId = formData.get("entityId") as string | null;
    const kind = (formData.get("kind") as string | null) as FileAssetKind | undefined;
    const role = (formData.get("role") as string | null) as FileAttachmentRole | undefined;
    const caption = formData.get("caption") as string | null;
    const visibility = (formData.get("visibility") as string | null) || "internal";
    const customerShareable = formData.get("customerShareable") === "true";

    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 422 });
    if (!fileName || !entityType || !entityId)
      return NextResponse.json({ error: "fileName, entityType, and entityId are required." }, { status: 422 });

    // Client-side file size check (also enforced server-side in uploadManagedFileAsset)
    const maxBytes = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);
    if (file.size > maxBytes)
      return NextResponse.json({ error: `File exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB upload limit.` }, { status: 413 });

    const current = await getWorkspace();

    // Upload to Google Drive
    const uploaded = await uploadManagedFileAsset(user, current.data, {
      file, fileName, entityType, entityId, kind, role,
    });

    // Persist FileAsset + EntityFileAttachment + quota update server-side
    const timestamp = new Date().toISOString();
    const asset: FileAsset = {
      id: `drivefile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      storage_account_id: uploaded.storageAccountId,
      google_file_id: uploaded.id,
      file_name: uploaded.name,
      mime_type: uploaded.mimeType,
      file_size_bytes: uploaded.size,
      kind: kind || "media",
      web_view_link: uploaded.webViewLink,
      thumbnail_url: uploaded.thumbnailLink,
      storage_provider: "google_drive",
      storage_mode: "managed",
      sync_status: "uploaded",
      tags: [],
      status: "active",
      storage_folder_instance_id: uploaded.storageFolderInstance.id,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const existingInstances = current.data.master.storageFolderInstances || [];
    const folderInstanceExists = existingInstances.some((inst) => inst.id === uploaded.storageFolderInstance.id);
    // Enrich the ManagedGoogleFileAsset's storageFolderInstance with the fields
    // required by StorageFolderInstance (status, created_at, updated_at).
    const enrichedFolderInstance = {
      ...uploaded.storageFolderInstance,
      status: "active" as const,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const updatedInstances = folderInstanceExists ? existingInstances : [...existingInstances, enrichedFolderInstance];

    const updatedAccounts = (current.data.master.storageAccounts || []).map((account) =>
      account.id === uploaded.storageAccountId
        ? { ...account, quota_used_bytes: Number(account.quota_used_bytes || 0) + uploaded.size, updated_at: timestamp }
        : account
    );

    const newAttachment: EntityFileAttachment = {
      id: `attach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      file_asset_id: asset.id, entity_type: entityType, entity_id: entityId,
      role: (role || "media") as FileAttachmentRole,
      caption: caption || undefined,
      visibility: visibility as EntityFileAttachment["visibility"],
      customer_shareable: customerShareable,
      created_at: timestamp, updated_at: timestamp,
    };

    // FIX-E2E-002: Replace full saveWorkspace with a lightweight direct UPSERT
    // of just the storageFolderInstance row. The previous saveWorkspace call
    // caused a 409 Conflict when the client also committed (both incremented
    // the workspace revision simultaneously). Now the upload route only
    // persists the folder instance (so future uploads find the cached folder)
    // and returns the FileAsset + Attachment for the client to commit.
    try {
      const admin = getSupabaseAdminClient();
      await admin.from("entity_master_storageFolderInstances").upsert({
        id: enrichedFolderInstance.id,
        workspace_id: "default",
        revision: 0,
        updated_at: timestamp,
        updated_by: user.name,
        data: enrichedFolderInstance,
      }, { onConflict: "id" });
    } catch (folderSaveError) {
      // Non-fatal — the folder exists in Drive; the client will still receive
      // the folder instance and can persist it in its own commit.
      console.error("[google-drive/upload] Failed to persist folder instance:", folderSaveError);
    }

    // Return the upload result + the FileAsset + Attachment so the client
    // can add them to its local store and commit in one operation.
    return NextResponse.json({
      id: uploaded.id, name: uploaded.name, mimeType: uploaded.mimeType, size: uploaded.size,
      webViewLink: uploaded.webViewLink, thumbnailLink: uploaded.thumbnailLink,
      folderId: uploaded.folderId, customerId: uploaded.customerId, siteId: uploaded.siteId,
      workOrderId: uploaded.workOrderId, storageAccountId: uploaded.storageAccountId,
      storageFolderTemplateId: uploaded.storageFolderTemplateId,
      storageFolderInstance: enrichedFolderInstance,
      // Include the saved FileAsset + Attachment so the client can show them immediately
      fileAsset: asset,
      attachment: newAttachment,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : "Google Drive upload failed.";
    console.error("[google-drive/upload] Error:", message);
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication is required." : message },
      { status: message === "UNAUTHORIZED" ? 401 : 422 }
    );
  }
}
