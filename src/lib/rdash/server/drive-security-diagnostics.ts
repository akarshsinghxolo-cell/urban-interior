import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuthenticatedUser } from "./auth";
import { accessTokenForDriveConnection, GOOGLE_DRIVE_SCOPE } from "./drive-connections";
import { getWorkspace } from "./workspace";

const OAUTH_CONFIG_COLLECTION = "system.googleDriveOAuth";
const OAUTH_CONFIG_ID = "default";
const DRIVE_VAULT_COLLECTION = "system.googleDriveVault";
const DRIVE_VAULT_ID = "default";
const DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)";

type StoredOAuthSettings = {
  clientId?: string;
  clientSecret?: string;
  updatedAt?: string;
  updatedBy?: string;
};

type StoredEncryptedSecret = {
  version?: number;
  iv?: string;
  tag?: string;
  ciphertext?: string;
};

type StoredDriveConnection = {
  id: string;
  refreshTokenEncrypted?: StoredEncryptedSecret;
  /** Legacy plaintext token. Retained only so old vault rows can still be diagnosed during migration. */
  refreshToken?: string;
  email?: string;
  googleAccountId?: string;
  rootFolderId?: string;
  rootFolderName?: string;
  rootFolderUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

type StoredDriveVault = {
  version?: number;
  connections?: StoredDriveConnection[];
};

type UploadSessionRow = {
  id: string;
  batch_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  status?: string | null;
  progress?: number | null;
  confirmed_bytes?: number | null;
  storage_account_id?: string | null;
  session_uri?: string | null;
  session_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  retry_count?: number | null;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function fingerprint(value: string | null | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hasReusableRefreshToken(connection: StoredDriveConnection | undefined) {
  return Boolean(connection?.refreshToken || connection?.refreshTokenEncrypted?.ciphertext);
}

function refreshTokenFingerprint(connection: StoredDriveConnection | undefined) {
  if (connection?.refreshTokenEncrypted?.ciphertext) {
    return fingerprint(connection.refreshTokenEncrypted.ciphertext);
  }
  return fingerprint(connection?.refreshToken);
}

function sessionHost(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "Google resumable upload endpoint";
  }
}

async function readGenericRecord(collection: string, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("GenericRecord")
    .select("dataJson")
    .eq("collection", collection)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read ${collection}: ${error.message}`);
  return data?.dataJson as string | null | undefined;
}

async function inspectAccessToken(connection: StoredDriveConnection) {
  if (!connection.id || !hasReusableRefreshToken(connection)) {
    return {
      state: "missing" as const,
      fingerprint: null,
      verifiedAt: null,
      scope: [GOOGLE_DRIVE_SCOPE],
      serverCacheWindowMinutes: 50,
      error: "No reusable server connection token is stored.",
    };
  }

  try {
    const token = await accessTokenForDriveConnection(connection.id);
    const response = await fetch(DRIVE_ABOUT_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      user?: { permissionId?: string; emailAddress?: string };
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message || "Google rejected the access token verification request.");

    return {
      state: "active" as const,
      fingerprint: fingerprint(token),
      verifiedAt: new Date().toISOString(),
      scope: [GOOGLE_DRIVE_SCOPE],
      serverCacheWindowMinutes: 50,
      googleAccountId: payload.user?.permissionId || connection.googleAccountId || null,
      email: payload.user?.emailAddress || connection.email || null,
      error: null,
    };
  } catch (error) {
    return {
      state: "reconnect_required" as const,
      fingerprint: null,
      verifiedAt: new Date().toISOString(),
      scope: [GOOGLE_DRIVE_SCOPE],
      serverCacheWindowMinutes: 50,
      error: error instanceof Error ? error.message : "Access token verification failed.",
    };
  }
}

export async function readGoogleDriveSecurityDiagnostics(user: AuthenticatedUser) {
  if (user.role !== "Owner") throw new Error("FORBIDDEN:Only Owner can view Google Drive security diagnostics.");

  const admin = getSupabaseAdminClient();
  const [oauthRaw, vaultRaw, workspace, sessionsResult] = await Promise.all([
    readGenericRecord(OAUTH_CONFIG_COLLECTION, OAUTH_CONFIG_ID),
    readGenericRecord(DRIVE_VAULT_COLLECTION, DRIVE_VAULT_ID),
    getWorkspace(),
    admin
      .from("uc_upload_items")
      .select("id,batch_id,file_name,mime_type,size_bytes,status,progress,confirmed_bytes,storage_account_id,session_uri,session_expires_at,created_at,updated_at,retry_count")
      .not("session_uri", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  if (sessionsResult.error) throw new Error(`Could not load upload sessions: ${sessionsResult.error.message}`);

  const savedOAuth = parseJson<StoredOAuthSettings>(oauthRaw, {});
  const vault = parseJson<StoredDriveVault>(vaultRaw, { version: 1, connections: [] });
  const connections = Array.isArray(vault.connections) ? vault.connections : [];
  const sessions = (sessionsResult.data || []) as UploadSessionRow[];
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || savedOAuth.clientId || "";
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || savedOAuth.clientSecret || "";
  const storageAccounts = workspace.data.master.storageAccounts || [];

  const accountDiagnostics = await Promise.all(storageAccounts.map(async (account) => {
    const connection = connections.find((entry) => entry.id === account.oauth_connection_id);
    const accessToken = connection
      ? await inspectAccessToken(connection)
      : {
          state: "missing" as const,
          fingerprint: null,
          verifiedAt: null,
          scope: [GOOGLE_DRIVE_SCOPE],
          serverCacheWindowMinutes: 50,
          error: "This Drive slot is not linked to a server OAuth connection.",
        };
    const accountSessions = sessions
      .filter((session) => String(session.storage_account_id || "") === account.id)
      .map((session) => ({
        uploadItemId: session.id,
        uploadBatchId: session.batch_id || null,
        fileName: session.file_name || "Unnamed upload",
        mimeType: session.mime_type || null,
        sizeBytes: Number(session.size_bytes || 0),
        confirmedBytes: Number(session.confirmed_bytes || 0),
        progress: Number(session.progress || 0),
        status: session.status || "unknown",
        retryCount: Number(session.retry_count || 0),
        sessionFingerprint: fingerprint(session.session_uri),
        sessionHost: sessionHost(session.session_uri),
        sessionExpiresAt: session.session_expires_at || null,
        createdAt: session.created_at || null,
        updatedAt: session.updated_at || null,
      }));

    return {
      storageAccountId: account.id,
      label: account.label,
      status: account.status,
      email: account.email || connection?.email || null,
      oauthConnectionId: account.oauth_connection_id || null,
      googleAccountId: connection?.googleAccountId || null,
      rootFolderId: connection?.rootFolderId || account.root_folder_id || null,
      rootFolderName: connection?.rootFolderName || account.root_folder_name || null,
      refreshToken: {
        configured: hasReusableRefreshToken(connection),
        fingerprint: refreshTokenFingerprint(connection),
        storage: "server-only",
        updatedAt: connection?.updatedAt || null,
      },
      accessToken,
      resumableSessions: accountSessions,
    };
  }));

  const mappedConnectionIds = new Set(storageAccounts.map((account) => account.oauth_connection_id).filter(Boolean));
  const orphanConnections = connections
    .filter((connection) => !mappedConnectionIds.has(connection.id))
    .map((connection) => ({
      oauthConnectionId: connection.id,
      email: connection.email || null,
      googleAccountId: connection.googleAccountId || null,
      refreshTokenConfigured: hasReusableRefreshToken(connection),
      refreshTokenFingerprint: refreshTokenFingerprint(connection),
      updatedAt: connection.updatedAt || null,
    }));

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      rawSecretsSentToBrowser: false,
      explanation: "Client secrets, OAuth access tokens, refresh tokens and resumable-session URIs remain server-only. The UI receives fingerprints and operational metadata only.",
    },
    oauthApplication: {
      clientId,
      configured: Boolean(clientId && clientSecret),
      clientIdSource: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID ? "environment" : savedOAuth.clientId ? "supabase" : "missing",
      clientSecret: {
        configured: Boolean(clientSecret),
        fingerprint: fingerprint(clientSecret),
        source: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET ? "environment" : savedOAuth.clientSecret ? "supabase" : "missing",
        storage: "server-only",
      },
      scope: [GOOGLE_DRIVE_SCOPE],
      updatedAt: savedOAuth.updatedAt || null,
    },
    drives: accountDiagnostics,
    orphanConnections,
  };
}
