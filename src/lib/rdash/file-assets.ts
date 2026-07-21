import type { FileAttachmentEntityType, FileAttachmentRole, FileAssetCreateInput, FileAssetKind, EntityFileAttachment, } from "./types";
export type ManagedUploadInput = {
    file?: File | Blob;
    dataUrl?: string;
    fileName: string;
    entityType: FileAttachmentEntityType;
    entityId: string;
    kind?: FileAssetKind;
    role?: FileAttachmentRole;
    caption?: string;
    visibility?: EntityFileAttachment["visibility"];
    customerShareable?: boolean;
};
export type ManagedDriveUpload = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    webViewLink: string;
    thumbnailLink?: string;
    folderId?: string;
    customerId?: string;
    siteId?: string;
    workOrderId?: string;
    storageAccountId: string;
    storageFolderTemplateId: string;
    storageFolderInstance: {
        id: string;
        storage_account_id: string;
        template_id: string;
        google_folder_id?: string;
        folder_path: string;
        web_view_link?: string;
    };
};
export const MANAGED_FILE_ACCEPT = "image/*,video/*,application/pdf,.pdf";
export async function readFileAsDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not prepare the selected file."));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
    });
}
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    if (!response.ok)
        throw new Error("Could not read the selected file.");
    return response.blob();
}
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const ALLOWED_MIME_TYPES = [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
    "video/mp4", "video/avi", "video/quicktime", "video/x-matroska",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword", "application/vnd.ms-excel",
    "text/plain", "text/csv",
    "application/zip", "application/x-rar-compressed",
];

export async function uploadManagedFile(input: ManagedUploadInput): Promise<ManagedDriveUpload> {
    const file = input.file || (input.dataUrl ? await dataUrlToBlob(input.dataUrl) : undefined);
    if (!file)
        throw new Error("Select a file before uploading.");
    // Client-side file size validation
    if (file.size > MAX_UPLOAD_BYTES)
        throw new Error(`File is ${Math.round(file.size / 1024 / 1024)} MB. Maximum upload size is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
    // Client-side MIME type validation (only if type is known)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith("image/") && !file.type.startsWith("video/"))
        throw new Error(`File type "${file.type}" is not allowed. Upload images, videos, PDFs, or documents.`);
    const makeForm = () => {
        const form = new FormData();
        form.append("file", file, input.fileName);
        form.append("fileName", input.fileName);
        form.append("entityType", input.entityType);
        form.append("entityId", input.entityId);
        if (input.kind)
            form.append("kind", input.kind);
        if (input.role)
            form.append("role", input.role);
        if (input.caption)
            form.append("caption", input.caption);
        if (input.visibility)
            form.append("visibility", input.visibility);
        form.append("customerShareable", String(Boolean(input.customerShareable)));
        return form;
    };
    let payload: any = {};
    let response: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
        response = await fetch("/api/google-drive/upload", { method: "POST", body: makeForm() });
        payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.id && payload?.webViewLink && payload?.storageAccountId && payload?.storageFolderInstance)
            return payload as ManagedDriveUpload;
        const waitingForServerCommit = response.status === 422 && /not found|does not resolve|saved entity|does not exist|saved.*before uploading|entity is required/i.test(String(payload?.error || ""));
        if (!waitingForServerCommit || attempt === 29)
            break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(payload?.error || "Google Drive upload failed.");
}
export function asManagedFileAsset(upload: ManagedDriveUpload, input: Pick<ManagedUploadInput, "kind">): FileAssetCreateInput {
    return {
        storage_account_id: upload.storageAccountId,
        storage_folder_instance_id: upload.storageFolderInstance.id,
        storage_folder_instance: upload.storageFolderInstance,
        google_file_id: upload.id,
        file_name: upload.name,
        mime_type: upload.mimeType,
        kind: input.kind || "document",
        web_view_link: upload.webViewLink,
        thumbnail_url: upload.thumbnailLink,
        file_size_bytes: upload.size,
        storage_provider: "google_drive",
        storage_mode: "managed",
        sync_status: "uploaded",
    };
}
export function looksLikeEmbeddedBinary(value?: string) { return Boolean(value && /^(data:|blob:)/i.test(value)); }
