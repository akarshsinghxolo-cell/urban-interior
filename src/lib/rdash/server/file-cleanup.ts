import type { AuthenticatedUser } from "./auth";
import { getGoogleDriveAccessToken } from "./google-drive";
import { commitWorkspaceOperations, getWorkspace } from "./workspace";
import { DRIVE_API, driveFetch } from "./direct-upload-storage";
import type { FileAsset, RDashDatabase } from "../types";

export type FileCleanupResult = {
  deleted: boolean;
  reason?: "missing" | "referenced" | "external_reference" | "account_missing";
  fileAssetId: string;
  googleFileId?: string;
};

function threadReferencesFileAsset(db: RDashDatabase, fileAssetId: string): boolean {
  return (db.threads || []).some((thread) =>
    (thread.messages || []).some((message) =>
      (message.attachments || []).some((attachment) => attachment.file_asset_id === fileAssetId),
    ),
  );
}

export function fileAssetHasReferences(db: RDashDatabase, fileAssetId: string): boolean {
  if ((db.entityFileAttachments || []).some((row) => row.file_asset_id === fileAssetId)) return true;
  if ((db.master.catalogues || []).some((row) => row.drive_asset_id === fileAssetId && row.status !== "archived")) return true;
  if ((db.master.referenceMedia || []).some((row) => row.drive_asset_id === fileAssetId && row.status !== "archived")) return true;
  if ((db.staffDocuments || []).some((row) => row.file_asset_id === fileAssetId)) return true;
  if (threadReferencesFileAsset(db, fileAssetId)) return true;
  return false;
}

async function deleteFileAssetRow(fileAssetId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const workspace = await getWorkspace(true);
    const asset = workspace.data.master.fileAssets.find((row) => row.id === fileAssetId);
    if (!asset) return;
    if (fileAssetHasReferences(workspace.data, fileAssetId)) return;
    try {
      await commitWorkspaceOperations(
        workspace.revision,
        [{ collection: "master.fileAssets", deleteIds: [fileAssetId] }],
        workspace.rowVersions || {},
      );
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not remove the unused FileAsset after retries.");
}

export async function cleanupUnreferencedManagedFile(
  _user: AuthenticatedUser,
  fileAssetId: string,
): Promise<FileCleanupResult> {
  const workspace = await getWorkspace();
  const asset = workspace.data.master.fileAssets.find((row) => row.id === fileAssetId) as FileAsset | undefined;
  if (!asset) return { deleted: false, reason: "missing", fileAssetId };
  if (fileAssetHasReferences(workspace.data, fileAssetId)) {
    return { deleted: false, reason: "referenced", fileAssetId, googleFileId: asset.google_file_id };
  }
  if (asset.storage_provider !== "google_drive" || asset.storage_mode !== "managed" || !asset.google_file_id) {
    return { deleted: false, reason: "external_reference", fileAssetId, googleFileId: asset.google_file_id };
  }

  const account = asset.storage_account_id
    ? workspace.data.master.storageAccounts.find((row) => row.id === asset.storage_account_id)
    : undefined;
  if (!account) {
    return { deleted: false, reason: "account_missing", fileAssetId, googleFileId: asset.google_file_id };
  }

  const accessToken = await getGoogleDriveAccessToken(account);
  const deleted = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(asset.google_file_id)}`,
    { method: "DELETE" },
  );
  if (!deleted.ok && deleted.status !== 404) {
    const payload = await deleted.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || `Google Drive cleanup failed (${deleted.status}).`);
  }

  // The Drive object is gone. Remove its registry row as a second idempotent step;
  // a CAS conflict simply retries against the latest workspace revision.
  await deleteFileAssetRow(fileAssetId);
  return { deleted: true, fileAssetId, googleFileId: asset.google_file_id };
}
