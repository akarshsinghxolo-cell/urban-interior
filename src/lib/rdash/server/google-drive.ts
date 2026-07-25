import type { RDashDatabase, StorageAccount } from "../types";
import { accessTokenForDriveConnection } from "./drive-connections";
import type { AuthenticatedUser } from "./auth";

/** Resolve a managed Drive file already registered in the workspace. */
export function managedFileByGoogleId(db: RDashDatabase, fileId: string) {
  return (db.master.fileAssets || []).find((item) =>
    item.google_file_id === fileId &&
    item.storage_provider === "google_drive" &&
    item.storage_mode === "managed" &&
    item.sync_status === "uploaded"
  );
}

/** Authorize private preview/thumbnail proxy access for a registered file. */
export function canReadManagedFileAsset(user: AuthenticatedUser, db: RDashDatabase, fileId: string) {
  const file = managedFileByGoogleId(db, fileId);
  if (!file) return false;
  if (user.role === "Owner" || user.role === "Operations Manager") return true;
  const attachments = (db.entityFileAttachments || []).filter((row) => row.file_asset_id === file.id);
  if (!attachments.length) return false;
  if (user.role === "Finance") return attachments.some((row) => ["payment", "invoice", "vendor_bill"].includes(row.entity_type));
  if (user.role === "Procurement Staff") return attachments.some((row) => ["vendor", "purchase_order", "grn", "dispatch", "inventory"].includes(row.entity_type));
  if (user.role === "Field Staff") {
    return attachments.some((row) => {
      if (row.entity_type === "visit") return db.visits.find((visit) => visit.id === row.entity_id)?.staff_id === user.staffId;
      if (row.entity_type === "execution_log") return db.executionLogs.find((log) => log.id === row.entity_id)?.filed_by_staff_id === user.staffId;
      if (row.entity_type === "grn") return db.grns.find((grn) => grn.id === row.entity_id)?.received_by_staff_id === user.staffId;
      return false;
    });
  }
  return false;
}

/** Obtain a short-lived access token from the server-side connected Drive vault. */
export async function getGoogleDriveAccessToken(account: StorageAccount): Promise<string> {
  if (!account.oauth_connection_id) {
    throw new Error(`Google Drive account “${account.label}” is not connected on this server. Reconnect it before accessing files.`);
  }
  return accessTokenForDriveConnection(account.oauth_connection_id);
}
