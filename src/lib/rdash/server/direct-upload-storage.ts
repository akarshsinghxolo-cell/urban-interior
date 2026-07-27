import type { StorageAccount } from "../types";
import { ensureFolderPath as ensureCanonicalFolderPath } from "./drive-folder-engine";
import type { CanonicalFolderSegment } from "./drive-folder-hierarchy";

export {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  WORKSPACE_ID,
  MAX_UPLOAD_BYTES,
  nowIso,
  safeSegment,
  practicalFolderName,
  driveFetch,
  selectUploadAccount,
} from "./direct-upload-storage-core";

export { destinationSegments } from "./drive-folder-hierarchy";
export type { CanonicalFolderSegment as FolderSegment } from "./drive-folder-hierarchy";

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
