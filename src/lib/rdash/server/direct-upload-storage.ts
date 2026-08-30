import type { RDashDatabase, StorageAccount } from "../types";
import { getGoogleDriveAccessToken } from "./google-drive";
import { ensureFolderPath as ensureCanonicalFolderPath } from "./drive-folder-engine";
import type { CanonicalFolderSegment } from "./drive-folder-hierarchy";
import {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  WORKSPACE_ID,
  MAX_UPLOAD_BYTES,
  nowIso,
  safeSegment,
  driveFetch,
} from "./direct-upload-storage-core";

export {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  WORKSPACE_ID,
  MAX_UPLOAD_BYTES,
  nowIso,
  safeSegment,
  driveFetch,
};

export { destinationSegments } from "./drive-folder-hierarchy";
export type { CanonicalFolderSegment as FolderSegment } from "./drive-folder-hierarchy";

async function liveAccountAccess(account: StorageAccount): Promise<{
  account: StorageAccount;
  accessToken: string;
  used: number;
  limit: number;
}> {
  const accessToken = await getGoogleDriveAccessToken(account);
  const response = await driveFetch(accessToken, `${DRIVE_API}/about?fields=storageQuota(limit,usage)`);
  const payload = await response.json().catch(() => ({})) as {
    storageQuota?: { limit?: string; usage?: string };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `Could not read quota for ${account.label}.`);
  return {
    account,
    accessToken,
    used: Number(payload.storageQuota?.usage || account.quota_used_bytes || 0),
    limit: Number(payload.storageQuota?.limit || account.quota_limit_bytes || 0),
  };
}

/**
 * Select a Drive account without requiring a persisted server-side upload batch.
 * The first file chooses an account using the full client batch size; later files
 * pass the locally pinned account ID so a multi-file selection stays together.
 */
export async function selectUploadAccount(
  db: RDashDatabase,
  _batchId: string,
  incomingBytes: number,
  preferredStorageAccountId?: string,
) {
  const accounts = [...(db.master.storageAccounts || [])]
    .filter((account) => account.status === "connected" && account.write_enabled !== false)
    .sort((a, b) => a.priority_order - b.priority_order || a.label.localeCompare(b.label));
  if (!accounts.length) throw new Error("Connect at least one Google Drive account before uploading files.");

  if (preferredStorageAccountId) {
    const pinned = accounts.find((account) => account.id === preferredStorageAccountId);
    if (!pinned) throw new Error("The Drive account pinned to this local upload group is no longer available.");
    return liveAccountAccess(pinned);
  }

  const errors: string[] = [];
  for (const account of accounts) {
    try {
      const access = await liveAccountAccess(account);
      const limit = access.limit || 15 * 1024 * 1024 * 1024;
      const threshold = Math.max(1, Math.min(100, Number(account.switch_threshold_percent || 85))) / 100;
      if (access.used + incomingBytes <= limit * threshold) return access;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Could not use ${account.label}.`);
    }
  }
  throw new Error(errors[0] || "No connected Drive account has enough configured capacity.");
}

export function ensureFolderPath(
  accessToken: string,
  account: StorageAccount,
  segments: CanonicalFolderSegment[],
): Promise<{ id: string; webViewLink: string; key: string }> {
  // The old customer-level Commercial folder may contain communications and
  // files from several Sites. Never adopt it wholesale into one Site. New
  // Site Commercial folders are created canonically; historical files can be
  // moved individually by a verified reconciliation pass.
  const safeSegments = segments.map((segment) =>
    segment.key.includes(":commercial") && segment.legacyKeys?.length
      ? { ...segment, legacyKeys: undefined }
      : segment,
  );
  return ensureCanonicalFolderPath(accessToken, account, safeSegments);
}
