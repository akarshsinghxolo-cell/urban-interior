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
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
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
    // The server also returns the saved FileAsset + EntityFileAttachment
    // so the client can add them to local state without a server round-trip.
    fileAsset?: any;
    attachment?: any;
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
    // QA-DRIVE-001 FIX: Replaced XMLHttpRequest with fetch.
    //
    // The previous XHR implementation caused the server's
    // `request.formData()` parser (Next.js on Vercel Node.js runtime) to
    // silently drop all multipart TEXT fields (fileName, entityType,
    // entityId…), resulting in a 422 "fileName, entityType, and entityId are
    // required" on every upload. The identical FormData sent via fetch
    // parses correctly (verified end-to-end: file lands in Google Drive).
    //
    // Progress reporting is preserved via a ReadableStream wrapper around the
    // serialized body — the browser builds the multipart body + boundary via
    // `new Response(form)`, then we stream the resulting Blob and call
    // onProgress as bytes are pulled.
    //
    // UPLOAD-010: AbortSignal for cancellation (now via fetch's native signal).
    const uploadWithProgress = async (
        form: FormData,
        onProgress?: (pct: number) => void,
        signal?: AbortSignal,
    ): Promise<{ response: Response; payload: any }> => {
        // Let the browser serialize FormData → multipart body + Content-Type
        // (with boundary). This guarantees the server receives a well-formed
        // multipart payload, identical to what `fetch(form)` would send.
        const serialized = new Response(form);
        const body = await serialized.blob();
        const contentType = serialized.headers.get("content-type") || "multipart/form-data";
        const total = body.size;

        // Combine the caller's AbortSignal with a 2-minute timeout.
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
            () => controller.abort(new DOMException("Upload timed out.", "TimeoutError")),
            120000,
        );
        if (signal) {
            if (signal.aborted) {
                window.clearTimeout(timeoutId);
                throw signal.reason instanceof DOMException
                    ? signal.reason
                    : new DOMException("Upload was cancelled.", "AbortError");
            }
            signal.addEventListener(
                "abort",
                () => controller.abort(
                    signal.reason instanceof DOMException
                        ? signal.reason
                        : new DOMException("Upload was cancelled.", "AbortError"),
                ),
                { once: true },
            );
        }

        // Build a progress-tracking ReadableStream only when onProgress is
        // provided. When it isn't, pass the Blob directly — simpler + avoids
        // the streaming-body `duplex: 'half'` requirement.
        let progressStream: ReadableStream<Uint8Array> | undefined;
        if (onProgress && total > 0) {
            let loaded = 0;
            progressStream = new ReadableStream<Uint8Array>({
                start(streamController) {
                    const reader = body.stream().getReader();
                    const pump = (): Promise<void> =>
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                streamController.close();
                                return;
                            }
                            loaded += value.byteLength;
                            onProgress(Math.min(100, Math.round((loaded / total) * 100)));
                            streamController.enqueue(value);
                            return pump();
                        }).catch((err) => {
                            streamController.error(err);
                        });
                    return pump();
                },
            });
        }

        try {
            const fetchInit: RequestInit = {
                method: "POST",
                headers: { "Content-Type": contentType },
                signal: controller.signal,
            };
            if (progressStream) {
                fetchInit.body = progressStream;
                // `duplex: "half"` is required by the Fetch standard when the
                // body is a ReadableStream. Cast needed for older TS lib defs.
                (fetchInit as RequestInit & { duplex: string }).duplex = "half";
            } else {
                fetchInit.body = body;
            }
            const response = await fetch("/api/google-drive/upload", fetchInit);
            const payload = await response.json().catch(() => ({}));
            return { response, payload };
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    let payload: any = {};
    let response: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const result = await uploadWithProgress(makeForm(), input.onProgress, input.signal);
            response = result.response;
            payload = result.payload;
        } catch (uploadError) {
            // Don't retry on AbortError (user cancelled) or TimeoutError
            // (2-minute timeout exceeded). These are intentional stops.
            if (uploadError instanceof DOMException
                && (uploadError.name === "AbortError" || uploadError.name === "TimeoutError")) {
                throw uploadError;
            }
            // Network error (e.g. TypeError "Failed to fetch") — retry if we
            // haven't exhausted attempts.
            if (attempt < 29) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
            }
            throw uploadError;
        }
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
