import type { StorageAccount } from "../types";
import { accessTokenForDriveConnection } from "./drive-connections";



/** Obtain a short-lived access token from the server-side connected Drive vault. */
export async function getGoogleDriveAccessToken(account: StorageAccount): Promise<string> {
  if (!account.oauth_connection_id) {
    throw new Error(`Google Drive account “${account.label}” is not connected on this server. Reconnect it before accessing files.`);
  }
  return accessTokenForDriveConnection(account.oauth_connection_id);
}
