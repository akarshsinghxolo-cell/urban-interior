import type { AuthenticatedUser } from "./auth";
import { getGoogleDriveAccessToken } from "./google-drive";
import { commitWorkspaceOperations, getWorkspaceSubset } from "./workspace";
import { DRIVE_API, driveFetch } from "./direct-upload-storage";
import type { FileAsset, RDashDatabase, StorageAccount } from "../types";

export type FileCleanupResult = {
  deleted: boolean;
  driveDeleted?: boolean;
  reason?: "missing" | "referenced" | "external_reference" | "account_missing";
  fileAssetId: string;
  googleFileId?: string;
};

type CleanupClaim = {
  asset?: FileAsset;
  account?: StorageAccount;
  reason?: FileCleanupResult["reason"];
};

const FILE_REFERENCE_COLLECTIONS = Object.freeze([
  "entityFileAttachments",
  "staffDocuments",
  "threads",
  "master.catalogues",
  "master.referenceMedia",
] as const);

function threadReferencesFileAsset(db: RDashDatabase, fileAssetId: string): boolean {
  return (db.threads || []).some((thread) =>
    (thread.messages || []).some((message) =>
      (message.attachments || []).some((attachment) => attachment.file_asset_id === fileAssetId),
    ),
  );
}

export function fileAssetHasReferences(db: RDashDatabase, fileAssetId: string): boolean {
  if ((db.entityFileAttachments || []).some((row) => row.file_asset_id === fileAssetId)) return true;
  if ((db.master.catalogues || []).some((row) => row.drive_asset_id === fileAssetId)) return true;
  if ((db.master.referenceMedia || []).some((row) => row.drive_asset_id === fileAssetId)) return true;
  if ((db.staffDocuments || []).some((row) => row.file_asset_id === fileAssetId)) return true;
  if (threadReferencesFileAsset(db, fileAssetId)) return true;
  return false;
}

async function claimUnreferencedFileAsset(fileAssetId: string): Promise<CleanupClaim> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // The cleanup decision needs the one FileAsset plus the collections that can
    // actually reference it. It never reconstructs unrelated ERP domains.
    const workspace = await getWorkspaceSubset({
      fullCollections: [...FILE_REFERENCE_COLLECTIONS],
      rowsByCollection: { "master.fileAssets": [fileAssetId] },
      limitsByCollection: Object.fromEntries(FILE_REFERENCE_COLLECTIONS.map((collection) => [collection, 0])),
    });
    const asset = workspace.data.master.fileAssets.find((row) => row.id === fileAssetId) as FileAsset | undefined;
    if (!asset) return { reason: "missing" };
    if (fileAssetHasReferences(workspace.data, fileAssetId)) return { reason: "referenced", asset };

    const managed = asset.storage_mode === "managed" && Boolean(asset.google_file_id);
    let account: StorageAccount | undefined;
    if (managed && asset.storage_account_id) {
      const accountState = await getWorkspaceSubset({
        rowsByCollection: { "master.storageAccounts": [asset.storage_account_id] },
      });
      if (accountState.revision !== workspace.revision) {
        lastError = new Error("CONFLICT");
        continue;
      }
      account = accountState.data.master.storageAccounts.find((row) => row.id === asset.storage_account_id);
    }
    if (managed && !account) return { reason: "account_missing", asset };

    try {
      // Claim the unused asset under the current workspace revision before any
      // external Drive deletion. Any concurrent attachment write conflicts.
      await commitWorkspaceOperations(
        workspace.revision,
        [{ collection: "master.fileAssets", deleteIds: [fileAssetId] }],
        workspace.rowVersions || {},
      );
      return { asset, account };
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not claim the unused FileAsset after retries.");
}

async function restoreFileAsset(asset: FileAsset): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const workspace = await getWorkspaceSubset({
      rowsByCollection: { "master.fileAssets": [asset.id] },
    });
    if (workspace.data.master.fileAssets.some((row) => row.id === asset.id)) return;
    try {
      await commitWorkspaceOperations(
        workspace.revision,
        [{ collection: "master.fileAssets", upsert: [{ ...asset }] }],
        workspace.rowVersions || {},
      );
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not restore the FileAsset after Drive cleanup failed.");
}

export async function cleanupUnreferencedManagedFile(
  _user: AuthenticatedUser,
  fileAssetId: string,
): Promise<FileCleanupResult> {
  const claim = await claimUnreferencedFileAsset(fileAssetId);
  const asset = claim.asset;
  if (!asset) return { deleted: false, reason: claim.reason || "missing", fileAssetId };
  if (claim.reason) {
    return {
      deleted: false,
      reason: claim.reason,
      fileAssetId,
      googleFileId: asset.google_file_id,
    };
  }

  // External references are registry entries only. Once their last workspace
  // reference is detached, the registry row is cleaned but the external file is
  // never deleted because Urban Castle does not own its lifecycle.
  if (asset.storage_mode !== "managed" || !asset.google_file_id) {
    return {
      deleted: true,
      driveDeleted: false,
      reason: "external_reference",
      fileAssetId,
      googleFileId: asset.google_file_id,
    };
  }

  const account = claim.account;
  if (!account) {
    await restoreFileAsset(asset);
    return { deleted: false, reason: "account_missing", fileAssetId, googleFileId: asset.google_file_id };
  }

  try {
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
  } catch (error) {
    try {
      await restoreFileAsset(asset);
    } catch (restoreError) {
      const original = error instanceof Error ? error.message : String(error);
      const restore = restoreError instanceof Error ? restoreError.message : String(restoreError);
      throw new Error(`${original} FileAsset restoration also failed: ${restore}`);
    }
    throw error;
  }

  return { deleted: true, driveDeleted: true, fileAssetId, googleFileId: asset.google_file_id };
}
