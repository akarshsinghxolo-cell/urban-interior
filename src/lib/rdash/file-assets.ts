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
export async function uploadManagedFile(input: ManagedUploadInput): Promise<ManagedDriveUpload> {
    const file = input.file || (input.dataUrl ? await dataUrlToBlob(input.dataUrl) : undefined);
    if (!file)
        throw new Error("Select a file before uploading.");
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
    for (let attempt = 0; attempt < 10; attempt += 1) {
        response = await fetch("/api/google-drive/upload", { method: "POST", body: makeForm() });
        payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.id && payload?.webViewLink && payload?.storageAccountId && payload?.storageFolderInstance)
            return payload as ManagedDriveUpload;
        const waitingForServerCommit = response.status === 422 && /not found|does not resolve|saved entity|does not exist/i.test(String(payload?.error || ""));
        if (!waitingForServerCommit || attempt === 9)
            break;
        await new Promise((resolve) => setTimeout(resolve, 250));
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
