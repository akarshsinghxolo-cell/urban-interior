import type { EntityFileAttachment, FileAsset, FileAttachmentEntityType, FileAttachmentRole, ID, RDashDatabase, } from "./types";
import type { FilePreviewSource } from "@/components/rdash/FilePreview";
import { resolveEntityContext } from "./entity-context";
type AttachedFile = {
    attachment: EntityFileAttachment;
    asset: FileAsset;
};
export type CustomerMediaItem = {
    attachment?: EntityFileAttachment;
    asset: FileAsset;
    section: string;
    sourceLabel: string;
};
export type CustomerMediaGroup = {
    section: string;
    items: CustomerMediaItem[];
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
    const googleFileId = asset.google_file_id || googleFileIdFromUrl(asset.web_view_link);
    const proxyBase = managedDriveFile && googleFileId
        ? `/api/google-drive/stream?fileId=${encodeURIComponent(googleFileId)}`
        : undefined;
    return {
        fileName: asset.file_name,
        mimeType: asset.mime_type,
        googleFileId: managedDriveFile ? googleFileId : undefined,
        url: asset.web_view_link,
        thumbnailUrl: asset.thumbnail_url,
        proxyUrl: proxyBase
            ? `${proxyBase}&account=${encodeURIComponent(asset.storage_account_id || "")}`
            : undefined,
    };
}

export function googleFileIdFromUrl(value?: string): string | undefined {
    if (!value)
        return undefined;
    const pathMatch = value.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    if (pathMatch?.[1])
        return pathMatch[1];
    try {
        const parsed = new URL(value);
        const id = parsed.searchParams.get("id");
        return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : undefined;
    }
    catch {
        return undefined;
    }
}

function customerMediaSection(attachment?: EntityFileAttachment, asset?: FileAsset): string {
    if (attachment?.entity_type === "measurement_revision" || attachment?.role === "measurement") return "Measurement photos";
    if (attachment?.entity_type === "drawing" || attachment?.role === "drawing" || asset?.kind === "drawing") return "Architectural drawings";
    if (["execution_log", "workOrder", "variation_request"].includes(attachment?.entity_type || "")) return "Work execution media";
    if (["site", "room", "visit"].includes(attachment?.entity_type || "") || ["photo", "video"].includes(attachment?.role || "")) return "Site and area media";
    if (attachment?.entity_type === "workRequired") return "Requirement files";
    if (["quotation", "quotation_item", "accepted_scope"].includes(attachment?.entity_type || "")) return "Quotation files";
    if (["payment", "invoice", "customer_receipt"].includes(attachment?.entity_type || "")) return "Finance documents";
    return "Customer documents";
}

function attachmentCustomerId(db: RDashDatabase, attachment: EntityFileAttachment): ID | undefined {
    try {
        return resolveEntityContext(db, attachment.entity_type, attachment.entity_id, "Customer media").customerId;
    }
    catch {
        return undefined;
    }
}

export function customerMediaItems(db: RDashDatabase, customerId: ID): CustomerMediaItem[] {
    const attachmentsByAsset = new Map<ID, EntityFileAttachment[]>();
    for (const attachment of db.entityFileAttachments || []) {
        const entries = attachmentsByAsset.get(attachment.file_asset_id) || [];
        entries.push(attachment);
        attachmentsByAsset.set(attachment.file_asset_id, entries);
    }
    const items: CustomerMediaItem[] = [];
    for (const asset of db.master.fileAssets || []) {
        if (asset.status !== "active") continue;
        const matching = (attachmentsByAsset.get(asset.id) || []).filter((attachment) =>
            (attachment.entity_type === "customer" && attachment.entity_id === customerId)
            || attachmentCustomerId(db, attachment) === customerId,
        );
        if (asset.customer_id !== customerId && matching.length === 0) continue;
        const attachment = matching.find((row) => row.entity_type === "measurement_revision")
            || matching.find((row) => row.entity_type === "drawing")
            || matching.find((row) => row.entity_type !== "customer")
            || matching[0];
        items.push({
            attachment,
            asset,
            section: customerMediaSection(attachment, asset),
            sourceLabel: attachment?.entity_label || attachment?.caption || customerMediaSection(attachment, asset),
        });
    }
    return items.sort((a, b) => String(b.attachment?.created_at || b.asset.created_at).localeCompare(String(a.attachment?.created_at || a.asset.created_at)));
}

export function customerMediaGroups(db: RDashDatabase, customerId: ID): CustomerMediaGroup[] {
    const groups = new Map<string, CustomerMediaItem[]>();
    for (const item of customerMediaItems(db, customerId)) {
        const entries = groups.get(item.section) || [];
        entries.push(item);
        groups.set(item.section, entries);
    }
    const order = ["Customer documents", "Measurement photos", "Architectural drawings", "Site and area media", "Requirement files", "Work execution media", "Quotation files", "Finance documents"];
    return [...groups.entries()]
        .map(([section, items]) => ({ section, items }))
        .sort((a, b) => (order.indexOf(a.section) < 0 ? order.length : order.indexOf(a.section)) - (order.indexOf(b.section) < 0 ? order.length : order.indexOf(b.section)));
}

export function fileCustomerNames(db: RDashDatabase, asset: FileAsset): string[] {
    const ids = new Set<ID>();
    if (asset.customer_id) ids.add(asset.customer_id);
    if (asset.site_id) {
        const site = db.sites.find((row) => row.id === asset.site_id);
        if (site) ids.add(site.customer_id);
    }
    for (const attachment of db.entityFileAttachments || []) {
        if (attachment.file_asset_id !== asset.id) continue;
        const customerId = attachmentCustomerId(db, attachment);
        if (customerId) ids.add(customerId);
    }
    return [...ids].map((id) => db.customers.find((row) => row.id === id)?.name || id);
}
export function attachedPreview(db: RDashDatabase, attachmentId?: ID): FilePreviewSource | undefined {
    const attached = attachedFileById(db, attachmentId);
    return attached ? assetPreview(attached.asset) : undefined;
}

/** Returns an attachment ID only after it has been persisted. */
export function confirmedAttachmentId(value: unknown): ID | undefined {
    if (!value || typeof value !== "object" || !("attachment_id" in value)) return undefined;
    const id = (value as { attachment_id?: unknown }).attachment_id;
    return typeof id === "string" && id ? id : undefined;
}
export function attachedFilesForIds(db: RDashDatabase, attachmentIds: ID[] | undefined): AttachedFile[] {
  return (attachmentIds || [])
    .map((id) => attachedFileById(db, id))
    .filter((value): value is AttachedFile => Boolean(value));
}
