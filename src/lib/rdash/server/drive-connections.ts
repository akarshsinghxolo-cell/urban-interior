import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import type { AuthenticatedUser } from "./auth";
import { getSupabaseAdminClient } from "../../supabase/server";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_CIPHER = "aes-256-gcm";
const TOKEN_KEY_ENV = "DRIVE_TOKEN_ENCRYPTION_KEY";
const OAUTH_STATE_VERSION = 1;
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type EncryptedSecret = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

type CredentialRow = {
  storage_account_id: string;
  google_account_id: string | null;
  refresh_token_encrypted: unknown;
  created_at: string;
  updated_at: string;
};

type CanonicalStorageAccountRow = {
  id: string;
  data: Record<string, unknown>;
};

type OAuthStatePayload = {
  version: 1;
  userId: string;
  label: string;
  origin: string;
  returnTo: string;
  existingStorageAccountId?: string;
  expiresAt: number;
};

export type PendingDriveCredential = {
  googleAccountId?: string;
  refreshTokenEncrypted: EncryptedSecret;
  createdAt: string;
  updatedAt: string;
};

type DriveConnectionResult = {
  id: string;
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

type DriveConnectionSummary = {
  id: string;
  googleAccountId?: string;
  createdAt: string;
  updatedAt: string;
};

function workspaceId() {
  return process.env.UC_WORKSPACE_ID || "default";
}

function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function normalizedEmail(value?: string) {
  return value?.trim().toLowerCase() || "";
}

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
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBuffer = Buffer.from(iv);
  const cipher = createCipheriv(TOKEN_CIPHER, tokenEncryptionKey(), ivBuffer);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: ivBuffer.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function encryptedSecret(value: unknown): EncryptedSecret {
  if (!value || typeof value !== "object") {
    throw new Error("Google Drive credential is invalid. Reconnect the Drive account.");
  }
  const row = value as Partial<EncryptedSecret>;
  if (
    row.version !== 1 ||
    typeof row.iv !== "string" ||
    typeof row.tag !== "string" ||
    typeof row.ciphertext !== "string"
  ) {
    throw new Error("Google Drive credential is invalid. Reconnect the Drive account.");
  }
  return row as EncryptedSecret;
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

function sealOAuthState(payload: OAuthStatePayload): string {
  const encrypted = encryptSecret(JSON.stringify(payload));
  return Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
}

function openOAuthState(value: string): OAuthStatePayload {
  if (!value || value.length > 4096) throw new Error("Google Drive connection state is invalid.");
  try {
    const envelope = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const payload = JSON.parse(decryptSecret(encryptedSecret(envelope))) as OAuthStatePayload;
    if (
      payload.version !== OAUTH_STATE_VERSION ||
      !payload.userId ||
      !payload.origin ||
      !payload.label ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      throw new Error("expired");
    }
    return payload;
  } catch {
    throw new Error("Google Drive connection request is invalid or expired. Start again from Drive storage.");
  }
}

async function readCredential(storageAccountId: string): Promise<CredentialRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_google_drive_credentials")
    .select("storage_account_id,google_account_id,refresh_token_encrypted,created_at,updated_at")
    .eq("storage_account_id", storageAccountId)
    .maybeSingle();
  if (error) throw new Error(`Could not load Google Drive credential: ${error.message}`);
  return (data || null) as CredentialRow | null;
}

async function credentialByGoogleAccountId(googleAccountId: string): Promise<CredentialRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_google_drive_credentials")
    .select("storage_account_id,google_account_id,refresh_token_encrypted,created_at,updated_at")
    .eq("google_account_id", googleAccountId)
    .maybeSingle();
  if (error) throw new Error(`Could not check Google Drive identity: ${error.message}`);
  return (data || null) as CredentialRow | null;
}

async function readStorageAccount(storageAccountId: string): Promise<CanonicalStorageAccountRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("entity_master_storageAccounts")
    .select("id,data")
    .eq("workspace_id", workspaceId())
    .eq("id", storageAccountId)
    .maybeSingle();
  if (error) throw new Error(`Could not load canonical Drive account: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as CanonicalStorageAccountRow;
  const parsed = typeof row.data === "string" ? JSON.parse(row.data) as Record<string, unknown> : row.data;
  return { id: row.id, data: parsed || {} };
}

function refreshTokenForCredential(credential: CredentialRow): string {
  return decryptSecret(encryptedSecret(credential.refresh_token_encrypted));
}

function canonicalStorageAccountId(identity: { googleAccountId?: string; email?: string }) {
  const stableIdentity = identity.googleAccountId || normalizedEmail(identity.email);
  if (!stableIdentity) throw new Error("Google did not return an account identity.");
  const key = createHash("sha256")
    .update(`${workspaceId()}:${stableIdentity}`)
    .digest("hex")
    .slice(0, 24);
  return `storage-${key}`;
}

export async function persistGoogleDriveCredential(
  storageAccountId: string,
  credential: PendingDriveCredential,
) {
  const { error } = await getSupabaseAdminClient()
    .from("uc_google_drive_credentials")
    .upsert({
      storage_account_id: storageAccountId,
      google_account_id: credential.googleAccountId || null,
      refresh_token_encrypted: credential.refreshTokenEncrypted,
      created_at: credential.createdAt,
      updated_at: credential.updatedAt,
    }, { onConflict: "storage_account_id" });
  if (error) throw new Error(`Could not persist Google Drive credential: ${error.message}`);
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

async function config() {
  const clientId = envValue("GOOGLE_DRIVE_OAUTH_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET");
  const hasTokenKey = Boolean(envValue(TOKEN_KEY_ENV));
  if (!clientId || !clientSecret || !hasTokenKey) {
    throw new Error(`Google Drive OAuth is not configured. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and ${TOKEN_KEY_ENV} in Vercel environment variables, then redeploy.`);
  }
  return { clientId, clientSecret };
}

export async function readGoogleDriveConnectionSummaries(user: AuthenticatedUser): Promise<DriveConnectionSummary[]> {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can view Google Drive connections.");
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_google_drive_credentials")
    .select("storage_account_id,google_account_id,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load Google Drive connections: ${error.message}`);
  return (data || []).map((row) => {
    const typed = row as Pick<CredentialRow, "storage_account_id" | "google_account_id" | "created_at" | "updated_at">;
    return {
      id: typed.storage_account_id,
      googleAccountId: typed.google_account_id || undefined,
      createdAt: typed.created_at,
      updatedAt: typed.updated_at,
    };
  });
}

async function google(url: string, accessToken: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
}

async function refreshToken(refreshTokenValue: string) {
  const { clientId, clientSecret } = await config();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    if (payload.error === "invalid_grant" || payload.error === "invalid_client") {
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

async function getCachedAccessToken(storageAccountId: string, refreshTokenValue: string): Promise<string> {
  const cached = tokenCache.get(storageAccountId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const token = await refreshToken(refreshTokenValue);
  tokenCache.set(storageAccountId, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  return token;
}

function invalidateTokenCache(storageAccountId?: string) {
  if (storageAccountId) tokenCache.delete(storageAccountId);
  else tokenCache.clear();
}

async function findOrCreateRoot(accessToken: string) {
  const query = "'root' in parents and name = 'Urban Castle' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const found = await google(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`, accessToken);
  const listed = await found.json().catch(() => ({})) as {
    files?: Array<{ id?: string; name?: string; webViewLink?: string }>;
  };
  if (found.ok && listed.files?.[0]?.id) {
    const folder = listed.files[0];
    return {
      id: folder.id!,
      name: folder.name || "Urban Castle",
      webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    };
  }
  const created = await google(`${DRIVE_API}/files?fields=id,name,webViewLink`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Urban Castle", mimeType: "application/vnd.google-apps.folder", parents: ["root"] }),
  });
  const folder = await created.json().catch(() => ({})) as {
    id?: string;
    name?: string;
    webViewLink?: string;
    error?: { message?: string };
  };
  if (!created.ok || !folder.id) {
    throw new Error(folder.error?.message || "Could not create the Urban Castle folder in this Google Drive account.");
  }
  return {
    id: folder.id,
    name: folder.name || "Urban Castle",
    webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
  };
}

export async function beginGoogleDriveConnect(
  user: AuthenticatedUser,
  input: {
    label: string;
    origin: string;
    returnTo?: string | null;
    existingStorageAccountId?: string;
  },
) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can connect a Google Drive account.");
  const { clientId } = await config();
  const label = input.label.trim().slice(0, 100);
  if (!label) throw new Error("A display name is required for the Google Drive account.");

  if (input.existingStorageAccountId) {
    const existing = await readStorageAccount(input.existingStorageAccountId);
    if (!existing) throw new Error("The Drive account being reauthorized no longer exists.");
  }

  const state = sealOAuthState({
    version: OAUTH_STATE_VERSION,
    userId: user.userId,
    label,
    origin: input.origin,
    returnTo: safeReturnPath(input.returnTo || null),
    existingStorageAccountId: input.existingStorageAccountId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const redirectUri = `${input.origin}/api/google-drive/oauth/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeGoogleDriveConnect(
  user: AuthenticatedUser,
  input: { state: string; code: string; origin: string },
) {
  const pending = openOAuthState(input.state);
  if (pending.userId !== user.userId || pending.origin !== input.origin) {
    throw new Error("Google Drive connection state is not valid for this session.");
  }

  const { clientId, clientSecret } = await config();
  const exchange = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${input.origin}/api/google-drive/oauth/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const token = await exchange.json().catch(() => ({})) as {
    refresh_token?: string;
    access_token?: string;
    error_description?: string;
  };
  if (!exchange.ok || !token.access_token) {
    throw new Error(token.error_description || "Google rejected the Drive connection request.");
  }

  const aboutResponse = await google(
    `${DRIVE_API}/about?fields=user(permissionId,emailAddress,displayName),storageQuota(limit,usage)`,
    token.access_token,
  );
  const about = await aboutResponse.json().catch(() => ({})) as {
    user?: { permissionId?: string; emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string };
  };
  if (!aboutResponse.ok) {
    throw new Error("Google Drive did not allow Urban Castle to read account storage details.");
  }

  const identity = {
    googleAccountId: about.user?.permissionId?.trim() || undefined,
    email: normalizedEmail(about.user?.emailAddress) || undefined,
  };
  if (!identity.googleAccountId && !identity.email) {
    throw new Error("Google did not return an account identity. The Drive was not connected.");
  }

  const existingStorageAccountId = pending.existingStorageAccountId;
  const existingCredential = existingStorageAccountId
    ? await readCredential(existingStorageAccountId)
    : null;
  const existingAccount = existingStorageAccountId
    ? await readStorageAccount(existingStorageAccountId)
    : null;

  if (
    existingCredential?.google_account_id &&
    identity.googleAccountId &&
    existingCredential.google_account_id !== identity.googleAccountId
  ) {
    throw new Error("Reconnect this Drive slot using the same Google account. To add a different account, create a new Drive account.");
  }
  const existingEmail = normalizedEmail(String(existingAccount?.data.email || ""));
  if (!existingCredential?.google_account_id && existingEmail && identity.email && existingEmail !== identity.email) {
    throw new Error("Reconnect this Drive slot using the same Google account. To add a different account, create a new Drive account.");
  }

  if (identity.googleAccountId) {
    const duplicate = await credentialByGoogleAccountId(identity.googleAccountId);
    if (duplicate && duplicate.storage_account_id !== existingStorageAccountId) {
      throw new Error("This Google account is already connected to another Urban Castle Drive account.");
    }
  }

  const storageAccountId = existingStorageAccountId || canonicalStorageAccountId(identity);
  const sameIdAccount = await readStorageAccount(storageAccountId);
  const sameIdEmail = normalizedEmail(String(sameIdAccount?.data.email || ""));
  if (!existingStorageAccountId && sameIdAccount && sameIdEmail && identity.email && sameIdEmail !== identity.email) {
    throw new Error("The canonical Drive account ID is already assigned to a different Google account.");
  }

  const refresh = token.refresh_token || (existingCredential ? refreshTokenForCredential(existingCredential) : undefined);
  if (!refresh) {
    throw new Error("Google did not return a reusable connection token. Reconnect the Drive account with consent enabled.");
  }

  const root = await findOrCreateRoot(token.access_token);
  const now = new Date().toISOString();
  const connection: DriveConnectionResult = {
    id: storageAccountId,
    email: identity.email,
    googleAccountId: identity.googleAccountId || existingCredential?.google_account_id || undefined,
    rootFolderId: root.id,
    rootFolderName: root.name,
    rootFolderUrl: root.webViewLink,
    quotaUsedBytes: Number(about.storageQuota?.usage || 0),
    quotaLimitBytes: Number(about.storageQuota?.limit || 0),
    createdAt: existingCredential?.created_at || now,
    updatedAt: now,
  };
  const credential: PendingDriveCredential = {
    googleAccountId: connection.googleAccountId,
    refreshTokenEncrypted: encryptSecret(refresh),
    createdAt: connection.createdAt,
    updatedAt: now,
  };
  return {
    storageAccountId,
    connection,
    credential,
    label: pending.label,
    returnTo: pending.returnTo,
  };
}

export async function accessTokenForDriveConnection(storageAccountId: string) {
  const credential = await readCredential(storageAccountId);
  if (!credential) {
    throw new Error("This Google Drive account has no canonical server credential. Reconnect it before using its files.");
  }
  const refresh = refreshTokenForCredential(credential);
  try {
    return await getCachedAccessToken(storageAccountId, refresh);
  } catch (error) {
    if (error instanceof Error && error.name === "RefreshTokenRevokedError") {
      invalidateTokenCache(storageAccountId);
    }
    throw error;
  }
}

export async function refreshDriveConnection(storageAccountId: string) {
  invalidateTokenCache(storageAccountId);
  const credential = await readCredential(storageAccountId);
  if (!credential) throw new Error("This Google Drive account has no canonical server credential.");

  const refresh = refreshTokenForCredential(credential);
  const accessToken = await refreshToken(refresh);
  const aboutResponse = await google(
    `${DRIVE_API}/about?fields=user(permissionId,emailAddress),storageQuota(limit,usage)`,
    accessToken,
  );
  const about = await aboutResponse.json().catch(() => ({})) as {
    user?: { permissionId?: string; emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string };
  };
  if (!aboutResponse.ok) throw new Error("Google Drive storage quota could not be refreshed.");

  const refreshedGoogleAccountId = about.user?.permissionId?.trim() || undefined;
  if (
    credential.google_account_id &&
    refreshedGoogleAccountId &&
    credential.google_account_id !== refreshedGoogleAccountId
  ) {
    throw new Error("Google Drive returned a different account identity. Reconnect the original account.");
  }

  const updatedAt = new Date().toISOString();
  const { error } = await getSupabaseAdminClient()
    .from("uc_google_drive_credentials")
    .update({
      google_account_id: refreshedGoogleAccountId || credential.google_account_id,
      updated_at: updatedAt,
    })
    .eq("storage_account_id", storageAccountId);
  if (error) throw new Error(`Could not update Google Drive credential metadata: ${error.message}`);

  return {
    id: storageAccountId,
    email: normalizedEmail(about.user?.emailAddress) || undefined,
    googleAccountId: refreshedGoogleAccountId || credential.google_account_id || undefined,
    quotaUsedBytes: Number(about.storageQuota?.usage || 0),
    quotaLimitBytes: Number(about.storageQuota?.limit || 0),
    updatedAt,
  };
}
