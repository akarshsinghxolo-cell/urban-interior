import type { RDashDatabase, FileAttachmentEntityType, FileAssetKind, FileAttachmentRole, StorageAccount, StorageFolderTemplate, } from "../types";
import { resolveEntityContext } from "../entity-context";
import { inferStoragePurpose, logicalStoragePath, templateForPurpose, defaultStorageFolderTemplates } from "../storage";
import { accessTokenForDriveConnection } from "./drive-connections";
import type { AuthenticatedUser } from "./auth";
export type ManagedUploadRequest = {
    file: Blob;
    fileName: string;
    entityType: FileAttachmentEntityType;
    entityId: string;
    kind?: FileAssetKind;
    role?: FileAttachmentRole;
    caption?: string;
    visibility?: "internal" | "customer" | "vendor" | "contractor";
    customerShareable?: boolean;
};
export type ManagedGoogleFileAsset = {
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
type UploadScope = {
    customerId?: string;
    siteId?: string;
    workOrderId?: string;
    ownerKind: "customer" | "vendor" | "contractor" | "system";
    ownerId?: string;
    bucket: string;
};
type AccountAccess = {
    account: StorageAccount;
    accessToken: string;
    usedBytes: number;
    limitBytes: number;
};
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const allowedEntityTypes = new Set<FileAttachmentEntityType>([
    "customer", "site", "room", "workRequired", "quotation", "quotation_item", "workOrder", "boq", "boq_item", "purchase_order", "grn", "vendor_bill", "dispatch", "inventory", "drawing", "execution_log", "visit", "task", "followup", "payment", "invoice", "vendor", "vendor_rate", "contractor", "contractor_bid", "contractor_settlement", "commission", "blocked", "thread_message", "communication", "general",
]);
function value(input: unknown) { return typeof input === "string" ? input.trim() : ""; }
function safeSegment(value: string, fallback: string) { const cleaned = value.replace(/[^a-zA-Z0-9._ -]+/g, "-").replace(/\s+/g, " ").replace(/^-+|-+$/g, "").slice(0, 80); return cleaned || fallback; }
function escapeDriveQuery(value: string) { return value.replace(/'/g, "\\'"); }
function rowById<T extends {
    id: string;
}>(rows: T[], id: string) { return rows.find((row) => row.id === id); }
// UPLOAD-017: Server-side MIME type validation
const UPLOADABLE_MIME_PREFIXES = ["image/", "video/", "audio/"];
const UPLOADABLE_MIME_EXACT = new Set([
    "application/pdf",
    "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
    "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
]);
const UPLOADABLE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".mp4", ".mov", ".avi", ".mkv", ".webm", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip", ".rar", ".7z"]);
function isUploadableFile(mime: string, fileName: string): boolean {
    if (mime && (UPLOADABLE_MIME_PREFIXES.some((p) => mime.startsWith(p)) || UPLOADABLE_MIME_EXACT.has(mime))) return true;
    const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
    return UPLOADABLE_EXTENSIONS.has(ext);
}

export function assertUploadRequest(input: {
    entityType?: string;
    entityId?: string;
    fileName?: string;
    fileMime?: string;
}) {
    if (!input.entityType || !allowedEntityTypes.has(input.entityType as FileAttachmentEntityType))
        throw new Error("A valid attachment entity type is required.");
    if (!value(input.entityId))
        throw new Error("A saved entity is required before uploading a file.");
    if (!value(input.fileName))
        throw new Error("A file name is required.");
    // UPLOAD-017: Validate MIME type / extension server-side
    if (input.fileMime || input.fileName) {
        if (!isUploadableFile(input.fileMime || "", input.fileName || "")) {
            throw new Error(`File type "${input.fileMime || input.fileName}" is not allowed. Upload images, videos, PDFs, or documents.`);
        }
    }
}
export function managedFileByGoogleId(db: RDashDatabase, fileId: string) {
    return (db.master.fileAssets || []).find((item) => item.google_file_id === fileId && item.storage_provider === "google_drive" && item.storage_mode === "managed" && item.sync_status === "uploaded");
}
export function canReadManagedFileAsset(user: AuthenticatedUser, db: RDashDatabase, fileId: string) {
    const file = managedFileByGoogleId(db, fileId);
    if (!file)
        return false;
    if (user.role === "Owner" || user.role === "Operations Manager")
        return true;
    const attachments = (db.entityFileAttachments || []).filter((row) => row.file_asset_id === file.id);
    if (!attachments.length)
        return false;
    if (user.role === "Finance")
        return attachments.some((row) => ["payment", "invoice", "vendor_bill"].includes(row.entity_type));
    if (user.role === "Procurement Staff")
        return attachments.some((row) => ["vendor", "purchase_order", "grn", "dispatch", "inventory"].includes(row.entity_type));
    if (user.role === "Field Staff") {
        return attachments.some((row) => {
            if (row.entity_type === "visit")
                return db.visits.find((visit) => visit.id === row.entity_id)?.staff_id === user.staffId;
            if (row.entity_type === "execution_log")
                return db.executionLogs.find((log) => log.id === row.entity_id)?.filed_by_staff_id === user.staffId;
            if (row.entity_type === "grn")
                return db.grns.find((grn) => grn.id === row.entity_id)?.received_by_staff_id === user.staffId;
            return false;
        });
    }
    return false;
}
export async function getGoogleDriveAccessToken(account: StorageAccount): Promise<string> {
    if (!account.oauth_connection_id)
        throw new Error(`Google Drive account “${account.label}” is not connected on this server. Reconnect it before accessing files.`);
    return accessTokenForDriveConnection(account.oauth_connection_id);
}
export function resolveUploadScope(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: string): UploadScope {
    const context = resolveEntityContext(db, entityType, entityId, "Google Drive upload");
    if (["task", "followup"].includes(entityType) && !context.customerId) {
        throw new Error(`${entityType === "task" ? "Task" : "Follow-up"} needs a Customer or linked commercial record before file upload.`);
    }
    return { customerId: context.customerId, siteId: context.siteId, workOrderId: context.workOrderId, ownerKind: context.ownerKind, ownerId: context.ownerId, bucket: context.driveBucket };
}
// UPLOAD-021: canUpload returns boolean (true = allowed, throws if not)
function canUpload(user: AuthenticatedUser, db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: string, role?: FileAttachmentRole): boolean {
    if (user.role === "Owner" || user.role === "Operations Manager")
        return true;
    if (user.role === "Field Staff") {
        if (entityType === "visit") {
            const visit = rowById(db.visits, entityId);
            if (visit?.staff_id === user.staffId)
                return true;
        }
        if (entityType === "execution_log") {
            const log = rowById(db.executionLogs, entityId);
            if (log?.filed_by_staff_id === user.staffId)
                return true;
        }
        if (entityType === "grn") {
            const grn = rowById(db.grns, entityId);
            if (grn && grn.received_by_staff_id === user.staffId && grn.status === "pending_receipt_verification")
                return true;
        }
        if (entityType === "purchase_order" && role === "delivery") {
            const po = rowById(db.purchaseOrders, entityId);
            if (po && (po.status === "sent" || po.status === "partially_received"))
                return true;
        }
    }
    if (user.role === "Finance" && ["payment", "invoice", "vendor_bill"].includes(entityType))
        return true;
    if (user.role === "Procurement Staff" && ["vendor", "purchase_order", "grn", "dispatch"].includes(entityType))
        return true;
    throw new Error("You are not allowed to upload a file to this record.");
}
async function driveRequest(accessToken: string, url: string, init?: RequestInit) {
    return fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) }, cache: "no-store" });
}

// ── UPLOAD-002: Retry with exponential backoff for Drive API calls ──
async function driveRequestWithRetry(accessToken: string, url: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await driveRequest(accessToken, url, init);
            // Retry on 429 (rate limit) or 5xx (server error)
            if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries) {
                    const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, 8s max
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    continue;
                }
            }
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                continue;
            }
        }
    }
    throw lastError || new Error("Google Drive API request failed after retries.");
}
async function accountQuota(account: StorageAccount): Promise<AccountAccess> {
    const accessToken = await getGoogleDriveAccessToken(account);
    const response = await driveRequest(accessToken, `${DRIVE_API}/about?fields=storageQuota(limit,usage)`);
    const payload = await response.json().catch(() => ({})) as {
        storageQuota?: {
            limit?: string;
            usage?: string;
        };
        error?: {
            message?: string;
        };
    };
    if (!response.ok)
        throw new Error(payload.error?.message || `Google Drive quota could not be read for ${account.label}.`);
    return { account, accessToken, usedBytes: Number(payload.storageQuota?.usage || account.quota_used_bytes || 0), limitBytes: Number(payload.storageQuota?.limit || account.quota_limit_bytes || 0) };
}
async function selectLiveWriteAccount(db: RDashDatabase, incomingBytes: number): Promise<AccountAccess> {
    const candidates = [...(db.master.storageAccounts || [])]
        .filter((account) => account.status === "connected" && account.write_enabled !== false)
        .sort((a, b) => a.priority_order - b.priority_order || a.label.localeCompare(b.label));
    if (!candidates.length)
        throw new Error("Connect at least one Google Drive account and enable it for new uploads.");
    const failures: string[] = [];
    for (const account of candidates) {
        try {
            const access = await accountQuota(account);
            const threshold = Math.max(1, Math.min(100, Number(account.switch_threshold_percent || 85))) / 100;
            if (!access.limitBytes || access.usedBytes + incomingBytes < access.limitBytes * threshold)
                return access;
        }
        catch (error) {
            failures.push(error instanceof Error ? error.message : `Could not use ${account.label}.`);
        }
    }
    throw new Error(`No connected Google Drive account is below its configured write threshold. ${failures[0] || "Connect another Drive or increase capacity."}`);
}
// ── UPLOAD-004: In-memory folder cache to avoid race conditions ──
// Key: `${accountId}:${folderPath}`, Value: folder ID + URL
const folderCache = new Map<string, { id: string; webViewLink?: string }>();

async function findOrCreateFolder(accessToken: string, parentId: string, name: string, cacheKey?: string) {
    // Check cache first
    if (cacheKey && folderCache.has(cacheKey)) {
        const cached = folderCache.get(cacheKey)!;
        return cached;
    }
    const query = `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const found = await driveRequestWithRetry(accessToken, `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`);
    const foundPayload = await found.json().catch(() => ({})) as {
        files?: Array<{ id?: string; webViewLink?: string }>;
    };
    if (found.ok && foundPayload.files?.[0]?.id) {
        const result = { id: foundPayload.files[0].id, webViewLink: foundPayload.files[0].webViewLink };
        if (cacheKey) folderCache.set(cacheKey, result);
        return result;
    }
    const created = await driveRequestWithRetry(accessToken, `${DRIVE_API}/files?fields=id,name,webViewLink`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }) });
    const payload = await created.json().catch(() => ({})) as { id?: string; webViewLink?: string; error?: { message?: string } };
    if (!created.ok || !payload.id)
        throw new Error(payload.error?.message || `Could not create Google Drive folder ${name}.`);
    const result = { id: payload.id, webViewLink: payload.webViewLink };
    if (cacheKey) folderCache.set(cacheKey, result);
    return result;
}
async function resolveStorageFolder(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: string, kind: FileAssetKind | undefined, role: FileAttachmentRole | undefined, fileSize: number) {
    const access = await selectLiveWriteAccount(db, fileSize);
    if (!access.account.root_folder_id)
        throw new Error(`Google Drive account “${access.account.label}” has no Urban Castle root folder. Reconnect it before uploading.`);
    const purpose = inferStoragePurpose(entityType, kind, role);
    // Fall back to default templates if the workspace has none configured
    const masterWithTemplates = (db.master.storageFolderTemplates && db.master.storageFolderTemplates.length > 0)
        ? db.master
        : { ...db.master, storageFolderTemplates: defaultStorageFolderTemplates() };
    const template = templateForPurpose(masterWithTemplates, purpose);
    if (!template)
        throw new Error(`No active logical folder template exists for ${purpose.replaceAll("_", " ")}.`);
    const path = logicalStoragePath(db, entityType, entityId, template);
    let folderId = access.account.root_folder_id;
    let folderUrl = access.account.web_view_link;
    let currentPath = "";
    for (const part of path.split("/").map((value) => safeSegment(value, "General")).filter(Boolean)) {
        currentPath += "/" + part;
        const cacheKey = `${access.account.id}:${currentPath}`;
        const folder = await findOrCreateFolder(access.accessToken, folderId, part, cacheKey);
        folderId = folder.id!;
        folderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
    }
    return {
        access,
        template,
        folderId,
        folderUrl,
        path,
        instance: {
            id: `storage-folder-${access.account.id}-${folderId}`,
            storage_account_id: access.account.id,
            template_id: template.id,
            google_folder_id: folderId,
            folder_path: path,
            web_view_link: folderUrl,
        },
    };
}
// UPLOAD-020: Sanitize file names for Google Drive API (remove special chars)
function sanitizeFileName(name: string): string {
    return name
        .replace(/[/\\:*?"<>|]/g, "_")  // Replace Drive-invalid chars
        .replace(/\s+/g, " ")            // Normalize whitespace
        .trim()
        .slice(0, 200);                  // Drive limit is ~100 chars, be safe
}

async function uploadMultipart(accessToken: string, folderId: string, file: Blob, fileName: string) {
    const safeName = sanitizeFileName(fileName);
    const metadata = { name: safeName, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", file, fileName);
    const response = await driveRequestWithRetry(accessToken, `${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,thumbnailLink`, { method: "POST", body: form });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
    if (!response.ok || typeof payload.id !== "string")
        throw new Error(payload.error?.message || "Google Drive rejected the file upload.");
    return payload;
}
async function uploadResumable(accessToken: string, folderId: string, file: Blob, fileName: string, connectionId?: string) {
    const safeName = sanitizeFileName(fileName);
    const start = await driveRequestWithRetry(accessToken, `${UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,thumbnailLink`, { method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": file.type || "application/octet-stream", "X-Upload-Content-Length": String(file.size) }, body: JSON.stringify({ name: safeName, parents: [folderId] }) });
    let location = start.headers.get("location");
    if (!start.ok || !location) {
        const payload = await start.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(payload.error?.message || "Google Drive resumable upload could not start.");
    }
    // UPLOAD-003: True resumable upload — query byte offset and resume from where it left off
    // UPLOAD-011: If we get a 401 mid-upload, refresh the token and retry
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks for resumable
    let lastError: Error | null = null;
    let currentToken = accessToken;

    for (let attempt = 0; attempt <= 4; attempt++) {
        try {
            // Step 1: Query how many bytes Google already has (resume support)
            const statusResp = await fetch(location, {
                method: "PUT",
                headers: { "Content-Range": `bytes */${file.size}` },
                cache: "no-store",
            });

            // 308 = Resume Incomplete (Google has partial data), 200/201 = Complete
            if (statusResp.status === 200 || statusResp.status === 201) {
                const payload = await statusResp.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
                if (typeof payload.id === "string") return payload;
            }

            // Parse the Range header to find how many bytes are already uploaded
            let uploadedBytes = 0;
            const rangeHeader = statusResp.headers.get("range");
            if (rangeHeader) {
                const match = rangeHeader.match(/bytes=0-(\d+)/);
                if (match) uploadedBytes = parseInt(match[1], 10) + 1;
            }

            // Step 2: Upload the remaining bytes in chunks
            while (uploadedBytes < file.size) {
                const end = Math.min(uploadedBytes + CHUNK_SIZE - 1, file.size - 1);
                const chunk = file.slice(uploadedBytes, end + 1);
                const chunkResp = await fetch(location, {
                    method: "PUT",
                    headers: {
                        "Content-Length": String(chunk.size),
                        "Content-Range": `bytes ${uploadedBytes}-${end}/${file.size}`,
                    },
                    body: chunk,
                    cache: "no-store",
                });

                if (chunkResp.status === 200 || chunkResp.status === 201) {
                    const payload = await chunkResp.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
                    if (typeof payload.id === "string") return payload;
                    throw new Error(payload.error?.message || "Google Drive upload completed but returned no file ID.");
                }

                if (chunkResp.status === 308) {
                    // Resume Incomplete — more bytes to upload
                    const range = chunkResp.headers.get("range");
                    if (range) {
                        const match = range.match(/bytes=0-(\d+)/);
                        if (match) uploadedBytes = parseInt(match[1], 10) + 1;
                    } else {
                        uploadedBytes = end + 1;
                    }
                    continue;
                }

                if (chunkResp.status === 429 || chunkResp.status >= 500) {
                    throw new Error(`Google Drive returned ${chunkResp.status} during chunk upload (retryable).`);
                }

                // Non-retryable error
                const payload = await chunkResp.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(payload.error?.message || `Google Drive upload failed with status ${chunkResp.status}.`);
            }

            // If we get here, all chunks were uploaded but we didn't get a 200/201
            throw new Error("Google Drive upload completed but no confirmation received.");
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // UPLOAD-011: If 401 (token expired), refresh the token
            if (lastError.message.includes("401") || lastError.message.includes("Unauthorized")) {
                if (connectionId) {
                    try {
                        const { invalidateTokenCache } = await import("./drive-connections");
                        invalidateTokenCache(connectionId);
                        const { accessTokenForDriveConnection } = await import("./drive-connections");
                        currentToken = await accessTokenForDriveConnection(connectionId);
                        // Re-initiate the resumable session with the new token
                        const restart = await driveRequestWithRetry(currentToken, `${UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,thumbnailLink`, { method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": file.type || "application/octet-stream", "X-Upload-Content-Length": String(file.size) }, body: JSON.stringify({ name: safeName, parents: [folderId] }) });
                        const newLocation = restart.headers.get("location");
                        if (newLocation) location = newLocation;
                    } catch { /* fall through to retry */ }
                }
            }

            if (attempt < 4) {
                await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
                continue;
            }
        }
    }
    throw lastError || new Error("Google Drive resumable upload failed after retries.");
}

// ── UPLOAD-009: Delete file from Google Drive (for rollback on failure) ──
async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
    try {
        await driveRequestWithRetry(accessToken, `${DRIVE_API}/${fileId}`, { method: "DELETE" });
    } catch {
        // Non-fatal: we tried to clean up but couldn't. Log for manual cleanup.
        console.warn(`[google-drive] Failed to delete orphaned file ${fileId} from Google Drive.`);
    }
}

/**
 * Make a Google Drive file publicly accessible (anyone with the link can view).
 * This is called after every upload so files are always public — thumbnails,
 * previews, and shared links work without requiring the viewer to authenticate.
 * Failures are non-fatal (the file is still uploaded; it just won't be public).
 */
async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
    // Retry making the file public (important for thumbnails/previews to work)
    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            const response = await driveRequestWithRetry(accessToken, `${DRIVE_API}/${fileId}/permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: "reader", type: "anyone" }),
            });
            if (response.ok) return;
            if (response.status < 500 && response.status !== 429) return; // Non-retryable
        } catch {
            // Continue to retry
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
    // Non-fatal: file uploaded but couldn't be made public
    console.warn(`[google-drive] Failed to make file ${fileId} public after retries.`);
}
export async function deleteManagedFile(accessToken: string, fileId: string): Promise<void> {
    return deleteDriveFile(accessToken, fileId);
}
export async function uploadManagedFileAsset(user: AuthenticatedUser, db: RDashDatabase, input: ManagedUploadRequest): Promise<ManagedGoogleFileAsset> {
    assertUploadRequest({ entityType: input.entityType, entityId: input.entityId, fileName: input.fileName, fileMime: input.file?.type });
    canUpload(user, db, input.entityType, input.entityId, input.role);
    if (!input.file || !input.file.size)
        throw new Error("The selected file is empty.");
    const maxBytes = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || input.file.size > maxBytes)
        throw new Error(`File exceeds the server upload limit of ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
    const scope = resolveUploadScope(db, input.entityType, input.entityId);
    const location = await resolveStorageFolder(db, input.entityType, input.entityId, input.kind, input.role, input.file.size);
    const payload = input.file.size >= 5 * 1024 * 1024
        ? await uploadResumable(location.access.accessToken, location.folderId, input.file, input.fileName, location.access.account.oauth_connection_id)
        : await uploadMultipart(location.access.accessToken, location.folderId, input.file, input.fileName);
    const id = String(payload.id);
    // Make the uploaded file public (anyone with link can view) so thumbnails,
    // previews, and shared links work without requiring viewer authentication.
    await makeFilePublic(location.access.accessToken, id);
    return {
        id,
        name: typeof payload.name === "string" ? payload.name : input.fileName,
        mimeType: typeof payload.mimeType === "string" ? payload.mimeType : (input.file.type || "application/octet-stream"),
        size: Number(payload.size || input.file.size),
        webViewLink: typeof payload.webViewLink === "string" ? payload.webViewLink : `https://drive.google.com/file/d/${id}/view`,
        thumbnailLink: typeof payload.thumbnailLink === "string" ? payload.thumbnailLink : undefined,
        folderId: location.folderId,
        customerId: scope.customerId,
        siteId: scope.siteId,
        workOrderId: scope.workOrderId,
        storageAccountId: location.access.account.id,
        storageFolderTemplateId: location.template.id,
        storageFolderInstance: location.instance,
    };
}
