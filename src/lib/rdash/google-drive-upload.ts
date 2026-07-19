import { uploadManagedFile, type ManagedUploadInput, type ManagedDriveUpload } from "./file-assets";
export type GoogleDriveUpload = ManagedDriveUpload;
export async function uploadCapturedMediaToGoogleDrive(input: {
    dataUrl?: string;
    file?: File | Blob;
    fileName: string;
    entityType: ManagedUploadInput["entityType"];
    entityId: string;
    kind?: ManagedUploadInput["kind"];
    role?: ManagedUploadInput["role"];
    caption?: string;
    visibility?: ManagedUploadInput["visibility"];
    customerShareable?: boolean;
}): Promise<GoogleDriveUpload> {
    return uploadManagedFile({ dataUrl: input.dataUrl, file: input.file, fileName: input.fileName, entityType: input.entityType, entityId: input.entityId, kind: input.kind || "site_proof", role: input.role || "proof", caption: input.caption, visibility: input.visibility || "internal", customerShareable: input.customerShareable });
}
