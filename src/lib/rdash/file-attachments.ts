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
function dedupeAttachedFiles(items: AttachedFile[]): AttachedFile[] {
    const seen = new Set<ID>();
    return items.filter((item) => {
        if (seen.has(item.asset.id))
            return false;
        seen.add(item.asset.id);
        return true;
    }).sort((a, b) => a.attachment.created_at.localeCompare(b.attachment.created_at));
}
/**
 * Files shown in the record Files tab. Ownership stays exact; this helper only
 * surfaces three intentionally small parent roll-ups without copying or moving
 * attachments.
 */
export function entityFilesForPanel(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: ID): AttachedFile[] {
    const files: AttachedFile[] = [...entityFiles(db, entityType, entityId)];
    const add = (type: FileAttachmentEntityType, ids: ID[]) => {
        for (const id of ids)
            files.push(...entityFiles(db, type, id));
    };
    if (entityType === "customer") {
        add("site", db.sites.filter((site) => site.customer_id === entityId).map((site) => site.id));
    }
    else if (entityType === "site") {
        add("workOrder", db.workOrders.filter((order) => order.site_id === entityId).map((order) => order.id));
        add("visit", db.visits.filter((visit) => visit.site_id === entityId).map((visit) => visit.id));
        add("drawing", db.drawings.filter((drawing) => drawing.site_id === entityId).map((drawing) => drawing.id));
    }
    else if (entityType === "workOrder") {
        add("drawing", db.drawings.filter((drawing) => drawing.work_order_id === entityId).map((drawing) => drawing.id));
        add("execution_log", (db.executionLogs || []).filter((entry) => entry.work_order_id === entityId).map((entry) => entry.id));
        const poIds = new Set(db.purchaseOrders.filter((po) => po.work_order_id === entityId).map((po) => po.id));
        add("grn", db.grns.filter((grn) => grn.work_order_id === entityId || poIds.has(grn.po_id)).map((grn) => grn.id));
    }
    return dedupeAttachedFiles(files);
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
        sizeBytes: asset.file_size_bytes,
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
