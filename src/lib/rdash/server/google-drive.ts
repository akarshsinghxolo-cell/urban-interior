import type { StorageAccount } from "../types";
import { accessTokenForDriveConnection } from "./drive-connections";



/** Obtain a short-lived access token from the server-only canonical credential store. */
export async function getGoogleDriveAccessToken(account: StorageAccount): Promise<string> {
  return accessTokenForDriveConnection(account.id);
}
