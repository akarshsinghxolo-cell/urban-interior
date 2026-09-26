import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { AuthenticatedUser } from "./auth";
import { accessTokenForDriveConnection, GOOGLE_DRIVE_SCOPE } from "./drive-connections";
import { getWorkspace } from "./workspace";

const DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)";

type StoredEncryptedSecret = {
  version?: number;
  iv?: string;
  tag?: string;
  ciphertext?: string;
};

type StoredDriveCredential = {
  storage_account_id: string;
  google_account_id?: string | null;
  refresh_token_encrypted?: StoredEncryptedSecret | null;
  created_at?: string | null;
  updated_at?: string | null;
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

function fingerprint(value: string | null | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hasReusableRefreshToken(credential: StoredDriveCredential | undefined) {
  return Boolean(credential?.refresh_token_encrypted?.ciphertext);
}

function refreshTokenFingerprint(credential: StoredDriveCredential | undefined) {
  return fingerprint(credential?.refresh_token_encrypted?.ciphertext);
}

function sessionHost(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "Google resumable upload endpoint";
  }
}

async function inspectAccessToken(
  storageAccountId: string,
  credential: StoredDriveCredential | undefined,
) {
  if (!credential || !hasReusableRefreshToken(credential)) {
    return {
      state: "missing" as const,
      fingerprint: null,
      verifiedAt: null,
      scope: [GOOGLE_DRIVE_SCOPE],
      serverCacheWindowMinutes: 50,
      error: "No canonical server credential is stored for this Drive account.",
    };
  }

  try {
    const token = await accessTokenForDriveConnection(storageAccountId);
    const response = await fetch(DRIVE_ABOUT_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      user?: { permissionId?: string; emailAddress?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || "Google rejected the access token verification request.");
    }

    return {
      state: "active" as const,
      fingerprint: fingerprint(token),
      verifiedAt: new Date().toISOString(),
      scope: [GOOGLE_DRIVE_SCOPE],
      serverCacheWindowMinutes: 50,
      googleAccountId: payload.user?.permissionId || credential.google_account_id || null,
      email: payload.user?.emailAddress || null,
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
  if (user.role !== "Owner") {
    throw new Error("FORBIDDEN:Only Owner can view Google Drive security diagnostics.");
  }

  const admin = getSupabaseAdminClient();
  const [workspace, sessionsResult, credentialsResult] = await Promise.all([
    getWorkspace(),
    admin
      .from("uc_upload_items")
      .select("id,batch_id,file_name,mime_type,size_bytes,status,progress,confirmed_bytes,storage_account_id,session_uri,session_expires_at,created_at,updated_at,retry_count")
      .not("session_uri", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100),
    admin
      .from("uc_google_drive_credentials")
      .select("storage_account_id,google_account_id,refresh_token_encrypted,created_at,updated_at"),
  ]);

  if (sessionsResult.error) {
    throw new Error(`Could not load upload sessions: ${sessionsResult.error.message}`);
  }
  if (credentialsResult.error) {
    throw new Error(`Could not load Drive credentials: ${credentialsResult.error.message}`);
  }

  const sessions = (sessionsResult.data || []) as UploadSessionRow[];
  const credentials = (credentialsResult.data || []) as unknown as StoredDriveCredential[];
  const credentialsByAccount = new Map(
    credentials.map((credential) => [credential.storage_account_id, credential]),
  );
  const storageAccounts = workspace.data.master.storageAccounts || [];
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || "";

  const accountDiagnostics = await Promise.all(storageAccounts.map(async (account) => {
    const credential = credentialsByAccount.get(account.id);
    const accessToken = await inspectAccessToken(account.id, credential);
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
      email: account.email || accessToken.email || null,
      googleAccountId: credential?.google_account_id || accessToken.googleAccountId || null,
      rootFolderId: account.root_folder_id || null,
      rootFolderName: account.root_folder_name || null,
      refreshToken: {
        configured: hasReusableRefreshToken(credential),
        fingerprint: refreshTokenFingerprint(credential),
        storage: "server-only canonical credential table",
        updatedAt: credential?.updated_at || null,
      },
      accessToken,
      resumableSessions: accountSessions,
    };
  }));

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      rawSecretsSentToBrowser: false,
      explanation: "OAuth client secrets, access tokens, refresh tokens and resumable-session URIs remain server-only. The UI receives fingerprints and operational metadata only.",
    },
    oauthApplication: {
      clientId,
      configured: Boolean(clientId && clientSecret),
      clientIdSource: clientId ? "environment" : "missing",
      clientSecret: {
        configured: Boolean(clientSecret),
        fingerprint: fingerprint(clientSecret),
        source: clientSecret ? "environment" : "missing",
        storage: "server-only",
      },
      scope: [GOOGLE_DRIVE_SCOPE],
      updatedAt: null,
    },
    drives: accountDiagnostics,
  };
}
