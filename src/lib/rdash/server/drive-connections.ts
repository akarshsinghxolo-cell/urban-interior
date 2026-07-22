import { randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "./auth";
import { getSupabaseAdminClient } from "../../supabase/server";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const OAUTH_CONFIG_COLLECTION = "system.googleDriveOAuth";
const OAUTH_CONFIG_ID = "default";
const DRIVE_VAULT_COLLECTION = "system.googleDriveVault";
const DRIVE_VAULT_ID = "default";

type DriveConnection = {
  id: string;
  refreshToken: string;
  email?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  rootFolderUrl?: string;
  quotaUsedBytes?: number;
  quotaLimitBytes?: number;
  createdAt: string;
  updatedAt: string;
};

type PendingConnect = {
  state: string;
  userId: string;
  label: string;
  origin: string;
  returnTo: string;
  existingConnectionId?: string;
  expiresAt: number;
};

type Vault = {
  version: 1;
  connections: DriveConnection[];
  pending: PendingConnect[];
};

type GoogleDriveOAuthSettings = {
  clientId: string;
  clientSecret: string;
  updatedAt?: string;
  updatedBy?: string;
};

function emptyVault(): Vault {
  return { version: 1, connections: [], pending: [] };
}

function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function parseSettings(raw: string | null | undefined): Partial<GoogleDriveOAuthSettings> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Partial<GoogleDriveOAuthSettings>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function readRecord(collection: string, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("GenericRecord")
    .select("dataJson")
    .eq("collection", collection)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function writeRecord(collection: string, id: string, value: unknown) {
  const { error } = await getSupabaseAdminClient()
    .from("GenericRecord")
    .upsert({ collection, id, dataJson: JSON.stringify(value) }, { onConflict: "collection,id" });
  if (error) throw new Error(`Could not write Google Drive record: ${error.message}`);
}

async function storedSettings() {
  const row = await readRecord(OAUTH_CONFIG_COLLECTION, OAUTH_CONFIG_ID);
  return parseSettings(row?.dataJson);
}

async function saveSettings(settings: GoogleDriveOAuthSettings) {
  await writeRecord(OAUTH_CONFIG_COLLECTION, OAUTH_CONFIG_ID, settings);
}

export async function readGoogleDriveOAuthConfig(origin?: string) {
  const saved = await storedSettings();
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || saved.clientId || "";
  const hasClientSecret = Boolean(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || saved.clientSecret);
  return {
    clientId,
    hasClientSecret,
    configured: Boolean(clientId && hasClientSecret),
    redirectUri: origin ? `${origin}/api/google-drive/oauth/callback` : "/api/google-drive/oauth/callback",
    updatedAt: saved.updatedAt || null,
  };
}

export async function saveGoogleDriveOAuthConfig(user: AuthenticatedUser, input: { clientId?: string; clientSecret?: string; credentialsKey?: string }) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can configure Google Drive OAuth.");
  const existing = await storedSettings();
  const clientId = String(input.clientId || existing.clientId || process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(input.clientSecret || existing.clientSecret || process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId) throw new Error("Google OAuth Client ID is required.");
  if (!clientSecret) throw new Error("Google OAuth Client Secret is required.");
  const settings = { clientId, clientSecret, updatedAt: new Date().toISOString(), updatedBy: user.userId };
  await saveSettings(settings);
  return readGoogleDriveOAuthConfig();
}

async function config() {
  const saved = await storedSettings();
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || saved.clientId;
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || saved.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Google Drive OAuth is not configured. Open Google Drive Manager → OAuth Settings and save the Client ID and Client Secret.");
  }
  return { clientId, clientSecret };
}

// ── Vault: plaintext JSON (no encryption) ──
// UPLOAD-016: Simple write lock to prevent concurrent vault writes
let vaultWritePromise: Promise<void> | null = null;

async function readVault(): Promise<Vault> {
  const row = await readRecord(DRIVE_VAULT_COLLECTION, DRIVE_VAULT_ID);
  if (!row?.dataJson) return emptyVault();
  try {
    const value = JSON.parse(row.dataJson) as Vault;
    if (value.version !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.pending)) return emptyVault();
    // UPLOAD-023: Garbage-collect expired pending OAuth state on read
    value.pending = value.pending.filter((p) => p.expiresAt > Date.now());
    return value;
  } catch {
    return emptyVault();
  }
}

// UPLOAD-016: Atomic vault write — serialize concurrent writes to prevent corruption
async function writeVault(vault: Vault) {
  // Wait for any pending write to complete
  while (vaultWritePromise) {
    await vaultWritePromise;
  }
  vaultWritePromise = writeRecord(DRIVE_VAULT_COLLECTION, DRIVE_VAULT_ID, vault)
    .finally(() => { vaultWritePromise = null; });
  await vaultWritePromise;
}

async function google(url: string, accessToken: string, init?: RequestInit) {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) }, cache: "no-store" });
}

async function refreshToken(refreshTokenValue: string) {
  const { clientId, clientSecret } = await config();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshTokenValue, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    // UPLOAD-021: Distinguish revoked tokens from transient failures
    const errorCode = payload.error || "";
    if (errorCode === "invalid_grant" || errorCode === "invalid_client") {
      const err = new Error("Google Drive authorization has been revoked. Reconnect this Drive account.");
      err.name = "RefreshTokenRevokedError";
      throw err;
    }
    throw new Error(payload.error_description || "Google Drive authorization needs reconnecting.");
  }
  return payload.access_token;
}

// ── UPLOAD-008: Access token cache with 50-minute TTL ──
// Google access tokens are valid for 1 hour. We cache them for 50 minutes
// to avoid calling the token endpoint on every upload (saves 1-2s per upload).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

async function getCachedAccessToken(connectionId: string, refreshTokenValue: string): Promise<string> {
  const cached = tokenCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  // Refresh and cache
  const token = await refreshToken(refreshTokenValue);
  tokenCache.set(connectionId, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  return token;
}

export function invalidateTokenCache(connectionId?: string) {
  if (connectionId) {
    tokenCache.delete(connectionId);
  } else {
    tokenCache.clear();
  }
}

async function findOrCreateRoot(accessToken: string) {
  const query = "'root' in parents and name = 'Urban Castle' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const found = await google(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`, accessToken);
  const listed = await found.json().catch(() => ({})) as { files?: Array<{ id?: string; name?: string; webViewLink?: string }> };
  if (found.ok && listed.files?.[0]?.id) {
    const folder = listed.files[0];
    return { id: folder.id!, name: folder.name || "Urban Castle", webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}` };
  }
  const created = await google(`${DRIVE_API}/files?fields=id,name,webViewLink`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Urban Castle", mimeType: "application/vnd.google-apps.folder", parents: ["root"] }),
  });
  const folder = await created.json().catch(() => ({})) as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
  if (!created.ok || !folder.id) throw new Error(folder.error?.message || "Could not create the Urban Castle folder in this Google Drive account.");
  return { id: folder.id, name: folder.name || "Urban Castle", webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}` };
}

export async function beginGoogleDriveConnect(user: AuthenticatedUser, input: { label: string; origin: string; returnTo?: string | null; existingConnectionId?: string }) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can connect a Google Drive account.");
  const { clientId } = await config();
  const label = input.label.trim();
  if (!label) throw new Error("A display name is required for the Google Drive account.");
  const state = randomBytes(32).toString("base64url");
  const vault = await readVault();
  vault.pending = vault.pending.filter((pending) => pending.expiresAt > Date.now());
  vault.pending.push({ state, userId: user.userId, label, origin: input.origin, returnTo: safeReturnPath(input.returnTo || null), existingConnectionId: input.existingConnectionId, expiresAt: Date.now() + 10 * 60 * 1000 });
  await writeVault(vault);
  const redirectUri = `${input.origin}/api/google-drive/oauth/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeGoogleDriveConnect(user: AuthenticatedUser, input: { state: string; code: string; origin: string }) {
  const vault = await readVault();
  const pending = vault.pending.find((item) => item.state === input.state && item.expiresAt > Date.now());
  if (!pending) throw new Error("Google Drive connection request expired. Start again from Drive storage.");
  if (pending.userId !== user.userId || pending.origin !== input.origin) throw new Error("Google Drive connection state is not valid for this session.");
  const { clientId, clientSecret } = await config();
  const exchange = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: input.code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${input.origin}/api/google-drive/oauth/callback`, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const token = await exchange.json().catch(() => ({})) as { refresh_token?: string; access_token?: string; error_description?: string };
  if (!exchange.ok || !token.access_token) throw new Error(token.error_description || "Google rejected the Drive connection request.");
  const previous = pending.existingConnectionId ? vault.connections.find((connection) => connection.id === pending.existingConnectionId) : undefined;
  const refresh = token.refresh_token || previous?.refreshToken;
  if (!refresh) throw new Error("Google did not return a reusable connection token. Disconnect this Google account from Google permissions and connect it again.");
  const aboutResponse = await google(`${DRIVE_API}/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)`, token.access_token);
  const about = await aboutResponse.json().catch(() => ({})) as { user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } };
  if (!aboutResponse.ok) throw new Error("Google Drive did not allow Urban Castle to read account storage details.");
  const root = await findOrCreateRoot(token.access_token);
  const id = previous?.id || `drive-connection-${randomBytes(12).toString("base64url")}`;
  const connection: DriveConnection = {
    id,
    refreshToken: refresh,
    email: about.user?.emailAddress,
    rootFolderId: root.id,
    rootFolderName: root.name,
    rootFolderUrl: root.webViewLink,
    quotaUsedBytes: Number(about.storageQuota?.usage || 0),
    quotaLimitBytes: Number(about.storageQuota?.limit || 0),
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  vault.connections = [...vault.connections.filter((item) => item.id !== id), connection];
  vault.pending = vault.pending.filter((item) => item.state !== input.state && item.expiresAt > Date.now());
  await writeVault(vault);
  return { connection, label: pending.label, returnTo: pending.returnTo };
}

export async function accessTokenForDriveConnection(connectionId: string) {
  const vault = await readVault();
  const connection = vault.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("This Google Drive account is not connected on the server. Reconnect it before using its files.");
  try {
    return await getCachedAccessToken(connectionId, connection.refreshToken);
  } catch (error) {
    // UPLOAD-021: If refresh token is revoked, mark the account for reconnection
    if (error instanceof Error && error.name === "RefreshTokenRevokedError") {
      invalidateTokenCache(connectionId);
      throw error; // Propagate so the caller can mark the storage account
    }
    throw error;
  }
}

export async function refreshDriveConnection(connectionId: string) {
  invalidateTokenCache(connectionId);
  const vault = await readVault();
  const connection = vault.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("This Google Drive account is not connected on the server.");
  const accessToken = await refreshToken(connection.refreshToken);
  const aboutResponse = await google(`${DRIVE_API}/about?fields=user(emailAddress),storageQuota(limit,usage)`, accessToken);
  const about = await aboutResponse.json().catch(() => ({})) as { user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } };
  if (!aboutResponse.ok) throw new Error("Google Drive storage quota could not be refreshed.");
  const updated: DriveConnection = { ...connection, email: about.user?.emailAddress || connection.email, quotaUsedBytes: Number(about.storageQuota?.usage || 0), quotaLimitBytes: Number(about.storageQuota?.limit || 0), updatedAt: new Date().toISOString() };
  vault.connections = vault.connections.map((item) => item.id === connectionId ? updated : item);
  await writeVault(vault);
  return updated;
}
