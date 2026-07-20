import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { uploadManagedFileAsset } from "@/lib/rdash/server/google-drive";
import type { FileAttachmentEntityType, FileAttachmentRole, FileAssetKind } from "@/lib/rdash/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60s for file uploads (Google Drive API can be slow)

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

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 422 });
    }
    if (!fileName || !entityType || !entityId) {
      return NextResponse.json({ error: "fileName, entityType, and entityId are required." }, { status: 422 });
    }

    const current = await getWorkspace();

    // Upload to Google Drive (selects write account, resolves folder, uploads, makes public)
    // Does NOT save anything to the workspace — the client-side store handles that
    // via createFileAssetAndAttach() after receiving this response.
    const uploaded = await uploadManagedFileAsset(user, current.data, {
      file,
      fileName,
      entityType,
      entityId,
      kind,
      role,
    });

    // Return in the format uploadManagedFile() in file-assets.ts expects:
    // { id, name, mimeType, size, webViewLink, thumbnailLink, folderId,
    //   storageAccountId, storageFolderTemplateId, storageFolderInstance }
    return NextResponse.json({
      id: uploaded.id,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      webViewLink: uploaded.webViewLink,
      thumbnailLink: uploaded.thumbnailLink,
      folderId: uploaded.folderId,
      customerId: uploaded.customerId,
      siteId: uploaded.siteId,
      workOrderId: uploaded.workOrderId,
      storageAccountId: uploaded.storageAccountId,
      storageFolderTemplateId: uploaded.storageFolderTemplateId,
      storageFolderInstance: uploaded.storageFolderInstance,
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
