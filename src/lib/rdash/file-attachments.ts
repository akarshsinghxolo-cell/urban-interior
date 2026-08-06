import type { EntityFileAttachment, FileAsset, FileAttachmentEntityType, FileAttachmentRole, ID, RDashDatabase, } from "./types";
import type { FilePreviewSource } from "@/components/rdash/FilePreview";
export type AttachedFile = {
    attachment: EntityFileAttachment;
    asset: FileAsset;
};
export type FileAttachmentReference = {
    attachment_id: ID;
    caption?: string;
    captured_at?: string;
    type?: string;
};
export function entityFiles(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, role?: FileAttachmentRole): AttachedFile[] {
    return (db.entityFileAttachments || [])
        .filter((attachment) => attachment.entity_type === entityType &&
        attachment.entity_id === entityId &&
        (!role || attachment.role === role))
        .map((attachment) => {
        const asset = db.master.fileAssets.find((file) => file.id === attachment.file_asset_id);
        return asset ? { attachment, asset } : undefined;
    })
        .filter((value): value is AttachedFile => Boolean(value))
        .sort((a, b) => a.attachment.created_at.localeCompare(b.attachment.created_at));
}
export function attachedFileById(db: RDashDatabase, attachmentId?: ID): AttachedFile | undefined {
    if (!attachmentId)
        return undefined;
    const attachment = db.entityFileAttachments.find((row) => row.id === attachmentId);
    if (!attachment)
        return undefined;
    const asset = db.master.fileAssets.find((row) => row.id === attachment.file_asset_id);
    return asset ? { attachment, asset } : undefined;
}
export function assetPreview(asset: FileAsset): FilePreviewSource {
    const managedDriveFile = asset.storage_provider === "google_drive" && asset.storage_mode === "managed";
    return {
        fileName: asset.file_name,
        mimeType: asset.mime_type,
        googleFileId: managedDriveFile ? asset.google_file_id : undefined,
        url: asset.web_view_link,
        thumbnailUrl: asset.thumbnail_url,
    };
}
export function attachedPreview(db: RDashDatabase, attachmentId?: ID): FilePreviewSource | undefined {
    const attached = attachedFileById(db, attachmentId);
    return attached ? assetPreview(attached.asset) : undefined;
}
export function attachmentIdsForEntity(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID, role?: FileAttachmentRole): ID[] {
    return entityFiles(db, entityType, entityId, role).map((item) => item.attachment.id);
}
export function displayNameForAttachment(db: RDashDatabase, attachmentId?: ID, fallback = "Attached file") {
    return attachedFileById(db, attachmentId)?.asset.file_name || fallback;
}

export function attachedFilesForIds(db: RDashDatabase, attachmentIds: ID[] | undefined): AttachedFile[] {
  return (attachmentIds || [])
    .map((id) => attachedFileById(db, id))
    .filter((value): value is AttachedFile => Boolean(value));
}
