import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "./auth";
import { getSupabaseAdminClient } from "../../supabase/server";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_VAULT_COLLECTION = "system.googleDriveVault";
const DRIVE_VAULT_ID = "default";
const TOKEN_CIPHER = "aes-256-gcm";
const TOKEN_KEY_ENV = "DRIVE_TOKEN_ENCRYPTION_KEY";

type EncryptedSecret = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

type DriveConnection = {
  id: string;
  refreshTokenEncrypted?: EncryptedSecret;
  /** Legacy plaintext value. Read only so old vaults can be migrated on next use. */
  refreshToken?: string;
  email?: string;
  googleAccountId?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  rootFolderUrl?: string;
  quotaUsedBytes?: number;
  quotaLimitBytes?: number;
  createdAt: string;
  updatedAt: string;
};

type PersistedDriveConnection = Omit<DriveConnection, "refreshToken"> & {
  refreshTokenEncrypted: EncryptedSecret;
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

type DriveConnectionResult = Omit<DriveConnection, "refreshToken" | "refreshTokenEncrypted">;

function emptyVault(): Vault {
  return { version: 1, connections: [], pending: [] };
}

function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function normalizedEmail(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function sameGoogleIdentity(
  connection: Pick<DriveConnection, "googleAccountId" | "email">,
  identity: { googleAccountId?: string; email?: string },
) {
  if (connection.googleAccountId && identity.googleAccountId) {
    return connection.googleAccountId === identity.googleAccountId;
  }
  const leftEmail = normalizedEmail(connection.email);
  const rightEmail = normalizedEmail(identity.email);
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
}

export type DriveConnectionSummary = {
  id: string;
  email?: string;
  googleAccountId?: string;
  createdAt: string;
  updatedAt: string;
};

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

function tokenEncryptionKey() {
  const raw = envValue(TOKEN_KEY_ENV);
  if (!raw) {
    throw new Error(`Google Drive token encryption is not configured. Set ${TOKEN_KEY_ENV} in Vercel environment variables, then redeploy.`);
  }
  return createHash("sha256").update(raw).digest();
}

function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(TOKEN_CIPHER, tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptSecret(value: EncryptedSecret): string {
  const decipher = createDecipheriv(TOKEN_CIPHER, tokenEncryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function refreshTokenForConnection(connection: DriveConnection): string {
  if (connection.refreshTokenEncrypted) return decryptSecret(connection.refreshTokenEncrypted);
  if (connection.refreshToken) return connection.refreshToken;
  throw new Error("This Google Drive connection has no usable refresh token. Reconnect the Drive account.");
}

function publicConnection(connection: DriveConnection): DriveConnectionResult {
  const {
    refreshToken: _refreshToken,
    refreshTokenEncrypted: _refreshTokenEncrypted,
    ...safeConnection
  } = connection;
  return safeConnection;
}

function persistedConnection(connection: DriveConnection, refreshToken?: string): PersistedDriveConnection {
  const token = refreshToken || refreshTokenForConnection(connection);
  return {
    ...publicConnection(connection),
    refreshTokenEncrypted: encryptSecret(token),
  };
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

export async function readGoogleDriveOAuthConfig(origin?: string) {
  const clientId = envValue("GOOGLE_DRIVE_OAUTH_CLIENT_ID");
  const hasClientSecret = Boolean(envValue("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"));
  const hasCredentialsKey = Boolean(envValue(TOKEN_KEY_ENV));
  return {
    clientId,
    hasClientSecret,
    hasCredentialsKey,
    configured: Boolean(clientId && hasClientSecret && hasCredentialsKey),
    configurationSource: "environment" as const,
    redirectUri: origin ? `${origin}/api/google-drive/oauth/callback` : "/api/google-drive/oauth/callback",
    updatedAt: null,
  };
}

export async function saveGoogleDriveOAuthConfig(_user: AuthenticatedUser, _input: { clientId?: string; clientSecret?: string; credentialsKey?: string }) {
  throw new Error(`Google Drive OAuth credentials are server secrets. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and ${TOKEN_KEY_ENV} in Vercel environment variables instead of saving them from the browser.`);
}

async function config() {
  const clientId = envValue("GOOGLE_DRIVE_OAUTH_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET");
  const hasTokenKey = Boolean(envValue(TOKEN_KEY_ENV));
  if (!clientId || !clientSecret || !hasTokenKey) {
    throw new Error(`Google Drive OAuth is not configured. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and ${TOKEN_KEY_ENV} in Vercel environment variables, then redeploy.`);
  }
  return { clientId, clientSecret };
}

// ── Vault: encrypted JSON ──
// Refresh tokens are encrypted before persistence. Legacy plaintext vault rows
// are read only for migration and are rewritten encrypted on next successful use.
let vaultWritePromise: Promise<void> | null = null;

async function readVault(): Promise<Vault> {
  const row = await readRecord(DRIVE_VAULT_COLLECTION, DRIVE_VAULT_ID);
  if (!row?.dataJson) return emptyVault();
  try {
    const value = JSON.parse(row.dataJson) as Vault;
    if (value.version !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.pending)) return emptyVault();
    value.pending = value.pending.filter((p) => p.expiresAt > Date.now());
    return value;
  } catch {
    return emptyVault();
  }
}

export async function readGoogleDriveConnectionSummaries(user: AuthenticatedUser): Promise<DriveConnectionSummary[]> {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can view Google Drive connections.");
  const vault = await readVault();
  return vault.connections.map(({ id, email, googleAccountId, createdAt, updatedAt }) => ({
    id,
    email,
    googleAccountId,
    createdAt,
    updatedAt,
  }));
}

async function writeVault(vault: Vault) {
  while (vaultWritePromise) {
    await vaultWritePromise;
  }
  const encryptedVault: Vault = {
    version: 1,
    pending: vault.pending,
    connections: vault.connections.map((connection) => persistedConnection(connection)),
  };
  vaultWritePromise = writeRecord(DRIVE_VAULT_COLLECTION, DRIVE_VAULT_ID, encryptedVault)
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

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;

async function getCachedAccessToken(connectionId: string, refreshTokenValue: string): Promise<string> {
  const cached = tokenCache.get(connectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
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
  if (pending.existingConnectionId && !previous) {
    throw new Error("The Drive connection being reauthorized no longer exists. Start a new Drive connection instead.");
  }
  const aboutResponse = await google(`${DRIVE_API}/about?fields=user(permissionId,emailAddress,displayName),storageQuota(limit,usage)`, token.access_token);
  const about = await aboutResponse.json().catch(() => ({})) as {
    user?: { permissionId?: string; emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string };
  };
  if (!aboutResponse.ok) throw new Error("Google Drive did not allow Urban Castle to read account storage details.");

  const identity = {
    googleAccountId: about.user?.permissionId?.trim() || undefined,
    email: normalizedEmail(about.user?.emailAddress) || undefined,
  };
  if (!identity.googleAccountId && !identity.email) {
    throw new Error("Google did not return an account identity. The Drive was not connected.");
  }
  if (previous && !sameGoogleIdentity(previous, identity)) {
    throw new Error(`Reconnect “${previous.email || previous.id}” using that same Google account. To add a different account, start a new Drive connection.`);
  }

  const duplicate = previous ? undefined : vault.connections.find((connection) => sameGoogleIdentity(connection, identity));
  const target = previous || duplicate;
  const refresh = token.refresh_token || (target ? refreshTokenForConnection(target) : undefined);
  if (!refresh) throw new Error("Google did not return a reusable connection token. Disconnect this Google account from Google permissions and connect it again.");

  const root = await findOrCreateRoot(token.access_token);
  const id = target?.id || `drive-connection-${randomBytes(12).toString("base64url")}`;
  const connection: PersistedDriveConnection = {
    id,
    refreshTokenEncrypted: encryptSecret(refresh),
    email: identity.email,
    googleAccountId: identity.googleAccountId || target?.googleAccountId,
    rootFolderId: root.id,
    rootFolderName: root.name,
    rootFolderUrl: root.webViewLink,
    quotaUsedBytes: Number(about.storageQuota?.usage || 0),
    quotaLimitBytes: Number(about.storageQuota?.limit || 0),
    createdAt: target?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  vault.connections = [
    ...vault.connections.filter((item) => item.id !== id && !sameGoogleIdentity(item, identity)),
    connection,
  ];
  vault.pending = vault.pending.filter((item) => item.state !== input.state && item.expiresAt > Date.now());
  await writeVault(vault);
  return { connection: publicConnection(connection), label: pending.label, returnTo: pending.returnTo };
}

export async function accessTokenForDriveConnection(connectionId: string) {
  const vault = await readVault();
  const connection = vault.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("This Google Drive account is not connected on the server. Reconnect it before using its files.");
  const refresh = refreshTokenForConnection(connection);
  if (connection.refreshToken && !connection.refreshTokenEncrypted) {
    vault.connections = vault.connections.map((item) => item.id === connectionId ? persistedConnection(item, refresh) : item);
    await writeVault(vault);
  }
  try {
    return await getCachedAccessToken(connectionId, refresh);
  } catch (error) {
    if (error instanceof Error && error.name === "RefreshTokenRevokedError") {
      invalidateTokenCache(connectionId);
      throw error;
    }
    throw error;
  }
}

export async function refreshDriveConnection(connectionId: string) {
  invalidateTokenCache(connectionId);
  const vault = await readVault();
  const connection = vault.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("This Google Drive account is not connected on the server.");
  const refresh = refreshTokenForConnection(connection);
  const accessToken = await refreshToken(refresh);
  const aboutResponse = await google(`${DRIVE_API}/about?fields=user(permissionId,emailAddress),storageQuota(limit,usage)`, accessToken);
  const about = await aboutResponse.json().catch(() => ({})) as {
    user?: { permissionId?: string; emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string };
  };
  if (!aboutResponse.ok) throw new Error("Google Drive storage quota could not be refreshed.");
  const refreshedIdentity = {
    googleAccountId: about.user?.permissionId?.trim() || undefined,
    email: normalizedEmail(about.user?.emailAddress) || undefined,
  };
  if (!sameGoogleIdentity(connection, refreshedIdentity)) {
    throw new Error("Google Drive returned a different account identity. Reconnect the original account before refreshing it.");
  }
  const updated: PersistedDriveConnection = {
    ...persistedConnection(connection, refresh),
    email: refreshedIdentity.email || connection.email,
    googleAccountId: refreshedIdentity.googleAccountId || connection.googleAccountId,
    quotaUsedBytes: Number(about.storageQuota?.usage || 0),
    quotaLimitBytes: Number(about.storageQuota?.limit || 0),
    updatedAt: new Date().toISOString(),
  };
  vault.connections = vault.connections.map((item) => item.id === connectionId ? updated : item);
  await writeVault(vault);
  return publicConnection(updated);
}
